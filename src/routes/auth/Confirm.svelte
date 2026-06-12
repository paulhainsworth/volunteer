<script>
  import { onMount } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import { auth } from '../../lib/stores/auth';

  let status = 'verifying';
  let errorMessage = '';

  onMount(async () => {
    // Magic links land here as #/auth/confirm?token_hash=...&type=magiclink[&post_login=waiver]
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const qIndex = hash.indexOf('?');
    const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
    const tokenHash = params.get('token_hash');
    const postLogin = params.get('post_login');

    if (!tokenHash) {
      status = 'error';
      errorMessage = 'This sign-in link is incomplete. Please request a new one.';
      return;
    }

    try {
      const { profile } = await auth.verifyMagicLinkToken(tokenHash);

      const needsOnboarding = !profile?.emergency_contact_name;
      if (needsOnboarding) {
        if (postLogin === 'waiver') {
          sessionStorage.setItem('postOnboardingRoute', '/volunteer/waiver');
        }
        await replace('/onboarding');
      } else if (postLogin === 'waiver') {
        await replace('/volunteer/waiver');
      } else {
        await replace('/my-signups');
      }
    } catch (e) {
      console.error('[auth] magic link verification failed:', e);
      status = 'error';
      const msg = String(e?.message ?? '').toLowerCase();
      errorMessage =
        msg.includes('expired') || msg.includes('invalid') || msg.includes('not found')
          ? 'This sign-in link has expired or was already used. Request a new one below — links work once and expire after an hour.'
          : 'We could not sign you in. Please request a new link and try again.';
    }
  });
</script>

<div class="confirm-page">
  {#if status === 'verifying'}
    <div class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>Signing you in…</h1>
      <p>One moment while we verify your link.</p>
    </div>
  {:else}
    <div class="card">
      <h1>Sign-in link didn't work</h1>
      <p>{errorMessage}</p>
      <a class="button" href="#/auth/login">Request a new link</a>
    </div>
  {/if}
</div>

<style>
  .confirm-page {
    display: flex;
    justify-content: center;
    padding: 4rem 1rem;
  }
  .card {
    max-width: 420px;
    width: 100%;
    text-align: center;
    padding: 2rem;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    background: var(--card-bg, #fff);
  }
  .card h1 {
    font-size: 1.25rem;
    margin: 0.75rem 0 0.5rem;
  }
  .card p {
    color: var(--text-secondary, #4b5563);
    margin: 0 0 1rem;
  }
  .spinner {
    width: 32px;
    height: 32px;
    margin: 0 auto;
    border: 3px solid var(--border-color, #e5e7eb);
    border-top-color: var(--primary-color, #1a56b0);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .button {
    display: inline-block;
    background: var(--primary-color, #1a56b0);
    color: #fff;
    text-decoration: none;
    padding: 0.6rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
  }
</style>
