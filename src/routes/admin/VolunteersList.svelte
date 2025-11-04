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
  let viewMode = 'cards'; // 'cards' or 'table'
  let sortColumn = 'last_name';
  let sortDirection = 'asc';

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

  function sortVolunteers(volunteers) {
    return [...volunteers].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortColumn) {
        case 'first_name':
          aVal = a.first_name || '';
          bVal = b.first_name || '';
          break;
        case 'last_name':
          aVal = a.last_name || '';
          bVal = b.last_name || '';
          break;
        case 'email':
          aVal = a.email;
          bVal = b.email;
          break;
        case 'role':
          aVal = a.role;
          bVal = b.role;
          break;
        case 'signups':
          aVal = a.totalSignups;
          bVal = b.totalSignups;
          break;
        case 'hours':
          aVal = a.totalHours;
          bVal = b.totalHours;
          break;
        default:
          aVal = a.last_name || '';
          bVal = b.last_name || '';
      }
      
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  $: filteredVolunteers = sortVolunteers($volunteers.filter(volunteer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.toLowerCase();
    const email = volunteer.email.toLowerCase();
    return name.includes(query) || email.includes(query);
  }));

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

  async function changeRole(userId, newRole) {
    const roleNames = {
      'admin': 'Admin',
      'volunteer_leader': 'Volunteer Leader',
      'volunteer': 'Volunteer'
    };

    const confirmMessages = {
      'admin': 'promote this user to Admin? They will have full administrative access.',
      'volunteer_leader': 'make this user a Volunteer Leader? They can manage assigned roles.',
      'volunteer': 'change this user to a regular Volunteer?'
    };

    if (!confirm(`Are you sure you want to ${confirmMessages[newRole]}`)) {
      return;
    }

    try {
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error('No rows updated - check permissions');
      }

      console.log('Role updated successfully:', updateData);

      // Refresh volunteer list
      await volunteers.fetchVolunteers();
      
      alert(`User role changed to ${roleNames[newRole]} successfully! Changes take effect on their next login.`);
    } catch (err) {
      console.error('Change role error:', err);
      error = 'Failed to change role: ' + err.message;
      alert(`Error: ${err.message}`);
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
    <div class="controls">
      <div class="search-box">
        <input
          type="text"
          placeholder="Search volunteers by name or email..."
          bind:value={searchQuery}
        />
      </div>
      
      <div class="view-toggle">
        <button
          class="view-btn {viewMode === 'cards' ? 'active' : ''}"
          on:click={() => viewMode = 'cards'}
          title="Card view"
        >
          <span class="icon">▦</span> Cards
        </button>
        <button
          class="view-btn {viewMode === 'table' ? 'active' : ''}"
          on:click={() => viewMode = 'table'}
          title="Table view"
        >
          <span class="icon">☰</span> Table
        </button>
      </div>
    </div>

    {#if viewMode === 'table'}
      <div class="table-view">
        <table>
          <thead>
            <tr>
              <th on:click={() => handleSort('first_name')} class="sortable">
                First Name
                {#if sortColumn === 'first_name'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('last_name')} class="sortable">
                Last Name
                {#if sortColumn === 'last_name'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('email')} class="sortable">
                Email
                {#if sortColumn === 'email'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('role')} class="sortable">
                Role
                {#if sortColumn === 'role'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('signups')} class="sortable">
                Signups
                {#if sortColumn === 'signups'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('hours')} class="sortable">
                Hours
                {#if sortColumn === 'hours'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th>Waiver</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredVolunteers as volunteer (volunteer.id)}
              <tr>
                <td>
                  {volunteer.first_name || '-'}
                  {#if volunteer.emergency_contact_name}
                    <span class="emergency-indicator" title="Has emergency contact">🆘</span>
                  {/if}
                </td>
                <td>{volunteer.last_name || '-'}</td>
                <td>
                  <a href="mailto:{volunteer.email}" class="email-link">{volunteer.email}</a>
                  {#if volunteer.phone}
                    <div class="phone-display">📱 {volunteer.phone}</div>
                  {/if}
                </td>
                <td>
                  <span class="role-badge {volunteer.role}">
                    {#if volunteer.role === 'admin'}
                      👑 Admin
                    {:else if volunteer.role === 'volunteer_leader'}
                      ⭐ Leader
                    {:else}
                      👤 Volunteer
                    {/if}
                  </span>
                </td>
                <td class="text-center">{volunteer.totalSignups}</td>
                <td class="text-center">{volunteer.totalHours}h</td>
                <td class="text-center">
                  {#if volunteer.hasSignedWaiver}
                    <span class="waiver-badge signed">✓</span>
                  {:else}
                    <span class="waiver-badge unsigned">✗</span>
                  {/if}
                </td>
                <td>
                  <div class="table-actions">
                    {#if volunteer.role === 'volunteer'}
                      <button 
                        class="btn btn-xs btn-secondary"
                        on:click={() => changeRole(volunteer.id, 'volunteer_leader')}
                        title="Make Leader"
                      >
                        Leader
                      </button>
                      <button 
                        class="btn btn-xs btn-info"
                        on:click={() => changeRole(volunteer.id, 'admin')}
                        title="Make Admin"
                      >
                        Admin
                      </button>
                    {:else if volunteer.role === 'volunteer_leader'}
                      <button 
                        class="btn btn-xs btn-info"
                        on:click={() => changeRole(volunteer.id, 'admin')}
                        title="Promote to Admin"
                      >
                        → Admin
                      </button>
                      <button 
                        class="btn btn-xs btn-secondary"
                        on:click={() => changeRole(volunteer.id, 'volunteer')}
                        title="Demote"
                      >
                        → Volunteer
                      </button>
                    {:else}
                      <button 
                        class="btn btn-xs btn-warning"
                        on:click={() => changeRole(volunteer.id, 'volunteer')}
                        title="Demote"
                      >
                        → Volunteer
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="volunteers-grid">
      {#each filteredVolunteers as volunteer (volunteer.id)}
        <div class="volunteer-card">
          <div class="volunteer-header">
            <div class="volunteer-info">
              <h3>
                {volunteer.first_name || 'No'} {volunteer.last_name || 'Name'}
                {#if volunteer.emergency_contact_name}
                  <span class="emergency-indicator" title="Has emergency contact info">🆘</span>
                {/if}
              </h3>
              <a href="mailto:{volunteer.email}" class="email-link">{volunteer.email}</a>
              {#if volunteer.phone}
                <a href="tel:{volunteer.phone}" class="phone-link">📱 {volunteer.phone}</a>
              {/if}
              {#if volunteer.emergency_contact_name}
                <div class="emergency-contact">
                  <strong>Emergency:</strong> {volunteer.emergency_contact_name}
                  {#if volunteer.emergency_contact_phone}
                    - <a href="tel:{volunteer.emergency_contact_phone}">{volunteer.emergency_contact_phone}</a>
                  {/if}
                  {#if volunteer.emergency_contact_relationship}
                    ({volunteer.emergency_contact_relationship})
                  {/if}
                </div>
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
              <span class="value role-badge {volunteer.role}">
                {#if volunteer.role === 'admin'}
                  👑 Admin
                {:else if volunteer.role === 'volunteer_leader'}
                  ⭐ Volunteer Leader
                {:else}
                  👤 Volunteer
                {/if}
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
                on:click={() => changeRole(volunteer.id, 'volunteer_leader')}
              >
                Make Leader
              </button>
              <button 
                class="btn btn-sm btn-info"
                on:click={() => changeRole(volunteer.id, 'admin')}
              >
                Make Admin
              </button>
            {:else if volunteer.role === 'volunteer_leader'}
              <button 
                class="btn btn-sm btn-info"
                on:click={() => changeRole(volunteer.id, 'admin')}
              >
                Promote to Admin
              </button>
              <button 
                class="btn btn-sm btn-secondary"
                on:click={() => changeRole(volunteer.id, 'volunteer')}
              >
                Demote to Volunteer
              </button>
            {:else}
              <button 
                class="btn btn-sm btn-warning"
                on:click={() => changeRole(volunteer.id, 'volunteer')}
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
    {/if}

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

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .search-box {
    flex: 1;
    min-width: 300px;
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

  .view-toggle {
    display: flex;
    gap: 0.5rem;
    background: white;
    border-radius: 6px;
    padding: 0.25rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .view-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    color: #6c757d;
    transition: all 0.2s;
  }

  .view-btn:hover {
    background: #f8f9fa;
    color: #1a1a1a;
  }

  .view-btn.active {
    background: #007bff;
    color: white;
  }

  .view-btn .icon {
    font-size: 1.1rem;
  }

  .table-view {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .table-view table {
    width: 100%;
    border-collapse: collapse;
  }

  .table-view th {
    background: #f8f9fa;
    padding: 1rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
    white-space: nowrap;
  }

  .table-view th.sortable {
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }

  .table-view th.sortable:hover {
    background: #e9ecef;
  }

  .sort-arrow {
    margin-left: 0.5rem;
    color: #007bff;
  }

  .table-view td {
    padding: 1rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  .table-view tr:hover {
    background: #f8f9fa;
  }

  .text-center {
    text-align: center;
  }

  .table-actions {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .btn-xs {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .waiver-badge {
    display: inline-block;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    border-radius: 50%;
    font-weight: bold;
  }

  .waiver-badge.signed {
    background: #d4edda;
    color: #155724;
  }

  .waiver-badge.unsigned {
    background: #f8d7da;
    color: #721c24;
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

  .emergency-indicator {
    margin-left: 0.5rem;
    font-size: 0.9rem;
    cursor: help;
  }

  .emergency-contact {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #fff3cd;
    border-left: 3px solid #ffc107;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #856404;
  }

  .emergency-contact a {
    color: #007bff;
    text-decoration: none;
  }

  .emergency-contact a:hover {
    text-decoration: underline;
  }

  .phone-display {
    font-size: 0.85rem;
    color: #6c757d;
    margin-top: 0.25rem;
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

  .role-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .role-badge.admin {
    background: #e7f3ff;
    color: #004085;
  }

  .role-badge.volunteer_leader {
    background: #fff3cd;
    color: #856404;
  }

  .role-badge.volunteer {
    background: #f8f9fa;
    color: #495057;
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

  .btn-info {
    background: white;
    color: #17a2b8;
    border: 1px solid #17a2b8;
  }

  .btn-info:hover {
    background: #17a2b8;
    color: white;
  }

  @media (max-width: 768px) {
    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      width: 100%;
    }

    .view-toggle {
      width: 100%;
    }

    .view-btn {
      flex: 1;
      justify-content: center;
    }

    .volunteers-grid {
      grid-template-columns: 1fr;
    }

    .table-view {
      overflow-x: auto;
    }

    .table-view table {
      min-width: 800px;
    }
  }
</style>

