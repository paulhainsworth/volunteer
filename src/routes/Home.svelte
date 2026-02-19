<script>
  import { auth } from '../lib/stores/auth';
  import { roles } from '../lib/stores/roles';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { formatEventDateInPacific } from '../lib/utils/timeDisplay';

  let homeRoles = [];
  let rolesLoading = true;
  let rolesLoadFailed = false;

  onMount(() => {
    const run = async () => {
      // Wait for auth to settle so we don't fetch then redirect
      let waited = 0;
      while ($auth.loading && waited < 5000) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }
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

      const timeoutMs = 12000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      );
      try {
        const all = await Promise.race([roles.fetchRoles(), timeoutPromise]) || [];
        homeRoles = Array.isArray(all) ? all.slice(0, 6) : [];
        rolesLoadFailed = false;
      } catch (e) {
        homeRoles = [];
        rolesLoadFailed = true;
        if (e?.message === 'timeout') {
          console.warn('[Omnium] Home roles fetch timed out after 12s. Check Network tab for supabase.co requests.');
        }
      } finally {
        rolesLoading = false;
      }
    };
    run();
  });
</script>

<div class="home">
  <div class="hero">
    <h1>🚴 Race Volunteer Management</h1>
    <p class="tagline">Organize, track, and communicate with race volunteers</p>
    
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
        <a href="#/volunteer" class="btn btn-secondary btn-see-all">See All Volunteer Roles</a>
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
        <p class="roles-empty">Roles couldn’t load. Try <a href="#/volunteer">See All Volunteer Roles</a>, or use a private/incognito window or disable browser extensions (e.g. wallet extensions) for this site.</p>
      {:else if homeRoles.length === 0}
        <p class="roles-empty">No volunteer roles yet. Check back soon.</p>
      {:else}
        <div class="role-cards">
          {#each homeRoles as role (role.id)}
            <a href="#/volunteer?info={role.id}" class="role-card">
              <h3 class="role-card-name">{role.name}</h3>
              {#if role.event_date}
                <p class="role-card-date">{formatEventDateInPacific(role.event_date, 'short')}</p>
              {:else}
                <p class="role-card-date">TBD</p>
              {/if}
              {#if role.domain?.name}
                <p class="role-card-domain">{role.domain.name}</p>
              {/if}
              {#if role.positions_total != null}
                <p class="role-card-slots">{role.positions_filled ?? 0} / {role.positions_total} filled</p>
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

  <div class="about">
    <h2>Built for Race Organizers</h2>
    <p>
      Our volunteer management system streamlines the entire process of coordinating 
      volunteers for bicycle racing events. From creating volunteer roles to tracking 
      signups and sending communications, everything is in one place.
    </p>
  </div>
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
    color: #1a1a1a;
  }

  .tagline {
    font-size: 1.5rem;
    color: #6c757d;
    margin-bottom: 2rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn-see-all {
    margin-bottom: 0;
  }

  .btn {
    padding: 1rem 2rem;
    font-size: 1.1rem;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 2px solid #007bff;
  }

  .roles-section {
    margin: 2rem 0 4rem;
  }

  .roles-loading,
  .roles-empty {
    text-align: center;
    color: var(--text-secondary, #6c757d);
    margin: 2rem 0;
  }

  .roles-empty a {
    color: var(--primary-color, #007bff);
    text-decoration: underline;
  }

  .role-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.5rem;
    margin-top: 1.5rem;
  }

  .role-card {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid var(--border-color, #e9ecef);
  }

  .role-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .role-card-name {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
    color: #1a1a1a;
  }

  .role-card-date,
  .role-card-domain,
  .role-card-slots {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    color: #6c757d;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 4rem 0;
  }

  .feature-card {
    background: white;
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
    color: #1a1a1a;
  }

  .feature-card p {
    color: #6c757d;
  }

  .about {
    text-align: center;
    padding: 3rem 1rem;
    background: #f8f9fa;
    border-radius: 12px;
    margin: 2rem 0;
  }

  .about h2 {
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  .about p {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #495057;
    max-width: 700px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
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

