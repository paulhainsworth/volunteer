<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { auth } from './lib/stores/auth';
  
  // Layout
  import Layout from './lib/components/Layout.svelte';
  
  // Routes
  import Home from './routes/Home.svelte';
  import Login from './routes/auth/Login.svelte';
  import AuthCallback from './routes/auth/AuthCallback.svelte';
  
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
  import Contacts from './routes/Contacts.svelte';

  const routes = {
    '/': Home,
    '/auth/login': Login,
    '/auth/callback': AuthCallback,
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
    '/kids': KidsClinic,
    '/contacts': Contacts
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
        const { completeMagicLinkAfterRedirect } = await import(
          './lib/auth/completeMagicLinkAfterRedirect.js'
        );
        await completeMagicLinkAfterRedirect({ hashSnapshot: hash, hadPkceCode });
      }
    })();
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
