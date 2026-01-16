<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { auth } from './lib/stores/auth';
  
  // Layout
  import Layout from './lib/components/Layout.svelte';
  
  // Routes
  import Home from './routes/Home.svelte';
  import Login from './routes/auth/Login.svelte';
  import Signup from './routes/auth/Signup.svelte';
  import ResetPassword from './routes/auth/ResetPassword.svelte';
  
  // Volunteer routes
  import BrowseRoles from './routes/volunteer/BrowseRoles.svelte';
  import VolunteerSignup from './routes/volunteer/Signup.svelte';
  import MySignups from './routes/volunteer/MySignups.svelte';
  
  // Admin routes
  import AdminDashboard from './routes/admin/Dashboard.svelte';
  import RolesList from './routes/admin/RolesList.svelte';
  import VolunteersList from './routes/admin/VolunteersList.svelte';
  import Communications from './routes/admin/Communications.svelte';
  import Domains from './routes/admin/Domains.svelte';
  
  // Volunteer Leader routes
  import LeaderDashboard from './routes/leader/Dashboard.svelte';
  import DomainInvite from './routes/invite/Domain.svelte';
  
  // Profile
  import Profile from './routes/Profile.svelte';
  import Onboarding from './routes/Onboarding.svelte';
  
  // Board
  import Board from './routes/Board.svelte';

  const routes = {
    '/': Home,
    '/auth/login': Login,
    '/auth/signup': Signup,
    '/auth/reset-password': ResetPassword,
    '/volunteer': BrowseRoles,
    '/signup/:id': VolunteerSignup,
    '/my-signups': MySignups,
    '/profile': Profile,
    '/onboarding': Onboarding,
    '/leader': LeaderDashboard,
    '/invite/:domainId': DomainInvite,
    '/admin': AdminDashboard,
    '/admin/roles': RolesList,
    '/admin/roles/:id': RolesList,
    '/admin/volunteers': VolunteersList,
    '/admin/domains': Domains,
    '/admin/communications': Communications,
    '/board': Board
  };

  onMount(() => {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash || '';
      const doubleHashIndex = currentHash.indexOf('#', 1);

      if (currentHash.startsWith('#/auth/reset-password') && doubleHashIndex !== -1) {
        const recoveryFragment = currentHash.slice(doubleHashIndex + 1);
        if (recoveryFragment) {
          try {
            sessionStorage.setItem('pending-recovery-params', recoveryFragment);
          } catch (storageErr) {
            console.warn('Unable to store recovery params:', storageErr);
          }
        }

        const cleanHash = currentHash.slice(0, doubleHashIndex);
        window.history.replaceState({}, document.title, `${window.location.origin}/${cleanHash}`);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }

    auth.initialize();
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
