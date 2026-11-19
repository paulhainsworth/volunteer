<script>
  import { auth } from '../lib/stores/auth';
  import { roles } from '../lib/stores/roles';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { formatRoleScheduleDate } from '../lib/utils/timeDisplay';
  import { formatWebsiteMessage, loadPublishedWebsiteMessages } from '../lib/websiteMessages';

  let websiteMessages;
  let homeRoles = [];
  let rolesLoading = true;
  let rolesLoadFailed = false;

  onMount(() => {
    let cancelled = false;
    const run = async () => {
      // Wait for auth to settle so we don't fetch then redirect
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

      const timeoutMs = 20000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      );
      try {
        const featured = await Promise.race([roles.fetchFeaturedRoles(), timeoutPromise]) || [];
        if (cancelled) return;
        if (featured.length > 0) {
          homeRoles = featured;
        } else {
          const all = await Promise.race([roles.fetchRoles(), timeoutPromise]) || [];
          if (cancelled) return;
          homeRoles = Array.isArray(all) ? all.slice(0, 6) : [];
        }
        rolesLoadFailed = false;
      } catch (e) {
        if (cancelled) return;
        homeRoles = [];
        rolesLoadFailed = true;
        if (e?.message === 'timeout') {
          console.warn('[Omnium] Home roles fetch timed out. If this happens on production, check Supabase Dashboard — the project may be paused (free tier).');
        }
      } finally {
        if (!cancelled) rolesLoading = false;
      }
    };
    run();
    return () => { cancelled = true; };
  });
</script>

<div class="home">
  <div class="hero">
    <h1>Find a volunteer shift</h1>
    <p class="tagline">Help put on the Berkeley Omnium. Find a shift that fits your schedule.</p>
    
    <div class="cta-buttons">
      {#if $auth.user}
        {#if $auth.isAdmin}
          <a href="#/admin" class="btn btn-primary">Go to Dashboard</a>
        {:else if $auth.profile?.role === 'volunteer_leader'}
          <a href="#/leader" class="btn btn-primary">View My Roles</a>
        {:else}
          <a href="#/my-signups" class="btn btn-primary">My Signups</a>
        {/if}
      {/if}
      {#if !$auth.user}
        <a href="#/volunteer" class="btn btn-primary">Browse volunteer shifts</a>
      {:else}
        <a href="#/volunteer" class="btn btn-secondary">Browse Opportunities</a>
      {/if}
    </div>
  </div>

  {#if !$auth.user}
    <div class="roles-section">
      {#if rolesLoading}
        <p class="roles-loading">Loading roles…</p>
      {:else if rolesLoadFailed}
        <p class="roles-empty">Shifts couldn’t load. Try <a href="#/volunteer">browsing volunteer shifts</a>.</p>
      {:else if homeRoles.length === 0}
        <p class="roles-empty">No volunteer roles yet. Check back soon.</p>
      {:else}
        <h2>Volunteer shifts</h2>
        <div class="role-cards">
          {#each homeRoles as role (role.id)}
            {@const openSpots = Math.max((role.positions_total ?? 0) - (role.positions_filled ?? 0), 0)}
            <a href="#/volunteer?info={role.id}" class="role-card">
              <h3 class="role-card-name">{role.name}</h3>
              <p class="role-card-date">{formatRoleScheduleDate(role, 'short')}</p>
              {#if role.domain?.name}
                <p class="role-card-domain">{role.domain.name}</p>
              {/if}
              {#if role.positions_total != null}
                <p class="role-card-slots">{openSpots ? `${openSpots} ${openSpots === 1 ? 'spot' : 'spots'} open` : 'Full'}</p>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </div>
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

  <section class="impact" aria-labelledby="impact-title">
    <h2 id="impact-title">Your shift supports East Bay youth cycling</h2>
    <p>
      The Berkeley Omnium is a two-day race weekend organized by the Berkeley Bicycle Club.
      Proceeds from the Berkeley Hills Road Race and Berkeley Streets Criterium help local
      high school mountain bike teams pay for equipment, coaching, and race opportunities.
    </p>

    <dl class="impact-stats">
      <div>
        <dt>Raised in 2026</dt>
        <dd>$28,610</dd>
      </div>
      <div>
        <dt>East Bay high school teams supported</dt>
        <dd>6</dd>
      </div>
    </dl>

    {#if websiteMessages?.homepage_thanks}
      <p class="homepage-thanks">{formatWebsiteMessage(websiteMessages.homepage_thanks, websiteMessages.event_year)}</p>
    {/if}

    <ul class="impact-links" role="list">
      <li><a href="https://berkeleyomnium.com/">Berkeley Omnium</a></li>
      <li><a href="https://berkeleyomnium.com/impact">Where the proceeds go</a></li>
      <li><a href="https://berkeleybikeclub.org/">Berkeley Bicycle Club</a></li>
    </ul>
  </section>
</div>

<style>
  .home {
    max-width: 1000px;
    margin: 0 auto;
  }

  .hero {
    text-align: center;
    padding: 3rem 1rem;
  }

  .hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .tagline {
    font-size: 1.5rem;
    color: var(--text-muted);
    margin-bottom: 2rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 1rem 2rem;
    font-size: 1.1rem;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-primary {
    background: #0056b3;
    color: white;
  }

  .btn-primary:active {
    background: #00458e;
  }

  .btn-secondary {
    background: var(--bg-primary);
    color: var(--primary-color);
    border: 2px solid var(--primary-color);
  }

  .roles-section {
    margin: 0.5rem 0 3rem;
  }

  .roles-section h2 {
    font-size: 1.375rem;
  }

  .roles-loading,
  .roles-empty {
    text-align: center;
    color: var(--text-muted);
    margin: 2rem 0;
  }

  .roles-empty a {
    color: var(--primary-color, #007bff);
    text-decoration: underline;
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
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid var(--border-color, var(--border-color));
  }

  @media (hover: hover) and (pointer: fine) {
    .btn:hover,
    .role-card:hover {
      text-decoration: none;
      box-shadow: var(--shadow-md);
    }
  }

  .btn:focus-visible,
  .role-card:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .role-card-name {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }

  .role-card-date,
  .role-card-domain,
  .role-card-slots {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .role-card-slots {
    font-weight: 600;
    color: var(--text-primary);
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 4rem 0;
  }

  .feature-card {
    background: var(--bg-primary);
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    transition: transform 0.2s;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .feature-card h3 {
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .feature-card p {
    color: var(--text-secondary);
  }

  .impact {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin: 2rem 0;
    padding: clamp(1rem, 4vw, 2rem);
  }

  .impact h2 {
    margin-bottom: 0.75rem;
  }

  .impact p {
    color: var(--text-muted);
    max-width: 65ch;
  }

  .homepage-thanks {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .impact-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    max-width: 42rem;
    margin: 1.25rem 0;
  }

  .impact-stats > div {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    gap: 0.25rem;
    padding: clamp(0.75rem, 3vw, 1.25rem);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .impact-stats dt {
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.35;
  }

  .impact-stats dd {
    color: var(--text-primary);
    font-size: clamp(1.5rem, 5vw, 2.25rem);
    font-weight: 700;
    line-height: 1.15;
  }

  .impact-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    list-style: none;
    margin-top: 0.75rem;
  }

  .impact-links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--link-hover);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .impact-links a:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .hero {
      padding: 1rem 0 2rem;
    }

    .hero h1 {
      font-size: 2rem;
    }

    .tagline {
      font-size: 1.2rem;
    }

    .features {
      grid-template-columns: 1fr;
    }
  }
</style>

