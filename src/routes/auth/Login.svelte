<script>
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';

  let email = '';
  let error = '';
  let loading = false;
  let emailSent = false;

  // We never check emergency contact here so magic links are always sent (e.g. for
  // admin-created leaders who will complete emergency contact after clicking the link).
  async function handleLogin() {
    error = '';
    loading = true;

    try {
      await auth.signInWithMagicLink(email);
      emailSent = true;
    } catch (err) {
      error = err.message || 'Failed to send sign-in link';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1>Sign In</h1>
    <p class="subtitle">Enter your email and we'll send you a verification link. No password needed.</p>

    {#if emailSent}
      <div class="success-message">
        <p><strong>Check your email</strong></p>
        <p>We've sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.</p>
        <p class="hint">Didn't receive it? Check your spam folder or <button type="button" class="btn-link" on:click={() => (emailSent = false)}>try again</button>.</p>
      </div>
    {:else}
      {#if error}
        <div class="alert alert-error">
          {error}
        </div>
      {/if}

      <form on:submit|preventDefault={handleLogin}>
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <button type="submit" class="btn btn-primary btn-full" disabled={loading}>
          {loading ? 'Sending link...' : 'Send sign-in link'}
        </button>
      </form>
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
    line-height: 1.5;
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
  }

  input:focus {
    outline: none;
    border-color: #007bff;
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

  .success-message {
    padding: 1rem 0;
  }

  .success-message p {
    margin: 0 0 0.75rem;
    color: #1a1a1a;
  }

  .success-message .hint {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .btn-link {
    background: none;
    border: none;
    color: #007bff;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    font-size: inherit;
  }
</style>
