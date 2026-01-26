<script>
  import { onMount, tick } from 'svelte';
  import { domains } from '../../lib/stores/domains';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { get } from 'svelte/store';

  let loading = true;
  let error = '';
  let volunteerLeaders = [];
  let allRoles = [];
  let showForm = false;
  let editingDomain = null;
  let assigningRoles = null;
  let refreshKey = 0; // Force UI updates
  let initialManageDomainId = null;

  let isAdminUser = false;
  let isLeaderUser = false;
  let currentUserId = null;
  let accessibleDomainIds = [];

  const unsubscribe = auth.subscribe(value => {
    isAdminUser = !!value?.isAdmin;
    isLeaderUser = value?.profile?.role === 'volunteer_leader';
    currentUserId = value?.user?.id || null;
  });

function canManageDomain(domain) {
  if (isAdminUser) return true;
  return domain?.leader_id === currentUserId;
}

function canEditDomain(domain) {
  return canManageDomain(domain);
}

async function fetchDomainsForCurrentUser() {
  const domainData = await domains.fetchDomains(
    isAdminUser ? {} : { leaderId: currentUserId }
  );
  accessibleDomainIds = domainData.map(d => d.id);
  return domainData;
}

function waitForAuthReady() {
  const current = get(auth);
  if (!current?.loading) {
    return Promise.resolve(current);
  }

  return new Promise(resolve => {
    const stop = auth.subscribe(value => {
      if (!value.loading) {
        stop();
        resolve(value);
      }
    });
  });
}
  
  let formData = {
    name: '',
    description: '',
    leader_id: null
  };

  const ADD_NEW_LEADER = '__add_new_leader__';
  let showAddLeaderModal = false;
  let addLeaderForm = { first_name: '', last_name: '', email: '', phone: '' };
  let addingLeader = false;
  let addLeaderError = '';
  let leaderAssignSuccess = null;

  function handleLeaderSelectChange(e) {
    const v = e.currentTarget.value;
    if (v === ADD_NEW_LEADER) {
      formData.leader_id = null;
      showAddLeaderModal = true;
      addLeaderError = '';
      addLeaderForm = { first_name: '', last_name: '', email: '', phone: '' };
    }
  }

  function closeAddLeaderModal() {
    showAddLeaderModal = false;
    addLeaderForm = { first_name: '', last_name: '', email: '', phone: '' };
    addLeaderError = '';
    addingLeader = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && showAddLeaderModal) {
      closeAddLeaderModal();
    }
  }

  async function createLeaderAccount({ first_name, last_name, email, phone = null }) {
    const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: { first_name, last_name, role: 'volunteer_leader' },
        emailRedirectTo: `${window.location.origin}/#/auth/reset-password`
      }
    });
    if (authError) throw authError;
    if (!authData?.user) throw new Error('User creation failed.');
    const userId = authData.user.id;
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        first_name,
        last_name,
        phone,
        role: 'volunteer_leader'
      });
    if (profileError) throw profileError;
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ first_name, last_name, phone, role: 'volunteer_leader' })
      .eq('id', userId);
    if (updateErr) console.warn('Profile update warning:', updateErr.message);
    return userId;
  }

  async function sendLeaderInviteEmail({ email, first_name, domainName }) {
    const loginUrl = `${window.location.origin}/#/auth/login`;
    await supabase.functions.invoke('send-email', {
      body: {
        to: email,
        subject: `You're now the volunteer leader for ${domainName}`,
        html: `
          <h2>Welcome aboard!</h2>
          <p>Hi ${first_name || 'there'},</p>
          <p>You've been added as the volunteer leader for <strong>${domainName}</strong>.</p>
          <p>Please follow these steps to finish setting up:</p>
          <ol>
            <li>Visit <a href="${loginUrl}">${loginUrl}</a> and sign in with this email address.</li>
            <li>Create your password when prompted (or use "Forgot password" if you've already signed up).</li>
            <li>Complete any missing profile details and fill out the emergency contact form.</li>
            <li>Once finished, you'll see your Volunteer Leader dashboard with all the roles you manage.</li>
          </ol>
          <p>If you have any questions or need help getting started, just reply to this email.</p>
          <p>Thank you for leading our volunteers!</p>
        `
      }
    });
  }

  function withTimeout(promise, ms, message = 'Request timed out. Please check your connection and try again.') {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
  }

  function getCreateLeaderErrorMessage(err) {
    const msg = (err?.message || err?.error_description || '').toLowerCase();
    if (msg.includes('already') && (msg.includes('registered') || msg.includes('exists') || msg.includes('email'))) {
      return 'This email is already in use. Select them from the dropdown above, or use a different email.';
    }
    return err?.message || err?.error_description || 'Failed to create volunteer leader.';
  }

  async function createLeaderAndAssign() {
    if (!editingDomain) {
      addLeaderError = 'No domain selected.';
      return;
    }
    const first = addLeaderForm.first_name?.trim() || '';
    const last = addLeaderForm.last_name?.trim() || '';
    const email = addLeaderForm.email?.trim() || '';
    if (!first || !last || !email) {
      addLeaderError = 'First name, last name, and email are required.';
      return;
    }
    addingLeader = true;
    addLeaderError = '';
    const domainId = editingDomain.id;
    const domainName = editingDomain.name;
    const leaderDetails = { first_name: first, last_name: last, email, phone: addLeaderForm.phone?.trim() || null };
    try {
      await withTimeout(
        (async () => {
          const userId = await createLeaderAccount(leaderDetails);
          await domains.assignLeader(domainId, userId);
          await fetchVolunteerLeaders();
          closeAddLeaderModal();
          showForm = false;
          editingDomain = null;
          leaderAssignSuccess = {
            domainName,
            leaderName: `${first} ${last}`.trim(),
            leaderEmail: email
          };
          await fetchDomainsForCurrentUser();
          await fetchAllRoles();
          sendLeaderInviteEmail({ email, first_name: first, domainName })
            .then(() => {})
            .catch((err) => {
              console.error('Leader invite email failed:', err);
              leaderAssignSuccess = { ...leaderAssignSuccess, emailFailed: true };
            });
        })(),
        25_000
      );
    } catch (err) {
      console.error('Create leader error:', err);
      addLeaderError = getCreateLeaderErrorMessage(err);
    } finally {
      addingLeader = false;
    }
  }

onMount(() => {
  let cancelled = false;

  (async () => {
    const authState = await waitForAuthReady();

    isAdminUser = !!authState?.isAdmin;
    isLeaderUser = authState?.profile?.role === 'volunteer_leader';
    currentUserId = authState?.user?.id || null;

    if (!isAdminUser && !isLeaderUser) {
      push('/volunteer');
      return;
    }

    try {
      loading = true;
      error = '';

      const searchParams = getHashSearchParams();
      initialManageDomainId = searchParams.get('manageDomain');

      await fetchDomainsForCurrentUser();

      if (isAdminUser) {
        await fetchVolunteerLeaders();
      }

      await fetchAllRoles();

      if (initialManageDomainId) {
        const domainList = get(domains);
        const matchedDomain = domainList.find(d => d.id === initialManageDomainId);
        if (matchedDomain && canManageDomain(matchedDomain)) {
          assigningRoles = matchedDomain;
          showForm = false;
          refreshKey++;
        }
      }
    } catch (err) {
      if (!cancelled) {
        error = err.message || 'Unable to load domains.';
      }
    } finally {
      if (!cancelled) {
        loading = false;
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe();
  };
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

  async function fetchAllRoles() {
    let query = supabase
      .from('volunteer_roles')
      .select('id, name, event_date, domain_id')
      .order('event_date', { ascending: true })
      .order('name', { ascending: true });

    if (!isAdminUser) {
      const filters = [];

      if (accessibleDomainIds.length) {
        const formattedIds = accessibleDomainIds
          .map(id => `'${id}'`)
          .join(',');
        filters.push(`domain_id.in.(${formattedIds})`);
      }

      filters.push('domain_id.is.null');
      query = query.or(filters.join(','));
    }

    const { data, error: rolesError } = await query;

    if (rolesError) {
      throw rolesError;
    }

    if (data) {
      allRoles = [...data];
    }
  }

  function showCreateForm() {
    if (!isAdminUser) return;
    editingDomain = null;
    formData = { name: '', description: '', leader_id: null };
    showForm = true;
    leaderAssignSuccess = null;
  }

  function showEditForm(domain) {
    if (!canEditDomain(domain)) return;
    editingDomain = domain;
    formData = {
      name: domain.name,
      description: domain.description || '',
      leader_id: domain.leader_id
    };
    showForm = true;
    leaderAssignSuccess = null;
  }

  function cancelForm() {
    showForm = false;
    editingDomain = null;
    leaderAssignSuccess = null;
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
      await fetchDomainsForCurrentUser();
      await fetchAllRoles();
    } catch (err) {
      error = err.message;
    }
  }

  async function handleDelete(domainId) {
    if (!isAdminUser) return;

    if (!confirm('Are you sure you want to delete this domain? Roles will be unassigned.')) {
      return;
    }

    try {
      await domains.deleteDomain(domainId);
      await fetchDomainsForCurrentUser();
      await fetchAllRoles();
    } catch (err) {
      error = err.message;
      alert(err.message);
    }
  }

  async function showRoleAssignment(domain) {
    if (!canManageDomain(domain)) return;
    assigningRoles = domain;
    showForm = false;
    await tick();
    const el = document.querySelector('.assign-roles-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelRoleAssignment() {
    assigningRoles = null;
    leaderAssignSuccess = null;
  }

  async function toggleRoleAssignment(roleId, domainId, currentDomainId) {
    if (!canManageDomain(assigningRoles)) {
      error = 'You do not have permission to manage this domain.';
      return;
    }

    if (!isAdminUser && !accessibleDomainIds.includes(domainId)) {
      error = 'You do not have permission to manage this domain.';
      return;
    }

    try {
      const newDomainId = currentDomainId === domainId ? null : domainId;
      
      const { error: updateError } = await supabase
        .from('volunteer_roles')
        .update({ domain_id: newDomainId })
        .eq('id', roleId);

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      // Refresh data and force UI update
      await fetchAllRoles();
      const refreshedDomains = await fetchDomainsForCurrentUser();
      if (assigningRoles) {
        const updatedDomain = refreshedDomains.find(d => d.id === assigningRoles.id);
        if (updatedDomain) {
          assigningRoles = updatedDomain;
        }
      }
      
      // Force Svelte to re-render by incrementing the refresh key
      refreshKey++;
    } catch (err) {
      console.error('Toggle assignment error:', err);
      error = err.message;
      alert(`Error: ${err.message}`);
    }
  }

  function getRolesForDomain(domainId) {
    return allRoles.filter(r => r.domain_id === domainId);
  }

  function getUnassignedRoles() {
    return allRoles.filter(r => !r.domain_id);
  }

  function getHashSearchParams() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) {
      return new URLSearchParams();
    }
    const queryString = hash.slice(queryIndex + 1);
    return new URLSearchParams(queryString);
  }

  function createRoleForDomain(domain) {
    if (!domain) return;
    assigningRoles = null;
    const params = new URLSearchParams({
      domainId: domain.id,
      returnTo: '/admin/domains',
      returnDomainId: domain.id
    });
    push(`/admin/roles/new?${params.toString()}`);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="domains-page">
  <div class="header">
    <div>
      <h1>Volunteer Leader Domains</h1>
      <p>Organize roles by department and assign leaders</p>
    </div>
    
    {#if isAdminUser}
      <button class="btn btn-primary" on:click={showCreateForm}>
        + Create Domain
      </button>
    {/if}
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if leaderAssignSuccess}
    <div class="alert alert-success leader-assign-success">
      <strong>✓ {leaderAssignSuccess.leaderName}</strong> is now the volunteer leader for <strong>{leaderAssignSuccess.domainName}</strong>.
      {#if leaderAssignSuccess.emailFailed}
        <span class="email-failed">The notification email could not be sent. Please contact {leaderAssignSuccess.leaderEmail} manually.</span>
      {:else}
        An email has been sent to {leaderAssignSuccess.leaderEmail}.
      {/if}
      <button type="button" class="btn-dismiss" on:click={() => (leaderAssignSuccess = null)} aria-label="Dismiss">×</button>
    </div>
  {/if}

  {#if assigningRoles}
    <div class="assign-roles-card">
      <div class="assign-header">
        <h3>Assign Roles to {assigningRoles.name}</h3>
        <div class="assign-actions">
          {#if canManageDomain(assigningRoles)}
            <button
              class="btn btn-primary btn-sm"
              type="button"
              on:click={() => createRoleForDomain(assigningRoles)}
            >
              + Create Role
            </button>
          {/if}
          <button class="btn btn-secondary btn-sm" on:click={cancelRoleAssignment}>
            Done
          </button>
        </div>
      </div>

      <div class="roles-assignment">
        {#key refreshKey}
        <div class="assigned-section">
          <h4>Assigned Roles ({getRolesForDomain(assigningRoles.id).length})</h4>
          {#if getRolesForDomain(assigningRoles.id).length === 0}
            <p class="empty-text">No roles assigned yet. Select from unassigned roles below.</p>
          {:else}
            <div class="role-list">
              {#each getRolesForDomain(assigningRoles.id) as role (role.id)}
                <div class="role-item assigned">
                  <div class="role-info">
                    <strong>{role.name}</strong>
                    <span class="role-date">{role.event_date}</span>
                  </div>
                  <button
                    class="btn-remove"
                    on:click={() => toggleRoleAssignment(role.id, assigningRoles.id, role.domain_id)}
                    title="Remove from domain"
                  >
                    ✕
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="unassigned-section">
          <h4>Unassigned Roles ({getUnassignedRoles().length})</h4>
          {#if getUnassignedRoles().length === 0}
            <p class="empty-text">All roles are assigned to domains.</p>
          {:else}
            <div class="role-list">
              {#each getUnassignedRoles() as role (role.id)}
                <div class="role-item unassigned">
                  <div class="role-info">
                    <strong>{role.name}</strong>
                    <span class="role-date">{role.event_date}</span>
                  </div>
                  <button
                    class="btn-add"
                    on:click={() => toggleRoleAssignment(role.id, assigningRoles.id, role.domain_id)}
                    title="Add to domain"
                  >
                    + Add
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {/key}
      </div>
    </div>
  {:else if showForm}
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

        {#if isAdminUser}
          <div class="form-group">
            <label for="leader_id">Assign Volunteer Leader</label>
            <select
              id="leader_id"
              bind:value={formData.leader_id}
              on:change={handleLeaderSelectChange}
              disabled={addingLeader}
            >
              <option value={null}>No leader assigned</option>
              {#each volunteerLeaders as leader}
                <option value={leader.id}>
                  {leader.first_name} {leader.last_name} ({leader.email})
                </option>
              {/each}
              <option value={ADD_NEW_LEADER}>➕ Add new leader</option>
            </select>
          </div>
        {/if}

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
  {:else if loading}
    <div class="loading">Loading domains...</div>
  {:else if $domains.length === 0}
    <div class="empty">
      <h2>No domains yet</h2>
      <p>Create domains to organize your volunteer roles</p>
    </div>
  {:else}
    <div class="domains-table-container">
      <table class="domains-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Description</th>
            <th>Leader</th>
            <th>Contact</th>
            <th>Roles</th>
            <th class="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each $domains as domain (domain.id)}
            <tr>
              <td class="domain-name-cell">
                <div class="domain-name">
                  <strong>{domain.name}</strong>
                  {#if canManageDomain(domain)}
                    <button
                      class="btn btn-xs btn-info"
                      type="button"
                      on:click={() => showRoleAssignment(domain)}
                    >
                      📋 Manage Roles
                    </button>
                  {/if}
                </div>
              </td>
              <td class="domain-desc">
                {domain.description || '—'}
              </td>
              <td>
                {#if domain.leader}
                  <div class="leader-name">
                    {domain.leader.first_name} {domain.leader.last_name}
                  </div>
                {:else}
                  <span class="no-leader">No leader assigned</span>
                {/if}
              </td>
              <td>
                {#if domain.leader}
                  <div class="leader-contact">
                    <a href="mailto:{domain.leader.email}">{domain.leader.email}</a>
                    {#if domain.leader.phone}
                      <div class="leader-phone">📱 {domain.leader.phone}</div>
                    {/if}
                  </div>
                {:else}
                  —
                {/if}
              </td>
              <td class="roles-count">
                {domain.role_count || 0}
              </td>
              <td class="action-buttons-cell">
                <div class="action-buttons">
                  {#if canEditDomain(domain)}
                    <button
                      class="btn btn-xs btn-secondary"
                      type="button"
                      on:click={() => showEditForm(domain)}
                    >
                      Edit
                    </button>
                  {/if}

                  {#if isAdminUser}
                    <button
                      class="btn btn-xs btn-danger"
                      type="button"
                      on:click={() => handleDelete(domain.id)}
                    >
                      Delete
                    </button>
                  {/if}
                </div>

              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showAddLeaderModal}
    <div class="modal-overlay" on:click={closeAddLeaderModal}>
      <div class="modal-content add-leader-modal" role="dialog" aria-modal="true" aria-labelledby="add-leader-title" tabindex="-1" on:click|stopPropagation>
        <button class="modal-close" on:click={closeAddLeaderModal} aria-label="Close">×</button>
        <div class="modal-header">
          <h2 id="add-leader-title">Add New Volunteer</h2>
          <p class="modal-subtitle">
            Create a new volunteer leader and assign them to <strong>{editingDomain?.name || 'this domain'}</strong>.
            An invitation email will be sent to set up their account.
          </p>
        </div>
        <div class="modal-body">
          {#if addLeaderError}
            <div class="alert alert-error">{addLeaderError}</div>
          {/if}
          <div class="form-row">
            <div class="form-group">
              <label for="add-leader-first">First Name *</label>
              <input
                id="add-leader-first"
                type="text"
                bind:value={addLeaderForm.first_name}
                placeholder="First name"
                disabled={addingLeader}
              />
            </div>
            <div class="form-group">
              <label for="add-leader-last">Last Name *</label>
              <input
                id="add-leader-last"
                type="text"
                bind:value={addLeaderForm.last_name}
                placeholder="Last name"
                disabled={addingLeader}
              />
            </div>
          </div>
          <div class="form-group">
            <label for="add-leader-email">Email Address *</label>
            <input
              id="add-leader-email"
              type="email"
              bind:value={addLeaderForm.email}
              placeholder="email@example.com"
              disabled={addingLeader}
            />
            <small>An invitation email will be sent to this address.</small>
          </div>
          <div class="form-group">
            <label for="add-leader-phone">Phone Number (Optional)</label>
            <input
              id="add-leader-phone"
              type="tel"
              bind:value={addLeaderForm.phone}
              placeholder="(555) 123-4567"
              disabled={addingLeader}
            />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" on:click={closeAddLeaderModal} disabled={addingLeader}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" on:click={createLeaderAndAssign} disabled={addingLeader}>
            {addingLeader ? 'Creating...' : 'Create Volunteer'}
          </button>
        </div>
      </div>
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

  .alert-success {
    background: #d4edda;
    color: #155724;
    border-color: #c3e6cb;
  }

  .leader-assign-success {
    position: relative;
    padding-right: 2.5rem;
  }

  .leader-assign-success .btn-dismiss {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: transparent;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: #155724;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .leader-assign-success .btn-dismiss:hover {
    color: #0d3d1a;
  }

  .leader-assign-success .email-failed {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.9rem;
    opacity: 0.9;
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

  .domains-table-container {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    overflow-x: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
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

  .btn-xs {
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
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

  .btn-info {
    background: white;
    color: #17a2b8;
    border: 1px solid #17a2b8;
  }

  .btn-info:hover {
    background: #17a2b8;
    color: white;
  }

  .assign-roles-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }

  .assign-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #dee2e6;
    gap: 1rem;
  }

  .assign-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .assign-header h3 {
    margin: 0;
    color: #1a1a1a;
  }

  .roles-assignment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .assigned-section,
  .unassigned-section {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .assigned-section {
    background: #f8fff9;
    border-color: #c3e6cb;
  }

  .unassigned-section {
    background: #fff8f8;
    border-color: #f5c6cb;
  }

  .assigned-section h4,
  .unassigned-section h4 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.1rem;
  }

  .empty-text {
    color: #6c757d;
    font-style: italic;
    text-align: center;
    padding: 2rem 1rem;
  }

  .role-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .role-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 6px;
    gap: 1rem;
  }

  .role-item.assigned {
    background: white;
    border: 1px solid #c3e6cb;
  }

  .role-item.unassigned {
    background: white;
    border: 1px solid #f5c6cb;
  }

  .role-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .role-info strong {
    color: #1a1a1a;
    font-size: 0.95rem;
  }

  .role-date {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .btn-add,
  .btn-remove {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn-add {
    background: #28a745;
    color: white;
  }

  .btn-add:hover {
    background: #218838;
  }

  .btn-remove {
    background: #dc3545;
    color: white;
  }

  .btn-remove:hover {
    background: #c82333;
  }

  .domains-table {
    width: 100%;
    border-collapse: collapse;
  }

  .domains-table thead {
    background: #f8f9fa;
  }

  .domains-table th,
  .domains-table td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid #e9ecef;
    vertical-align: top;
  }

  .domains-table th {
    font-size: 0.85rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #6c757d;
  }

  .domain-name {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .domain-desc {
    color: #495057;
  }

  .leader-name {
    font-weight: 600;
  }

  .leader-contact {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }

  .leader-contact a {
    color: #007bff;
    text-decoration: none;
  }

  .leader-contact a:hover {
    text-decoration: underline;
  }

  .leader-phone {
    color: #495057;
  }

  .no-leader {
    color: #6c757d;
    font-style: italic;
  }

  .roles-count {
    font-weight: 700;
    color: #007bff;
    min-width: 3rem;
  }

  .action-buttons-cell {
    min-width: 200px;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .actions-column {
    width: 18%;
  }

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
    max-width: 520px;
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
    z-index: 1;
  }

  .modal-close:hover {
    background: #e2e3e5;
    color: #1a1a1a;
  }

  .add-leader-modal .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    padding-right: 4rem;
    border-bottom: 1px solid #dee2e6;
  }

  .add-leader-modal .modal-header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
  }

  .add-leader-modal .modal-subtitle {
    margin: 0;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .add-leader-modal .modal-body {
    padding: 2rem;
  }

  .add-leader-modal .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .add-leader-modal .form-group {
    margin-bottom: 1.5rem;
  }

  .add-leader-modal .form-group small {
    display: block;
    margin-top: 0.35rem;
    color: #6c757d;
    font-size: 0.85rem;
  }

  .add-leader-modal .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 2rem 2rem;
    border-top: 1px solid #dee2e6;
  }

  @media (max-width: 1024px) {
    .domains-table th,
    .domains-table td {
      padding: 0.75rem;
    }
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      gap: 1rem;
    }

    .roles-assignment {
      grid-template-columns: 1fr;
    }

    .domains-table-container {
      border-radius: 8px;
    }

    .domains-table th,
    .domains-table td {
      font-size: 0.9rem;
    }
  }
</style>

