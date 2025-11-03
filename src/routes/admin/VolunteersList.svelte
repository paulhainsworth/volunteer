<script>
  import { onMount } from 'svelte';
  import { volunteers } from '../../lib/stores/volunteers';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

  let loading = true;
  let error = '';
  let searchQuery = '';

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    try {
      await volunteers.fetchVolunteers();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  $: filteredVolunteers = $volunteers.filter(volunteer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = `${volunteer.first_name} ${volunteer.last_name}`.toLowerCase();
    const email = volunteer.email.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  function exportToCSV() {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Total Signups', 'Total Hours', 'Waiver Signed'];
    const rows = $volunteers.map(v => [
      v.first_name || '',
      v.last_name || '',
      v.email,
      v.phone || '',
      v.totalSignups,
      v.totalHours,
      v.hasSignedWaiver ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function promoteToAdmin(volunteerId) {
    if (!confirm('Are you sure you want to promote this volunteer to admin? They will have full administrative access.')) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', volunteerId);

      if (updateError) throw updateError;

      // Refresh volunteer list
      await volunteers.fetchVolunteers();
      
      alert('Volunteer promoted to admin successfully! They will see admin features on their next login.');
    } catch (err) {
      error = 'Failed to promote volunteer: ' + err.message;
    }
  }

  async function demoteToVolunteer(adminId) {
    if (!confirm('Are you sure you want to remove admin privileges from this user?')) {
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'volunteer' })
        .eq('id', adminId);

      if (updateError) throw updateError;

      // Refresh volunteer list
      await volunteers.fetchVolunteers();
      
      alert('User demoted to volunteer successfully!');
    } catch (err) {
      error = 'Failed to demote user: ' + err.message;
    }
  }

  function exportVolunteerRoster() {
    const headers = ['Volunteer Name', 'Email', 'Phone', 'Role', 'Event Date', 'Start Time', 'End Time'];
    const rows = [];

    $volunteers.forEach(volunteer => {
      volunteer.signups.forEach(signup => {
        rows.push([
          `${volunteer.first_name} ${volunteer.last_name}`,
          volunteer.email,
          volunteer.phone || signup.phone || '',
          signup.role.name,
          format(new Date(signup.role.event_date), 'yyyy-MM-dd'),
          signup.role.start_time,
          signup.role.end_time
        ]);
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteer-roster-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="volunteers-page">
  <div class="header">
    <div>
      <h1>Users</h1>
      <p>Manage all registered users, their roles, and signups</p>
    </div>
    
    <div class="header-actions">
      <button class="btn btn-secondary" on:click={exportToCSV}>
        Export List
      </button>
      <button class="btn btn-secondary" on:click={exportVolunteerRoster}>
        Export Roster
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading volunteers...</div>
  {:else if $volunteers.length === 0}
    <div class="empty">
      <h2>No volunteers yet</h2>
      <p>Volunteers will appear here once they sign up</p>
    </div>
  {:else}
    <div class="search-box">
      <input
        type="text"
        placeholder="Search volunteers by name or email..."
        bind:value={searchQuery}
      />
    </div>

    <div class="volunteers-grid">
      {#each filteredVolunteers as volunteer (volunteer.id)}
        <div class="volunteer-card">
          <div class="volunteer-header">
            <div class="volunteer-info">
              <h3>{volunteer.first_name} {volunteer.last_name}</h3>
              <a href="mailto:{volunteer.email}" class="email-link">{volunteer.email}</a>
              {#if volunteer.phone}
                <a href="tel:{volunteer.phone}" class="phone-link">{volunteer.phone}</a>
              {/if}
            </div>
            
            <div class="volunteer-stats">
              <div class="stat-badge">
                <span class="stat-value">{volunteer.totalSignups}</span>
                <span class="stat-label">signups</span>
              </div>
              <div class="stat-badge">
                <span class="stat-value">{volunteer.totalHours}h</span>
                <span class="stat-label">total</span>
              </div>
            </div>
          </div>

          <div class="volunteer-details">
            <div class="detail">
              <span class="label">Role:</span>
              <span class="value">
                {volunteer.role === 'admin' ? '👑 Admin' : '👤 Volunteer'}
              </span>
            </div>
            
            <div class="detail">
              <span class="label">Waiver:</span>
              <span class="value {volunteer.hasSignedWaiver ? 'success' : 'warning'}">
                {volunteer.hasSignedWaiver ? '✓ Signed' : '⚠ Not signed'}
              </span>
            </div>
            
            {#if volunteer.waivers && volunteer.waivers.length > 0}
              <div class="detail">
                <span class="label">Signed on:</span>
                <span class="value">
                  {format(new Date(volunteer.waivers[0].agreed_at), 'MMM d, yyyy')}
                </span>
              </div>
            {/if}
          </div>
          
          <div class="volunteer-actions">
            {#if volunteer.role === 'volunteer'}
              <button 
                class="btn btn-sm btn-secondary"
                on:click={() => promoteToAdmin(volunteer.id)}
              >
                Promote to Admin
              </button>
            {:else}
              <button 
                class="btn btn-sm btn-warning"
                on:click={() => demoteToVolunteer(volunteer.id)}
              >
                Demote to Volunteer
              </button>
            {/if}
          </div>

          {#if volunteer.signups && volunteer.signups.length > 0}
            <div class="signups-section">
              <h4>Signups ({volunteer.signups.length})</h4>
              <div class="signups-list">
                {#each volunteer.signups as signup}
                  <div class="signup-item">
                    <span class="signup-name">{signup.role.name}</span>
                    <span class="signup-date">
                      {format(new Date(signup.role.event_date), 'MMM d')}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if filteredVolunteers.length === 0}
      <div class="empty">
        <p>No volunteers found matching "{searchQuery}"</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .volunteers-page {
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    color: #6c757d;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .empty h2 {
    color: #1a1a1a;
    margin-bottom: 0.5rem;
  }

  .search-box {
    margin-bottom: 2rem;
  }

  .search-box input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  .search-box input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .volunteers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .volunteer-card {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .volunteer-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .volunteer-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .volunteer-info h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .email-link,
  .phone-link {
    display: block;
    color: #007bff;
    text-decoration: none;
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }

  .email-link:hover,
  .phone-link:hover {
    text-decoration: underline;
  }

  .volunteer-stats {
    display: flex;
    gap: 0.75rem;
  }

  .stat-badge {
    text-align: center;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .stat-value {
    display: block;
    font-size: 1.25rem;
    font-weight: bold;
    color: #007bff;
  }

  .stat-label {
    display: block;
    font-size: 0.75rem;
    color: #6c757d;
  }

  .volunteer-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0;
    border-top: 1px solid #dee2e6;
    border-bottom: 1px solid #dee2e6;
    margin-bottom: 1rem;
  }

  .detail {
    display: flex;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .label {
    font-weight: 600;
    color: #495057;
  }

  .value {
    color: #6c757d;
  }

  .value.success {
    color: #28a745;
  }

  .value.warning {
    color: #ffc107;
  }

  .signups-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #495057;
  }

  .signups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .signup-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .signup-name {
    font-weight: 500;
  }

  .signup-date {
    color: #6c757d;
  }

  .volunteer-actions {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  .btn-warning {
    background: white;
    color: #ffc107;
    border: 1px solid #ffc107;
  }

  .btn-warning:hover {
    background: #ffc107;
    color: white;
  }

  @media (max-width: 768px) {
    .volunteers-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

