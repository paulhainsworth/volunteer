<script>
  import { onMount } from 'svelte';
  import { supabase } from '../supabaseClient';
  import { auth } from '../stores/auth';
  import { NICA_BENEFICIARIES } from '../nicaBeneficiaries';
  import { format } from 'date-fns';
  import { friendlyEmailDigestSettingsError } from '../utils/emailDigestSettingsError';

  export let affiliations = [];

  const ALL_NICA_NAMES = new Set(NICA_BENEFICIARIES.flatMap((b) => b.affiliationNames));

  $: affNameById = new Map((affiliations || []).map((a) => [a.id, a.name]));

  $: nicaAffiliations = (affiliations || []).filter((a) => ALL_NICA_NAMES.has(a.name)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  let coaches = [];
  let loadingCoaches = true;
  let coachesError = '';

  let form = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    team_club_affiliation_id: '',
    email_end_date: ''
  };

  let adding = false;
  let addError = '';

  let digestEmailsEnabled = true;
  let loadingDigestSetting = true;
  let savingDigestToggle = false;
  let digestSettingError = '';

  let showCoachModal = false;
  let editingCoach = null;
  let editForm = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    team_club_affiliation_id: '',
    email_end_date: ''
  };
  let savingCoach = false;
  let modalError = '';

  function defaultEndDate() {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return format(d, 'yyyy-MM-dd');
  }

  onMount(() => {
    if (!form.email_end_date) form.email_end_date = defaultEndDate();
    loadCoaches();
    loadDigestSetting();
  });

  async function loadDigestSetting() {
    loadingDigestSetting = true;
    digestSettingError = '';
    try {
      const { data, error } = await supabase
        .from('email_digest_settings')
        .select('nica_coach_daily_digest_enabled')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      digestEmailsEnabled = data?.nica_coach_daily_digest_enabled !== false;
    } catch (e) {
      console.error(e);
      digestSettingError = friendlyEmailDigestSettingsError(e, 'Could not load digest email setting');
      digestEmailsEnabled = true;
    } finally {
      loadingDigestSetting = false;
    }
  }

  async function saveDigestSetting(next) {
    savingDigestToggle = true;
    digestSettingError = '';
    const prev = digestEmailsEnabled;
    digestEmailsEnabled = next;
    try {
      const { error } = await supabase
        .from('email_digest_settings')
        .update({ nica_coach_daily_digest_enabled: next })
        .eq('id', 1);

      if (error) throw error;
    } catch (e) {
      digestEmailsEnabled = prev;
      digestSettingError = friendlyEmailDigestSettingsError(e, 'Could not save');
    } finally {
      savingDigestToggle = false;
    }
  }

  async function loadCoaches() {
    loadingCoaches = true;
    coachesError = '';
    try {
      const { data, error } = await supabase
        .from('nica_coaches')
        .select('id, email, first_name, last_name, phone, team_club_affiliation_id, email_end_date, created_at')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;
      coaches = data || [];
    } catch (e) {
      console.error(e);
      coachesError = e.message || 'Failed to load NICA coaches';
      coaches = [];
    } finally {
      loadingCoaches = false;
    }
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function addCoach() {
    addError = '';
    const email = form.email.trim();
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const aff = (form.team_club_affiliation_id || '').trim();
    const end = (form.email_end_date || '').trim();

    if (!first || !last) {
      addError = 'First and last name are required.';
      return;
    }
    if (!validateEmail(email)) {
      addError = 'Enter a valid email address.';
      return;
    }
    if (!aff) {
      addError = 'Select a team / club affiliation.';
      return;
    }
    if (!end) {
      addError = 'Choose an end date for daily emails.';
      return;
    }

    adding = true;
    try {
      const { error } = await supabase.from('nica_coaches').insert({
        email: email.toLowerCase(),
        first_name: first,
        last_name: last,
        phone: form.phone.trim() || null,
        team_club_affiliation_id: aff,
        email_end_date: end,
        created_by: $auth.user?.id || null
      });

      if (error) {
        if (error.code === '23505') {
          addError = 'A coach with this email is already registered for that team.';
        } else throw error;
        return;
      }

      form = {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        team_club_affiliation_id: '',
        email_end_date: defaultEndDate()
      };
      await loadCoaches();
    } catch (e) {
      addError = e.message || 'Could not add coach';
    } finally {
      adding = false;
    }
  }

  function openCoachModal(row) {
    editingCoach = row;
    editForm = {
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      phone: row.phone || '',
      team_club_affiliation_id: row.team_club_affiliation_id || '',
      email_end_date: row.email_end_date || ''
    };
    modalError = '';
    showCoachModal = true;
  }

  function closeCoachModal() {
    showCoachModal = false;
    editingCoach = null;
    modalError = '';
  }

  async function saveCoachEdit() {
    if (!editingCoach) return;
    modalError = '';
    const email = editForm.email.trim();
    const first = editForm.first_name.trim();
    const last = editForm.last_name.trim();
    const aff = (editForm.team_club_affiliation_id || '').trim();
    const end = (editForm.email_end_date || '').trim();

    if (!first || !last) {
      modalError = 'First and last name are required.';
      return;
    }
    if (!validateEmail(email)) {
      modalError = 'Enter a valid email address.';
      return;
    }
    if (!aff) {
      modalError = 'Select a team / club affiliation.';
      return;
    }
    if (!end) {
      modalError = 'Choose an end date for daily emails.';
      return;
    }

    savingCoach = true;
    try {
      const { error } = await supabase
        .from('nica_coaches')
        .update({
          email: email.toLowerCase(),
          first_name: first,
          last_name: last,
          phone: editForm.phone.trim() || null,
          team_club_affiliation_id: aff,
          email_end_date: end
        })
        .eq('id', editingCoach.id);

      if (error) {
        if (error.code === '23505') {
          modalError = 'A coach with this email is already registered for that team.';
        } else throw error;
        return;
      }

      closeCoachModal();
      await loadCoaches();
    } catch (e) {
      modalError = e.message || 'Could not save';
    } finally {
      savingCoach = false;
    }
  }

  async function deleteCoach() {
    if (!editingCoach) return;
    if (!confirm(`Remove ${editingCoach.first_name} ${editingCoach.last_name} from NICA coach emails?`)) return;

    savingCoach = true;
    modalError = '';
    try {
      const { error } = await supabase.from('nica_coaches').delete().eq('id', editingCoach.id);
      if (error) throw error;
      closeCoachModal();
      await loadCoaches();
    } catch (e) {
      modalError = e.message || 'Could not delete';
    } finally {
      savingCoach = false;
    }
  }

  function affName(row) {
    return affNameById.get(row.team_club_affiliation_id) || '—';
  }
</script>

<div class="nica-coaches-card">
  <div class="digest-toggle-row" class:digest-toggle-row--disabled={loadingDigestSetting}>
    <label class="digest-toggle-label" for="nc-digest-enabled">
      <input
        id="nc-digest-enabled"
        type="checkbox"
        checked={digestEmailsEnabled}
        disabled={loadingDigestSetting || savingDigestToggle}
        on:change={(e) => saveDigestSetting(/** @type {HTMLInputElement} */ (e.currentTarget).checked)}
      />
      <span class="digest-toggle-text">
        <span class="digest-toggle-title">Daily signup summary emails to team coaches</span>
        <span class="digest-toggle-help">
          When enabled, NICA team coaches below receive the 8:00 a.m. PT digest (PDF + counts). Turn off to stop all of
          those emails; the schedule still runs but nothing is sent.
        </span>
      </span>
    </label>
    {#if savingDigestToggle}
      <span class="digest-toggle-saving" aria-live="polite">Saving…</span>
    {/if}
  </div>
  {#if digestSettingError}
    <p class="form-error" role="alert">{digestSettingError}</p>
  {/if}

  <p class="nica-coaches-lead">
    Add coaches who should receive a <strong>daily 8:00 a.m. PT</strong> email with the NICA export PDF for their team
    and a short summary (volunteers, roles, hours). Coaches do not need an account. Set an
    <strong>end date</strong> to stop the emails.
  </p>

  <div class="nica-coaches-form-row">
    <div class="field">
      <label class="sr-only" for="nc-first">First name</label>
      <input
        id="nc-first"
        type="text"
        placeholder="First name"
        bind:value={form.first_name}
        disabled={adding}
        autocomplete="given-name"
      />
    </div>
    <div class="field">
      <label class="sr-only" for="nc-last">Last name</label>
      <input
        id="nc-last"
        type="text"
        placeholder="Last name"
        bind:value={form.last_name}
        disabled={adding}
        autocomplete="family-name"
      />
    </div>
    <div class="field field-grow">
      <label class="sr-only" for="nc-email">Email</label>
      <input
        id="nc-email"
        type="email"
        placeholder="Email address"
        bind:value={form.email}
        disabled={adding}
        autocomplete="email"
      />
    </div>
    <div class="field">
      <label class="sr-only" for="nc-phone">Phone</label>
      <input
        id="nc-phone"
        type="tel"
        placeholder="Phone (optional)"
        bind:value={form.phone}
        disabled={adding}
        autocomplete="tel"
      />
    </div>
    <div class="field field-aff">
      <label class="sr-only" for="nc-aff">Team / Club</label>
      <select id="nc-aff" bind:value={form.team_club_affiliation_id} disabled={adding}>
        <option value="">Team / Club *</option>
        {#each nicaAffiliations as aff (aff.id)}
          <option value={aff.id}>{aff.name}</option>
        {/each}
      </select>
    </div>
    <div class="field field-date">
      <label class="sr-only" for="nc-end">Email end date</label>
      <input id="nc-end" type="date" bind:value={form.email_end_date} disabled={adding} title="Last day to send daily emails (Pacific)" />
    </div>
    <button type="button" class="btn btn-primary btn-add" disabled={adding} on:click={addCoach}>
      {adding ? 'Adding…' : '+ Add'}
    </button>
  </div>

  {#if addError}
    <p class="form-error" role="alert">{addError}</p>
  {/if}

  {#if coachesError}
    <p class="form-error" role="alert">{coachesError}</p>
  {/if}

  {#if loadingCoaches}
    <p class="muted">Loading coaches…</p>
  {:else if coaches.length === 0}
    <p class="muted">No NICA coaches yet. Use the form above to add one.</p>
  {:else}
    <div class="table-wrap">
      <table class="coaches-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Team</th>
            <th>Email ends</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {#each coaches as row (row.id)}
            <tr class="clickable" on:click={() => openCoachModal(row)}>
              <td>{row.first_name} {row.last_name}</td>
              <td><span class="cell-email">{row.email}</span></td>
              <td>{affName(row)}</td>
              <td>{row.email_end_date}</td>
              <td>{row.phone || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showCoachModal && editingCoach}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" on:click={closeCoachModal}>
    <div
      class="modal-content coach-modal"
      on:click|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-modal-title"
      tabindex="-1"
    >
      <button type="button" class="modal-close" on:click={closeCoachModal} aria-label="Close">×</button>
      <h2 id="coach-modal-title">NICA coach</h2>
      <div class="modal-fields">
        <label>
          First name
          <input type="text" bind:value={editForm.first_name} disabled={savingCoach} />
        </label>
        <label>
          Last name
          <input type="text" bind:value={editForm.last_name} disabled={savingCoach} />
        </label>
        <label>
          Email
          <input type="email" bind:value={editForm.email} disabled={savingCoach} />
        </label>
        <label>
          Phone (optional)
          <input type="tel" bind:value={editForm.phone} disabled={savingCoach} />
        </label>
        <label>
          Team / Club *
          <select bind:value={editForm.team_club_affiliation_id} disabled={savingCoach}>
            <option value="">Select…</option>
            {#each nicaAffiliations as aff (aff.id)}
              <option value={aff.id}>{aff.name}</option>
            {/each}
          </select>
        </label>
        <label>
          Daily emails end (Pacific, inclusive)
          <input type="date" bind:value={editForm.email_end_date} disabled={savingCoach} />
        </label>
      </div>
      {#if modalError}
        <p class="form-error" role="alert">{modalError}</p>
      {/if}
      <div class="modal-actions">
        <button type="button" class="btn btn-danger-outline" disabled={savingCoach} on:click={deleteCoach}>
          Delete
        </button>
        <div class="modal-actions-right">
          <button type="button" class="btn btn-secondary" disabled={savingCoach} on:click={closeCoachModal}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={savingCoach} on:click={saveCoachEdit}>
            {savingCoach ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .nica-coaches-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .digest-toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    margin: 0 0 1rem;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }

  .digest-toggle-row--disabled {
    opacity: 0.75;
  }

  .digest-toggle-label {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    margin: 0;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }

  .digest-toggle-label input {
    margin-top: 0.2rem;
    flex-shrink: 0;
    width: 1.1rem;
    height: 1.1rem;
    cursor: pointer;
  }

  .digest-toggle-label input:disabled {
    cursor: not-allowed;
  }

  .digest-toggle-text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .digest-toggle-title {
    font-weight: 600;
    color: #111827;
    font-size: 0.95rem;
  }

  .digest-toggle-help {
    font-size: 0.85rem;
    color: #4b5563;
    line-height: 1.45;
  }

  .digest-toggle-saving {
    font-size: 0.85rem;
    color: #6b7280;
    flex-shrink: 0;
  }

  .nica-coaches-lead {
    margin: 0 0 1rem;
    font-size: 0.95rem;
    color: #374151;
    line-height: 1.5;
  }

  .nica-coaches-form-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem 0.65rem;
  }

  .nica-coaches-form-row .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .nica-coaches-form-row input,
  .nica-coaches-form-row select {
    padding: 0.45rem 0.55rem;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font-size: 0.9rem;
    min-width: 0;
  }

  .field-grow {
    flex: 1 1 140px;
    min-width: 160px;
  }

  .field-aff {
    flex: 1 1 200px;
    min-width: 180px;
  }

  .field-aff select {
    width: 100%;
  }

  .field-date input {
    width: 100%;
    min-width: 9rem;
  }

  .btn-add {
    white-space: nowrap;
    padding: 0.5rem 1rem;
    height: fit-content;
  }

  .form-error {
    color: #b02a37;
    font-size: 0.9rem;
    margin: 0.75rem 0 0;
  }

  .muted {
    color: #6c757d;
    margin: 1rem 0 0;
    font-size: 0.95rem;
  }

  .table-wrap {
    overflow-x: auto;
    margin-top: 1rem;
  }

  .coaches-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .coaches-table th,
  .coaches-table td {
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid #e9ecef;
  }

  .coaches-table th {
    background: #f6f8fa;
    font-weight: 600;
    color: #1a1a1a;
  }

  tr.clickable {
    cursor: pointer;
  }

  tr.clickable:hover {
    background: #f8fafc;
  }

  .cell-email {
    word-break: break-all;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .coach-modal {
    background: white;
    border-radius: 12px;
    max-width: 480px;
    width: 100%;
    padding: 1.5rem;
    position: relative;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    border: none;
    background: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: #6c757d;
  }

  .coach-modal h2 {
    margin: 0 0 1rem;
    font-size: 1.15rem;
  }

  .modal-fields {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .modal-fields label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.88rem;
    font-weight: 500;
    color: #374151;
  }

  .modal-fields input,
  .modal-fields select {
    padding: 0.5rem 0.6rem;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font-size: 0.95rem;
  }

  .modal-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1.25rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .modal-actions-right {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .btn-danger-outline {
    background: white;
    color: #c82333;
    border: 1px solid #dc3545;
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .btn-danger-outline:hover:not(:disabled) {
    background: #fff5f5;
  }

  .btn-danger-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
