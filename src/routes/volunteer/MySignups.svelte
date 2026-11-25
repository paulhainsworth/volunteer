<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { signups as signupsStore } from '../../lib/stores/signups';
  import { sendVolunteerNotification } from '../../lib/volunteerSignup';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import ContactLeader from '../../lib/components/ContactLeader.svelte';
  import {
    formatTimeRange,
    calculateDuration,
    formatRoleScheduleDate,
    isRoleScheduleInPast
  } from '../../lib/utils/timeDisplay';

  let loading = true;
  let error = '';
  let cancellingId = null;
  let mySignups = [];
  let showCancelModal = false;
  let cancellingSignup = null;
  let showContactLeaderModal = false;
  let contactLeaderSignup = null;
  let cancelDialog = null;
  let contactDialog = null;
  let restoreFocusEl = null;

  function captureFocus() {
    if (showCancelModal || showContactLeaderModal) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) restoreFocusEl = active;
  }

  function restoreFocus() {
    const el = restoreFocusEl;
    restoreFocusEl = null;
    el?.focus();
  }

  async function focusNode(getNode) {
    await tick();
    getNode()?.focus();
  }

  function trapDialogTab(event) {
    if (event.key !== 'Tab') return;
    const root = event.currentTarget;
    const focusable = [...root.querySelectorAll('button, a[href], input, select, textarea')].filter(
      (el) => !el.disabled && el.tabIndex !== -1
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === root)) {
      event.preventDefault();
      first.focus();
    }
  }

  let active = true;
  onDestroy(() => { active = false; });

  onMount(async () => {
    const { user, profile } = await auth.waitForReady();
    if (!active) return;

    if (!user) {
      push('/auth/login');
      return;
    }

    // Redirect to onboarding if no emergency contact
    if (!profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

    // Redirect to sign waiver if they haven't signed the current waiver (e.g. admin-added volunteer)
    if (profile.role === 'volunteer') {
      try {
        const status = await waiverStore.checkWaiverStatus();
        if (!active) return;
        if (status.needsToSign) {
          push('/volunteer/waiver?return=' + encodeURIComponent('/my-signups'));
          return;
        }
      } catch (_) {
        // continue to load signups; waiver check will show error on waiver page if needed
      }
    }

    if (!active) return;
    try {
      // Fetch signups with domain and leader info
      const { data, error: fetchError } = await supabase
        .from('signups')
        .select(`
          *,
          role:volunteer_roles!role_id(
            *,
            domain:volunteer_leader_domains!domain_id(
              id,
              name,
              leader:profiles!leader_id(
                id,
                first_name,
                last_name,
                email,
                phone
              )
            ),
            direct_leader:profiles!leader_id(
              id,
              first_name,
              last_name,
              email,
              phone
            )
          )
        `)
        .eq('volunteer_id', user.id)
        .eq('status', 'confirmed')
        .order('role(event_date)', { ascending: true });

      if (fetchError) throw fetchError;

      mySignups = data || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function showCancelConfirmation(signup) {
    captureFocus();
    cancellingSignup = signup;
    showCancelModal = true;
    focusNode(() => cancelDialog);
  }

  function closeCancelModal() {
    showCancelModal = false;
    cancellingSignup = null;
    if (!showContactLeaderModal) restoreFocus();
  }

  function handleContactLeaderFirst() {
    contactLeaderSignup = cancellingSignup;
    showCancelModal = false;
    cancellingSignup = null;
    showContactLeaderModal = true;
    focusNode(() => contactDialog);
  }

  function closeContactLeaderModal() {
    showContactLeaderModal = false;
    contactLeaderSignup = null;
    if (!showCancelModal) restoreFocus();
  }

  function stillWantToCancel() {
    const signup = contactLeaderSignup;
    showContactLeaderModal = false;
    contactLeaderSignup = null;
    cancellingSignup = signup;
    showCancelModal = true;
    focusNode(() => cancelDialog);
  }

  async function confirmCancel() {
    if (!cancellingSignup) return;

    cancellingId = cancellingSignup.id;
    
    try {
      await signupsStore.cancelSignup(cancellingSignup.id);
      
      // Send email notifications to leader and admins
      await sendVolunteerNotification('cancellation', cancellingSignup.id).catch(() => {
        console.error('Cancellation notification did not complete');
      });
      
      // Remove from local array
      mySignups = mySignups.filter(s => s.id !== cancellingSignup.id);
      
      closeCancelModal();
    } catch (err) {
      error = err.message;
    } finally {
      cancellingId = null;
    }
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    if (showContactLeaderModal) closeContactLeaderModal();
    else if (showCancelModal) closeCancelModal();
  }

  function downloadCalendar(signup) {
    const role = signup.role;
    const day = role.event_date || role.completion_month;
    if (!day) {
      alert('This role has no calendar date. Add it manually if needed.');
      return;
    }
    const padTime = (t) => (t && String(t).trim() ? String(t).trim().slice(0, 5) : '09:00');
    const start = padTime(role.start_time);
    const end = padTime(role.end_time);
    const startDate = new Date(`${day}T${start}`);
    const endDate = new Date(`${day}T${end}`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      alert('Could not build a calendar entry for this role.');
      return;
    }

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Race Volunteer Manager//EN
BEGIN:VEVENT
UID:${signup.id}@volunteer-manager
DTSTAMP:${formatDateForICS(new Date())}
DTSTART:${formatDateForICS(startDate)}
DTEND:${formatDateForICS(endDate)}
SUMMARY:${role.name} - Volunteer
DESCRIPTION:${role.description || ''}
LOCATION:${role.location || ''}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${role.name.replace(/\s+/g, '-')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDateForICS(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function getEffectiveLeader(role) {
    // Domain leader takes precedence over direct leader
    if (role.domain?.leader) {
      return role.domain.leader;
    }
    if (role.direct_leader) {
      return role.direct_leader;
    }
    return null;
  }

  $: upcomingSignups = mySignups.filter((s) => !isRoleScheduleInPast(s.role));
  $: pastSignups = mySignups.filter((s) => isRoleScheduleInPast(s.role));
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="my-signups">
  <div class="header">
    <div>
      <h1>My Omnium shifts</h1>
      <p>Shifts you're signed up for</p>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading your signups...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if mySignups.length === 0}
    <div class="empty">
      <h2>No signups yet</h2>
      <p>You haven't signed up for a shift yet.</p>
      <a href="#/volunteer" class="btn btn-primary">Find a shift</a>
    </div>
  {:else}
    {#if upcomingSignups.length > 0}
      <section class="signups-section">
        <h2>Upcoming ({upcomingSignups.length})</h2>
        
        <div class="signups-list">
          {#each upcomingSignups as signup (signup.id)}
            {@const role = signup.role}
            {@const duration = calculateDuration(role.start_time, role.end_time)}
            {@const leader = getEffectiveLeader(role)}
            
            <div class="signup-card">
              <div class="signup-header">
                <h3>{role.name}</h3>
                <span class="upcoming-badge">Upcoming</span>
              </div>

              <div class="signup-details">
                <div class="detail">
                  <span class="icon" aria-hidden="true">📅</span>
                  <span>{formatRoleScheduleDate(role, 'long')}</span>
                </div>
                
                <div class="detail">
                  <span class="icon" aria-hidden="true">🕐</span>
                  <div class="shift-time">
                    <span>{formatTimeRange(role)}</span>
                    {#if duration != null}
                      <span class="shift-duration">({duration}h)</span>
                    {/if}
                  </div>
                </div>

                {#if role.location}
                  <div class="detail">
                    <span class="icon">📍</span>
                    <span>{role.location}</span>
                  </div>
                {/if}

                {#if signup.phone}
                  <div class="detail">
                    <span class="icon">📱</span>
                    <span>{signup.phone}</span>
                  </div>
                {/if}
              </div>

              {#if role.description}
                <p class="description">{role.description}</p>
              {/if}

              {#if role.domain}
                <div class="domain-info">
                  <span class="domain-badge">📁 {role.domain.name}</span>
                </div>
              {/if}

              {#if leader}
                <ContactLeader {leader} />
              {/if}

              <div class="signup-actions">
                <button
                  class="btn btn-sm btn-secondary"
                  on:click={() => downloadCalendar(signup)}
                >
                  Add to Calendar
                </button>
                
                <button
                  class="btn btn-sm btn-danger"
                  on:click={() => showCancelConfirmation(signup)}
                  disabled={cancellingId === signup.id}
                >
                  {cancellingId === signup.id ? 'Cancelling...' : 'Cancel Signup'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if pastSignups.length > 0}
      <section class="signups-section">
        <h2>Past ({pastSignups.length})</h2>
        
        <div class="signups-list">
          {#each pastSignups as signup (signup.id)}
            {@const role = signup.role}
            {@const duration = calculateDuration(role.start_time, role.end_time)}
            
            <div class="signup-card">
              <div class="signup-header">
                <h3>{role.name}</h3>
                <span class="past-badge">Past</span>
              </div>

              <div class="signup-details">
                <div class="detail">
                  <span class="icon" aria-hidden="true">📅</span>
                  <span>{formatRoleScheduleDate(role, 'long')}</span>
                </div>
                
                <div class="detail">
                  <span class="icon" aria-hidden="true">🕐</span>
                  <div class="shift-time">
                    <span>{formatTimeRange(role)}</span>
                    {#if duration != null}
                      <span class="shift-duration">({duration}h)</span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

{#if showCancelModal && cancellingSignup}
  <div class="modal-overlay" on:click={closeCancelModal}>
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-signup-title"
      tabindex="-1"
      bind:this={cancelDialog}
      on:click|stopPropagation
      on:keydown={trapDialogTab}
    >
      <button class="modal-close" on:click={closeCancelModal} aria-label="Close">×</button>

      <div class="modal-header">
        <h2 id="cancel-signup-title">Cancel Signup Confirmation</h2>
      </div>

      <div class="modal-body">
        <p class="warning-text">
          Are you sure you want to cancel your signup for <strong>{cancellingSignup.role.name}</strong>?
        </p>
        
        <div class="role-info-box">
          <div class="detail">
            <span class="icon">📅</span>
            <span>{formatRoleScheduleDate(cancellingSignup.role, 'long')}</span>
          </div>
          <div class="detail">
            <span class="icon">🕐</span>
            <span>{formatTimeRange(cancellingSignup.role)}</span>
          </div>
          {#if cancellingSignup.role.location}
            <div class="detail">
              <span class="icon">📍</span>
              <span>{cancellingSignup.role.location}</span>
            </div>
          {/if}
        </div>

        <p class="info-text">
          If you cancel, your volunteer leader and event coordinators will be notified automatically.
        </p>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-contact"
          on:click={handleContactLeaderFirst}
        >
          📧 Contact My Leader First
        </button>
        
        <button
          class="btn btn-secondary"
          on:click={closeCancelModal}
        >
          No, Keep Signup
        </button>
        
        <button
          class="btn btn-danger"
          on:click={confirmCancel}
          disabled={cancellingId}
        >
          {cancellingId ? 'Cancelling...' : 'Yes, Cancel Signup'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showContactLeaderModal && contactLeaderSignup}
  {@const leader = getEffectiveLeader(contactLeaderSignup.role)}
  
  <div class="modal-overlay" on:click={closeContactLeaderModal}>
    <div
      class="modal-content contact-leader-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-leader-title"
      tabindex="-1"
      bind:this={contactDialog}
      on:click|stopPropagation
      on:keydown={trapDialogTab}
    >
      <button class="modal-close" on:click={closeContactLeaderModal} aria-label="Close">×</button>

      <div class="modal-header">
        <h2 id="contact-leader-title">Contact Your Volunteer Leader</h2>
      </div>

      <div class="modal-body">
        <p class="info-text-primary">
          Before canceling, you might want to discuss with your volunteer leader about:
        </p>
        <ul class="suggestions-list">
          <li>Swapping shifts with another volunteer</li>
          <li>Finding a replacement volunteer</li>
          <li>Understanding the impact of your cancellation</li>
          <li>Exploring alternative ways to help</li>
        </ul>

        <div class="role-context">
          <h3>Your Signup:</h3>
          <p><strong>{contactLeaderSignup.role.name}</strong></p>
          <p>{formatRoleScheduleDate(contactLeaderSignup.role, 'long')} • {formatTimeRange(contactLeaderSignup.role)}</p>
        </div>

        {#if leader}
          <div class="leader-contact-section">
            <ContactLeader {leader} />
          </div>
        {:else}
          <div class="no-leader-notice">
            <p>No volunteer leader has been assigned to this role yet.</p>
            <p>You can contact the event organizers directly at <a href="mailto:volunteer@mailinator.com">volunteer@mailinator.com</a></p>
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-secondary"
          on:click={closeContactLeaderModal}
        >
          Close
        </button>
        
        <button
          class="btn btn-danger-outline"
          on:click={stillWantToCancel}
        >
          Still Want to Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .my-signups {
    max-width: 1000px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 2rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
  }

  .header p {
    color: var(--text-muted);
    margin: 0;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-muted);
  }

  .empty h2 {
    color: var(--text-primary);
    margin: 0 0 1rem 0;
    font-size: 1.75rem;
  }

  .empty p {
    margin: 0 0 2rem 0;
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .error {
    color: var(--danger-color);
  }

  .signups-section {
    margin-bottom: 3rem;
  }

  .signups-section h2 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .signups-list {
    display: grid;
    gap: 1.5rem;
  }

  .signup-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .signup-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .signup-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .signup-header h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .upcoming-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--success-surface);
    color: var(--success-text);
    white-space: nowrap;
  }

  .past-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .signup-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .signup-details:last-child {
    margin-bottom: 0;
  }

  .detail {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
  }

  .shift-time {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.5rem;
  }

  .shift-duration {
    color: var(--text-secondary);
  }

  .icon {
    font-size: 1.1rem;
  }

  .description {
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 1rem 0;
    font-size: 0.95rem;
  }

  .signup-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 44px;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }

  .btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover {
    background: #0056b3;
  }

  .btn-primary:active {
    background: #00458e;
  }

  .btn-secondary {
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover {
    background: var(--bg-secondary);
  }

  .btn-secondary:active {
    background: var(--bg-page);
  }

  .btn-danger {
    background: var(--bg-primary);
    color: var(--danger-color);
    border: 1px solid #dc3545;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc3545;
    color: white;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .domain-info {
    margin: 1rem 0;
  }

  .domain-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: var(--info-surface);
    border: 1px solid var(--info-border);
    border-radius: 20px;
    font-size: 0.9rem;
    color: var(--info-text);
    font-weight: 500;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-primary);
    border-radius: 16px;
    max-width: 550px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-content:focus {
    outline: none;
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: var(--bg-secondary);
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }

  .modal-close:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .modal-close:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border-color);
    padding-right: 4.75rem;
  }

  .modal-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.5rem;
  }

  .modal-body {
    padding: 2rem;
  }

  .warning-text {
    font-size: 1.1rem;
    color: var(--text-muted);
    margin: 0 0 1.5rem 0;
    line-height: 1.5;
  }

  .warning-text strong {
    color: var(--text-primary);
  }

  .role-info-box {
    background: var(--warning-surface);
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .role-info-box .detail {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.75rem;
    color: var(--text-muted);
  }

  .role-info-box .detail:last-child {
    margin-bottom: 0;
  }

  .role-info-box .icon {
    font-size: 1.25rem;
  }

  .info-text {
    font-size: 0.95rem;
    color: var(--text-secondary);
    margin: 0;
    padding: 1rem;
    background: var(--info-surface);
    border-radius: 6px;
    border-left: 4px solid var(--primary-color);
  }

  .modal-actions {
    padding: 1.5rem 2rem 2rem 2rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-contact {
    background: #17a2b8;
    color: white;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-contact:hover {
    background: #138496;
  }

  .btn-contact:active {
    background: #117a8b;
  }

  .btn-danger {
    background: #dc3545;
    color: white;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-danger:hover:not(:disabled) {
    background: #c82333;
  }

  .btn-danger:active:not(:disabled) {
    background: #a71d2a;
  }

  .btn-danger:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-danger-outline {
    background: var(--bg-primary);
    color: var(--danger-color);
    border: 2px solid #dc3545;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-danger-outline:hover {
    background: #dc3545;
    color: white;
  }

  .btn-danger-outline:hover:active,
  .btn-danger-outline:active {
    background: #a71d2a;
    border-color: #a71d2a;
    color: white;
  }

  /* Contact Leader Modal Specific Styles */
  .contact-leader-modal {
    max-width: 650px;
  }

  .info-text-primary {
    font-size: 1rem;
    color: var(--text-muted);
    margin: 0 0 1rem 0;
    line-height: 1.6;
  }

  .suggestions-list {
    background: var(--bg-secondary);
    border-left: 4px solid #17a2b8;
    border-radius: 6px;
    padding: 1.5rem 1.5rem 1.5rem 2.5rem;
    margin: 0 0 1.5rem 0;
  }

  .suggestions-list li {
    color: var(--text-muted);
    margin-bottom: 0.75rem;
    line-height: 1.5;
  }

  .suggestions-list li:last-child {
    margin-bottom: 0;
  }

  .role-context {
    background: var(--warning-surface);
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .role-context h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: var(--warning-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .role-context p {
    margin: 0.25rem 0;
    color: var(--text-muted);
  }

  .role-context strong {
    color: var(--text-primary);
    font-size: 1.1rem;
  }

  .leader-contact-section {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
  }

  .no-leader-notice {
    background: var(--info-surface);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
  }

  .no-leader-notice p {
    margin: 0.5rem 0;
    color: var(--text-muted);
  }

  .no-leader-notice a {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 600;
  }

  .no-leader-notice a:hover {
    text-decoration: underline;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
    }

    .modal-content {
      max-height: 95vh;
      margin: 0.5rem;
    }

    .modal-header {
      padding: 1.5rem 1.5rem 1rem 1.5rem;
      padding-right: 4.75rem;
    }

    .modal-header h2 {
      font-size: 1.25rem;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-actions {
      padding: 1rem 1.5rem 1.5rem 1.5rem;
    }
  }
</style>

