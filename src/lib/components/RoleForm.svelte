<script>
  // @ts-nocheck
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { supabase } from '../supabaseClient';
  import { domains } from '../stores/domains';
  import { getCriticalPositionsRequired, normalizeCriticalPositionsInput } from '../utils/criticalSpots';

  export let role = null;
  export let loading = false;
  export let defaultDomainId = null;

  let volunteerLeaders = [];

  const dispatch = createEventDispatcher();

  onMount(async () => {
    // Use domains store (same as RolesList/Domains page). Fetch if empty (e.g. direct nav to /admin/roles/new).
    if (get(domains).length === 0) {
      try {
        await domains.fetchDomains();
      } catch (e) {
        console.warn('RoleForm: could not load domains', e);
      }
    }

    // Fetch volunteer leaders for legacy direct assignment
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'volunteer_leader')
      .order('last_name', { ascending: true });
    
    if (data) {
      volunteerLeaders = data;
    }
  });

  let formData = {
    name: '',
    description: '',
    event_date: '',
    completion_month: '',
    start_time: '',
    end_time: '',
    location: '',
    positions_total: 1,
    critical_positions_required: 0,
    domain_id: null,
    leader_id: null,
    critical: false
  };

  if (role) {
    formData.name = role.name || '';
    formData.description = role.description || '';
    formData.event_date = role.event_date || '';
    formData.completion_month =
      role.completion_month && String(role.completion_month).length >= 7
        ? String(role.completion_month).slice(0, 7)
        : '';
    formData.start_time = role.start_time || '';
    formData.end_time = role.end_time || '';
    formData.location = role.location || '';
    formData.positions_total = role.positions_total || 1;
    formData.critical_positions_required = getCriticalPositionsRequired(role);
    formData.domain_id = role.domain_id || null;
    formData.leader_id = role.leader_id || null;
  } else if (defaultDomainId) {
    formData.domain_id = defaultDomainId;
  }

  $: if (formData.event_date) formData.completion_month = '';
  $: if (formData.completion_month) formData.event_date = '';

  $: formData.critical_positions_required = normalizeCriticalPositionsInput(
    formData.critical_positions_required,
    formData.positions_total
  );

  $: if (!role && defaultDomainId && formData.domain_id !== defaultDomainId) {
    formData.domain_id = defaultDomainId;
  }

  function handleSubmit() {
    dispatch('submit', formData);
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="role-form">
  <div class="form-group">
    <label for="name">Role Name *</label>
    <input
      type="text"
      id="name"
      bind:value={formData.name}
      required
      placeholder="e.g., Registration Table"
      disabled={loading}
    />
  </div>

  <div class="form-group">
    <label for="description">Description</label>
    <textarea
      id="description"
      bind:value={formData.description}
      rows="4"
      placeholder="Describe the volunteer responsibilities..."
      disabled={loading}
    ></textarea>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="event_date">Event date</label>
      <input
        type="date"
        id="event_date"
        bind:value={formData.event_date}
        disabled={loading || !!formData.completion_month}
      />
    </div>

    <div class="form-group">
      <label for="positions_total">Number of Positions *</label>
      <input
        type="number"
        id="positions_total"
        bind:value={formData.positions_total}
        min="1"
        required
        disabled={loading}
      />
    </div>
  </div>

  <div class="form-group">
    <label for="completion_month">Complete during month (no specific day)</label>
    <input
      type="month"
      id="completion_month"
      bind:value={formData.completion_month}
      disabled={loading || !!formData.event_date}
    />
    <small>Optional. Pick a calendar month when the work should be done, without a fixed day or time. Clears event date above when set.</small>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="start_time">Start time</label>
      <input
        type="time"
        id="start_time"
        bind:value={formData.start_time}
        disabled={loading}
      />
    </div>

    <div class="form-group">
      <label for="end_time">End time</label>
      <input
        type="time"
        id="end_time"
        bind:value={formData.end_time}
        disabled={loading}
      />
    </div>
  </div>

  <p class="schedule-hint">
    Leave date and time blank for a <strong>flexible</strong> schedule (shown as Flexible to volunteers). You can combine a specific date with flexible times, or a month window with flexible times.
  </p>

  <div class="form-group">
    <label for="location">Location/Meeting Point</label>
    <input
      type="text"
      id="location"
      bind:value={formData.location}
      placeholder="e.g., Main tent near start/finish"
      disabled={loading}
    />
  </div>

  <div class="form-group">
    <label for="critical_positions_required">Critical Spots Required</label>
    <input
      type="number"
      id="critical_positions_required"
      bind:value={formData.critical_positions_required}
      min="0"
      max={formData.positions_total}
      disabled={loading}
    />
    <small>
      Set how many of this role's spots are must-fill. Use 0 for nice-to-have only, or up to {formData.positions_total}.
    </small>
  </div>

  <div class="form-group">
    <label for="domain_id">Domain (Recommended)</label>
    <select
      id="domain_id"
      bind:value={formData.domain_id}
      disabled={loading}
    >
      <option value={null}>No domain</option>
      {#each $domains as domain}
        <option value={domain.id}>
          {domain.name}
          {#if domain.leader}
            - Led by {domain.leader.first_name} {domain.leader.last_name}
          {/if}
        </option>
      {/each}
    </select>
    <small>Assign to a domain (inherits domain's leader)</small>
  </div>

  <div class="form-group">
    <label for="leader_id">Or Direct Leader Assignment (Legacy)</label>
    <select
      id="leader_id"
      bind:value={formData.leader_id}
      disabled={loading}
    >
      <option value={null}>No direct leader</option>
      {#each volunteerLeaders as leader}
        <option value={leader.id}>
          {leader.first_name} {leader.last_name} ({leader.email})
        </option>
      {/each}
    </select>
    <small>Only use if not assigning to a domain</small>
  </div>

  <div class="form-actions">
    <button
      type="button"
      class="btn btn-secondary"
      on:click={handleCancel}
      disabled={loading}
    >
      Cancel
    </button>
    
    <button
      type="submit"
      class="btn btn-primary"
      disabled={loading}
    >
      {loading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
    </button>
  </div>
</form>

<style>
  .role-form {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
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

  input:disabled,
  textarea:disabled,
  select:disabled {
    background: #f8f9fa;
    cursor: not-allowed;
  }

  small {
    display: block;
    margin-top: 0.25rem;
    color: #6c757d;
    font-size: 0.875rem;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: white;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f8f9fa;
  }

  .schedule-hint {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    background: #f8f9fa;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #495057;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>

