<script>
  import { onMount } from 'svelte';
  import { domains } from '../../lib/stores/domains';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let error = '';
  let volunteerLeaders = [];
  let showForm = false;
  let editingDomain = null;
  
  let formData = {
    name: '',
    description: '',
    leader_id: null
  };

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    try {
      await Promise.all([
        domains.fetchDomains(),
        fetchVolunteerLeaders()
      ]);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function fetchVolunteerLeaders() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'volunteer_leader')
      .order('last_name', { ascending: true });
    
    if (data) {
      volunteerLeaders = data;
    }
  }

  function showCreateForm() {
    editingDomain = null;
    formData = { name: '', description: '', leader_id: null };
    showForm = true;
  }

  function showEditForm(domain) {
    editingDomain = domain;
    formData = {
      name: domain.name,
      description: domain.description || '',
      leader_id: domain.leader_id
    };
    showForm = true;
  }

  function cancelForm() {
    showForm = false;
    editingDomain = null;
  }

  async function handleSubmit() {
    error = '';
    
    try {
      if (editingDomain) {
        await domains.updateDomain(editingDomain.id, formData);
      } else {
        await domains.createDomain(formData);
      }
      
      showForm = false;
      editingDomain = null;
    } catch (err) {
      error = err.message;
    }
  }

  async function handleDelete(domainId) {
    if (!confirm('Are you sure you want to delete this domain? Roles will be unassigned.')) {
      return;
    }

    try {
      await domains.deleteDomain(domainId);
    } catch (err) {
      error = err.message;
      alert(err.message);
    }
  }

  async function assignLeader(domainId, leaderId) {
    try {
      await domains.assignLeader(domainId, leaderId);
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div class="domains-page">
  <div class="header">
    <div>
      <h1>Volunteer Leader Domains</h1>
      <p>Organize roles by department and assign leaders</p>
    </div>
    
    <button class="btn btn-primary" on:click={showCreateForm}>
      + Create Domain
    </button>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if showForm}
    <div class="form-card">
      <h3>{editingDomain ? 'Edit Domain' : 'Create New Domain'}</h3>
      
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="name">Domain Name *</label>
          <input
            type="text"
            id="name"
            bind:value={formData.name}
            required
            placeholder="e.g., Course Marshals"
          />
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea
            id="description"
            bind:value={formData.description}
            rows="3"
            placeholder="Describe the responsibilities..."
          ></textarea>
        </div>

        <div class="form-group">
          <label for="leader_id">Assign Volunteer Leader</label>
          <select id="leader_id" bind:value={formData.leader_id}>
            <option value={null}>No leader assigned</option>
            {#each volunteerLeaders as leader}
              <option value={leader.id}>
                {leader.first_name} {leader.last_name} ({leader.email})
              </option>
            {/each}
          </select>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" on:click={cancelForm}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            {editingDomain ? 'Update' : 'Create'} Domain
          </button>
        </div>
      </form>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading domains...</div>
  {:else if $domains.length === 0}
    <div class="empty">
      <h2>No domains yet</h2>
      <p>Create domains to organize your volunteer roles</p>
    </div>
  {:else}
    <div class="domains-grid">
      {#each $domains as domain (domain.id)}
        <div class="domain-card">
          <div class="domain-header">
            <h3>{domain.name}</h3>
            <div class="domain-actions">
              <button class="btn btn-sm btn-secondary" on:click={() => showEditForm(domain)}>
                Edit
              </button>
              <button class="btn btn-sm btn-danger" on:click={() => handleDelete(domain.id)}>
                Delete
              </button>
            </div>
          </div>

          {#if domain.description}
            <p class="domain-description">{domain.description}</p>
          {/if}

          <div class="domain-info">
            <div class="info-item">
              <span class="label">Leader:</span>
              {#if domain.leader}
                <div class="leader-info">
                  <strong>{domain.leader.first_name} {domain.leader.last_name}</strong>
                  <a href="mailto:{domain.leader.email}">{domain.leader.email}</a>
                  {#if domain.leader.phone}
                    <a href="tel:{domain.leader.phone}">📱 {domain.leader.phone}</a>
                  {/if}
                </div>
              {:else}
                <span class="no-leader">No leader assigned</span>
              {/if}
            </div>

            <div class="info-item">
              <span class="label">Roles:</span>
              <span class="role-count">{domain.role_count} {domain.role_count === 1 ? 'role' : 'roles'}</span>
            </div>
          </div>

          <div class="quick-assign">
            <label for="leader-{domain.id}">Quick assign leader:</label>
            <select
              id="leader-{domain.id}"
              value={domain.leader_id || ''}
              on:change={(e) => assignLeader(domain.id, e.target.value || null)}
            >
              <option value="">No leader</option>
              {#each volunteerLeaders as leader}
                <option value={leader.id}>
                  {leader.first_name} {leader.last_name}
                </option>
              {/each}
            </select>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .domains-page {
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    margin: 0;
    color: #6c757d;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .form-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }

  .form-card h3 {
    margin: 0 0 1.5rem 0;
    color: #1a1a1a;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
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

  .domains-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .domain-card {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .domain-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .domain-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .domain-header h3 {
    margin: 0;
    color: #1a1a1a;
  }

  .domain-actions {
    display: flex;
    gap: 0.5rem;
  }

  .domain-description {
    color: #6c757d;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .domain-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-item .label {
    font-weight: 600;
    color: #495057;
    font-size: 0.9rem;
  }

  .leader-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .leader-info a {
    color: #007bff;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .leader-info a:hover {
    text-decoration: underline;
  }

  .no-leader {
    color: #6c757d;
    font-style: italic;
  }

  .role-count {
    font-weight: 600;
    color: #007bff;
  }

  .quick-assign {
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
  }

  .quick-assign label {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
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

  .btn-danger {
    background: white;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-danger:hover {
    background: #dc3545;
    color: white;
  }

  @media (max-width: 768px) {
    .domains-grid {
      grid-template-columns: 1fr;
    }

    .header {
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>

