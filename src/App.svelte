<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { auth } from './lib/stores/auth';
  
  // Layout
  import Layout from './lib/components/Layout.svelte';
  
  // Routes
  import Home from './routes/Home.svelte';
  import Login from './routes/auth/Login.svelte';
  
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

  onMount(async () => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const hasAuthParams = hash && (hash.includes('access_token=') || hash.includes('type=magiclink'));
    await auth.initialize();
    if (hasAuthParams) {
      // Supabase parses auth tokens from the URL asynchronously. Wait for session
      // to be recovered before we clear the hash, or the tokens are lost.
      const { supabase } = await import('./lib/supabaseClient');
      for (let i = 0; i < 20; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { replace } = await import('svelte-spa-router');
          const { profile } = await auth.refreshSession();
          const needsOnboarding = !profile?.emergency_contact_name;
          const fromMagicLink = hash.includes('type=magiclink');
          if (needsOnboarding) {
            await replace('/onboarding');
          } else if (fromMagicLink) {
            await replace('/my-signups');
          } else {
            await replace('/');
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
