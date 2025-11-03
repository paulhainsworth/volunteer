<script>
  import { onMount } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { auth } from '../../lib/stores/auth';
  import { format } from 'date-fns';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let error = '';
  let searchQuery = '';
  let sortBy = 'date';
  let filterDate = '';
  let filterStatus = 'all';

  onMount(async () => {
    try {
      await roles.fetchRoles();
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

  function getFillStatus(role) {
    const percentage = (role.positions_filled / role.positions_total) * 100;
    if (percentage >= 100) return { label: 'Full', class: 'full' };
    if (percentage >= 75) return { label: 'Almost Full', class: 'almost-full' };
    if (percentage >= 50) return { label: 'Filling Up', class: 'filling' };
    return { label: 'Available', class: 'available' };
  }

  $: filteredRoles = $roles
    .filter(role => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = role.name.toLowerCase().includes(query);
        const matchesDescription = role.description?.toLowerCase().includes(query);
        const matchesLocation = role.location?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription && !matchesLocation) return false;
      }

      // Date filter
      if (filterDate && role.event_date !== filterDate) return false;

      // Status filter
      if (filterStatus === 'available' && role.positions_filled >= role.positions_total) return false;
      if (filterStatus === 'urgent') {
        const percentage = (role.positions_filled / role.positions_total) * 100;
        const daysUntil = Math.ceil((new Date(role.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        if (percentage >= 50 || daysUntil > 7) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateCompare = new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.start_time.localeCompare(b.start_time);
      }
      if (sortBy === 'duration') {
        const durationA = calculateDuration(a.start_time, a.end_time);
        const durationB = calculateDuration(b.start_time, b.end_time);
        return durationA - durationB;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

  function handleSignup(roleId) {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }
    push(`/signup/${roleId}`);
  }

  function handleShare(role) {
    const url = `${window.location.origin}#/signup/${role.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: role.name,
        text: `Sign up to volunteer: ${role.name}`,
        url: url
      });
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  }
</script>

<div class="browse-roles">
  <div class="header">
    <h1>Volunteer Opportunities</h1>
    <p>Find a role that fits your schedule and interests</p>
  </div>

  <div class="filters">
    <input
      type="text"
      placeholder="Search roles..."
      bind:value={searchQuery}
      class="search-input"
    />

    <select bind:value={sortBy} class="filter-select">
      <option value="date">Sort by Date</option>
      <option value="name">Sort by Name</option>
      <option value="duration">Sort by Duration</option>
    </select>

    <select bind:value={filterStatus} class="filter-select">
      <option value="all">All Roles</option>
      <option value="available">Available Only</option>
      <option value="urgent">Urgent Need</option>
    </select>

    <input
      type="date"
      bind:value={filterDate}
      class="filter-select"
      placeholder="Filter by date"
    />
  </div>

  {#if loading}
    <div class="loading">Loading opportunities...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if filteredRoles.length === 0}
    <div class="empty">
      <p>No volunteer opportunities found matching your filters.</p>
    </div>
  {:else}
    <div class="roles-grid">
      {#each filteredRoles as role (role.id)}
        {@const status = getFillStatus(role)}
        {@const duration = calculateDuration(role.start_time, role.end_time)}
        {@const isFull = role.positions_filled >= role.positions_total}
        
        <div class="role-card">
          <div class="role-header">
            <h3>{role.name}</h3>
            <span class="status-badge {status.class}">{status.label}</span>
          </div>

          <div class="role-details">
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

            <div class="detail">
              <span class="icon">👥</span>
              <span>{role.positions_filled} / {role.positions_total} spots filled</span>
            </div>
          </div>

          {#if role.description}
            <p class="description">{role.description}</p>
          {/if}

          <div class="role-actions">
            <button
              class="btn btn-primary"
              on:click={() => handleSignup(role.id)}
              disabled={isFull}
            >
              {isFull ? 'Full' : 'Sign Up'}
            </button>
            
            <button
              class="btn btn-secondary"
              on:click={() => handleShare(role)}
              title="Share this opportunity"
            >
              Share
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .browse-roles {
    max-width: 1200px;
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
    font-size: 1.1rem;
  }

  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .search-input,
  .filter-select {
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  .search-input:focus,
  .filter-select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .error {
    color: #dc3545;
  }

  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .role-card {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .role-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .role-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .role-header h3 {
    margin: 0;
    color: #1a1a1a;
    font-size: 1.3rem;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge.available {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.filling {
    background: #fff3cd;
    color: #856404;
  }

  .status-badge.almost-full {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.full {
    background: #e2e3e5;
    color: #383d41;
  }

  .role-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .detail {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
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

  .role-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .btn {
    flex: 1;
    padding: 0.75rem;
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
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  @media (max-width: 768px) {
    .filters {
      grid-template-columns: 1fr;
    }

    .roles-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

