<script>
  import { auth } from '../lib/stores/auth';
  import { roles } from '../lib/stores/roles';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { formatRoleScheduleDate, formatTimeRange, getRoleScheduleSortTime } from '../lib/utils/timeDisplay';
  import { getCriticalOpenSpots } from '../lib/utils/criticalSpots';
  import { formatWebsiteMessage, loadPublishedWebsiteMessages } from '../lib/websiteMessages';

  let websiteMessages;
  let homeRoles = [];
  let rolesLoading = true;
  let rolesLoadFailed = false;
  let loadGeneration = 0;

  function openSpotCount(role) {
    if (role?.positions_total == null) return null;
    return Math.max((role.positions_total ?? 0) - (role.positions_filled ?? 0), 0);
  }

  function isOpenShift(role) {
    const open = openSpotCount(role);
    return open == null || open > 0;
  }

  function pickHomeShifts(list) {
    return [...list]
      .filter(isOpenShift)
      .sort((a, b) => {
        const critical = Number(getCriticalOpenSpots(b) > 0) - Number(getCriticalOpenSpots(a) > 0);
        if (critical !== 0) return critical;
        const day = getRoleScheduleSortTime(a) - getRoleScheduleSortTime(b);
        if (day !== 0) return day;
        return String(a.start_time ?? '').localeCompare(String(b.start_time ?? ''));
      })
      .slice(0, 6);
  }

  function groupByDay(list) {
    const groups = [];
    for (const role of list) {
      const label = formatRoleScheduleDate(role, 'long');
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, roles: [role] });
      else last.roles.push(role);
    }
    return groups;
  }

  async function loadBoard() {
    const generation = ++loadGeneration;
    rolesLoading = true;
    rolesLoadFailed = false;
    const withTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
    ]);
    try {
      const featured = await withTimeout(roles.fetchFeaturedRoles()) || [];
      if (generation !== loadGeneration) return;
      let pool = featured;
      if (pickHomeShifts(featured).length < 6) {
        const all = await withTimeout(roles.fetchRoles()) || [];
        if (generation !== loadGeneration) return;
        const seen = new Set();
        pool = [];
        for (const role of [...featured, ...(Array.isArray(all) ? all : [])]) {
          if (role?.id == null || seen.has(role.id)) continue;
          seen.add(role.id);
          pool.push(role);
        }
      }
      homeRoles = pickHomeShifts(pool);
      rolesLoadFailed = false;
    } catch (e) {
      if (generation !== loadGeneration) return;
      homeRoles = [];
      rolesLoadFailed = true;
      if (e?.message === 'timeout') {
        console.warn('[Omnium] Home roles fetch timed out. If this happens on production, check Supabase Dashboard — the project may be paused (free tier).');
      }
    } finally {
      if (generation === loadGeneration) rolesLoading = false;
    }
  }

  $: dayGroups = groupByDay(homeRoles);
  $: boardStatus = rolesLoading
    ? 'Loading shifts…'
    : rolesLoadFailed
      ? 'Shifts could not load.'
      : homeRoles.length === 0
        ? 'No open shifts right now.'
        : `${homeRoles.length} open ${homeRoles.length === 1 ? 'shift' : 'shifts'}`;

  onMount(() => {
    let cancelled = false;
    const run = async () => {
      let waited = 0;
      while ($auth.loading && waited < 5000 && !cancelled) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }
      if (cancelled) return;
      if ($auth.user) {
        if (!$auth.profile?.emergency_contact_name) {
          push('/onboarding');
          return;
        }
        if ($auth.isAdmin) {
          push('/admin');
        } else if ($auth.profile?.role === 'volunteer_leader') {
          push('/leader');
        } else {
          push('/volunteer');
        }
        rolesLoading = false;
        return;
      }

      void loadPublishedWebsiteMessages().then((messages) => {
        if (!cancelled) websiteMessages = messages;
      });
      await loadBoard();
    };
    run();
    return () => {
      cancelled = true;
      loadGeneration += 1;
    };
  });
</script>

<div class="home">
  <header class="hero">
    <h1>Find a volunteer shift</h1>
    <p class="tagline">Help put on the Berkeley Omnium. Find a shift that fits your schedule.</p>
    {#if !$auth.user}
      <p class="stakes">Sign in with the link we email you. If you are under 18, a parent or guardian signs the waiver before the seat is confirmed. Your first visit asks for an emergency contact.</p>
      <div class="cta-buttons">
        <a href="#/volunteer" class="btn btn-primary">Browse volunteer shifts</a>
      </div>
    {:else}
      <div class="cta-buttons">
        {#if $auth.isAdmin}
          <a href="#/admin" class="btn btn-primary">Go to Dashboard</a>
        {:else if $auth.profile?.role === 'volunteer_leader'}
          <a href="#/leader" class="btn btn-primary">View My Roles</a>
        {:else}
          <a href="#/my-signups" class="btn btn-primary">My Signups</a>
        {/if}
        <a href="#/volunteer" class="btn btn-secondary">Browse Opportunities</a>
      </div>
    {/if}
  </header>

  {#if !$auth.user}
    <section class="roles-section" aria-labelledby="shifts-title">
      <h2 id="shifts-title">Volunteer shifts</h2>
      <p class="board-status" role="status">{boardStatus}</p>
      {#if rolesLoadFailed}
        <p class="roles-empty">
          <button type="button" class="retry" on:click={loadBoard}>Try again</button>
          <a href="#/volunteer">Browse volunteer shifts</a>
        </p>
      {:else if !rolesLoading && homeRoles.length === 0}
        <p class="roles-empty">
          <a href="#/volunteer">Browse volunteer shifts</a>
        </p>
      {:else if homeRoles.length > 0}
        {#each dayGroups as group (group.label)}
          <h3 class="day-label">{group.label}</h3>
          <div class="role-cards">
            {#each group.roles as role (role.id)}
              {@const openSpots = openSpotCount(role)}
              {@const criticalOpen = getCriticalOpenSpots(role)}
              <a href="#/volunteer?info={role.id}" class="role-card">
                <p class="role-card-name">{role.name}</p>
                <p class="role-card-time">{formatTimeRange(role)}</p>
                {#if role.location}
                  <p class="role-card-place">Place: {role.location}</p>
                {/if}
                {#if role.domain?.name}
                  <p class="role-card-domain">Domain: {role.domain.name}</p>
                {/if}
                {#if criticalOpen > 0}
                  <p class="role-card-critical">{criticalOpen} critical {criticalOpen === 1 ? 'spot' : 'spots'} still needed</p>
                {/if}
                {#if openSpots != null}
                  <p class="role-card-slots">{openSpots} {openSpots === 1 ? 'spot' : 'spots'} open</p>
                {/if}
                <p class="role-card-action">View details</p>
              </a>
            {/each}
          </div>
        {/each}
      {/if}
    </section>

    <p class="support">
      Proceeds from the Berkeley Omnium support East Bay youth cycling.
      <a href="https://berkeleyomnium.com/impact">Where the proceeds go</a>
    </p>
    {#if websiteMessages?.homepage_thanks}
      <p class="support homepage-thanks">{formatWebsiteMessage(websiteMessages.homepage_thanks, websiteMessages.event_year)}</p>
    {/if}
  {:else}
    <div class="features">
      <div class="feature-card">
        <div class="icon">📋</div>
        <h3>Easy Role Management</h3>
        <p>Create and manage volunteer roles with just a few clicks</p>
      </div>
      <div class="feature-card">
        <div class="icon">👥</div>
        <h3>Track Volunteers</h3>
        <p>Monitor signups and see who's committed to each role</p>
      </div>
      <div class="feature-card">
        <div class="icon">📧</div>
        <h3>Communicate</h3>
        <p>Send reminders and updates directly to volunteers</p>
      </div>
      <div class="feature-card">
        <div class="icon">📊</div>
        <h3>Real-time Dashboard</h3>
        <p>View fill status and identify staffing gaps instantly</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .home {
    max-width: 1000px;
    margin: 0 auto;
  }

  .hero {
    text-align: left;
    padding: 1.5rem 0 0.5rem;
  }

  .hero h1 {
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0 0 0.5rem;
  }

  .tagline,
  .stakes {
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-muted);
    margin: 0 0 1rem;
    max-width: 65ch;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .btn,
  .retry {
    padding: 0.75rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    text-decoration: none;
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    transition: background-color 0.2s ease, box-shadow 0.2s ease;
  }

  .btn-primary,
  .retry {
    background: var(--primary-color);
    color: #fff;
  }

  .btn-secondary {
    background: var(--bg-primary);
    color: var(--primary-color);
    border: 2px solid var(--primary-color);
  }

  .roles-section {
    margin: 1.5rem 0 1rem;
  }

  .roles-section h2 {
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
  }

  .board-status,
  .roles-empty {
    color: var(--text-muted);
    margin: 0.5rem 0 0;
  }

  .roles-empty {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: center;
  }

  .roles-empty a,
  .support a {
    color: var(--primary-color);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .day-label {
    font-size: 1rem;
    font-weight: 600;
    margin: 1rem 0 0;
  }

  .role-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .role-card {
    background: var(--bg-primary);
    padding: 1.25rem;
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--border-color);
    transition: box-shadow 0.2s ease;
  }

  .btn-primary:active,
  .retry:active {
    background: var(--primary-hover);
  }

  @media (hover: hover) and (pointer: fine) {
    .btn-primary:hover,
    .retry:hover {
      background: var(--primary-hover);
      box-shadow: var(--shadow-md);
    }

    .role-card:hover,
    .btn-secondary:hover {
      box-shadow: var(--shadow-md);
    }
  }

  .btn:focus-visible,
  .retry:focus-visible,
  .role-card:focus-visible,
  .support a:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .role-card-name {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .role-card-time,
  .role-card-place,
  .role-card-domain,
  .role-card-slots,
  .role-card-action {
    margin: 0.25rem 0;
    font-size: 1rem;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .role-card-slots,
  .role-card-critical {
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-card-critical {
    margin: 0.25rem 0;
    font-size: 1rem;
  }

  .role-card-action {
    margin-top: 0.75rem;
    color: var(--primary-color);
    font-weight: 600;
  }

  .support {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.6;
    max-width: 65ch;
    margin: 1.5rem 0 2rem;
  }

  .homepage-thanks {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 2rem 0;
  }

  .feature-card {
    background: var(--bg-primary);
    padding: 1.25rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    text-align: left;
  }

  .icon {
    font-size: 1.375rem;
    margin-bottom: 0.5rem;
  }

  .feature-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .feature-card p {
    margin: 0;
    color: var(--text-secondary);
  }

  @media (max-width: 768px) {
    .hero {
      padding-top: 1rem;
    }
  }
</style>
