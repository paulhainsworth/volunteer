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
        <p>If an account exists for <strong>{email}</strong>, you'll receive a sign-in link.</p>
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
    background: var(--bg-primary);
    padding: 3rem;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 450px;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--text-primary);
  }

  .subtitle {
    color: var(--text-secondary);
    margin-bottom: 2rem;
    line-height: 1.5;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .alert-error {
    background: var(--danger-surface);
    color: var(--danger-text);
    border: 1px solid var(--danger-border);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: var(--primary-color);
  }

  input:disabled {
    background: var(--bg-secondary);
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
    color: var(--text-primary);
  }

  .success-message .hint {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--primary-color);
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    font-size: inherit;
  }
</style>
