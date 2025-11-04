<script>
  import { onMount } from 'svelte';
  import { roles, dashboardStats } from '../../lib/stores/roles';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

  let loading = true;
  let error = '';

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    // Admins can skip onboarding if they want, but encourage it
    // Don't force redirect for admins to allow initial setup

    try {
      await roles.fetchRoles();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function getFillClass(role) {
    const percentage = (role.positions_filled / role.positions_total) * 100;
    if (percentage >= 100) return 'full';
    if (percentage >= 75) return 'almost-full';
    if (percentage >= 50) return 'half-full';
    return 'low';
  }

  function getCriticalRoles() {
    return $roles.filter(role => {
      const fillPercentage = (role.positions_filled / role.positions_total) * 100;
      const eventDate = new Date(role.event_date);
      const daysUntil = Math.ceil((eventDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      return fillPercentage < 50 && daysUntil <= 14 && daysUntil >= 0;
    }).sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  }

  function getUpcomingEvents() {
    const eventDates = [...new Set($roles.map(r => r.event_date))];
    return eventDates
      .filter(date => new Date(date) >= new Date())
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .slice(0, 5);
  }

  $: criticalRoles = getCriticalRoles();
  $: upcomingEvents = getUpcomingEvents();
</script>

<div class="admin-dashboard">
  <div class="header">
    <h1>Admin Dashboard</h1>
    <div class="header-actions">
      <a href="#/admin/roles/new" class="btn btn-primary">+ Create Role</a>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading dashboard...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-content">
          <div class="stat-value">{$dashboardStats.totalRoles}</div>
          <div class="stat-label">Total Roles</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <div class="stat-value">{$dashboardStats.filledPositions} / {$dashboardStats.totalPositions}</div>
          <div class="stat-label">Positions Filled</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">{Math.round($dashboardStats.fillPercentage)}%</div>
          <div class="stat-label">Fill Rate</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {$dashboardStats.fillPercentage}%"></div>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-content">
          <div class="stat-value">{$dashboardStats.upcomingRoles}</div>
          <div class="stat-label">Upcoming Roles</div>
        </div>
      </div>

      {#if $dashboardStats.criticalRoles > 0}
        <div class="stat-card critical">
          <div class="stat-icon">⚠️</div>
          <div class="stat-content">
            <div class="stat-value">{$dashboardStats.criticalRoles}</div>
            <div class="stat-label">Need Attention</div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Critical Roles -->
    {#if criticalRoles.length > 0}
      <div class="dashboard-section">
        <h2>Roles Needing Attention</h2>
        <p class="section-description">
          These roles are less than 50% filled and happening within 2 weeks
        </p>

        <div class="roles-table">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Date</th>
                <th>Time</th>
                <th>Fill Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each criticalRoles as role (role.id)}
                {@const fillPercent = Math.round((role.positions_filled / role.positions_total) * 100)}
                {@const daysUntil = Math.ceil((new Date(role.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                
                <tr>
                  <td>
                    <strong>{role.name}</strong>
                    {#if daysUntil <= 3}
                      <span class="urgent-tag">Urgent</span>
                    {/if}
                  </td>
                  <td>
                    {format(new Date(role.event_date), 'MMM d, yyyy')}
                    <small>({daysUntil} days)</small>
                  </td>
                  <td>{role.start_time}</td>
                  <td>
                    <div class="fill-status {getFillClass(role)}">
                      {role.positions_filled} / {role.positions_total}
                      <span class="fill-percent">({fillPercent}%)</span>
                    </div>
                  </td>
                  <td>
                    <a href="#/admin/roles/{role.id}" class="btn btn-sm btn-secondary">View</a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Upcoming Events -->
    {#if upcomingEvents.length > 0}
      <div class="dashboard-section">
        <h2>Upcoming Events</h2>
        
        <div class="events-list">
          {#each upcomingEvents as eventDate}
            {@const eventRoles = $roles.filter(r => r.event_date === eventDate)}
            {@const totalPositions = eventRoles.reduce((sum, r) => sum + r.positions_total, 0)}
            {@const filledPositions = eventRoles.reduce((sum, r) => sum + r.positions_filled, 0)}
            {@const fillPercent = Math.round((filledPositions / totalPositions) * 100)}
            
            <div class="event-card">
              <div class="event-header">
                <h3>{format(new Date(eventDate), 'EEEE, MMMM d, yyyy')}</h3>
                <span class="event-stats">
                  {eventRoles.length} roles · {filledPositions}/{totalPositions} filled
                </span>
              </div>
              
              <div class="progress-bar">
                <div class="progress-fill" style="width: {fillPercent}%"></div>
              </div>
              
              <div class="event-roles">
                {#each eventRoles as role}
                  <div class="mini-role-card {getFillClass(role)}">
                    <span class="role-name">{role.name}</span>
                    <span class="role-fill">{role.positions_filled}/{role.positions_total}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="dashboard-section">
      <h2>Quick Actions</h2>
      
      <div class="quick-actions">
        <a href="#/admin/roles" class="action-card">
          <div class="action-icon">📋</div>
          <div class="action-title">Manage Roles</div>
          <div class="action-description">View and edit all volunteer roles</div>
        </a>

        <a href="#/admin/volunteers" class="action-card">
          <div class="action-icon">👥</div>
          <div class="action-title">Manage Users</div>
          <div class="action-description">View all users, promote to admin, see signups</div>
        </a>

        <a href="#/admin/communications" class="action-card">
          <div class="action-icon">📧</div>
          <div class="action-title">Send Email</div>
          <div class="action-description">Communicate with volunteers</div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .admin-dashboard {
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .header h1 {
    margin: 0;
    color: #1a1a1a;
  }

  .loading,
  .error {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
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

  .stat-card.critical {
    border: 2px solid #dc3545;
    background: #fff5f5;
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

  .dashboard-section {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }

  .dashboard-section h2 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .section-description {
    color: #6c757d;
    margin-bottom: 1.5rem;
  }

  .roles-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.75rem;
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
  }

  td {
    padding: 1rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  .urgent-tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #dc3545;
    color: white;
    font-size: 0.75rem;
    border-radius: 4px;
    margin-left: 0.5rem;
  }

  small {
    display: block;
    color: #6c757d;
    font-size: 0.85rem;
  }

  .fill-status {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    font-weight: 600;
  }

  .fill-status.full {
    background: #d4edda;
    color: #155724;
  }

  .fill-status.almost-full {
    background: #fff3cd;
    color: #856404;
  }

  .fill-status.half-full {
    background: #f8d7da;
    color: #721c24;
  }

  .fill-status.low {
    background: #f8d7da;
    color: #721c24;
  }

  .fill-percent {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .events-list {
    display: grid;
    gap: 1.5rem;
  }

  .event-card {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .event-header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #1a1a1a;
  }

  .event-stats {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .event-roles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .mini-role-card {
    padding: 0.75rem;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    border: 1px solid;
  }

  .mini-role-card.full {
    background: #d4edda;
    border-color: #c3e6cb;
  }

  .mini-role-card.almost-full {
    background: #fff3cd;
    border-color: #ffeeba;
  }

  .mini-role-card.half-full {
    background: #f8d7da;
    border-color: #f5c6cb;
  }

  .mini-role-card.low {
    background: #f8d7da;
    border-color: #f5c6cb;
  }

  .role-name {
    font-weight: 500;
  }

  .role-fill {
    font-weight: 600;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .action-card {
    padding: 2rem;
    border: 2px solid #dee2e6;
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
  }

  .action-card:hover {
    border-color: #007bff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
  }

  .action-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .action-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 0.5rem;
  }

  .action-description {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    transition: background 0.2s;
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
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .quick-actions {
      grid-template-columns: 1fr;
    }
  }
</style>

