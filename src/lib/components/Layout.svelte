<script>
  import { onMount } from 'svelte';
  import { auth } from '../stores/auth';
  import { theme } from '../stores/theme';
  import { push } from 'svelte-spa-router';

  let showMobileMenu = false;
  let signingOut = false;

  onMount(() => {
    theme.initialize();
  });

  async function handleSignOut(event) {
    event?.preventDefault();
    if (signingOut) return;

    signingOut = true;
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      showMobileMenu = false;
      signingOut = false;
      push('/auth/login');
    }
  }

  function toggleMobileMenu() {
    showMobileMenu = !showMobileMenu;
  }

  function handleNavClick() {
    showMobileMenu = false;
  }
</script>

<div class="app-layout">
  <nav class="navbar">
    <div class="nav-container">
      <div class="nav-brand">
        <a href="#/" class="nav-brand-link">
          <img src="/bbc-logo.png" alt="Berkeley Bicycle Club" class="nav-logo" />
        </a>
      </div>

      <div class="nav-center">
        <span class="nav-title">Omnium Volunteer Hub</span>
      </div>

      <div class="nav-right">
        <button class="mobile-menu-btn" on:click={toggleMobileMenu} aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="nav-menu" class:active={showMobileMenu}>
        {#if $auth.user}
          {#if $auth.isAdmin}
            <a href="#/admin" class="nav-link" on:click={handleNavClick}>Dashboard</a>
            <a href="#/admin/roles" class="nav-link" on:click={handleNavClick}>Roles</a>
            <a href="#/admin/domains" class="nav-link" on:click={handleNavClick}>Domains</a>
            <a href="#/admin/volunteers" class="nav-link" on:click={handleNavClick}>Users</a>
            <a href="#/admin/communications" class="nav-link" on:click={handleNavClick}>Communications</a>
          {:else if $auth.profile?.role === 'volunteer_leader'}
            <a href="#/leader" class="nav-link" on:click={handleNavClick}>My Roles</a>
            <a href="#/volunteer" class="nav-link" on:click={handleNavClick}>Browse Roles</a>
            <a href="#/my-signups" class="nav-link" on:click={handleNavClick}>My Signups</a>
          {:else}
            <a href="#/volunteer" class="nav-link" on:click={handleNavClick}>Browse Roles</a>
            <a href="#/my-signups" class="nav-link" on:click={handleNavClick}>My Signups</a>
          {/if}
          
          <button class="theme-toggle" on:click={() => theme.toggle()} title="Toggle {$theme === 'light' ? 'dark' : 'light'} mode">
            {#if $theme === 'light'}
              🌙
            {:else}
              ☀️
            {/if}
          </button>
          
          <div class="nav-user">
            <a href="#/profile" class="user-email" title="Edit Profile" on:click={handleNavClick}>
              {$auth.profile?.email}
            </a>
            <button type="button" class="btn-link" on:click={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        {:else}
          <a href="#/auth/login" class="nav-link" on:click={handleNavClick}>Sign In</a>
          
          <button class="theme-toggle" on:click={() => theme.toggle()} title="Toggle {$theme === 'light' ? 'dark' : 'light'} mode">
            {#if $theme === 'light'}
              🌙
            {:else}
              ☀️
            {/if}
          </button>
        {/if}
        </div>
      </div>
    </div>
  </nav>

  <main class="main-content">
    <slot />
  </main>

  <footer class="footer">
    <p>&copy; 2025 Berkeley Bicycle Club. All rights reserved.</p>
  </footer>
</div>

<style>
  .app-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .navbar {
    background: var(--bg-secondary);
    color: var(--text-primary);
    padding: 1rem 0;
    box-shadow: var(--shadow-md);
    border-bottom: 1px solid var(--border-color);
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    position: relative;
    gap: 1rem;
  }

  .nav-brand {
    justify-self: start;
  }

  .nav-brand-link {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: var(--text-primary);
  }

  .nav-logo {
    height: 36px;
    width: auto;
    display: block;
  }

  .nav-center {
    justify-self: center;
    text-align: center;
  }

  .nav-title {
    font-size: 3rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .nav-right {
    display: flex;
    align-items: center;
    justify-self: end;
  }

  .mobile-menu-btn {
    display: none;
    flex-direction: column;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
  }

  .mobile-menu-btn span {
    width: 25px;
    height: 3px;
    background: var(--text-primary);
    border-radius: 3px;
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-link {
    color: var(--text-primary);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .nav-link:hover {
    background: var(--bg-tertiary);
  }

  .nav-link.btn-primary {
    background: var(--primary-color);
    color: white;
  }

  .nav-link.btn-primary:hover {
    background: var(--primary-hover);
  }

  .nav-user {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-left: 1rem;
    border-left: 1px solid var(--border-color);
  }

  .user-email {
    font-size: 0.9rem;
    opacity: 0.8;
    color: var(--text-primary);
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .user-email:hover {
    opacity: 1;
    text-decoration: underline;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.9rem;
  }

  .btn-link[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
    text-decoration: none;
  }

  .theme-toggle {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    width: 44px;
    height: 44px;
  }

  .theme-toggle:hover {
    background: var(--bg-primary);
    transform: scale(1.05);
  }

  .theme-toggle:active {
    transform: scale(0.95);
  }

  .main-content {
    flex: 1;
    padding: 2rem 1rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .footer {
    background: var(--bg-secondary);
    padding: 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
    border-top: 1px solid var(--border-color);
  }

  @media (max-width: 768px) {
    .nav-container {
      grid-template-columns: auto 1fr auto;
    }

    .nav-title {
      font-size: 2rem;
      white-space: normal;
      line-height: 1.2;
    }

    .mobile-menu-btn {
      display: flex;
    }

    .nav-menu {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 1rem;
      display: none;
      box-shadow: var(--shadow-lg);
    }

    .nav-menu.active {
      display: flex;
    }

    .nav-link {
      padding: 1rem;
    }

    .nav-user {
      flex-direction: column;
      align-items: stretch;
      border-left: none;
      border-top: 1px solid var(--border-color);
      padding-left: 0;
      padding-top: 1rem;
      margin-top: 0.5rem;
    }
  }
</style>

