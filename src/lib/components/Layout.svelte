<script>
  import { onMount } from 'svelte';
  import { auth } from '../stores/auth';
  import { theme } from '../stores/theme';
  import { location, push } from 'svelte-spa-router';

  $: isKidsLanding = $location === '/kids';

  let showMobileMenu = false;
  let mobileMenuButton;
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

  function handleMenuKeydown(event) {
    if (event.key !== 'Escape' || !showMobileMenu || !mobileMenuButton?.offsetWidth) return;

    event.preventDefault();
    showMobileMenu = false;
    mobileMenuButton.focus();
  }
</script>

<svelte:window on:keydown={handleMenuKeydown} on:hashchange={handleNavClick} />

<div class="app-layout" class:kids-landing={isKidsLanding}>
  {#if !isKidsLanding}
  <nav class="navbar" aria-label="Main">
    <div class="nav-container">
      <a href="#/" class="nav-brand-link">
        <img src="/bbc-logo.png" alt="Berkeley Bicycle Club" class="nav-logo" />
        <span class="nav-title">Omnium Volunteer Hub</span>
      </a>

      <div class="nav-right">
        <button
          type="button"
          class="mobile-menu-btn"
          bind:this={mobileMenuButton}
          on:click={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={showMobileMenu}
          aria-controls="main-navigation"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div id="main-navigation" class="nav-menu" class:active={showMobileMenu}>
        {#if $auth.user}
          {#if $auth.isAdmin}
            <a href="#/admin" class="nav-link" aria-current={$location === '/admin' ? 'page' : undefined} on:click={handleNavClick}>Dashboard</a>
            <a href="#/admin/roles" class="nav-link" aria-current={$location === '/admin/roles' ? 'page' : undefined} on:click={handleNavClick}>Roles</a>
            <a href="#/admin/domains" class="nav-link" aria-current={$location === '/admin/domains' ? 'page' : undefined} on:click={handleNavClick}>Domains</a>
            <a href="#/admin/volunteers" class="nav-link" aria-current={$location === '/admin/volunteers' ? 'page' : undefined} on:click={handleNavClick}>Users</a>
            <a href="#/admin/communications" class="nav-link" aria-current={$location === '/admin/communications' ? 'page' : undefined} on:click={handleNavClick}>Communications</a>
          {:else if $auth.profile?.role === 'volunteer_leader'}
            <a href="#/leader" class="nav-link" aria-current={$location === '/leader' ? 'page' : undefined} on:click={handleNavClick}>My Roles</a>
            <a href="#/volunteer" class="nav-link" aria-current={$location === '/volunteer' ? 'page' : undefined} on:click={handleNavClick}>Browse Roles</a>
            <a href="#/my-signups" class="nav-link" aria-current={$location === '/my-signups' ? 'page' : undefined} on:click={handleNavClick}>My Signups</a>
          {:else}
            <a href="#/volunteer" class="nav-link" aria-current={$location === '/volunteer' ? 'page' : undefined} on:click={handleNavClick}>Browse Roles</a>
            <a href="#/my-signups" class="nav-link" aria-current={$location === '/my-signups' ? 'page' : undefined} on:click={handleNavClick}>My Signups</a>
          {/if}
          
          <button class="theme-toggle" on:click={() => theme.toggle()} aria-label="Dark mode" aria-pressed={$theme === 'dark'} title="Toggle {$theme === 'light' ? 'dark' : 'light'} mode">
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
          <a href="#/auth/login" class="nav-link" aria-current={$location === '/auth/login' ? 'page' : undefined} on:click={handleNavClick}>Sign In</a>
          
          <button class="theme-toggle" on:click={() => theme.toggle()} aria-label="Dark mode" aria-pressed={$theme === 'dark'} title="Toggle {$theme === 'light' ? 'dark' : 'light'} mode">
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
  {/if}

  <main class="main-content" class:main-content--kids={isKidsLanding}>
    <slot />
  </main>

  {#if !isKidsLanding}
  <footer class="footer">
    <p>&copy; 2025 Berkeley Bicycle Club. All rights reserved.</p>
  </footer>
  {/if}
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
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--border-color);
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    gap: 1rem;
  }

  .nav-brand-link {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    min-width: 0;
    text-decoration: none;
    color: var(--text-primary);
  }

  .nav-logo {
    width: 105px;
    height: auto;
    flex-shrink: 0;
    display: block;
  }

  :global([data-theme='dark']) .nav-logo {
    filter: brightness(0) invert(1);
  }

  .nav-title {
    font-size: 1.125rem;
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
  }

  .nav-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .mobile-menu-btn {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    width: 44px;
    height: 44px;
  }

  .mobile-menu-btn:hover,
  .mobile-menu-btn[aria-expanded="true"] {
    background: var(--bg-tertiary);
  }

  .nav-brand-link:focus-visible,
  .mobile-menu-btn:focus-visible,
  .nav-link:focus-visible,
  .nav-user a:focus-visible,
  .nav-user button:focus-visible,
  .theme-toggle:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
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
    gap: 0.375rem;
  }

  .nav-link {
    color: var(--text-primary);
    text-decoration: none;
    padding: 0.625rem;
    border-radius: 6px;
    font-size: 0.9375rem;
    white-space: nowrap;
    transition: background 0.2s;
  }

  .nav-link:hover,
  .nav-link[aria-current="page"] {
    background: var(--bg-tertiary);
  }

  .nav-user {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-left: 0.375rem;
    padding-left: 0.75rem;
    border-left: 1px solid var(--border-color);
  }

  .user-email {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    white-space: nowrap;
    min-height: 44px;
    padding: 0 0.25rem;
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

  .main-content--kids {
    padding: 0;
    max-width: none;
  }

  .kids-landing {
    background: var(--bg-primary);
  }

  .footer {
    background: var(--bg-secondary);
    padding: 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
    border-top: 1px solid var(--border-color);
  }

  @media (max-width: 1100px) {
    .nav-title {
      white-space: normal;
    }

    .mobile-menu-btn {
      display: flex;
    }

    .nav-menu {
      display: none;
      position: absolute;
      z-index: 10;
      top: calc(100% + 0.875rem);
      right: 1rem;
      width: min(23rem, calc(100% - 2rem));
      max-height: calc(100dvh - 5rem);
      overflow-y: auto;
      flex-direction: column;
      align-items: stretch;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
    }

    .nav-menu.active {
      display: flex;
    }

    .nav-link {
      padding: 0.75rem;
    }

    .theme-toggle {
      flex-shrink: 0;
    }

    .nav-user {
      justify-content: space-between;
      border-left: none;
      border-top: 1px solid var(--border-color);
      margin: 0.375rem 0 0;
      padding: 0.375rem 0.25rem 0;
    }

    .user-email {
      min-width: 0;
      max-width: none;
    }
  }

  @media (max-width: 400px) {
    .nav-brand-link {
      gap: 0.625rem;
    }

    .nav-logo {
      width: 84px;
    }

    .nav-title {
      font-size: 1rem;
    }
  }
</style>
