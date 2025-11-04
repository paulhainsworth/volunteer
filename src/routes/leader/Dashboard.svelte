<script>
  import { onMount } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

  let loading = true;
  let error = '';
  let myRoles = [];

  onMount(async () => {
    if (!$auth.user || $auth.profile?.role !== 'volunteer_leader') {
      push('/volunteer');
      return;
    }

    // Redirect to onboarding if no emergency contact
    if (!$auth.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

    try {
      await fetchMyRoles();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function fetchMyRoles() {
    const { data, error: fetchError } = await supabase
      .from('volunteer_roles')
      .select(`
        *,
        signups:signups!role_id(
          id,
          volunteer:profiles!volunteer_id(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          phone,
          status,
          signed_up_at
        )
      `)
      .eq('leader_id', $auth.user.id)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (fetchError) throw fetchError;

    myRoles = data.map(role => ({
      ...role,
      confirmedSignups: role.signups?.filter(s => s.status === 'confirmed') || [],
      positions_filled: role.signups?.filter(s => s.status === 'confirmed').length || 0
    }));
  }

  function getFillClass(role) {
    const percentage = (role.positions_filled / role.positions_total) * 100;
    if (percentage >= 100) return 'full';
    if (percentage >= 75) return 'almost-full';
    if (percentage >= 50) return 'half-full';
    return 'low';
  }

  $: totalPositions = myRoles.reduce((sum, r) => sum + r.positions_total, 0);
  $: filledPositions = myRoles.reduce((sum, r) => sum + r.positions_filled, 0);
  $: fillPercentage = totalPositions > 0 ? Math.round((filledPositions / totalPositions) * 100) : 0;
  $: totalVolunteers = new Set(
    myRoles.flatMap(r => r.confirmedSignups.map(s => s.volunteer.id))
  ).size;
</script>

<div class="leader-dashboard">
  <div class="header">
    <h1>Volunteer Leader Dashboard</h1>
    <p>Manage the roles assigned to you</p>
  </div>

  {#if loading}
    <div class="loading">Loading your assignments...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if myRoles.length === 0}
    <div class="empty">
      <h2>No Roles Assigned Yet</h2>
      <p>You haven't been assigned to lead any volunteer roles yet.</p>
      <p>Contact an administrator to get assigned roles.</p>
    </div>
  {:else}
    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-content">
          <div class="stat-value">{myRoles.length}</div>
          <div class="stat-label">Your Roles</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <div class="stat-value">{filledPositions} / {totalPositions}</div>
          <div class="stat-label">Positions Filled</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">{fillPercentage}%</div>
          <div class="stat-label">Fill Rate</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {fillPercentage}%"></div>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">🙋</div>
        <div class="stat-content">
          <div class="stat-value">{totalVolunteers}</div>
          <div class="stat-label">Total Volunteers</div>
        </div>
      </div>
    </div>

    <!-- Roles List -->
    <div class="roles-section">
      <h2>Your Assigned Roles</h2>
      
      <div class="roles-list">
        {#each myRoles as role (role.id)}
          {@const fillPercent = Math.round((role.positions_filled / role.positions_total) * 100)}
          
          <div class="role-card {getFillClass(role)}">
            <div class="role-header">
              <div>
                <h3>{role.name}</h3>
                <div class="role-meta">
                  <span>📅 {format(new Date(role.event_date), 'EEEE, MMM d, yyyy')}</span>
                  <span>🕐 {role.start_time} - {role.end_time}</span>
                  {#if role.location}
                    <span>📍 {role.location}</span>
                  {/if}
                </div>
              </div>
              
              <div class="fill-status">
                <div class="fill-number">{role.positions_filled} / {role.positions_total}</div>
                <div class="fill-percent">{fillPercent}%</div>
              </div>
            </div>

            {#if role.description}
              <p class="role-description">{role.description}</p>
            {/if}

            <div class="progress-bar">
              <div class="progress-fill" style="width: {fillPercent}%"></div>
            </div>

            {#if role.confirmedSignups.length > 0}
              <div class="volunteers-list">
                <h4>Volunteers ({role.confirmedSignups.length})</h4>
                <div class="volunteer-items">
                  {#each role.confirmedSignups as signup}
                    <div class="volunteer-item">
                      <div class="volunteer-info">
                        <strong>{signup.volunteer.first_name} {signup.volunteer.last_name}</strong>
                        <a href="mailto:{signup.volunteer.email}" class="volunteer-email">
                          {signup.volunteer.email}
                        </a>
                        {#if signup.phone || signup.volunteer.phone}
                          <a href="tel:{signup.phone || signup.volunteer.phone}" class="volunteer-phone">
                            📱 {signup.phone || signup.volunteer.phone}
                          </a>
                        {/if}
                      </div>
                      <div class="signup-date">
                        Signed up: {format(new Date(signup.signed_up_at), 'MMM d')}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="no-volunteers">
                ⚠️ No volunteers signed up yet
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .leader-dashboard {
    max-width: 1400px;
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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    gap: 1rem;
  }

  .stat-icon {
    font-size: 2.5rem;
  }

  .stat-content {
    flex: 1;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #1a1a1a;
    line-height: 1;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .progress-bar {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #20c997);
    transition: width 0.3s;
  }

  .roles-section {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .roles-section h2 {
    margin: 0 0 1.5rem 0;
    color: #1a1a1a;
  }

  .roles-list {
    display: grid;
    gap: 1.5rem;
  }

  .role-card {
    border: 2px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .role-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .role-card.full {
    border-color: #28a745;
    background: #f8fff9;
  }

  .role-card.almost-full {
    border-color: #ffc107;
    background: #fffef8;
  }

  .role-card.half-full {
    border-color: #dc3545;
    background: #fff8f8;
  }

  .role-card.low {
    border-color: #dc3545;
    background: #fff8f8;
  }

  .role-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .role-header h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .role-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    color: #495057;
  }

  .fill-status {
    text-align: right;
  }

  .fill-number {
    font-size: 1.5rem;
    font-weight: bold;
    color: #1a1a1a;
  }

  .fill-percent {
    font-size: 0.9rem;
    color: #6c757d;
  }

  .role-description {
    color: #495057;
    margin: 1rem 0;
    line-height: 1.5;
  }

  .volunteers-list {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .volunteers-list h4 {
    margin: 0 0 1rem 0;
    color: #495057;
    font-size: 1rem;
  }

  .volunteer-items {
    display: grid;
    gap: 0.75rem;
  }

  .volunteer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 6px;
    gap: 1rem;
  }

  .volunteer-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .volunteer-info strong {
    color: #1a1a1a;
  }

  .volunteer-email,
  .volunteer-phone {
    font-size: 0.85rem;
    color: #007bff;
    text-decoration: none;
  }

  .volunteer-email:hover,
  .volunteer-phone:hover {
    text-decoration: underline;
  }

  .signup-date {
    font-size: 0.85rem;
    color: #6c757d;
    white-space: nowrap;
  }

  .no-volunteers {
    text-align: center;
    padding: 2rem;
    color: #856404;
    background: #fff3cd;
    border-radius: 6px;
    margin-top: 1rem;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }

    .volunteer-item {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

