<script>
  import { auth } from '../../lib/stores/auth';

  let email = '';
  let error = '';
  let loading = false;
  let success = false;

  async function handleReset() {
    error = '';
    loading = true;
    success = false;

    try {
      await auth.resetPassword(email);
      success = true;
    } catch (err) {
      error = err.message || 'Failed to send reset email';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1>Reset Password</h1>
    <p class="subtitle">We'll send you a link to reset your password</p>

    {#if error}
      <div class="alert alert-error">
        {error}
      </div>
    {/if}

    {#if success}
      <div class="alert alert-success">
        Check your email for a password reset link!
      </div>
    {/if}

    <form on:submit|preventDefault={handleReset}>
      <div class="form-group">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          bind:value={email}
          required
          placeholder="you@example.com"
          disabled={loading || success}
        />
      </div>

      <button type="submit" class="btn btn-primary btn-full" disabled={loading || success}>
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>
    </form>

    <div class="auth-links">
      <a href="#/auth/login">Back to sign in</a>
    </div>
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

