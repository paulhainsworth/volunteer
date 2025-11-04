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
  
  // Volunteer Leader routes
  import LeaderDashboard from './routes/leader/Dashboard.svelte';

  const routes = {
    '/': Home,
    '/auth/login': Login,
    '/auth/signup': Signup,
    '/auth/reset-password': ResetPassword,
    '/volunteer': BrowseRoles,
    '/signup/:id': VolunteerSignup,
    '/my-signups': MySignups,
    '/leader': LeaderDashboard,
    '/admin': AdminDashboard,
    '/admin/roles': RolesList,
    '/admin/roles/:id': RolesList,
    '/admin/volunteers': VolunteersList,
    '/admin/communications': Communications
  };

  onMount(() => {
    auth.initialize();
  });
</script>

<Layout>
  <Router {routes} />
</Layout>
