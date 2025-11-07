<script>
import { onMount } from 'svelte';
import { roles } from '../../lib/stores/roles';
import { auth } from '../../lib/stores/auth';
import { supabase } from '../../lib/supabaseClient';
import { push } from 'svelte-spa-router';
import RoleForm from '../../lib/components/RoleForm.svelte';
import BulkUpload from '../../lib/components/BulkUpload.svelte';
import { format } from 'date-fns';

  export let params = {};

  let loading = true;
  let error = '';
  let showForm = false;
  let showBulkUpload = false;
  let editingRole = null;
  let submitting = false;
  let expandedRoles = new Set(); // Track which roles are expanded
  let roleVolunteers = {}; // Store volunteers for each role
  let showAllVolunteers = false; // Track if all volunteers are shown
  let showDomainLeaderModal = false;
  let selectedDomain = null;
  let availableLeaders = [];
  let selectedLeaderId = '';
  let loadingLeaders = false;
  let assigningLeader = false;
  let domainModalError = '';
  let groupedRoles = [];

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    if (params.id === 'new') {
      showForm = true;
      loading = false;
    } else if (params.id) {
      try {
        editingRole = await roles.fetchRole(params.id);
        showForm = true;
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    } else {
      try {
        await roles.fetchRoles();
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    }
  });

  function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes}${ampm}`;
  }

  async function toggleRoleExpansion(roleId) {
    if (expandedRoles.has(roleId)) {
      // Collapse - remove from set
      expandedRoles.delete(roleId);
      expandedRoles = new Set(expandedRoles); // Trigger reactivity
    } else {
      // Expand - add to set and fetch volunteers if not already loaded
      expandedRoles.add(roleId);
      expandedRoles = new Set(expandedRoles); // Trigger reactivity
      
      if (!roleVolunteers[roleId]) {
        await fetchRoleVolunteers(roleId);
      }
    }
  }

  async function fetchRoleVolunteers(roleId) {
    try {
      const { data, error: fetchError } = await supabase
        .from('signups')
        .select(`
          id,
          signed_up_at,
          phone,
          volunteer:profiles!volunteer_id(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('role_id', roleId)
        .eq('status', 'confirmed')
        .order('signed_up_at', { ascending: true });

      if (fetchError) throw fetchError;

      roleVolunteers[roleId] = data || [];
      roleVolunteers = { ...roleVolunteers }; // Trigger reactivity
    } catch (err) {
      console.error('Error fetching volunteers:', err);
      error = 'Failed to load volunteers: ' + err.message;
    }
  }

  async function toggleAllVolunteers() {
    showAllVolunteers = !showAllVolunteers;
    
    if (showAllVolunteers) {
      // Expand all roles
      const allRoleIds = $roles.map(r => r.id);
      expandedRoles = new Set(allRoleIds);
      
      // Fetch volunteers for all roles that haven't been loaded yet
      const fetchPromises = allRoleIds
        .filter(id => !roleVolunteers[id])
        .map(id => fetchRoleVolunteers(id));
      
      await Promise.all(fetchPromises);
    } else {
      // Collapse all roles
      expandedRoles = new Set();
    }
  }

  async function handleSubmit(event) {
    const formData = event.detail;
    submitting = true;
    error = '';

    try {
      if (editingRole) {
        await roles.updateRole(editingRole.id, {
          ...formData,
          created_by: $auth.user.id
        });
      } else {
        await roles.createRole({
          ...formData,
          created_by: $auth.user.id
        });
      }
      
      push('/admin/roles');
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }

  function handleCancel() {
    push('/admin/roles');
  }

  function showBulkUploadDialog() {
    showBulkUpload = true;
    showForm = false;
  }

  async function handleBulkImport(event) {
    const rolesToImport = event.detail.roles;
    submitting = true;
    error = '';

    try {
      let successCount = 0;
      let failCount = 0;
      const errors = [];

      for (const roleData of rolesToImport) {
        try {
          // Look up domain_id from domain_name if provided
          let domainId = null;
          if (roleData.domain_name) {
            const { data: domainData } = await supabase
              .from('volunteer_leader_domains')
              .select('id')
              .eq('name', roleData.domain_name)
              .single();
            
            if (domainData) {
              domainId = domainData.id;
            } else {
              // Domain not found - warn but continue
              errors.push(`${roleData.name}: Domain "${roleData.domain_name}" not found - role created without domain`);
            }
          }

          // Look up leader_id from email if provided (only if no domain)
          let leaderId = null;
          if (roleData.leader_email && !domainId) {
            const { data: leaderData } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', roleData.leader_email)
              .eq('role', 'volunteer_leader')
              .single();
            
            if (leaderData) {
              leaderId = leaderData.id;
            } else {
              // Leader not found - warn but continue
              errors.push(`${roleData.name}: Leader "${roleData.leader_email}" not found - role created without leader`);
            }
          }

          // Remove non-column fields from data
          const { leader_email, domain_name, ...roleDataClean } = roleData;

          await roles.createRole({
            ...roleDataClean,
            domain_id: domainId,
            leader_id: leaderId,
            created_by: $auth.user.id
          });
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`${roleData.name}: ${err.message}`);
        }
      }

      if (successCount > 0) {
        alert(`Successfully imported ${successCount} roles!${failCount > 0 ? `\n\n${failCount} roles failed.` : ''}`);
      }

      if (errors.length > 0) {
        error = `Import errors:\n${errors.join('\n')}`;
      }

      showBulkUpload = false;
      
      // Refresh roles list
      await roles.fetchRoles();
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }

  function handleBulkCancel() {
    showBulkUpload = false;
  }

  async function handleDelete(roleId) {
    if (!confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      return;
    }

    try {
      await roles.deleteRole(roleId);
    } catch (err) {
      error = err.message;
    }
  }

  async function handleDuplicate(roleId) {
    try {
      await roles.duplicateRole(roleId);
    } catch (err) {
      error = err.message;
    }
  }

  function exportToCSV() {
    const headers = ['Role Name', 'Event Date', 'Start Time', 'End Time', 'Location', 'Total Positions', 'Filled Positions', 'Fill %'];
    const rows = $roles.map(role => [
      role.name,
      format(new Date(role.event_date), 'yyyy-MM-dd'),
      role.start_time,
      role.end_time,
      role.location || '',
      role.positions_total,
      role.positions_filled,
      Math.round((role.positions_filled / role.positions_total) * 100)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteer-roles-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadLeaderOptions() {
    loadingLeaders = true;
    try {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true });

      if (profilesError) throw profilesError;

      availableLeaders = data || [];
    } catch (err) {
      console.error('Error loading users:', err);
      domainModalError = 'Failed to load users: ' + err.message;
    } finally {
      loadingLeaders = false;
    }
  }

  async function openDomainLeaderModal(domain) {
    if (!domain) return;

    selectedDomain = domain;
    selectedLeaderId = domain.leader?.id || '';
    domainModalError = '';
    showDomainLeaderModal = true;

    if (availableLeaders.length === 0) {
      await loadLeaderOptions();
    }
  }

  function closeDomainLeaderModal() {
    showDomainLeaderModal = false;
    selectedDomain = null;
    selectedLeaderId = '';
    assigningLeader = false;
    domainModalError = '';
  }

  async function assignDomainLeader() {
    if (!selectedDomain || !selectedLeaderId) {
      domainModalError = 'Please select a leader.';
      return;
    }

    assigningLeader = true;
    domainModalError = '';

    try {
      const { error: updateError } = await supabase
        .from('volunteer_leader_domains')
        .update({ leader_id: selectedLeaderId })
        .eq('id', selectedDomain.id);

      if (updateError) throw updateError;

      await roles.fetchRoles();
      closeDomainLeaderModal();
    } catch (err) {
      console.error('Error assigning leader:', err);
      domainModalError = 'Failed to assign leader: ' + err.message;
    } finally {
      assigningLeader = false;
    }
  }

  function getUserDisplay(user) {
    if (!user) return 'Unnamed user';
    const parts = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (parts) {
      return user.email ? `${parts} (${user.email})` : parts;
    }
    return user.email || 'Unnamed user';
  }

  function groupRolesList(rolesList) {
    const domainMap = new Map();

    rolesList.forEach(role => {
      const domainId = role.domain?.id || 'no-domain';
      if (!domainMap.has(domainId)) {
        domainMap.set(domainId, {
          id: domainId,
          name: role.domain?.name || 'No Domain',
          leader: role.domain?.leader || null,
          domain: role.domain || null,
          roles: []
        });
      }

      domainMap.get(domainId).roles.push(role);
    });

    return Array.from(domainMap.values());
  }

  $: groupedRoles = groupRolesList($roles);
</script>

<div class="roles-page">
  {#if showBulkUpload}
    <div class="form-container">
      <BulkUpload
        on:import={handleBulkImport}
        on:cancel={handleBulkCancel}
      />
    </div>
  {:else if showForm}
    <div class="form-container">
      <h1>{editingRole ? 'Edit Role' : 'Create New Role'}</h1>
      
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}

      <RoleForm
        role={editingRole}
        loading={submitting}
        on:submit={handleSubmit}
        on:cancel={handleCancel}
      />
    </div>
  {:else}
    <div class="header">
      <div>
        <h1>Volunteer Roles</h1>
        <p>Manage all volunteer opportunities</p>
      </div>
      
      <div class="header-actions">
        <button class="btn btn-secondary" on:click={toggleAllVolunteers}>
          {showAllVolunteers ? '📋 Hide All Volunteers' : '📋 Show All Volunteers'}
        </button>
        <button class="btn btn-secondary" on:click={exportToCSV}>
          Export CSV
        </button>
        <button class="btn btn-info" on:click={showBulkUploadDialog}>
          📤 Bulk Upload
        </button>
        <a href="#/admin/roles/new" class="btn btn-primary">+ Create Role</a>
      </div>
    </div>

    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">Loading roles...</div>
    {:else if $roles.length === 0}
      <div class="empty">
        <h2>No roles yet</h2>
        <p>Create your first volunteer role to get started</p>
        <a href="#/admin/roles/new" class="btn btn-primary">Create Role</a>
      </div>
    {:else}
      <div class="roles-table">
        {#each groupedRoles as group (group.id)}
          <div class="domain-group">
            <div class="domain-header">
              <div class="domain-header-info">
                <h3>{group.name}</h3>
                {#if group.domain}
                  {#if group.leader}
                    <div class="domain-leader-text">Leader: {group.leader.first_name} {group.leader.last_name}</div>
                  {:else}
                    <div class="domain-leader-text no-leader">
                      Leader: —
                      <button
                        class="btn btn-sm btn-secondary add-leader-btn"
                        type="button"
                        on:click={() => openDomainLeaderModal(group.domain)}
                      >
                        Add leader
                      </button>
                    </div>
                  {/if}
                {:else}
                  <div class="domain-leader-text no-leader">No domain leader</div>
                {/if}
              </div>
            </div>

            <div class="roles-group-table">
              <table>
                <thead>
                  <tr>
                    <th>Role Name</th>
                    <th>Volunteer Leader</th>
                    <th>Fill Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.roles as role (role.id)}
                    {@const fillPercent = Math.round((role.positions_filled / role.positions_total) * 100)}
                    {@const isExpanded = expandedRoles.has(role.id)}
                    {@const volunteers = roleVolunteers[role.id] || []}

                    <tr>
                      <td>
                        <div class="role-name-cell" on:click={() => toggleRoleExpansion(role.id)}>
                          <span class="expand-arrow {isExpanded ? 'expanded' : ''}">{isExpanded ? '▼' : '▶'}</span>
                          <div class="role-name-content">
                            <strong>{role.name}</strong>
                            {#if role.description}
                              <div class="role-desc">{role.description.substring(0, 100)}{role.description.length > 100 ? '...' : ''}</div>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td>
                        {#if role.direct_leader}
                          {role.direct_leader.first_name} {role.direct_leader.last_name}
                        {:else if role.domain?.leader}
                          {role.domain.leader.first_name} {role.domain.leader.last_name}
                        {:else}
                          <span class="no-leader">-</span>
                        {/if}
                      </td>
                      <td>
                        <div class="fill-indicator">
                          <div class="fill-bar">
                            <div class="fill-progress" style="width: {fillPercent}%"></div>
                          </div>
                          <span class="fill-text">{role.positions_filled}/{role.positions_total} ({fillPercent}%)</span>
                        </div>
                      </td>
                      <td>
                        <div class="action-buttons">
                          <a href="#/admin/roles/{role.id}" class="btn btn-sm btn-secondary">Edit</a>
                          <button class="btn btn-sm btn-link" on:click={() => handleDuplicate(role.id)}>Duplicate</button>
                          <button class="btn btn-sm btn-danger" on:click={() => handleDelete(role.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>

                    {#if isExpanded}
                      <tr class="volunteers-row">
                        <td colspan="4">
                          <div class="volunteers-container">
                            {#if volunteers.length > 0}
                              <h4>Volunteers ({volunteers.length})</h4>
                              <div class="volunteers-list">
                                {#each volunteers as signup (signup.id)}
                                  <div class="volunteer-item">
                                    <div class="volunteer-info">
                                      <strong>{signup.volunteer.first_name} {signup.volunteer.last_name}</strong>
                                      <a href="mailto:{signup.volunteer.email}" class="volunteer-email">{signup.volunteer.email}</a>
                                      {#if signup.phone || signup.volunteer.phone}
                                        <span class="volunteer-phone">📱 {signup.phone || signup.volunteer.phone}</span>
                                      {/if}
                                    </div>
                                    <div class="signup-date">
                                      Signed up: {format(new Date(signup.signed_up_at), 'MMM d, h:mm a')}
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            {:else}
                              <p class="no-volunteers">No volunteers signed up yet</p>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if showDomainLeaderModal && selectedDomain}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Assign Domain Leader</h2>
        <button class="modal-close" on:click={closeDomainLeaderModal} aria-label="Close">
          ×
        </button>
      </div>
      <div class="modal-body">
        <p class="modal-domain-name">{selectedDomain.name}</p>

        {#if domainModalError}
          <div class="alert alert-error">{domainModalError}</div>
        {/if}

        {#if loadingLeaders}
          <div class="loading">Loading users...</div>
        {:else if availableLeaders.length === 0}
          <p>No users available to assign.</p>
        {:else}
          <div class="form-group">
            <label for="domain-leader-select">Select a leader</label>
            <select
              id="domain-leader-select"
              bind:value={selectedLeaderId}
              disabled={assigningLeader}
            >
              <option value="">-- Choose a leader --</option>
              {#each availableLeaders as user (user.id)}
                <option value={user.id}>{getUserDisplay(user)}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={closeDomainLeaderModal} disabled={assigningLeader}>Cancel</button>
        <button class="btn btn-primary" on:click={assignDomainLeader} disabled={assigningLeader || !selectedLeaderId}>
          {assigningLeader ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .roles-page {
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

  .form-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .form-container h1 {
    margin-bottom: 2rem;
    color: #1a1a1a;
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

  .roles-table {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .domain-group {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .domain-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #dee2e6;
    background: #f8f9fa;
  }

  .domain-header-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .domain-header-info h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #1a1a1a;
  }

  .domain-leader-text {
    font-size: 0.9rem;
    color: #495057;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .domain-leader-text.no-leader {
    color: #adb5bd;
  }

  .roles-group-table {
    overflow-x: auto;
  }

  .roles-group-table table {
    width: 100%;
    border-collapse: collapse;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 1rem;
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
  }

  td {
    padding: 1rem;
    border-bottom: 1px solid #dee2e6;
  }

  tr:hover {
    background: #f8f9fa;
  }

  .role-desc {
    font-size: 0.85rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .role-name-cell {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
    padding: 0.25rem 0;
    user-select: none;
  }

  .role-name-cell:hover {
    opacity: 0.8;
  }

  .expand-arrow {
    flex-shrink: 0;
    font-size: 0.85rem;
    color: #007bff;
    transition: transform 0.2s;
    margin-top: 0.2rem;
  }

  .expand-arrow.expanded {
    color: #28a745;
  }

  .role-name-content {
    flex: 1;
  }

  .volunteers-row {
    background: #f8f9fa;
  }

  .volunteers-container {
    padding: 1.5rem 2rem;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .volunteers-container h4 {
    margin: 0 0 1rem 0;
    color: #495057;
    font-size: 1rem;
  }

  .volunteers-list {
    display: grid;
    gap: 0.75rem;
  }

  .volunteer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    gap: 1rem;
  }

  .volunteer-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .volunteer-info strong {
    color: #1a1a1a;
    font-size: 0.95rem;
  }

  .volunteer-email {
    color: #007bff;
    text-decoration: none;
    font-size: 0.85rem;
  }

  .volunteer-email:hover {
    text-decoration: underline;
  }

  .volunteer-phone {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .signup-date {
    font-size: 0.85rem;
    color: #6c757d;
    white-space: nowrap;
  }

  .no-volunteers {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
    font-style: italic;
  }

  .no-leader {
    color: #adb5bd;
    font-style: italic;
  }

  .add-leader-btn {
    margin-left: 0;
  }

  .fill-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fill-bar {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
  }

  .fill-progress {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #20c997);
    transition: width 0.3s;
  }

  .fill-text {
    font-size: 0.85rem;
    color: #495057;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
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

  .btn-sm {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
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

  .btn-info {
    background: #17a2b8;
    color: white;
  }

  .btn-info:hover {
    background: #138496;
  }

  .btn-danger {
    background: white;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-danger:hover {
    background: #dc3545;
    color: white;
  }

  .btn-link {
    background: none;
    color: #007bff;
    border: none;
    text-decoration: underline;
    padding: 0.5rem;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1.5rem;
  }

  .modal-content {
    background: #fff;
    border-radius: 12px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #dee2e6;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: #6c757d;
    padding: 0;
  }

  .modal-close:hover {
    color: #1a1a1a;
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-domain-name {
    font-weight: 600;
    margin: 0;
    color: #495057;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #495057;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    color: #495057;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
    }

    .roles-table {
      overflow-x: auto;
    }

    table {
      min-width: 800px;
    }
  }
</style>

