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
          // Look up leader_id from email if provided
          let leaderId = null;
          if (roleData.leader_email) {
            const { data: leaderData } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', roleData.leader_email)
              .eq('role', 'volunteer_leader')
              .single();
            
            if (leaderData) {
              leaderId = leaderData.id;
            }
          }

          // Remove leader_email from data (not a column)
          const { leader_email, ...roleDataWithoutEmail } = roleData;

          await roles.createRole({
            ...roleDataWithoutEmail,
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
        <table>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Event Date</th>
              <th>Time</th>
              <th>Location</th>
              <th>Fill Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each $roles as role (role.id)}
              {@const fillPercent = Math.round((role.positions_filled / role.positions_total) * 100)}
              
              <tr>
                <td>
                  <strong>{role.name}</strong>
                  {#if role.description}
                    <div class="role-desc">{role.description.substring(0, 100)}{role.description.length > 100 ? '...' : ''}</div>
                  {/if}
                </td>
                <td>{format(new Date(role.event_date), 'MMM d, yyyy')}</td>
                <td>{role.start_time} - {role.end_time}</td>
                <td>{role.location || '-'}</td>
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
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

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
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
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

