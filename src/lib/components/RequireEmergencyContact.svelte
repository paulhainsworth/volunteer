<script>
  import { auth } from '../stores/auth';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';

  export let children;

  onMount(() => {
    // Redirect to onboarding if no emergency contact
    if ($auth.user && !$auth.profile?.emergency_contact_name) {
      push('/onboarding');
    }
  });
</script>

{#if $auth.user && $auth.profile?.emergency_contact_name}
  <slot />
{:else if $auth.user}
  <div class="redirect-message">
    <p>Redirecting to complete your profile...</p>
  </div>
{/if}

<style>
  .redirect-message {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }
</style>

