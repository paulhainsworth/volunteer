<script>
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { auth } from './lib/stores/auth';
  
  // Layout
  import Layout from './lib/components/Layout.svelte';
  
  // Routes
  import Home from './routes/Home.svelte';
  import Login from './routes/auth/Login.svelte';
  import AuthConfirm from './routes/auth/Confirm.svelte';
  
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
    '/auth/confirm': AuthConfirm,
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
    // Magic-link sign-in is handled entirely by the /auth/confirm route (token_hash exchange),
    // so app startup just hydrates whatever session is persisted. Non-blocking so public
    // pages render while auth bootstraps.
    void auth.initialize();
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
