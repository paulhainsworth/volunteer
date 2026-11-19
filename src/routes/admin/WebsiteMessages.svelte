<script>
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { readWebsiteMessages, saveWebsiteMessages } from '../../lib/websiteMessages';

  const messageFields = [
    { key: 'opportunities_message', label: 'Volunteer Opportunities banner', hint: 'Shown to visitors when critical shifts are open. Leave blank to hide the banner.' },
    { key: 'homepage_thanks', label: 'Homepage thank-you', hint: 'Shown in the East Bay youth cycling section. Leave blank to hide the thank-you.' },
    { key: 'onboarding_message', label: 'New volunteer welcome message', hint: 'Shown below the heading when a new volunteer sets up their profile.' },
  ];

  let messages;
  let loading = true;
  let saving = false;
  let loadError = '';
  let saveError = '';
  let success = '';

  onMount(async () => {
    const session = await auth.ensureAdminRouteReady();
    if (!session.isAdmin) {
      replace('/volunteer');
      return;
    }
    await loadMessages();
  });

  async function loadMessages() {
    loading = true;
    loadError = '';
    try {
      messages = await readWebsiteMessages();
    } catch {
      loadError = 'Could not load website messages. Try again.';
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (saving) return;
    saving = true;
    saveError = '';
    success = '';
    try {
      const changes = { ...messages, onboarding_title: messages.onboarding_title.trim() };
      if (!changes.onboarding_title) {
        saveError = 'Enter a welcome heading.';
        return;
      }
      for (const { key } of messageFields) changes[key] = changes[key].trim();

      const saved = await saveWebsiteMessages(supabase, changes);
      if (saved) {
        messages = saved;
        success = 'Website messages published.';
      } else {
        saveError = 'The messages have changed since you opened this page. Copy your edits before reloading.';
      }
    } catch {
      saveError = 'Could not publish website messages. Your edits are still here. Try again.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="website-messages">
  <a class="back-link" href="#/admin/communications">Back to Communications</a>
  <h1>Website Messages</h1>
  <p class="intro">Update the thank-you and welcome copy visitors see. Use <code>{'{year}'}</code> wherever the event year should appear.</p>

  {#if loading}
    <p role="status">Loading website messages…</p>
  {:else if loadError}
    <p class="error" role="alert">{loadError}</p>
    <button type="button" class="btn" on:click={loadMessages}>Retry</button>
  {:else if messages}
    <form on:submit|preventDefault={save}>
      <fieldset disabled={saving}>
        <label for="website-event-year">Event year</label>
        <input id="website-event-year" type="number" min="2000" max="2100" required bind:value={messages.event_year} />

        {#each messageFields as field (field.key)}
          {#if field.key === 'onboarding_message'}
            <label for="onboarding-title">New volunteer welcome heading</label>
            <input id="onboarding-title" type="text" maxlength="120" required bind:value={messages.onboarding_title} />
          {/if}
          <label for={field.key}>{field.label}</label>
          <p class="hint" id={field.key + '-hint'}>{field.hint}</p>
          <textarea id={field.key} aria-describedby={field.key + '-hint'} rows="3" maxlength="1000" bind:value={messages[field.key]}></textarea>
        {/each}

        <button class="btn" type="submit">{saving ? 'Publishing…' : 'Publish messages'}</button>
      </fieldset>
      {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
      {#if success}<p class="success" role="status">{success}</p>{/if}
    </form>
  {/if}
</div>

<style>
  .website-messages {
    max-width: 46rem;
    margin: 0 auto;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    color: var(--link-hover);
    text-decoration: underline;
  }

  .intro {
    margin: 0.5rem 0 1.5rem;
    color: var(--text-muted);
  }

  form {
    padding: clamp(1rem, 4vw, 1.5rem);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
  }

  fieldset {
    border: 0;
    min-width: 0;
  }

  label {
    display: block;
    font-weight: 600;
  }

  input,
  textarea {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: 0.65rem;
    margin: 0.375rem 0 1.25rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1rem;
  }

  input[type="number"] {
    width: 8rem;
  }

  textarea {
    resize: vertical;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.9375rem;
  }

  .btn {
    background: #0056b3;
    color: #fff;
    border: 0;
    border-radius: 6px;
    min-height: 44px;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .error,
  .success {
    margin-top: 0.75rem;
  }

  .error {
    color: var(--danger-text);
  }

  .success {
    color: var(--success-text);
  }
</style>
