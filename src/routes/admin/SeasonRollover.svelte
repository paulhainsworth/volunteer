<script>
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { readVolunteerSeason } from '../../lib/volunteerSeason';
  import { withSupabaseReadTimeout } from '../../lib/utils/withTimeout';

  let activeYear = null;
  let nextYear;
  let previewYear;
  let preview;
  let confirmed = false;
  let busy = false;
  let ready = false;
  let error = '';
  let success = '';

  onMount(async () => {
    const session = await auth.ensureAdminRouteReady();
    if (!session.isAdmin) {
      replace('/volunteer');
      return;
    }
    try {
      const season = await readVolunteerSeason();
      if (!season) throw new Error('Roster season settings are unavailable. Check the database setup.');
      activeYear = season.active_year;
      nextYear = Math.max(new Date().getFullYear(), activeYear ?? 0) + 1;
      ready = true;
    } catch (err) {
      error = err.message || 'Could not load the roster season.';
    }
  });

  $: if (nextYear !== previewYear) confirmed = false;

  async function previewRollover() {
    if (busy) return;
    busy = true;
    error = '';
    success = '';
    preview = null;
    confirmed = false;
    const requestedYear = nextYear;

    try {
      const { data, error: previewError } = await withSupabaseReadTimeout(
        () => supabase.rpc('preview_volunteer_season', { p_active_year: requestedYear }).single(),
        'volunteerSeason.preview'
      );
      if (previewError || !data) throw previewError ?? new Error('Missing rollover preview');
      preview = data;
      previewYear = requestedYear;
    } catch {
      error = 'Could not preview the rollover. Try again.';
    } finally {
      busy = false;
    }
  }

  async function applyRollover() {
    if (busy || !confirmed || !preview || previewYear !== nextYear) return;
    busy = true;
    error = '';

    try {
      const update = supabase.from('volunteer_season').update({ active_year: previewYear }).eq('id', 1);
      const guardedUpdate = activeYear == null ? update.is('active_year', null) : update.eq('active_year', activeYear);
      const { data, error: updateError } = await withSupabaseReadTimeout(
        () => guardedUpdate.select('active_year').maybeSingle(),
        'volunteerSeason.apply'
      );
      if (updateError) throw updateError;
      if (!data) {
        error = 'The roster season changed since you opened this page. Reload to check the current season.';
        return;
      }
      activeYear = data.active_year;
      nextYear = activeYear < 2100 ? activeYear + 1 : undefined;
      success = `The active roster now starts in ${activeYear}.`;
      preview = null;
      confirmed = false;
    } catch {
      error = 'Could not start the new season. Reload to verify the current season before trying again.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="rollover">
  <a class="back" href="#/admin/volunteers">Back to Users</a>
  <h1>Season rollover</h1>
  <p class="intro">
    Choose the first year to show on the active roster. Earlier dated shifts move to history.
    Regular volunteers with only earlier confirmed shifts move to the archived list until they
    take a new shift. Accounts, waivers, and leadership assignments are preserved.
  </p>

  {#if ready}
    {#if activeYear}
      <p class="active-season">The active roster starts in <strong>{activeYear}</strong>.</p>
    {/if}
    <form on:submit|preventDefault={previewRollover}>
      <label for="next-roster-year">New roster year</label>
      <div class="form-row">
        <input id="next-roster-year" type="number" min={activeYear ? activeYear + 1 : 2001} max="2100" required bind:value={nextYear} disabled={busy || activeYear === 2100} />
        <button type="submit" class="btn" disabled={busy || activeYear === 2100}>Preview rollover</button>
      </div>
    </form>
  {:else if !error}
    <p role="status">Loading roster season…</p>
  {/if}

  {#if preview && previewYear === nextYear}
    <section aria-labelledby="rollover-preview">
      <h2 id="rollover-preview">Preview for {previewYear}</h2>
      <ul>
        <li>{preview.archived_shifts} dated {preview.archived_shifts === 1 ? 'shift moves' : 'shifts move'} to history.</li>
        <li>{preview.inactive_volunteers} regular {preview.inactive_volunteers === 1 ? 'volunteer moves' : 'volunteers move'} to the archived list.</li>
        <li>Admin and volunteer leader accounts stay active ({preview.retained_staff}).</li>
      </ul>
      <label class="confirm">
        <input type="checkbox" bind:checked={confirmed} disabled={busy} />
        Confirm the roster rollover to {previewYear}
      </label>
      <button type="button" class="btn" on:click={applyRollover} disabled={busy || !confirmed}>Start {previewYear} roster</button>
    </section>
  {/if}

  {#if success}<p class="success" role="status">{success}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .rollover {
    max-width: 44rem;
    margin: 0 auto;
  }

  .back {
    color: var(--link-hover);
    display: inline-block;
    margin-bottom: 1rem;
    text-decoration: underline;
  }

  .intro,
  .active-season {
    color: var(--text-muted);
    margin: 0.75rem 0 1rem;
  }

  form,
  section {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: clamp(1rem, 4vw, 1.5rem);
    margin-top: 1rem;
  }

  .form-row,
  .confirm {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  label {
    font-weight: 600;
  }

  input[type="number"] {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--input-border);
    border-radius: 6px;
    min-height: 44px;
    width: 8rem;
    padding: 0.5rem;
    font-size: 1rem;
  }

  ul {
    margin: 0.75rem 0 1rem 1.25rem;
    color: var(--text-muted);
  }

  .btn {
    background: #0056b3;
    color: white;
    border: none;
    border-radius: 6px;
    min-height: 44px;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .confirm {
    margin-bottom: 0.75rem;
  }

  .success,
  .error {
    margin-top: 1rem;
  }

  .success {
    color: var(--success-text);
  }

  .error {
    color: var(--danger-text);
  }
</style>
