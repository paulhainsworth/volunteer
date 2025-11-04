<script>
  import { auth } from '../stores/auth';
  import { push } from 'svelte-spa-router';

  let showMobileMenu = false;

  async function handleSignOut() {
    try {
      await auth.signOut();
      push('/auth/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  function toggleMobileMenu() {
    showMobileMenu = !showMobileMenu;
  }
</script>

<div class="app-layout">
  <nav class="navbar">
    <div class="nav-container">
      <div class="nav-brand">
        <a href="/">🚴 Volunteer Manager</a>
      </div>
      
      <button class="mobile-menu-btn" on:click={toggleMobileMenu} aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div class="nav-menu" class:active={showMobileMenu}>
        {#if $auth.user}
          {#if $auth.isAdmin}
            <a href="#/admin" class="nav-link">Dashboard</a>
            <a href="#/admin/roles" class="nav-link">Roles</a>
            <a href="#/admin/volunteers" class="nav-link">Users</a>
            <a href="#/admin/communications" class="nav-link">Communications</a>
          {:else if $auth.profile?.role === 'volunteer_leader'}
            <a href="#/leader" class="nav-link">My Roles</a>
            <a href="#/volunteer" class="nav-link">Browse Roles</a>
            <a href="#/my-signups" class="nav-link">My Signups</a>
          {:else}
            <a href="#/volunteer" class="nav-link">Browse Roles</a>
            <a href="#/my-signups" class="nav-link">My Signups</a>
          {/if}
          
          <div class="nav-user">
            <a href="#/profile" class="user-email" title="Edit Profile">
              {$auth.profile?.email}
            </a>
            <button on:click={handleSignOut} class="btn-link">Sign Out</button>
          </div>
        {:else}
          <a href="#/auth/login" class="nav-link">Login</a>
          <a href="#/auth/signup" class="nav-link btn-primary">Sign Up</a>
        {/if}
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
    background: #1a1a1a;
    color: white;
    padding: 1rem 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .nav-brand a {
    font-size: 1.5rem;
    font-weight: bold;
    color: white;
    text-decoration: none;
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
    background: white;
    border-radius: 3px;
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-link {
    color: white;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .nav-link:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .nav-link.btn-primary {
    background: #007bff;
    color: white;
  }

  .nav-link.btn-primary:hover {
    background: #0056b3;
  }

  .nav-user {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-left: 1rem;
    border-left: 1px solid rgba(255, 255, 255, 0.2);
  }

  .user-email {
    font-size: 0.9rem;
    opacity: 0.8;
    color: white;
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
    color: white;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.9rem;
  }

  .main-content {
    flex: 1;
    padding: 2rem 1rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .footer {
    background: #f8f9fa;
    padding: 1.5rem;
    text-align: center;
    color: #6c757d;
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .mobile-menu-btn {
      display: flex;
    }

    .nav-menu {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a1a;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 1rem;
      display: none;
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
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-left: 0;
      padding-top: 1rem;
      margin-top: 0.5rem;
    }
  }
</style>

