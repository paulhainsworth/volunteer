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
  let selectedRole = null; // For modal
  let copyMessage = '';
  let copyMessageTimeout = null;

  onMount(async () => {
    // Redirect to onboarding if no emergency contact
    if ($auth.user && !$auth.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

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

  function getDomainMeta(role) {
    const domainName = role.domain?.name || 'General Opportunities';
    const leader = role.domain?.leader || role.direct_leader;
    const leaderName = [leader?.first_name, leader?.last_name].filter(Boolean).join(' ').trim() || 'Volunteer Leader TBD';
    return {
      name: domainName,
      leaderName,
      leader
    };
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

  $: groupedDomains = (() => {
    const map = new Map();
    filteredRoles.forEach(role => {
      const domainId = role.domain?.id || `general-${role.direct_leader?.id || 'unassigned'}`;
      const meta = getDomainMeta(role);
      const remainingSpots = Math.max((role.positions_total || 0) - (role.positions_filled || 0), 0);

      if (!map.has(domainId)) {
        map.set(domainId, {
          id: domainId,
          name: meta.name,
          leaderName: meta.leaderName,
          leader: meta.leader,
          roles: [],
          openSpots: 0
        });
      }

      const domainEntry = map.get(domainId);
      domainEntry.roles.push(role);
      domainEntry.openSpots += remainingSpots;
    });

    return Array.from(map.values()).sort((a, b) => {
      const firstRoleA = a.roles[0];
      const firstRoleB = b.roles[0];
      const dateCompare = new Date(firstRoleA.event_date) - new Date(firstRoleB.event_date);
      if (dateCompare !== 0) return dateCompare;
      return firstRoleA.start_time.localeCompare(firstRoleB.start_time);
    });
  })();

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

  function copyRoleLink(role) {
    const url = `${window.location.origin}#/signup/${role.id}`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showCopyMessage('Link copied to clipboard!'))
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(url) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        showCopyMessage('Link copied to clipboard!');
      } else {
        showCopyMessage('Copy not supported. Please copy the link manually.', true);
        window.prompt('Copy this volunteer role link:', url);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      showCopyMessage('Copy not supported. Please copy the link manually.', true);
      window.prompt('Copy this volunteer role link:', url);
    }
  }

  function showCopyMessage(message, isError = false) {
    copyMessage = isError ? `⚠️ ${message}` : message;

    if (copyMessageTimeout) {
      clearTimeout(copyMessageTimeout);
    }

    copyMessageTimeout = setTimeout(() => {
      copyMessage = '';
      copyMessageTimeout = null;
    }, 4000);
  }

  function showMoreInfo(role) {
    selectedRole = role;
  }

  function closeModal() {
    selectedRole = null;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && selectedRole) {
      closeModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

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
    <div class="domains-list">
      {#each groupedDomains as domain (domain.id)}
        <section class="domain-section">
          <div class="domain-header">
            <div class="domain-info">
              <h2>{domain.name}</h2>
              <p>Led by {domain.leaderName}</p>
            </div>
            <div class="domain-summary">
              <span>{domain.openSpots} open spot{domain.openSpots === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div class="roles-grid">
            {#each domain.roles as role (role.id)}
              {@const status = getFillStatus(role)}
              {@const duration = calculateDuration(role.start_time, role.end_time)}
              {@const isFull = role.positions_filled >= role.positions_total}

              <div class="role-card">
                <div class="role-header">
                  <div>
                    <h3>{role.name}</h3>
                    <div class="role-meta">
                      <span class="role-meta-label">Team</span>
                      <span class="role-meta-value">{domain.name}</span>
                    </div>
                  </div>
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
                    on:click={() => showMoreInfo(role)}
                    title="View full details"
                  >
                    More Info
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

{#if selectedRole}
  {@const status = getFillStatus(selectedRole)}
  {@const duration = calculateDuration(selectedRole.start_time, selectedRole.end_time)}
  {@const isFull = selectedRole.positions_filled >= selectedRole.positions_total}
  {@const domainMeta = getDomainMeta(selectedRole)}
  
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeModal} aria-label="Close">
        ✕
      </button>
      
      <div class="modal-header">
        <h2>{selectedRole.name}</h2>
        <span class="status-badge {status.class}">{status.label}</span>
      </div>

      <div class="modal-body">
        <div class="modal-details">
          <div class="detail-row">
            <span class="icon">📅</span>
            <div>
              <strong>Date</strong>
              <p>{format(new Date(selectedRole.event_date), 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
          
          <div class="detail-row">
            <span class="icon">🕐</span>
            <div>
              <strong>Time</strong>
              <p>{formatTime(selectedRole.start_time)} - {formatTime(selectedRole.end_time)} ({duration}h)</p>
            </div>
          </div>

          {#if selectedRole.location}
            <div class="detail-row">
              <span class="icon">📍</span>
              <div>
                <strong>Location</strong>
                <p>{selectedRole.location}</p>
              </div>
            </div>
          {/if}

          <div class="detail-row">
            <span class="icon">👥</span>
            <div>
              <strong>Positions</strong>
              <p>{selectedRole.positions_filled} / {selectedRole.positions_total} spots filled</p>
            </div>
          </div>

          <div class="detail-row">
            <span class="icon">🤝</span>
            <div>
              <strong>Team</strong>
              <p>{domainMeta.name} • Led by {domainMeta.leaderName}</p>
            </div>
          </div>
        </div>

        {#if selectedRole.description}
          <div class="description-section">
            <strong>Description</strong>
            <p>{selectedRole.description}</p>
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-primary btn-large"
          on:click={() => handleSignup(selectedRole.id)}
          disabled={isFull}
        >
          {isFull ? 'This role is full' : 'Sign Up for This Role'}
        </button>
        
        <button
          class="btn btn-secondary"
          on:click={() => handleShare(selectedRole)}
        >
          Share This Opportunity
        </button>

        <button
          class="btn btn-outline"
          on:click={() => copyRoleLink(selectedRole)}
        >
          Copy Link
        </button>
      </div>

      {#if copyMessage}
        <div class="copy-message">
          {copyMessage}
        </div>
      {/if}
    </div>
  </div>
{/if}

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

  .domains-list {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .domain-section {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
  }

  .domain-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    border-bottom: 1px solid #f1f3f5;
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .domain-info h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #1a1a1a;
  }

  .domain-info p {
    margin: 0.4rem 0 0 0;
    color: #4c5d78;
    font-weight: 500;
  }

  .domain-summary {
    padding: 0.4rem 0.8rem;
    background: #f1f5ff;
    color: #2a4b9b;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.9rem;
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

  .role-meta {
    margin-top: 0.35rem;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: #6b7280;
  }

  .role-meta-label {
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.06em;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .role-meta-value {
    font-weight: 600;
    color: #1f2937;
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

  .btn-outline {
    padding: 0.75rem;
    border-radius: 6px;
    font-weight: 600;
    background: white;
    color: #1f2937;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .btn-outline:hover {
    background: #f8fafc;
    border-color: #94a3b8;
  }

  .copy-message {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: #eef2ff;
    color: #1e3a8a;
    border-radius: 8px;
    font-size: 0.9rem;
    border: 1px solid #c7d2fe;
  }

  /* Modal Styles */
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
    max-width: 600px;
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
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }

  .modal-close:hover {
    background: #e2e3e5;
    color: #1a1a1a;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding-right: 4rem; /* Space for close button */
  }

  .modal-header h2 {
    margin: 0;
    color: #1a1a1a;
    font-size: 1.75rem;
    flex: 1;
  }

  .modal-body {
    padding: 2rem;
  }

  .modal-details {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .detail-row {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .detail-row .icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .detail-row div {
    flex: 1;
  }

  .detail-row strong {
    display: block;
    color: #1a1a1a;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-row p {
    margin: 0;
    color: #495057;
    font-size: 1rem;
  }

  .description-section {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
    margin-top: 1.5rem;
  }

  .description-section strong {
    display: block;
    color: #1a1a1a;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .description-section p {
    margin: 0;
    color: #495057;
    line-height: 1.6;
    font-size: 1rem;
  }

  .modal-actions {
    padding: 1.5rem 2rem 2rem 2rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-large {
    padding: 1rem;
    font-size: 1.1rem;
  }

  @media (max-width: 768px) {
    .filters {
      grid-template-columns: 1fr;
    }

    .domain-section {
      padding: 1.5rem;
    }

    .roles-grid {
      grid-template-columns: 1fr;
    }

    .modal-content {
      max-height: 95vh;
      margin: 0.5rem;
    }

    .modal-header {
      padding: 1.5rem 1.5rem 1rem 1.5rem;
      padding-right: 3.5rem;
    }

    .modal-header h2 {
      font-size: 1.5rem;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-actions {
      padding: 1rem 1.5rem 1.5rem 1.5rem;
    }
  }
</style>

