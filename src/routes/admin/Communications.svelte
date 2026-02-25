<script>
  import { onMount } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { roles } from '../../lib/stores/roles';
  import { volunteers } from '../../lib/stores/volunteers';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let error = '';
  let success = '';

  let subject = '';
  let body = '';
  let recipientType = 'all';
  let selectedRoleId = '';
  let selectedDate = '';
  let sending = false;
  let currentWaiverVersion = null;

  const WAIVER_REMINDER_SUBJECT = 'Action required: Sign the volunteer waiver for 2026 Berkeley Omnium';
  const WAIVER_REMINDER_BODY = `Hi {volunteer_name},

You're signed up to volunteer at the 2026 Berkeley Omnium — thank you! We need you to sign our liability waiver before the event.

Please log in to the volunteer hub and sign the waiver (you'll see it when you view your signups or sign up for another role):

https://www.berkeleyomnium.com/#/volunteer

If you have any questions, reply to this email.

Thanks,
Berkeley Omnium Volunteer Team`;

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    try {
      await Promise.all([
        roles.fetchRoles(),
        volunteers.fetchVolunteers()
      ]);
      const waiverSettings = await waiverStore.fetchCurrentWaiver();
      currentWaiverVersion = waiverSettings?.version ?? 1;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function insertMergeField(field) {
    const textarea = document.getElementById('body');
    if (textarea instanceof HTMLTextAreaElement) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = body;
      body = text.substring(0, start) + `{${field}}` + text.substring(end);
      
      // Reset cursor position
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + field.length + 2;
        textarea.focus();
      }, 0);
    }
  }

  function getUnsignedVolunteers() {
    if (currentWaiverVersion == null) return [];
    return $volunteers.filter((v) => {
      const waivers = v.waivers || [];
      const hasSignedCurrent = waivers.some((w) => (w.waiver_version ?? 0) >= currentWaiverVersion);
      return !hasSignedCurrent;
    });
  }

  function getRecipients() {
    if (recipientType === 'all') {
      return $volunteers;
    }
    if (recipientType === 'waiver_unsigned') {
      return getUnsignedVolunteers();
    }
    if (recipientType === 'role' && selectedRoleId) {
      const role = $roles.find((r) => r.id === selectedRoleId);
      const signups = role?.signups?.filter((s) => s.status === 'confirmed') || [];
      return signups.map((s) => s.volunteer).filter(Boolean);
    }
    if (recipientType === 'date' && selectedDate) {
      const dateRoles = $roles.filter((r) => r.event_date === selectedDate);
      const byId = new Map();
      dateRoles.forEach((role) => {
        role.signups?.forEach((signup) => {
          if (signup.volunteer) byId.set(signup.volunteer.id, signup.volunteer);
        });
      });
      return Array.from(byId.values());
    }
    return [];
  }

  function getRecipientCount() {
    return getRecipients().length;
  }

  function fillWaiverReminderTemplate() {
    recipientType = 'waiver_unsigned';
    subject = WAIVER_REMINDER_SUBJECT;
    body = WAIVER_REMINDER_BODY;
  }

  async function handleSend() {
    error = '';
    success = '';

    if (!subject.trim() || !body.trim()) {
      error = 'Subject and body are required';
      return;
    }

    const recipients = getRecipients();
    if (recipients.length === 0) {
      error = 'No recipients selected.';
      return;
    }

    sending = true;

    try {
      const sendPromises = recipients.map((volunteer) => {
        const name = [volunteer.first_name, volunteer.last_name].filter(Boolean).join(' ').trim() || 'there';
        const bodyHtml = body
          .replace(/\{volunteer_name\}/g, name)
          .split('\n')
          .map((line) => `<p>${line || ' '}</p>`)
          .join('');
        const html = `
          <h2>${subject}</h2>
          ${bodyHtml}
          <hr style="margin: 2rem 0; border: none; border-top: 1px solid #dee2e6;">
          <p style="color: #6c757d; font-size: 0.9rem;">
            Sent via Berkeley Omnium Volunteer Hub
          </p>
        `;
        return supabase.functions.invoke('send-email', {
          body: { to: volunteer.email, subject, html }
        });
      });
      await Promise.all(sendPromises);
      success = `Email sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`;

      subject = '';
      body = '';
      recipientType = 'all';
      selectedRoleId = '';
      selectedDate = '';
    } catch (err) {
      error = 'Failed to send email: ' + (err?.message || err);
    } finally {
      sending = false;
    }
  }

  $: recipientCount = getRecipientCount();
  $: unsignedVolunteers = getUnsignedVolunteers();
  $: eventDates = [...new Set($roles.map((r) => r.event_date))].sort();
</script>

<div class="communications-page">
  <div class="header">
    <h1>Communications</h1>
    <p>Send emails to volunteers</p>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if success}
    <div class="alert alert-success">{success}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <div class="email-composer">
      <div class="form-section">
        <h3>Recipients</h3>
        
        <div class="form-group">
          <label>
            <input
              type="radio"
              bind:group={recipientType}
              value="all"
            />
            All Volunteers ({$volunteers.length})
          </label>
        </div>

        <div class="form-group">
          <label>
            <input
              type="radio"
              bind:group={recipientType}
              value="role"
            />
            Volunteers for specific role
          </label>
          
          {#if recipientType === 'role'}
            <select bind:value={selectedRoleId} class="select-input">
              <option value="">Select a role...</option>
              {#each $roles as role}
                <option value={role.id}>
                  {role.name} - {role.event_date} ({role.positions_filled} volunteers)
                </option>
              {/each}
            </select>
          {/if}
        </div>

        <div class="form-group">
          <label>
            <input
              type="radio"
              bind:group={recipientType}
              value="date"
            />
            Volunteers for specific date
          </label>
          
          {#if recipientType === 'date'}
            <select bind:value={selectedDate} class="select-input">
              <option value="">Select a date...</option>
              {#each eventDates as date}
                <option value={date}>{date}</option>
              {/each}
            </select>
          {/if}
        </div>

        <div class="form-group">
          <label>
            <input
              type="radio"
              bind:group={recipientType}
              value="waiver_unsigned"
            />
            Volunteers who haven't signed the waiver ({unsignedVolunteers.length})
          </label>
          {#if recipientType === 'waiver_unsigned'}
            <button type="button" class="btn btn-secondary btn-template" on:click={fillWaiverReminderTemplate}>
              Use waiver reminder template
            </button>
          {/if}
        </div>

        <div class="recipient-count">
          Will send to <strong>{recipientCount}</strong> {recipientCount === 1 ? 'recipient' : 'recipients'}
        </div>
      </div>

      <div class="form-section">
        <h3>Message</h3>

        <div class="merge-fields">
          <span class="merge-label">Insert:</span>
          <button type="button" class="btn-merge" on:click={() => insertMergeField('volunteer_name')}>
            Name
          </button>
          <button type="button" class="btn-merge" on:click={() => insertMergeField('role_name')}>
            Role
          </button>
          <button type="button" class="btn-merge" on:click={() => insertMergeField('date')}>
            Date
          </button>
          <button type="button" class="btn-merge" on:click={() => insertMergeField('time')}>
            Time
          </button>
          <button type="button" class="btn-merge" on:click={() => insertMergeField('location')}>
            Location
          </button>
        </div>

        <div class="form-group">
          <label for="subject">Subject</label>
          <input
            type="text"
            id="subject"
            bind:value={subject}
            placeholder="Email subject..."
            disabled={sending}
          />
        </div>

        <div class="form-group">
          <label for="body">Message</label>
          <textarea
            id="body"
            bind:value={body}
            rows="12"
            placeholder="Hi [volunteer_name],&#10;&#10;Thank you for signing up to volunteer for [role_name] on [date]...&#10;&#10;Best regards,&#10;The Team"
            disabled={sending}
          ></textarea>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-primary"
            on:click={handleSend}
            disabled={sending || recipientCount === 0}
          >
            {sending ? 'Sending...' : `Send Email to ${recipientCount} ${recipientCount === 1 ? 'Recipient' : 'Recipients'}`}
          </button>
        </div>
      </div>
    </div>

    <div class="help-section">
      <h3>💡 Tips</h3>
      <ul>
        <li>Use merge fields like <code>{'{volunteer_name}'}</code> to personalize emails</li>
        <li><strong>Waiver reminder:</strong> Choose "Volunteers who haven't signed the waiver", then "Use waiver reminder template" to pre-fill a message asking them to log in and sign. Only unsigned volunteers receive it.</li>
        <li>Send test emails to yourself first by selecting a specific role or date with few recipients</li>
        <li>Schedule reminder emails 7 days and 1 day before events</li>
        <li>Keep subject lines clear and concise</li>
      </ul>
    </div>

  {/if}
</div>

<style>
  .communications-page {
    max-width: 1000px;
    margin: 0 auto;
  }

  .header {
    margin-bottom: 2rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    color: #6c757d;
    margin: 0;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .alert-success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .email-composer {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .form-section {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #dee2e6;
  }

  .form-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .form-section h3 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .form-group input[type="radio"] {
    margin-right: 0.5rem;
  }

  .select-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    margin-top: 0.5rem;
  }

  .recipient-count {
    margin-top: 1rem;
    padding: 1rem;
    background: #e7f3ff;
    border-radius: 6px;
    color: #004085;
  }

  .merge-fields {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .merge-label {
    font-weight: 600;
    color: #495057;
  }

  .btn-merge {
    padding: 0.25rem 0.75rem;
    background: white;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-merge:hover {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }

  input[type="text"],
  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .form-actions {
    margin-top: 1.5rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
    margin-top: 0.5rem;
  }

  .btn-secondary:hover {
    background: #5a6268;
  }

  .btn-template {
    font-size: 0.9rem;
  }

  .help-section {
    background: #fff3cd;
    border: 1px solid #ffeeba;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .help-section h3 {
    margin: 0 0 1rem 0;
    color: #856404;
  }

  .help-section ul {
    margin: 0;
    padding-left: 1.5rem;
    color: #856404;
  }

  .help-section li {
    margin-bottom: 0.5rem;
  }

  .help-section code {
    background: white;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-size: 0.9em;
  }
</style>

