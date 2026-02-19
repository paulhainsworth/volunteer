<script>
  import { onMount } from 'svelte';
  import { signups as signupsStore } from '../../lib/stores/signups';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import ContactLeader from '../../lib/components/ContactLeader.svelte';
  import { formatTimeRange, calculateDuration, formatEventDateInPacific } from '../../lib/utils/timeDisplay';

  let loading = true;
  let error = '';
  let cancellingId = null;
  let mySignups = [];
  let showCancelModal = false;
  let cancellingSignup = null;
  let showContactLeaderModal = false;
  let contactLeaderSignup = null;

  onMount(async () => {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }

    // Redirect to onboarding if no emergency contact
    if (!$auth.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

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
        .eq('volunteer_id', $auth.user.id)
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
    cancellingSignup = signup;
    showCancelModal = true;
  }

  function closeCancelModal() {
    showCancelModal = false;
    cancellingSignup = null;
  }

  function handleContactLeaderFirst() {
    // Close cancel modal and open contact leader modal
    contactLeaderSignup = cancellingSignup;
    console.log('Contact leader signup:', contactLeaderSignup);
    console.log('Role:', contactLeaderSignup.role);
    console.log('Leader:', getEffectiveLeader(contactLeaderSignup.role));
    closeCancelModal();
    showContactLeaderModal = true;
  }

  function closeContactLeaderModal() {
    showContactLeaderModal = false;
    contactLeaderSignup = null;
  }

  async function confirmCancel() {
    if (!cancellingSignup) return;

    cancellingId = cancellingSignup.id;
    
    try {
      await signupsStore.cancelSignup(cancellingSignup.id);
      
      // Send email notifications to leader and admins
      await sendCancellationNotifications(cancellingSignup);
      
      // Remove from local array
      mySignups = mySignups.filter(s => s.id !== cancellingSignup.id);
      
      closeCancelModal();
    } catch (err) {
      error = err.message;
    } finally {
      cancellingId = null;
    }
  }

  async function sendCancellationNotifications(signup) {
    try {
      const role = signup.role;
      const volunteer = $auth.profile;
      
      // Get the effective leader
      const leader = getEffectiveLeader(signup);
      
      // Get all admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('role', 'admin');

      // Prepare email data
      const emailData = {
        volunteer_name: `${volunteer.first_name} ${volunteer.last_name}`,
        volunteer_email: volunteer.email,
        role_name: role.name,
        role_date: formatEventDateInPacific(role.event_date, 'long'),
        role_time: formatTimeRange(role),
        role_location: role.location || 'N/A'
      };

      // Send to leader if available
      if (leader) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: leader.email,
            subject: `Volunteer Cancellation: ${role.name}`,
            html: `
              <h2>Volunteer Cancellation Notice</h2>
              <p>Hello ${leader.first_name},</p>
              <p><strong>${emailData.volunteer_name}</strong> has cancelled their signup for:</p>
              <ul>
                <li><strong>Role:</strong> ${emailData.role_name}</li>
                <li><strong>Date:</strong> ${emailData.role_date}</li>
                <li><strong>Time:</strong> ${emailData.role_time}</li>
                <li><strong>Location:</strong> ${emailData.role_location}</li>
              </ul>
              <p>You may want to reach out to find a replacement volunteer.</p>
              <p>Contact: ${emailData.volunteer_email}</p>
            `
          }
        });
      }

      // Send to all admins
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await supabase.functions.invoke('send-email', {
            body: {
              to: admin.email,
              subject: `Volunteer Cancellation: ${role.name}`,
              html: `
                <h2>Volunteer Cancellation Notice</h2>
                <p>Hello ${admin.first_name},</p>
                <p><strong>${emailData.volunteer_name}</strong> has cancelled their signup for:</p>
                <ul>
                  <li><strong>Role:</strong> ${emailData.role_name}</li>
                  <li><strong>Date:</strong> ${emailData.role_date}</li>
                  <li><strong>Time:</strong> ${emailData.role_time}</li>
                  <li><strong>Location:</strong> ${emailData.role_location}</li>
                </ul>
                ${leader ? `<p><strong>Leader notified:</strong> ${leader.first_name} ${leader.last_name} (${leader.email})</p>` : ''}
                <p>Volunteer contact: ${emailData.volunteer_email}</p>
              `
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to send cancellation notifications:', err);
      // Don't throw error - cancellation should still succeed even if emails fail
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (showCancelModal) {
        closeCancelModal();
      }
      if (showContactLeaderModal) {
        closeContactLeaderModal();
      }
    }
  }

  function downloadCalendar(signup) {
    const role = signup.role;
    const startDate = new Date(`${role.event_date}T${role.start_time}`);
    const endDate = new Date(`${role.event_date}T${role.end_time}`);

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

  $: upcomingSignups = mySignups.filter(s => !s.role.event_date || new Date(s.role.event_date) >= new Date());
  $: pastSignups = mySignups.filter(s => s.role.event_date && new Date(s.role.event_date) < new Date());
  $: totalHours = mySignups.reduce((sum, signup) => {
    const d = calculateDuration(signup.role.start_time, signup.role.end_time);
    return sum + (d ?? 0);
  }, 0);
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="my-signups">
  <div class="header">
    <div>
      <h1>My Volunteer Signups</h1>
      <p>Manage your volunteer commitments</p>
    </div>
    
    {#if mySignups.length > 0}
      <div class="stats">
        <div class="stat">
          <div class="stat-value">{mySignups.length}</div>
          <div class="stat-label">Total Signups</div>
        </div>
        <div class="stat">
          <div class="stat-value">{Math.round(totalHours * 10) / 10}</div>
          <div class="stat-label">Total Hours</div>
        </div>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="loading">Loading your signups...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if mySignups.length === 0}
    <div class="empty">
      <h2>No signups yet</h2>
      <p>You haven't signed up for any volunteer opportunities yet.</p>
      <a href="#/volunteer" class="btn btn-primary">Browse Opportunities</a>
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
                  <span class="icon">📅</span>
                  <span>{role.event_date ? formatEventDateInPacific(role.event_date, 'long') : 'TBD'}</span>
                </div>
                
                <div class="detail">
                  <span class="icon">🕐</span>
                  <span>{formatTimeRange(role)}{#if duration != null} ({duration}h){/if}</span>
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
                <ContactLeader {leader} roleName={role.name} />
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
            
            <div class="signup-card past">
              <div class="signup-header">
                <h3>{role.name}</h3>
                <span class="past-badge">Completed</span>
              </div>

              <div class="signup-details">
                <div class="detail">
                  <span class="icon">📅</span>
                  <span>{role.event_date ? formatEventDateInPacific(role.event_date, 'long') : 'TBD'}</span>
                </div>
                
                <div class="detail">
                  <span class="icon">🕐</span>
                  <span>{formatTimeRange(role)}{#if duration != null} ({duration}h){/if}</span>
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
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeCancelModal} aria-label="Close">
        ✕
      </button>
      
      <div class="modal-header">
        <h2>Cancel Signup Confirmation</h2>
      </div>

      <div class="modal-body">
        <p class="warning-text">
          Are you sure you want to cancel your signup for <strong>{cancellingSignup.role.name}</strong>?
        </p>
        
        <div class="role-info-box">
          <div class="detail">
            <span class="icon">📅</span>
            <span>{cancellingSignup.role.event_date ? formatEventDateInPacific(cancellingSignup.role.event_date, 'long') : 'TBD'}</span>
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
    <div class="modal-content contact-leader-modal" on:click|stopPropagation>
      <button class="modal-close" on:click={closeContactLeaderModal} aria-label="Close">
        ✕
      </button>
      
      <div class="modal-header">
        <h2>Contact Your Volunteer Leader</h2>
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
          <p>{contactLeaderSignup.role.event_date ? formatEventDateInPacific(contactLeaderSignup.role.event_date, 'long') : 'TBD'} • {formatTimeRange(contactLeaderSignup.role)}</p>
        </div>

        {#if leader}
          <div class="leader-contact-section">
            <ContactLeader {leader} roleName={contactLeaderSignup.role.name} />
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
          on:click={() => {
            closeContactLeaderModal();
            showCancelConfirmation(contactLeaderSignup);
          }}
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
    color: #1a1a1a;
  }

  .header p {
    color: #6c757d;
    margin: 0;
  }

  .stats {
    display: flex;
    gap: 2rem;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #007bff;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #6c757d;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #6c757d;
  }

  .empty h2 {
    color: #1a1a1a;
    margin: 0 0 1rem 0;
    font-size: 1.75rem;
  }

  .empty p {
    margin: 0 0 2rem 0;
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .error {
    color: #dc3545;
  }

  .signups-section {
    margin-bottom: 3rem;
  }

  .signups-section h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .signups-list {
    display: grid;
    gap: 1.5rem;
  }

  .signup-card {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .signup-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .signup-card.past {
    opacity: 0.7;
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
    color: #1a1a1a;
  }

  .upcoming-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    background: #d4edda;
    color: #155724;
    white-space: nowrap;
  }

  .past-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    background: #e2e3e5;
    color: #383d41;
    white-space: nowrap;
  }

  .signup-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .detail {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .icon {
    font-size: 1.1rem;
  }

  .description {
    color: #6c757d;
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
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
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

  .btn-secondary {
    background: white;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  .btn-danger {
    background: white;
    color: #dc3545;
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
    background: #e7f3ff;
    border: 1px solid #b3d9ff;
    border-radius: 20px;
    font-size: 0.9rem;
    color: #004085;
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
    background: white;
    border-radius: 16px;
    max-width: 550px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: #f8f9fa;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6c757d;
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }

  .modal-close:hover {
    background: #e2e3e5;
    color: #1a1a1a;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid #dee2e6;
    padding-right: 4rem;
  }

  .modal-header h2 {
    margin: 0;
    color: #1a1a1a;
    font-size: 1.5rem;
  }

  .modal-body {
    padding: 2rem;
  }

  .warning-text {
    font-size: 1.1rem;
    color: #495057;
    margin: 0 0 1.5rem 0;
    line-height: 1.5;
  }

  .warning-text strong {
    color: #1a1a1a;
  }

  .role-info-box {
    background: #fff3cd;
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
    color: #495057;
  }

  .role-info-box .detail:last-child {
    margin-bottom: 0;
  }

  .role-info-box .icon {
    font-size: 1.25rem;
  }

  .info-text {
    font-size: 0.95rem;
    color: #6c757d;
    margin: 0;
    padding: 1rem;
    background: #e7f3ff;
    border-radius: 6px;
    border-left: 4px solid #007bff;
  }

  .modal-actions {
    padding: 1.5rem 2rem 2rem 2rem;
    border-top: 1px solid #dee2e6;
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

  .btn-danger:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-danger-outline {
    background: white;
    color: #dc3545;
    border: 2px solid #dc3545;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-danger-outline:hover {
    background: #dc3545;
    color: white;
  }

  /* Contact Leader Modal Specific Styles */
  .contact-leader-modal {
    max-width: 650px;
  }

  .info-text-primary {
    font-size: 1rem;
    color: #495057;
    margin: 0 0 1rem 0;
    line-height: 1.6;
  }

  .suggestions-list {
    background: #f8f9fa;
    border-left: 4px solid #17a2b8;
    border-radius: 6px;
    padding: 1.5rem 1.5rem 1.5rem 2.5rem;
    margin: 0 0 1.5rem 0;
  }

  .suggestions-list li {
    color: #495057;
    margin-bottom: 0.75rem;
    line-height: 1.5;
  }

  .suggestions-list li:last-child {
    margin-bottom: 0;
  }

  .role-context {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .role-context h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #856404;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .role-context p {
    margin: 0.25rem 0;
    color: #495057;
  }

  .role-context strong {
    color: #1a1a1a;
    font-size: 1.1rem;
  }

  .leader-contact-section {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
  }

  .no-leader-notice {
    background: #e7f3ff;
    border: 1px solid #b3d9ff;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
  }

  .no-leader-notice p {
    margin: 0.5rem 0;
    color: #495057;
  }

  .no-leader-notice a {
    color: #007bff;
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

    .stats {
      width: 100%;
      justify-content: space-around;
    }

    .modal-content {
      max-height: 95vh;
      margin: 0.5rem;
    }

    .modal-header {
      padding: 1.5rem 1.5rem 1rem 1.5rem;
      padding-right: 3.5rem;
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

