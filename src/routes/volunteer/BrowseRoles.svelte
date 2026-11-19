<script>
  import { onMount } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { getCriticalOpenSpots } from '../../lib/utils/criticalSpots';
  import {
    formatTimeRange,
    calculateDuration,
    isFlexibleTime,
    formatEstimateDuration,
    formatRoleScheduleDate,
    getApproxDaysUntilScheduleEnd,
    getRoleScheduleSortTime
  } from '../../lib/utils/timeDisplay';
  import { createVolunteerAccount } from '../../lib/volunteerSignup';
  import { signups } from '../../lib/stores/signups';
  import { affiliations } from '../../lib/stores/affiliations';
  import { waiver as waiverStore } from '../../lib/stores/waiver';

  let loading = true;
  let error = '';
  let searchQuery = '';
  let sortBy = 'date';
  let filterStatus = 'all';
  let raceDayFilter = 'all'; // 'all', 'bhrr', 'bsc', 'pre-race', 'post-race'
  let filterDuration = 'all'; // 'all', '1-or-less', '2-3', '4-5', '6-8', 'full-day'
  let showExtraFilters = false;
  $: activeExtraFilters = Number(raceDayFilter !== 'all') + Number(filterDuration !== 'all');
  let selectedRole = null; // For modal
  let expandedDomains = new Set(); // Track which domains are expanded
  let domainsInitialized = false; // Track if we've initialized domains
  let isProspectiveVolunteer = false;

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
    emergency_contact_phone: '',
    team_club_affiliation_id: ''
  };
  let piiSubmitting = false;
  let piiError = '';
  let awaitingVerification = false;

  onMount(async () => {
    // Redirect to onboarding if no emergency contact
    if ($auth.user && !$auth.profile?.emergency_contact_name) {
      loading = false;
      push('/onboarding');
      return;
    }

    // Redirect to sign waiver if volunteer hasn't signed current waiver (e.g. admin-added volunteer)
    if ($auth.user && $auth.profile?.emergency_contact_name && $auth.profile?.role === 'volunteer') {
      try {
        const status = await waiverStore.checkWaiverStatus();
        if (status.needsToSign) {
          push('/volunteer/waiver?return=' + encodeURIComponent('/volunteer'));
          return;
        }
      } catch (_) {
        // continue to load roles
      }
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

    // If arrived with ?info=ROLE_ID (e.g. from homepage featured role) → open Role Info modal
    // If arrived with ?signup=ROLE_ID (e.g. from shared link or confirmation email) → open PII modal
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1 && rolesData.length) {
      const queryParams = new URLSearchParams(hash.slice(queryIndex));
      const infoId = queryParams.get('info');
      const signupId = queryParams.get('signup');
      if (infoId) {
        const r = rolesData.find((x) => x.id === infoId);
        if (r) selectedRole = r;
      } else if (signupId) {
        const r = rolesData.find((x) => x.id === signupId);
        if (r) {
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

  function getRemainingSpots(role) {
    return Math.max((role.positions_total || 0) - (role.positions_filled || 0), 0);
  }

  function compareRolesForDomain(a, b) {
    const criticalCompare = Number(getCriticalOpenSpots(b) > 0) - Number(getCriticalOpenSpots(a) > 0);
    if (criticalCompare !== 0) return criticalCompare;
    return (a?.name || '').localeCompare(b?.name || '');
  }

  function hasOpenCriticalRole(domainEntry) {
    return domainEntry.roles.some((role) => getCriticalOpenSpots(role) > 0);
  }

  function getDomainSortKey(domainEntry) {
    return domainEntry.roles.reduce((best, role) => {
      const time = getRoleScheduleSortTime(role);
      const tieBreaker = isFlexibleTime(role) ? 1 : 0;
      const start = role.start_time || '';
      const candidate = { time, tieBreaker, start };
      if (
        candidate.time < best.time ||
        (candidate.time === best.time && candidate.tieBreaker < best.tieBreaker) ||
        (candidate.time === best.time && candidate.tieBreaker === best.tieBreaker && candidate.start < best.start)
      ) {
        return candidate;
      }
      return best;
    }, { time: Infinity, tieBreaker: 1, start: '' });
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

  function formatDateForDisplay(role) {
    return formatRoleScheduleDate(role, 'long');
  }

  function formatDateCompact(role) {
    return formatRoleScheduleDate(role, 'short');
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

  $: isProspectiveVolunteer = !$auth.user;

  $: isProspectiveVolunteer = !$auth.user;

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
        const daysUntil = getApproxDaysUntilScheduleEnd(role);
        if (percentage >= 50 || daysUntil > 7) return false;
      }

      // Duration filter
      if (!roleMatchesDurationFilter(role, filterDuration)) return false;

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = getRoleScheduleSortTime(a);
        const timeB = getRoleScheduleSortTime(b);
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
      const remainingSpots = getRemainingSpots(role);

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

    return Array.from(map.values())
      .map((domainEntry) => ({
        ...domainEntry,
        roles: isProspectiveVolunteer ? [...domainEntry.roles].sort(compareRolesForDomain) : domainEntry.roles
      }))
      .filter((domainEntry) => !isProspectiveVolunteer || domainEntry.openSpots > 0)
      .sort((a, b) => {
        if (isProspectiveVolunteer) {
          const criticalDomainCompare = Number(hasOpenCriticalRole(b)) - Number(hasOpenCriticalRole(a));
          if (criticalDomainCompare !== 0) return criticalDomainCompare;
          return a.name.localeCompare(b.name);
        }

        const keyA = getDomainSortKey(a);
        const keyB = getDomainSortKey(b);
        if (keyA.time !== keyB.time) return keyA.time - keyB.time;
        if (keyA.tieBreaker !== keyB.tieBreaker) return keyA.tieBreaker - keyB.tieBreaker;
        if (keyA.start !== keyB.start) return keyA.start.localeCompare(keyB.start);
        return a.name.localeCompare(b.name);
      });
  })();

  const TOP_CRITICAL_SPOTLIGHT = 10;

  /** Unauthenticated hub: surface roles that still need critical coverage first */
  $: topCriticalRoles = isProspectiveVolunteer
    ? [...filteredRoles]
        .filter(
          (role) => getCriticalOpenSpots(role) > 0 && getRemainingSpots(role) > 0
        )
        .sort((a, b) => {
          const c = getCriticalOpenSpots(b) - getCriticalOpenSpots(a);
          if (c !== 0) return c;
          const ta = getRoleScheduleSortTime(a);
          const tb = getRoleScheduleSortTime(b);
          if (ta !== tb) return ta - tb;
          return (a.name || '').localeCompare(b.name || '');
        })
        .slice(0, TOP_CRITICAL_SPOTLIGHT)
    : [];

  $: topCriticalRoleIds = new Set(topCriticalRoles.map((r) => r.id));

  /** Avoid duplicating spotlight roles in the expandable domain sections */
  $: groupedDomainsDisplay = (() => {
    if (!isProspectiveVolunteer || topCriticalRoleIds.size === 0) {
      return groupedDomains;
    }
    return groupedDomains
      .map((d) => {
        const roles = d.roles.filter((r) => !topCriticalRoleIds.has(r.id));
        const openSpots = roles.reduce((sum, r) => sum + getRemainingSpots(r), 0);
        return { ...d, roles, openSpots };
      })
      .filter((d) => d.roles.length > 0);
  })();

  // Initialize domains as closed by default (only once; after groupedDomainsDisplay exists)
  $: if (groupedDomainsDisplay && groupedDomainsDisplay.length > 0 && !domainsInitialized) {
    expandedDomains = new Set();
    domainsInitialized = true;
  }

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
        emergency_contact_phone: '',
        team_club_affiliation_id: ''
      };
      piiError = '';
      awaitingVerification = false;
      showPiiModal = true;
      affiliations.fetchAffiliations().catch(() => {});
      return;
    }
    push(`/signup/${role?.id || roleOrId}`);
  }

  function closePiiModal() {
    showPiiModal = false;
    piiRole = null;
    piiError = '';
    awaitingVerification = false;
    piiSubmitting = false;
  }

  async function submitPiiModal() {
    const f = piiForm;
    if (!f.first_name?.trim() || !f.last_name?.trim() || !f.email?.trim()) {
      piiError = 'First name, last name, and email are required.';
      return;
    }
    if (!f.team_club_affiliation_id?.trim()) {
      piiError = 'Please select a team or club affiliation.';
      return;
    }
    if (!piiRole) {
      piiError = 'No role selected.';
      return;
    }
    const signupRoleId = piiRole.id;
    piiSubmitting = true;
    piiError = '';
    awaitingVerification = false;

    try {
      const result = await createVolunteerAccount(
        {
          first_name: f.first_name.trim(),
          last_name: f.last_name.trim(),
          email: f.email.trim(),
          phone: f.phone?.trim() || null,
          emergency_contact_name: f.emergency_contact_name?.trim() || null,
          emergency_contact_phone: f.emergency_contact_phone?.trim() || null,
          team_club_affiliation_id: f.team_club_affiliation_id.trim()
        },
        signupRoleId
      );

      if (result.pendingVerification) {
        awaitingVerification = true;
        return;
      }

      closePiiModal();
      push(`/signup/${signupRoleId}`);
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
    <label class="filter-field filter-search">
      <span>Search roles</span>
      <input type="search" placeholder="Search roles..." bind:value={searchQuery} />
    </label>

    <label class="filter-field">
      <span>Availability</span>
      <select bind:value={filterStatus}>
        <option value="all">Any availability</option>
        <option value="available">Available only</option>
        <option value="urgent">Urgent need</option>
      </select>
    </label>

    <button
      type="button"
      class="filters-toggle"
      aria-expanded={showExtraFilters}
      aria-controls="extra-role-filters"
      on:click={() => { showExtraFilters = !showExtraFilters; }}
    >
      Filters{activeExtraFilters ? ` (${activeExtraFilters})` : ''}
      <span class="filter-chevron" aria-hidden="true"></span>
    </button>

    <div class="filter-extra" class:expanded={showExtraFilters} id="extra-role-filters">
      <label class="filter-field">
        <span>Sort by</span>
        <select bind:value={sortBy}>
          <option value="date">Date</option>
          <option value="name">Name</option>
          <option value="duration">Duration</option>
        </select>
      </label>

      <label class="filter-field">
        <span>Event day</span>
        <select bind:value={raceDayFilter}>
          <option value="all">Any day</option>
          <option value="bhrr">Race day: BHRR</option>
          <option value="bsc">Race day: BSC</option>
          <option value="pre-race">Pre-race</option>
          <option value="post-race">Post-race</option>
        </select>
      </label>

      <label class="filter-field">
        <span>Duration</span>
        <select bind:value={filterDuration}>
          <option value="all">Any duration</option>
          <option value="1-or-less">1 hr or less</option>
          <option value="2-3">2–3 hrs</option>
          <option value="4-5">4–5 hrs</option>
          <option value="6-8">6–8 hrs</option>
          <option value="full-day">Full day</option>
        </select>
      </label>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading opportunities...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if groupedDomainsDisplay.length === 0 && topCriticalRoles.length === 0}
    <div class="empty">
      <p>No volunteer opportunities found matching your filters.</p>
    </div>
  {:else}
    {@const totalOpenSpots = filteredRoles.reduce((sum, r) => sum + getRemainingSpots(r), 0)}
    <div class="opportunities-summary">
      <span>{totalOpenSpots} total open spot{totalOpenSpots === 1 ? '' : 's'}</span>
    </div>

    {#if isProspectiveVolunteer && topCriticalRoles.length > 0}
      <section class="critical-spotlight" aria-label="Critical volunteer spots still needed">
        <p class="critical-spotlight-intro">
          Thanks for volunteering at 2026 Berkeley Omnium! In our final days before race weekend,
          please consider choosing one of the remaining critical spots. We can't host the races
          without these spots filled. Thank you! — 2026 Berkeley Omnium Team
        </p>
        <div class="roles-grid critical-spotlight-grid">
          {#each topCriticalRoles as role (role.id)}
            {@const status = getFillStatus(role)}
            {@const duration = calculateDuration(role.start_time, role.end_time)}
            {@const isFull = role.positions_filled >= role.positions_total}
            {@const criticalOpenSpots = getCriticalOpenSpots(role)}

            <div class="role-card compact">
              <div class="role-main">
                <div class="role-title-row">
                  <h3>
                    {#if criticalOpenSpots > 0}
                      <span class="critical-icon" title={`Critical need: ${criticalOpenSpots} open`} aria-label="Critical role">⚠</span>
                    {/if}
                    {role.name}
                  </h3>
                  <span class="status-badge {status.class}">{status.label}</span>
                </div>

                <div class="role-details-compact">
                  <div class="detail-inline">
                    <span class="icon">📅</span>
                    <span>{formatDateCompact(role)}</span>
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

                  {#if criticalOpenSpots > 0}
                    <div class="detail-inline critical-detail">
                      <span class="icon">⚠</span>
                      <span>{criticalOpenSpots} critical spot{criticalOpenSpots === 1 ? '' : 's'} still needed</span>
                    </div>
                  {/if}
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
      </section>
    {/if}

    {#if isProspectiveVolunteer && topCriticalRoles.length > 0 && groupedDomainsDisplay.length > 0}
      <h2 class="domains-section-heading">Browse by team</h2>
      <p class="domains-section-lead">Expand a team to see more roles and sign up.</p>
    {/if}

    <div class="domains-list">
      {#each groupedDomainsDisplay as domain (domain.id)}
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
                {@const criticalOpenSpots = getCriticalOpenSpots(role)}

                <div class="role-card compact">
                  <div class="role-main">
                    <div class="role-title-row">
                      <h3>
                        {#if criticalOpenSpots > 0}
                          <span class="critical-icon" title={`Critical need: ${criticalOpenSpots} open`} aria-label="Critical role">⚠</span>
                        {/if}
                        {role.name}
                      </h3>
                      <span class="status-badge {status.class}">{status.label}</span>
                    </div>

                    <div class="role-details-compact">
                      <div class="detail-inline">
                        <span class="icon">📅</span>
                        <span>{formatDateCompact(role)}</span>
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

                      {#if criticalOpenSpots > 0}
                        <div class="detail-inline critical-detail">
                          <span class="icon">⚠</span>
                          <span>{criticalOpenSpots} critical spot{criticalOpenSpots === 1 ? '' : 's'} still needed</span>
                        </div>
                      {/if}
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
              <p>{formatDateForDisplay(selectedRole)}</p>
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
        <p class="modal-subtitle">Enter your information to continue to the waiver.</p>
      </div>
      {#if awaitingVerification}
        <div class="modal-body" role="status">
          <p>Check your email to finish signing up. Follow the link to return to this role and complete the waiver. If you are under 18, ask your parent or guardian to sign then. A spot has not been reserved.</p>
        </div>
      {:else}
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
        <div class="form-group">
          <label for="pii-affiliation">Team / Club Affiliation *</label>
          <select id="pii-affiliation" bind:value={piiForm.team_club_affiliation_id} disabled={piiSubmitting} required>
            <option value="">-- Select team or club --</option>
            {#each $affiliations as aff (aff.id)}
              <option value={aff.id}>{aff.name}</option>
            {/each}
          </select>
        </div>

      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" on:click={closePiiModal} disabled={piiSubmitting}>Cancel</button>
        <button type="button" class="btn btn-primary" on:click={submitPiiModal} disabled={piiSubmitting}>
          {piiSubmitting ? 'Signing up...' : 'Continue to Waiver'}
        </button>
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
  }

  .header p {
    color: var(--text-muted);
    font-size: 1.1rem;
  }

  .filters {
    display: grid;
    grid-template-columns: minmax(0, 2fr) repeat(4, minmax(0, 1fr));
    align-items: end;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .filter-field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .filter-field input,
  .filter-field select,
  .filters-toggle {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.4;
    font-weight: 400;
  }

  .filter-field input::placeholder {
    color: var(--text-muted);
  }

  .filter-field input:focus-visible,
  .filter-field select:focus-visible,
  .filters-toggle:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .filter-extra {
    display: contents;
  }

  .filters-toggle {
    display: none;
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
    color: var(--text-muted);
    font-weight: 500;
  }

  .critical-spotlight {
    margin-bottom: 2.5rem;
  }

  .critical-spotlight-intro {
    margin: 0 0 1.25rem 0;
    padding: 1.25rem 1.35rem;
    background: linear-gradient(135deg, #f0f7ff 0%, #e8f4fc 100%);
    border: 1px solid #c5ddf5;
    border-radius: 10px;
    color: #1a3a52;
    font-size: 1.05rem;
    line-height: 1.55;
  }

  .critical-spotlight-grid {
    margin-top: 0;
  }

  .domains-section-heading {
    margin: 0 0 0.35rem 0;
    font-size: 1.25rem;
    color: #1a1a1a;
    font-weight: 600;
  }

  .domains-section-lead {
    margin: 0 0 1rem 0;
    color: #6c757d;
    font-size: 0.95rem;
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
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .critical-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #dc3545;
    font-size: 0.85rem;
    line-height: 1;
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

  .detail-inline.critical-detail {
    color: #b91c1c;
    font-weight: 600;
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
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .header {
      margin-bottom: 1.25rem;
    }

    .filter-search,
    .filter-extra {
      grid-column: 1 / -1;
    }

    .filter-extra {
      display: none;
    }

    .filter-extra.expanded {
      display: grid;
      gap: 0.75rem;
    }

    .filters-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.65rem;
      font-weight: 600;
      cursor: pointer;
    }

    .filters-toggle:active {
      background: var(--bg-tertiary);
    }

    .filter-chevron {
      display: block;
      width: 0.45rem;
      height: 0.45rem;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: translateY(-0.125rem) rotate(45deg);
    }

    .filters-toggle[aria-expanded='true'] .filter-chevron {
      transform: translateY(0.125rem) rotate(225deg);
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

