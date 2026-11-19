<script>
  import { saveNicaBeneficiary } from '../nicaBeneficiaries';

  export let affiliations = [];
  export let beneficiaries = [];
  export let onSaved;

  let id = null;
  let label = '';
  let affiliationIds = [];
  let saving = false;
  let error = '';
  let notice = '';

  $: owners = new Map(beneficiaries.flatMap((beneficiary) =>
    beneficiary.affiliationIds.map((affiliationId) => [affiliationId, beneficiary])
  ));

  function edit(beneficiary) {
    id = beneficiary?.id ?? null;
    label = beneficiary?.label ?? '';
    affiliationIds = [...(beneficiary?.affiliationIds ?? [])];
    error = '';
    notice = '';
  }

  async function save() {
    if (saving || !label.trim() || !affiliationIds.length) return;
    saving = true;
    error = '';
    notice = '';
    try {
      const saved = await saveNicaBeneficiary({ id, label: label.trim(), affiliationIds });
      await onSaved(saved);
      edit(saved);
      notice = `Saved ${saved.label}.`;
    } catch (failure) {
      if (failure.code === '23505') {
        error = 'That name is already in use or an affiliation belongs to another beneficiary.';
      } else if (failure.code === '22023') {
        error = 'Check the beneficiary name and select at least one existing affiliation.';
      } else {
        error = 'Could not save the beneficiary. Please try again.';
      }
    } finally {
      saving = false;
    }
  }
</script>

<section id="nica-beneficiary-management" class="panel" aria-labelledby="nica-management-title">
  <h2 id="nica-management-title">Manage NICA beneficiaries</h2>
  <p>Each affiliation can count toward one beneficiary.</p>

  <label for="nica-beneficiary-edit">Beneficiary</label>
  <select id="nica-beneficiary-edit" value={id ?? ''} disabled={saving}
    on:change={(event) => edit(beneficiaries.find((beneficiary) => beneficiary.id === event.currentTarget.value))}>
    <option value="">Add a beneficiary</option>
    {#each beneficiaries as beneficiary (beneficiary.id)}
      <option value={beneficiary.id}>{beneficiary.label}</option>
    {/each}
  </select>

  <form on:submit|preventDefault={save}>
    <label for="nica-beneficiary-name">Beneficiary name</label>
    <input id="nica-beneficiary-name" type="text" bind:value={label} maxlength="100" required disabled={saving} />

    <fieldset disabled={saving}>
      <legend>Team or club affiliations</legend>
      {#each affiliations as affiliation (affiliation.id)}
        {@const owner = owners.get(affiliation.id)}
        <label class="affiliation">
          <input type="checkbox" value={affiliation.id} bind:group={affiliationIds}
            disabled={Boolean(owner && owner.id !== id)} />
          <span>{affiliation.name}{#if owner && owner.id !== id} <small>· {owner.label}</small>{/if}</span>
        </label>
      {:else}
        <p>Add a team or club affiliation before creating a beneficiary.</p>
      {/each}
    </fieldset>

    <button type="submit" disabled={saving || !label.trim() || !affiliationIds.length}>
      {saving ? 'Saving…' : 'Save beneficiary'}
    </button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  </form>
</section>

<style>
  .panel {
    display: grid;
    gap: 0.75rem;
    padding: 1.25rem;
    margin: 0 0 1.25rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
  }

  h2 { font-size: 1.25rem; }
  p, small { color: var(--text-muted); }
  form { display: grid; gap: 0.75rem; }
  select, input[type='text'] {
    width: min(100%, 28rem);
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-md);
    font: inherit;
  }
  fieldset {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: 0.25rem 1rem;
    padding: 0 0.75rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }
  legend { padding: 0 0.35rem; font-weight: 600; }
  .affiliation { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; }
  button {
    justify-self: start;
    min-height: 44px;
    padding: 0.5rem 1rem;
    border: 0;
    border-radius: var(--radius-md);
    background: #0056b3;
    color: white;
    font: inherit;
    font-weight: 600;
  }
  button:disabled { cursor: not-allowed; opacity: 0.65; }
  .error { color: var(--danger-text); }
  .notice { color: var(--success-text); }
</style>
