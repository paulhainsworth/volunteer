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
  import SignWaiver from './routes/volunteer/SignWaiver.svelte';
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
  import KidsClinic from './routes/KidsClinic.svelte';

  const routes = {
    '/': Home,
    '/auth/login': Login,
    '/volunteer': BrowseRoles,
    '/volunteer/waiver': SignWaiver,
    '/signup/:id': VolunteerSignup,
    '/signup/:id/*': VolunteerSignup,
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
    '/board': Board,
    '/kids': KidsClinic
  };

  onMount(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    /** Capture before auth.initialize() — PKCE code may be stripped from the URL after exchange. */
    const hadPkceCode = /[?&]code=/.test(search);
    const hasAuthParams =
      (hash && (hash.includes('access_token=') || hash.includes('type=magiclink'))) ||
      hadPkceCode;
    // Run auth init without blocking mount so the login form can submit while bootstrap runs;
    // a timed-out getSession race previously left Supabase hung and froze magic-link sends.
    void (async () => {
      await auth.initialize();
      if (hasAuthParams) {
        // Supabase parses auth tokens from the URL asynchronously. Wait for session
        // to be recovered before we clear the hash, or the tokens are lost.
        const { supabase } = await import('./lib/supabaseClient');
        for (let i = 0; i < 40; i++) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { replace } = await import('svelte-spa-router');
            // Do not call refreshSession() here — it runs loadCurrentSession() stall recovery and can
            // clear localStorage right after magic-link tokens were written, leaving a ghost "signed in" UI.
            const { profile } = await auth.hydrateFromSession(session);
            const needsOnboarding = !profile?.emergency_contact_name;
            const fromMagicLink = hash.includes('type=magiclink') || hadPkceCode;
            const postLogin =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('post_login')
                : null;
            if (needsOnboarding) {
              if (postLogin === 'waiver') {
                sessionStorage.setItem('postOnboardingRoute', '/volunteer/waiver');
              }
              await replace('/onboarding');
            } else if (postLogin === 'waiver') {
              await replace('/volunteer/waiver');
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
    })();
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
