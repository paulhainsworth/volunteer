<script>
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin() {
    error = '';
    loading = true;

    try {
      await auth.signIn(email, password);
      
      // Check if needs onboarding (no emergency contact)
      if (!$auth.profile?.emergency_contact_name) {
        push('/onboarding');
        return;
      }

      // Redirect based on role
      if ($auth.isAdmin) {
        push('/admin');
      } else if ($auth.profile?.role === 'volunteer_leader') {
        push('/leader');
      } else {
        push('/volunteer');
      }
    } catch (err) {
      error = err.message || 'Failed to sign in';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1>Sign In</h1>
    <p class="subtitle">Welcome back to Race Volunteer Manager</p>

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

      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          bind:value={password}
          required
          placeholder="Enter your password"
          disabled={loading}
        />
      </div>

      <button type="submit" class="btn btn-primary btn-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <div class="auth-links">
      <a href="#/auth/reset-password">Forgot password?</a>
      <span>·</span>
      <a href="#/auth/signup">Create account</a>
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

  .auth-links span {
    margin: 0 0.5rem;
  }
</style>

