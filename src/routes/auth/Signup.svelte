<script>
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';

  let email = '';
  let password = '';
  let confirmPassword = '';
  let firstName = '';
  let lastName = '';
  let error = '';
  let loading = false;
  let success = false;

  async function handleSignup() {
    error = '';
    loading = true;

    // Validation
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      loading = false;
      return;
    }

    if (password.length < 6) {
      error = 'Password must be at least 6 characters';
      loading = false;
      return;
    }

    try {
      await auth.signUp(email, password, firstName, lastName, 'volunteer');
      success = true;
      
      // Redirect to volunteer dashboard
      setTimeout(() => {
        push('/volunteer');
      }, 2000);
    } catch (err) {
      console.error('Signup error:', err);
      error = err.message || 'Failed to create account';
      success = false;
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1>Create Account</h1>
    <p class="subtitle">Join as a volunteer</p>

    {#if error}
      <div class="alert alert-error">
        {error}
      </div>
    {/if}

    {#if success}
      <div class="alert alert-success">
        Account created successfully! Redirecting...
      </div>
    {/if}

    <form on:submit|preventDefault={handleSignup}>
      <div class="form-row">
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input
            type="text"
            id="firstName"
            bind:value={firstName}
            required
            placeholder="John"
            disabled={loading}
          />
        </div>

        <div class="form-group">
          <label for="lastName">Last Name</label>
          <input
            type="text"
            id="lastName"
            bind:value={lastName}
            required
            placeholder="Doe"
            disabled={loading}
          />
        </div>
      </div>

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
          placeholder="At least 6 characters"
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input
          type="password"
          id="confirmPassword"
          bind:value={confirmPassword}
          required
          placeholder="Re-enter password"
          disabled={loading}
        />
      </div>

      <button type="submit" class="btn btn-primary btn-full" disabled={loading || success}>
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
    </form>

    <div class="auth-links">
      Already have an account? <a href="#/auth/login">Sign in</a>
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
    max-width: 500px;
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

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
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

