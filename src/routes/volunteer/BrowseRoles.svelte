<script>
  import { onMount } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { formatTimeRange, calculateDuration, isFlexibleTime, formatEstimateDuration, formatEventDateInPacific, parseEventDate } from '../../lib/utils/timeDisplay';
  import {
    createVolunteerAndSignup,
    sendRoleConfirmationEmail,
    sendWelcomeEmail
  } from '../../lib/volunteerSignup';
  import { signups } from '../../lib/stores/signups';

  let loading = true;
  let error = '';
  let searchQuery = '';
  let sortBy = 'date';
  let filterStatus = 'all';
  let raceDayFilter = 'all'; // 'all', 'bhrr', 'bsc', 'pre-race', 'post-race'
  let filterDuration = 'all'; // 'all', '1-or-less', '2-3', '4-5', '6-8', 'full-day'
  let selectedRole = null; // For modal
  let expandedDomains = new Set(); // Track which domains are expanded
  let domainsInitialized = false; // Track if we've initialized domains

  // Race dates
  const BHRR_DATE = '2026-04-18'; // Saturday April 18, 2026
  const BSC_DATE = '2026-04-19'; // Sunday April 19, 2026
  let copyMessage = '';
  let copyMessageTimeout = null;

  // PII modal for new volunteer signup (unauthenticated)
  let showPiiModal = false;
  let piiRole = null;
  let piiForm = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: ''
  };
  let piiSubmitting = false;
  let piiError = '';

  onMount(async () => {
    // Redirect to onboarding if no emergency contact
    if ($auth.user && !$auth.profile?.emergency_contact_name) {
      loading = false;
      push('/onboarding');
      return;
    }

    let rolesData = [];
    const timeoutMs = 15000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Check your connection or try again.')), timeoutMs)
    );
    try {
      rolesData = await Promise.race([roles.fetchRoles(), timeoutPromise]) || [];
    } catch (err) {
      error = err?.message || 'Failed to load opportunities.';
      console.error('BrowseRoles fetch error:', err);
    } finally {
      loading = false;
    }

    // If arrived with ?signup=ROLE_ID (e.g. from shared link or confirmation email)
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const queryParams = new URLSearchParams(hash.slice(queryIndex));
      const signupId = queryParams.get('signup');
      if (signupId && rolesData.length) {
        const r = rolesData.find((x) => x.id === signupId);
        if (r) {
          // If user is logged in and already signed up for this role, go to signup page instead of PII modal
          if ($auth.user) {
            try {
              const mySignups = (await signups.fetchMySignups($auth.user.id)) ?? [];
              const alreadySignedUp = mySignups.some((s) => s.role_id === signupId || s.role?.id === signupId);
              if (alreadySignedUp) {
                push(`/signup/${signupId}`);
                return;
              }
            } catch (_) {
              /* fall through to PII modal */
            }
          }
          piiRole = r;
          showPiiModal = true;
        }
      }
    }
  });

  function getFillStatus(role) {
    const percentage = (role.positions_filled / role.positions_total) * 100;
    if (percentage >= 100) return { label: 'Full', class: 'full' };
    if (percentage >= 75) return { label: 'Almost Full', class: 'almost-full' };
    if (percentage >= 50) return { label: 'Filling Up', class: 'filling' };
    return { label: 'Available', class: 'available' };
  }

  /** Duration in hours: estimate_duration_hours if set, else from start/end time. Null if unknown. */
  function getRoleDurationHours(role) {
    if (role.estimate_duration_hours != null && role.estimate_duration_hours > 0) {
      return Number(role.estimate_duration_hours);
    }
    return calculateDuration(role.start_time, role.end_time);
  }

  /** True if role's duration falls in the given bucket. */
  function roleMatchesDurationFilter(role, bucket) {
    if (bucket === 'all') return true;
    const hours = getRoleDurationHours(role);
    if (hours == null) return false;
    switch (bucket) {
      case '1-or-less': return hours <= 1;
      case '2-3': return hours > 1 && hours <= 3;
      case '4-5': return hours > 3 && hours <= 5;
      case '6-8': return hours > 5 && hours <= 8;
      case 'full-day': return hours > 8;
      default: return true;
    }
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

  // Normalize date to YYYY-MM-DD format for consistent comparison
  function normalizeDate(dateValue) {
    if (!dateValue) return null;
    
    // Trim whitespace
    const trimmed = String(dateValue).trim();
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // If it contains 'T' (timestamp), extract just the date part
    if (trimmed.includes('T')) {
      const datePart = trimmed.split('T')[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }
    
    // Try to parse as Date
    const dateObj = new Date(trimmed);
    if (!isNaN(dateObj.getTime())) {
      // Format as YYYY-MM-DD
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // If parsing fails, try extracting YYYY-MM-DD from string
    const match = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    
    return null;
  }

  // Format date in Pacific (America/Los_Angeles); blank → TBD
  function formatDateForDisplay(dateString) {
    return formatEventDateInPacific(dateString, 'long');
  }

  function formatDateCompact(dateString) {
    return formatEventDateInPacific(dateString, 'short');
  }

  // Toggle domain expansion
  function toggleDomain(domainId) {
    const newSet = new Set(expandedDomains);
    if (newSet.has(domainId)) {
      newSet.delete(domainId);
    } else {
      newSet.add(domainId);
    }
    expandedDomains = newSet;
  }

  // Initialize domains as closed by default (only once)
  $: if (groupedDomains && groupedDomains.length > 0 && !domainsInitialized) {
    // Start with all domains closed (empty set)
    expandedDomains = new Set();
    domainsInitialized = true;
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

      // Race day filter (takes precedence over manual date filter)
      if (raceDayFilter !== 'all') {
        const roleDateStr = normalizeDate(role.event_date);
        
        if (!roleDateStr) {
          // If we can't parse the date, skip this role for exact date matches
          if (raceDayFilter === 'bhrr' || raceDayFilter === 'bsc') {
            return false;
          }
          // For pre/post-race, include roles with invalid dates (they'll be filtered elsewhere)
          return true;
        }
        
        if (raceDayFilter === 'bhrr') {
          // Show only April 18, 2026
          if (roleDateStr !== BHRR_DATE) {
            return false;
          }
        } else if (raceDayFilter === 'bsc') {
          // Show only April 19, 2026
          if (roleDateStr !== BSC_DATE) return false;
        } else if (raceDayFilter === 'pre-race') {
          // Show dates before April 18, 2026 (string comparison works for YYYY-MM-DD format)
          if (roleDateStr >= BHRR_DATE) return false;
        } else if (raceDayFilter === 'post-race') {
          // Show dates after April 19, 2026
          if (roleDateStr <= BSC_DATE) return false;
        }
      }

      // Status filter
      const total = role.positions_total ?? 0;
      const filled = role.positions_filled ?? 0;
      if (filterStatus === 'available' && total > 0 && filled >= total) return false;
      if (filterStatus === 'urgent') {
        const percentage = total > 0 ? (filled / total) * 100 : 0;
        const daysUntil = role.event_date
          ? Math.ceil(((parseEventDate(role.event_date)?.getTime() ?? 0) - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : Infinity;
        if (percentage >= 50 || daysUntil > 7) return false;
      }

      // Duration filter
      if (!roleMatchesDurationFilter(role, filterDuration)) return false;

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = parseEventDate(a.event_date)?.getTime() ?? Infinity;
        const timeB = parseEventDate(b.event_date)?.getTime() ?? Infinity;
        const dateCompare = timeA - timeB;
        if (dateCompare !== 0) return dateCompare;
        if (isFlexibleTime(a) && !isFlexibleTime(b)) return 1;
        if (!isFlexibleTime(a) && isFlexibleTime(b)) return -1;
        return (a.start_time || '').localeCompare(b.start_time || '');
      }
      if (sortBy === 'duration') {
        const durationA = calculateDuration(a.start_time, a.end_time);
        const durationB = calculateDuration(b.start_time, b.end_time);
        const da = durationA ?? Infinity;
        const db = durationB ?? Infinity;
        return da - db;
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
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
      const timeA = parseEventDate(firstRoleA.event_date)?.getTime() ?? Infinity;
      const timeB = parseEventDate(firstRoleB.event_date)?.getTime() ?? Infinity;
      const dateCompare = timeA - timeB;
      if (dateCompare !== 0) return dateCompare;
      if (isFlexibleTime(firstRoleA) && !isFlexibleTime(firstRoleB)) return 1;
      if (!isFlexibleTime(firstRoleA) && isFlexibleTime(firstRoleB)) return -1;
      return (firstRoleA.start_time || '').localeCompare(firstRoleB.start_time || '');
    });
  })();

  function handleSignup(roleOrId) {
    const role = typeof roleOrId === 'object' ? roleOrId : $roles.find((r) => r.id === roleOrId);
    if (!$auth.user) {
      piiRole = role;
      piiForm = {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        emergency_contact_name: '',
        emergency_contact_phone: ''
      };
      piiError = '';
      showPiiModal = true;
      return;
    }
    push(`/signup/${role?.id || roleOrId}`);
  }

  function closePiiModal() {
    showPiiModal = false;
    piiRole = null;
    piiError = '';
    piiSubmitting = false;
  }

  async function submitPiiModal() {
    const f = piiForm;
    if (!f.first_name?.trim() || !f.last_name?.trim() || !f.email?.trim()) {
      piiError = 'First name, last name, and email are required.';
      return;
    }
    if (!piiRole) {
      piiError = 'No role selected.';
      return;
    }

    piiSubmitting = true;
    piiError = '';

    try {
      const result = await createVolunteerAndSignup(
        {
          first_name: f.first_name.trim(),
          last_name: f.last_name.trim(),
          email: f.email.trim(),
          phone: f.phone?.trim() || null,
          emergency_contact_name: f.emergency_contact_name?.trim() || null,
          emergency_contact_phone: f.emergency_contact_phone?.trim() || null
        },
        piiRole.id
      );

      sendRoleConfirmationEmail({
        to: result.email,
        first_name: result.first_name,
        role: piiRole,
        roleId: piiRole.id
      }).catch((err) => console.error('Role confirmation email failed:', err));

      sendWelcomeEmail({
        to: result.email,
        first_name: result.first_name
      }).catch((err) => console.error('Welcome email failed:', err));

      closePiiModal();
      push('/my-signups');
    } catch (err) {
      piiError = err.message || 'Signup failed. Please try again.';
    } finally {
      piiSubmitting = false;
    }
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
    if (event.key === 'Escape') {
      if (showPiiModal) closePiiModal();
      else if (selectedRole) closeModal();
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

    <select bind:value={raceDayFilter} class="filter-select">
      <option value="all">All Roles</option>
      <option value="bhrr">Race day: BHRR</option>
      <option value="bsc">Race day: BSC</option>
      <option value="pre-race">Pre-race</option>
      <option value="post-race">Post-race</option>
    </select>

    <select bind:value={filterStatus} class="filter-select">
      <option value="all">All Status</option>
      <option value="available">Available Only</option>
      <option value="urgent">Urgent Need</option>
    </select>

    <select bind:value={filterDuration} class="filter-select">
      <option value="all">Any duration</option>
      <option value="1-or-less">1 hr or less</option>
      <option value="2-3">2–3 hrs</option>
      <option value="4-5">4–5 hrs</option>
      <option value="6-8">6–8 hrs</option>
      <option value="full-day">Full day</option>
    </select>
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
    {@const totalOpenSpots = groupedDomains.reduce((sum, d) => sum + d.openSpots, 0)}
    <div class="opportunities-summary">
      <span>{totalOpenSpots} total open spot{totalOpenSpots === 1 ? '' : 's'}</span>
    </div>

    <div class="domains-list">
      {#each groupedDomains as domain (domain.id)}
        {@const isExpanded = expandedDomains.has(domain.id)}
        <section class="domain-section">
          <div 
            class="domain-header clickable" 
            on:click={() => toggleDomain(domain.id)}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && toggleDomain(domain.id)}
          >
            <div class="domain-toggle">
              <span class="toggle-icon">{isExpanded ? '▼' : '►'}</span>
              <div class="domain-info">
                <h2>{domain.name}</h2>
                <p>Led by {domain.leaderName}</p>
              </div>
            </div>
            <div class="domain-summary">
              <span>{domain.openSpots} open</span>
            </div>
          </div>

          {#if isExpanded}
            <div class="roles-grid">
              {#each domain.roles as role (role.id)}
                {@const status = getFillStatus(role)}
                {@const duration = calculateDuration(role.start_time, role.end_time)}
                {@const isFull = role.positions_filled >= role.positions_total}

                <div class="role-card compact">
                  <div class="role-main">
                    <div class="role-title-row">
                      <h3>{role.name}</h3>
                      <span class="status-badge {status.class}">{status.label}</span>
                    </div>

                    <div class="role-details-compact">
                      <div class="detail-inline">
                        <span class="icon">📅</span>
                        <span>{formatDateCompact(role.event_date)}</span>
                      </div>
                      
                      <div class="detail-inline">
                        <span class="icon">🕐</span>
                        <span>{formatTimeRange(role)}{#if duration != null} (~{duration}h){/if}</span>
                      </div>

                      <div class="detail-inline">
                        <span class="icon">⏱</span>
                        <span>Est. {formatEstimateDuration(role.estimate_duration_hours)}</span>
                      </div>

                      {#if role.location}
                        <div class="detail-inline">
                          <span class="icon">📍</span>
                          <span>{role.location}</span>
                        </div>
                      {/if}

                      <div class="detail-inline">
                        <span class="icon">👥</span>
                        <span>{role.positions_filled} / {role.positions_total} spots filled</span>
                      </div>
                    </div>
                  </div>

                  <div class="role-actions-compact">
                    <button
                      class="btn btn-primary btn-compact"
                      on:click={() => handleSignup(role)}
                      disabled={isFull}
                    >
                      {isFull ? 'Full' : 'Sign Up'}
                    </button>
                    
                    <button
                      class="btn btn-secondary btn-compact"
                      on:click={() => showMoreInfo(role)}
                      title="View full details"
                    >
                      Info
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
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
  {@const timeDisplay = formatTimeRange(selectedRole) + (duration != null ? ` (${duration}h)` : '')}
  
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
              <p>{formatDateForDisplay(selectedRole.event_date)}</p>
            </div>
          </div>
          
          <div class="detail-row">
            <span class="icon">🕐</span>
            <div>
              <strong>Time</strong>
              <p>{timeDisplay}</p>
            </div>
          </div>

          <div class="detail-row">
            <span class="icon">⏱</span>
            <div>
              <strong>Est. duration</strong>
              <p>{formatEstimateDuration(selectedRole.estimate_duration_hours)}</p>
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
          on:click={() => handleSignup(selectedRole)}
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

{#if showPiiModal && piiRole}
  <div class="modal-overlay" on:click={closePiiModal}>
    <div class="modal-content pii-modal" on:click|stopPropagation>
      <button class="modal-close" on:click={closePiiModal} aria-label="Close">×</button>
      <div class="modal-header">
        <h2>Sign Up for {piiRole.name}</h2>
        <p class="modal-subtitle">Enter your information to complete your signup</p>
      </div>
      <div class="modal-body">
        {#if piiError}
          <div class="alert alert-error">{piiError}</div>
        {/if}
        <div class="form-row">
          <div class="form-group">
            <label for="pii-first">First Name *</label>
            <input id="pii-first" type="text" bind:value={piiForm.first_name} placeholder="First name" disabled={piiSubmitting} />
          </div>
          <div class="form-group">
            <label for="pii-last">Last Name *</label>
            <input id="pii-last" type="text" bind:value={piiForm.last_name} placeholder="Last name" disabled={piiSubmitting} />
          </div>
        </div>
        <div class="form-group">
          <label for="pii-email">Email Address *</label>
          <input id="pii-email" type="email" bind:value={piiForm.email} placeholder="you@example.com" disabled={piiSubmitting} />
        </div>
        <div class="form-group">
          <label for="pii-phone">Phone Number (optional)</label>
          <input id="pii-phone" type="tel" bind:value={piiForm.phone} placeholder="(555) 123-4567" disabled={piiSubmitting} />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="pii-emergency-name">Emergency Contact Name *</label>
            <input id="pii-emergency-name" type="text" bind:value={piiForm.emergency_contact_name} placeholder="Full name" disabled={piiSubmitting} />
          </div>
          <div class="form-group">
            <label for="pii-emergency-phone">Emergency Contact Phone *</label>
            <input id="pii-emergency-phone" type="tel" bind:value={piiForm.emergency_contact_phone} placeholder="(555) 123-4567" disabled={piiSubmitting} />
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" on:click={closePiiModal} disabled={piiSubmitting}>Cancel</button>
        <button type="button" class="btn btn-primary" on:click={submitPiiModal} disabled={piiSubmitting}>
          {piiSubmitting ? 'Signing up...' : 'Complete Signup'}
        </button>
      </div>
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
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
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

  .opportunities-summary {
    text-align: right;
    margin-bottom: 1rem;
    color: #6c757d;
    font-weight: 500;
  }

  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .domains-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .domain-section {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .domain-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .domain-header.clickable {
    cursor: pointer;
    user-select: none;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .domain-header.clickable:hover {
    background: #f8f9fa;
  }

  .domain-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .toggle-icon {
    font-size: 0.75rem;
    color: #6c757d;
    min-width: 1rem;
  }

  .domain-info h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #1a1a1a;
    font-weight: 600;
  }

  .domain-info p {
    margin: 0.25rem 0 0 0;
    color: #6c757d;
    font-weight: 400;
    font-size: 0.9rem;
  }

  .domain-summary {
    padding: 0.25rem 0.75rem;
    background: #f1f5ff;
    color: #2a4b9b;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .role-card.compact {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .role-card.compact:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-color: #007bff;
  }

  .role-main {
    flex: 1;
    min-width: 0;
  }

  .role-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .role-title-row h3 {
    margin: 0;
    color: #1a1a1a;
    font-size: 1rem;
    font-weight: 600;
    flex: 1;
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

  .role-details-compact {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .detail {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: #495057;
  }

  .detail-inline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: #495057;
    line-height: 1.4;
  }

  .icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .detail-inline .icon {
    font-size: 0.9rem;
  }

  .role-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .role-actions-compact {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
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

  .btn-compact {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    white-space: nowrap;
    min-width: 70px;
  }

  .role-actions-compact .btn {
    flex: none;
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

  .pii-modal .modal-header {
    flex-direction: column;
  }

  .pii-modal .modal-subtitle {
    margin: 0.5rem 0 0;
    color: #6c757d;
    font-size: 0.95rem;
  }

  .pii-modal .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .pii-modal .form-group {
    margin-bottom: 1rem;
  }

  .pii-modal .form-group label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
    color: #1a1a1a;
    font-size: 0.9rem;
  }

  .pii-modal .form-group input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  .pii-modal .alert {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .pii-modal .alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .pii-modal .modal-actions {
    flex-direction: row;
    justify-content: flex-end;
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
      padding: 0.75rem;
    }

    .roles-grid {
      grid-template-columns: 1fr;
    }

    .role-card.compact {
      flex-direction: column;
    }

    .role-actions-compact {
      flex-direction: row;
      width: 100%;
    }

    .role-actions-compact .btn {
      flex: 1;
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

