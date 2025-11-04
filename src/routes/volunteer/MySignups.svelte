<script>
  import { onMount } from 'svelte';
  import { signups } from '../../lib/stores/signups';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

  let loading = true;
  let error = '';
  let cancellingId = null;

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
      await signups.fetchMySignups($auth.user.id);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  function calculateDuration(startTime, endTime) {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return hours;
  }

  async function handleCancel(signupId) {
    if (!confirm('Are you sure you want to cancel this signup? This action cannot be undone.')) {
      return;
    }

    cancellingId = signupId;
    
    try {
      await signups.cancelSignup(signupId);
    } catch (err) {
      error = err.message;
    } finally {
      cancellingId = null;
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

  $: upcomingSignups = $signups.filter(s => new Date(s.role.event_date) >= new Date());
  $: pastSignups = $signups.filter(s => new Date(s.role.event_date) < new Date());
  $: totalHours = $signups.reduce((sum, signup) => {
    return sum + calculateDuration(signup.role.start_time, signup.role.end_time);
  }, 0);
</script>

<div class="my-signups">
  <div class="header">
    <div>
      <h1>My Volunteer Signups</h1>
      <p>Manage your volunteer commitments</p>
    </div>
    
    {#if $signups.length > 0}
      <div class="stats">
        <div class="stat">
          <div class="stat-value">{$signups.length}</div>
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
  {:else if $signups.length === 0}
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
            
            <div class="signup-card">
              <div class="signup-header">
                <h3>{role.name}</h3>
                <span class="upcoming-badge">Upcoming</span>
              </div>

              <div class="signup-details">
                <div class="detail">
                  <span class="icon">📅</span>
                  <span>{format(new Date(role.event_date), 'EEEE, MMMM d, yyyy')}</span>
                </div>
                
                <div class="detail">
                  <span class="icon">🕐</span>
                  <span>{formatTime(role.start_time)} - {formatTime(role.end_time)} ({duration}h)</span>
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

              <div class="signup-actions">
                <button
                  class="btn btn-sm btn-secondary"
                  on:click={() => downloadCalendar(signup)}
                >
                  Add to Calendar
                </button>
                
                <button
                  class="btn btn-sm btn-danger"
                  on:click={() => handleCancel(signup.id)}
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
                  <span>{format(new Date(role.event_date), 'EEEE, MMMM d, yyyy')}</span>
                </div>
                
                <div class="detail">
                  <span class="icon">🕐</span>
                  <span>{formatTime(role.start_time)} - {formatTime(role.end_time)} ({duration}h)</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

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
    padding: 3rem;
    color: #6c757d;
  }

  .empty h2 {
    color: #1a1a1a;
    margin-bottom: 0.5rem;
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

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
    }

    .stats {
      width: 100%;
      justify-content: space-around;
    }
  }
</style>

