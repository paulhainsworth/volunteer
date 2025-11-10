<script>
  import { onMount } from 'svelte';
  import { format } from 'date-fns';
  import { push } from 'svelte-spa-router';
  import { domains } from '../../lib/stores/domains';

  export let params = {};

  let loading = true;
  let error = '';
  let domain = null;
  let shareUrl = '';

  onMount(async () => {
    if (!params.domainId) {
      error = 'No invite link provided.';
      loading = false;
      return;
    }

    if (typeof window !== 'undefined') {
      shareUrl = `${window.location.origin}#/invite/${params.domainId}`;
    }

    try {
      const data = await domains.fetchDomain(params.domainId);

      if (!data) {
        error = 'We could not find this volunteer team.';
      } else {
        domain = data;
      }
    } catch (err) {
      console.error('Failed to load domain invite:', err);
      error = err.message || 'Unable to load volunteer opportunities right now.';
    } finally {
      loading = false;
    }
  });

  function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  function formatDuration(start, end) {
    if (!start || !end) return '';
    const startDate = new Date(`2000-01-01T${start}`);
    const endDate = new Date(`2000-01-01T${end}`);
    const hours = (endDate - startDate) / (1000 * 60 * 60);
    if (!Number.isFinite(hours)) return '';
    return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)} hour${hours === 1 ? '' : 's'}`;
  }

  function handleSignup(roleId) {
    if (!roleId) return;

    if (typeof window !== 'undefined') {
      push(`/signup/${roleId}`);
    }
  }

  function copyShareLink() {
    if (!shareUrl) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Invite link copied to your clipboard.');
      });
    }
  }
</script>

<div class="invite-page">
  {#if loading}
    <div class="loading">Loading volunteer opportunities...</div>
  {:else if error}
    <div class="error-card">
      <h1>Invite Not Available</h1>
      <p>{error}</p>
      <a class="btn" href="#/volunteer">View All Volunteer Opportunities</a>
    </div>
  {:else if domain}
    <div class="hero">
      <div class="hero-content">
        <div class="badge">Volunteer Team Invite</div>
        <h1>{domain.name}</h1>
        {#if domain.description}
          <p class="description">{domain.description}</p>
        {/if}

        {#if domain.leader}
          <div class="leader-card">
            <h2>Your Volunteer Leader</h2>
            <p class="leader-name">{domain.leader.first_name} {domain.leader.last_name}</p>
            {#if domain.leader.email}
              <a class="leader-email" href={`mailto:${domain.leader.email}`}>{domain.leader.email}</a>
            {/if}
            {#if domain.leader.phone}
              <div class="leader-phone">{domain.leader.phone}</div>
            {/if}
          </div>
        {/if}

        {#if shareUrl}
          <button type="button" class="share-btn" on:click={copyShareLink}>Copy Invite Link</button>
        {/if}

        <a class="view-all" href="#/volunteer">Browse All Opportunities</a>
      </div>
      <div class="hero-graphic" aria-hidden="true">
        <div class="circle"></div>
        <div class="circle small"></div>
        <div class="circle tiny"></div>
      </div>
    </div>

    <section class="roles-section">
      <h2>Open Roles in {domain.name}</h2>
      {#if domain.roles && domain.roles.length > 0}
        <div class="roles-grid">
          {#each domain.roles as role (role.id)}
            {@const spotsFilled = role.positions_filled || 0}
            {@const isFull = spotsFilled >= role.positions_total}
            <article class="role-card {isFull ? 'full' : ''}">
              <header>
                <h3>{role.name}</h3>
                <span class="spots">{spotsFilled}/{role.positions_total} filled</span>
              </header>

              <ul class="details">
                <li>
                  <span class="label">Date</span>
                  <span>{role.event_date ? format(new Date(role.event_date), 'EEEE, MMMM d, yyyy') : 'TBD'}</span>
                </li>
                <li>
                  <span class="label">Time</span>
                  <span>
                    {#if role.start_time && role.end_time}
                      {formatTime(role.start_time)} – {formatTime(role.end_time)}
                      {#if formatDuration(role.start_time, role.end_time)}
                        <span class="muted">({formatDuration(role.start_time, role.end_time)})</span>
                      {/if}
                    {:else}
                      TBD
                    {/if}
                  </span>
                </li>
                {#if role.location}
                  <li>
                    <span class="label">Location</span>
                    <span>{role.location}</span>
                  </li>
                {/if}
              </ul>

              {#if role.description}
                <p class="role-description">{role.description}</p>
              {/if}

              <div class="actions">
                {#if isFull}
                  <span class="status full">This role is currently full</span>
                  <button type="button" class="btn-secondary" on:click={() => handleSignup(role.id)}>
                    Join Waitlist
                  </button>
                {:else}
                  <button type="button" class="btn-primary" on:click={() => handleSignup(role.id)}>
                    Sign Up
                  </button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty">No roles are currently open in this team. Check back soon or explore other opportunities.</div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .invite-page {
    padding: 3rem 1.5rem 4rem;
    min-height: calc(100vh - 200px);
    background: var(--bg-primary);
  }

  .loading {
    max-width: 720px;
    margin: 4rem auto;
    text-align: center;
    font-size: 1.1rem;
  }

  .error-card {
    max-width: 640px;
    margin: 4rem auto;
    padding: 2.5rem;
    border-radius: 18px;
    background: var(--bg-secondary);
    box-shadow: var(--shadow-lg);
    text-align: center;
  }

  .error-card h1 {
    margin-bottom: 1rem;
  }

  .error-card .btn {
    display: inline-block;
    margin-top: 1.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 999px;
    background: var(--primary-color);
    color: #fff;
    text-decoration: none;
  }

  .hero {
    max-width: 1100px;
    margin: 0 auto 3.5rem;
    padding: 3rem;
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(0, 123, 255, 0.08), rgba(0, 123, 255, 0.02));
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 3rem;
    align-items: center;
  }

  .hero-content {
    max-width: 640px;
  }

  .badge {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(0, 123, 255, 0.15);
    color: var(--primary-color);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    margin-bottom: 1rem;
  }

  .hero h1 {
    font-size: clamp(2rem, 4vw, 3rem);
    margin-bottom: 1rem;
  }

  .hero .description {
    font-size: 1.1rem;
    line-height: 1.6;
    margin-bottom: 2rem;
    color: var(--text-secondary);
  }

  .leader-card {
    padding: 1.5rem;
    border-radius: 16px;
    background: var(--bg-secondary);
    box-shadow: var(--shadow-md);
    margin-bottom: 1.5rem;
  }

  .leader-card h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.5rem;
  }

  .leader-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .leader-email {
    color: var(--primary-color);
    text-decoration: none;
  }

  .leader-phone {
    margin-top: 0.25rem;
    color: var(--text-secondary);
  }

  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.25rem;
    border-radius: 999px;
    border: 1px solid var(--primary-color);
    background: #fff;
    color: var(--primary-color);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .share-btn:hover {
    background: rgba(0, 123, 255, 0.08);
  }

  .view-all {
    display: inline-block;
    margin-top: 1.5rem;
    color: var(--primary-color);
    font-weight: 600;
    text-decoration: none;
  }

  .hero-graphic {
    position: relative;
    width: 100%;
    height: 280px;
  }

  .circle {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at top left, rgba(0, 123, 255, 0.25), transparent 65%);
  }

  .circle.small {
    width: 60%;
    height: 60%;
    bottom: 10%;
    right: -10%;
    background: radial-gradient(circle at bottom, rgba(0, 123, 255, 0.15), transparent 70%);
  }

  .circle.tiny {
    width: 35%;
    height: 35%;
    top: 5%;
    left: 10%;
    background: radial-gradient(circle, rgba(0, 123, 255, 0.2), transparent 70%);
  }

  .roles-section {
    max-width: 1100px;
    margin: 0 auto;
  }

  .roles-section h2 {
    font-size: 1.8rem;
    margin-bottom: 1.5rem;
  }

  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.75rem;
  }

  .role-card {
    padding: 1.75rem;
    border-radius: 20px;
    background: var(--bg-secondary);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    min-height: 320px;
  }

  .role-card.full {
    border: 1px solid rgba(220, 53, 69, 0.35);
  }

  .role-card header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .role-card header h3 {
    font-size: 1.25rem;
  }

  .spots {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(0, 123, 255, 0.1);
    color: var(--primary-color);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .details {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: grid;
    gap: 0.5rem;
  }

  .details li {
    display: flex;
    justify-content: space-between;
    font-size: 0.95rem;
  }

  .label {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .muted {
    margin-left: 0.35rem;
    color: var(--text-tertiary);
    font-size: 0.85rem;
  }

  .role-description {
    flex: 1;
    margin: 0 0 1.25rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.25rem;
    border-radius: 999px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .btn-primary {
    background: var(--primary-color);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: rgba(0, 123, 255, 0.12);
    color: var(--primary-color);
  }

  .status.full {
    color: #dc3545;
    font-weight: 600;
  }

  .empty {
    padding: 2rem;
    border-radius: 18px;
    background: var(--bg-secondary);
    text-align: center;
    color: var(--text-secondary);
  }

  @media (max-width: 960px) {
    .hero {
      grid-template-columns: 1fr;
      text-align: center;
    }

    .hero-content {
      margin: 0 auto;
    }

    .hero-graphic {
      order: -1;
      height: 200px;
    }

    .leader-card {
      text-align: left;
    }
  }
</style>
