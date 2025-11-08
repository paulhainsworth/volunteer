<script>
  import { onMount, onDestroy } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  let mode = 'request'; // 'request' | 'update'

  let email = '';

  let requestError = '';
  let requestLoading = false;
  let requestSuccess = false;

  let newPassword = '';
  let confirmPassword = '';
  let updateError = '';
  let updateLoading = false;
  let updateSuccess = false;
  let verifyingLink = false;
  let redirectTimer = null;
  let recoveryTokens = null;

  function getRecoveryParams() {
    let fragment = '';
    const hash = window.location.hash || '';

    const secondHashIndex = hash.indexOf('#', 1);
    if (secondHashIndex !== -1) {
      fragment = hash.slice(secondHashIndex + 1);
    } else {
      const questionIndex = hash.indexOf('?');
      if (questionIndex !== -1) {
        fragment = hash.slice(questionIndex + 1);
      }
    }

    if (!fragment && window.location.search) {
      fragment = window.location.search.slice(1);
    }

    if (!fragment) {
      try {
        const storedFragment = sessionStorage.getItem('pending-recovery-params');
        if (storedFragment) {
          sessionStorage.removeItem('pending-recovery-params');
          fragment = storedFragment;
        }
      } catch (storageErr) {
        console.warn('Unable to read stored recovery params:', storageErr);
      }
    }

    if (!fragment) return null;

    return new URLSearchParams(fragment);
  }

  onMount(async () => {
    const params = getRecoveryParams();
    if (!params) return;

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && (!type || type === 'recovery')) {
      verifyingLink = true;
      const previousMode = mode;
      mode = 'update';
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseAnonKey
          }
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Unable to verify reset link.');
        }

        const userData = await response.json();
        email = userData?.email || email;
        recoveryTokens = { accessToken, refreshToken };
      } catch (err) {
        console.error('Password reset session error:', err);
        mode = previousMode;
        requestError = err.message || 'This reset link is invalid or has expired. Please request a new one.';
      } finally {
        verifyingLink = false;
        window.history.replaceState({}, document.title, `${window.location.origin}/#/auth/reset-password`);
      }
    }
  });

  onDestroy(() => {
    if (redirectTimer) {
      clearTimeout(redirectTimer);
    }
  });

  async function handleResetRequest() {
    requestError = '';
    requestSuccess = false;
    requestLoading = true;

    try {
      await auth.resetPassword(email);
      requestSuccess = true;
    } catch (err) {
      requestError = err.message || 'Failed to send reset email';
    } finally {
      requestLoading = false;
    }
  }

  async function handlePasswordUpdate() {
    updateError = '';
    updateSuccess = false;

    if (newPassword.trim().length < 8) {
      updateError = 'Password must be at least 8 characters long.';
      return;
    }

    if (newPassword !== confirmPassword) {
      updateError = 'Passwords do not match.';
      return;
    }

    if (!recoveryTokens?.accessToken) {
      updateError = 'Password reset link is missing required information. Please request a new reset email.';
      return;
    }

    updateLoading = true;

    try {
      const updateResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${recoveryTokens.accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: newPassword
        })
      });

      if (!updateResponse.ok) {
        const message = await updateResponse.text();
        throw new Error(message || 'Failed to update password.');
      }

      updateSuccess = true;
      newPassword = '';
      confirmPassword = '';

      if (recoveryTokens.refreshToken) {
        try {
          const sessionResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: supabaseAnonKey
            },
            body: JSON.stringify({
              refresh_token: recoveryTokens.refreshToken
            })
          });

          if (sessionResponse.ok) {
            const session = await sessionResponse.json();
            if (session?.access_token && session?.refresh_token) {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token
              });

              if (sessionError) {
                console.warn('Unable to set Supabase session after password reset:', sessionError.message);
              }
            }
          } else {
            console.warn('Refresh token exchange failed during password reset.');
          }
        } catch (sessionErr) {
          console.warn('Session exchange error during password reset:', sessionErr);
        }
      }

      redirectTimer = setTimeout(() => {
        window.location.hash = '#/auth/login';
      }, 1500);
    } catch (err) {
      updateError = err.message || 'Failed to update password. Please try again.';
    } finally {
      updateLoading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    {#if mode === 'request'}
      <h1>Reset Password</h1>
      <p class="subtitle">We'll send you a link to reset your password</p>

      {#if requestError}
        <div class="alert alert-error">
          {requestError}
        </div>
      {/if}

      {#if requestSuccess}
        <div class="alert alert-success">
          Check your email for a password reset link!
        </div>
      {/if}

      <form on:submit|preventDefault={handleResetRequest}>
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            placeholder="you@example.com"
            disabled={requestLoading || requestSuccess}
          />
        </div>

        <button type="submit" class="btn btn-primary btn-full" disabled={requestLoading || requestSuccess}>
          {requestLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <div class="auth-links">
        <a href="#/auth/login">Back to sign in</a>
      </div>
    {:else}
      <h1>Choose a New Password</h1>
      {#if verifyingLink}
        <p class="subtitle">Verifying your reset link...</p>
      {:else}
        <p class="subtitle">
          Set a new password for {email ? `${email}` : 'your account'}.
        </p>

        {#if updateError}
          <div class="alert alert-error">
            {updateError}
          </div>
        {/if}

        {#if updateSuccess}
          <div class="alert alert-success">
            Password updated! Redirecting you to finish setup…
          </div>
        {/if}

        <form on:submit|preventDefault={handlePasswordUpdate}>
          <div class="form-group">
            <label for="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              bind:value={newPassword}
              minlength="8"
              required
              placeholder="Enter a new password"
              disabled={updateLoading || updateSuccess}
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              bind:value={confirmPassword}
              minlength="8"
              required
              placeholder="Re-enter your new password"
              disabled={updateLoading || updateSuccess}
            />
          </div>

          <button type="submit" class="btn btn-primary btn-full" disabled={updateLoading || updateSuccess}>
            {updateLoading ? 'Updating…' : 'Save Password'}
          </button>
        </form>

        <div class="auth-links">
          <a href="#/auth/login">Back to sign in</a>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .auth-page {
    min-height: calc(100vh - 200px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .auth-card {
    background: white;
    padding: 3rem;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 450px;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: #1a1a1a;
  }

  .subtitle {
    color: #6c757d;
    margin-bottom: 2rem;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .alert-success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  input:disabled {
    background: #f8f9fa;
    cursor: not-allowed;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-full {
    width: 100%;
  }

  .auth-links {
    margin-top: 1.5rem;
    text-align: center;
    color: #6c757d;
  }

  .auth-links a {
    color: #007bff;
    text-decoration: none;
  }

  .auth-links a:hover {
    text-decoration: underline;
  }
</style>

