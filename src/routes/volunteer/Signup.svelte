<script>
  import { onMount } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { signups } from '../../lib/stores/signups';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { formatTimeRange, calculateDuration, formatEventDateInPacific } from '../../lib/utils/timeDisplay';
  import { sendRoleConfirmationEmail } from '../../lib/volunteerSignup';
  import { notifySlackSignup } from '../../lib/notifySlackSignup';

  export let params = {};

  let loading = true;
  let error = '';
  let role = null;
  let phone = '';
  let waiverText = '';
  let waiverAgreed = false;
  let signatureName = '';
  let submitting = false;
  let success = false;
  let needsWaiver = false;
  let isAuthenticated = false;
  let hasLoadedUserData = false;
  let loadingUserData = false;
  let alreadySignedUp = false;

  async function loadAuthenticatedData(userId) {
    loadingUserData = true;

    try {
      const status = await waiverStore.checkWaiverStatus(userId);
      needsWaiver = status.needsToSign;

      if (needsWaiver) {
        const currentWaiver = await waiverStore.fetchCurrentWaiver();
        waiverText = currentWaiver.text;
      } else {
        waiverText = '';
      }

      if ($auth.profile?.first_name && $auth.profile?.last_name) {
        signatureName = `${$auth.profile.first_name} ${$auth.profile.last_name}`;
      }

      hasLoadedUserData = true;
    } catch (err) {
      error = err.message || 'Unable to prepare signup form.';
      hasLoadedUserData = false;
    } finally {
      loadingUserData = false;
    }
  }

  onMount(async () => {
    isAuthenticated = !!$auth.user;

    try {
      role = await roles.fetchRole(params.id);

      // Don't redirect unauthenticated users - show role details + login prompt.
      // (Redirecting to /volunteer?signup=... opened the PII modal for users who already signed up.)

      if (isAuthenticated && $auth.user) {
        await loadAuthenticatedData($auth.user.id);
        const mySignups = (await signups.fetchMySignups($auth.user.id)) ?? [];
        alreadySignedUp = mySignups.some((s) => s.role_id === params.id || s.role?.id === params.id);
      }
    } catch (err) {
      error = err.message || 'Unable to load volunteer role.';
    } finally {
      loading = false;
    }
  });

  $: isAuthenticated = !!$auth.user;

  $: if (isAuthenticated && role && !hasLoadedUserData && !loadingUserData && $auth.user) {
    (async () => {
      await loadAuthenticatedData($auth.user.id);
      const mySignups = (await signups.fetchMySignups($auth.user.id)) ?? [];
      alreadySignedUp = mySignups.some((s) => s.role_id === params.id || s.role?.id === params.id);
    })();
  }

  $: if (!isAuthenticated) {
    hasLoadedUserData = false;
    needsWaiver = false;
    waiverText = '';
    waiverAgreed = false;
    signatureName = '';
  }

  async function handleSubmit() {
    error = '';

    if (!isAuthenticated || !$auth.user) {
      error = 'Please sign in to volunteer for this opportunity.';
      return;
    }

    if (needsWaiver && !waiverAgreed) {
      error = 'You must agree to the waiver to continue';
      return;
    }

    if (needsWaiver && !signatureName.trim()) {
      error = 'Please enter your full name as your digital signature';
      return;
    }

    submitting = true;

    try {
      // Sign waiver if needed
      if (needsWaiver) {
        await waiverStore.signWaiver($auth.user.id, signatureName);
      }

      // Create signup
      const signupData = await signups.createSignup($auth.user.id, params.id, phone || null);

      notifySlackSignup({
        role_id: params.id,
        role_name: signupData?.role?.name ?? role?.name,
        volunteer_id: $auth.user.id,
        volunteer_name: [$auth.profile?.first_name, $auth.profile?.last_name].filter(Boolean).join(' ').trim() || undefined,
        volunteer_email: $auth.profile?.email || $auth.user?.email,
      }).catch(() => {});

      // Send confirmation email
      sendRoleConfirmationEmail({
        to: $auth.profile?.email || $auth.user?.email,
        first_name: $auth.profile?.first_name || 'there',
        role,
        roleId: params.id
      }).catch((err) => console.error('Confirmation email failed:', err));

      success = true;

      // Redirect to my signups after a moment
      setTimeout(() => {
        push('/my-signups');
      }, 2000);
    } catch (err) {
      error = err.message;
      submitting = false;
    }
  }
</script>

<div class="signup-page">
  {#if loading}
    <div class="loading">Loading...</div>
  {:else if error && !role}
    <div class="error-card">
      <h2>Error</h2>
      <p>{error}</p>
      <a href="#/volunteer" class="btn btn-primary">Back to Opportunities</a>
    </div>
  {:else if success}
    <div class="success-card">
      <div class="success-icon">✓</div>
      <h2>You're all set!</h2>
      <p>You've successfully signed up for this volunteer role.</p>
      <p>We'll send you a reminder before the event.</p>
    </div>
  {:else if role}
    {@const duration = calculateDuration(role.start_time, role.end_time)}
    {@const isFull = role.positions_filled >= role.positions_total}
    {@const timeDisplay = formatTimeRange(role) + (duration != null ? ` (${duration} hours)` : '')}

    <div class="signup-container">
      <h1>Sign Up to Volunteer</h1>

      {#if error}
        <div class="alert alert-error">
          {error}
        </div>
      {/if}

      {#if isFull}
        <div class="alert alert-warning">
          This role is currently full. You can still try to sign up in case a spot opens up.
        </div>
      {/if}

      <div class="role-summary">
        <h2>{role.name}</h2>
        
        <div class="summary-details">
          <div class="detail">
            <strong>Date:</strong>
            {role.event_date ? formatEventDateInPacific(role.event_date, 'long') : 'TBD'}
          </div>
          
          <div class="detail">
            <strong>Time:</strong>
            {timeDisplay}
          </div>

          {#if role.location}
            <div class="detail">
              <strong>Location:</strong>
              {role.location}
            </div>
          {/if}

          <div class="detail">
            <strong>Availability:</strong>
            {role.positions_filled} / {role.positions_total} spots filled
          </div>
        </div>

        {#if role.description}
          <div class="description">
            <strong>Description:</strong>
            <p>{role.description}</p>
          </div>
        {/if}
      </div>

      {#if !isAuthenticated}
        <div class="login-prompt">
          <h3>Ready to volunteer?</h3>
          <p>Log in or create an account to claim this opportunity.</p>
          <div class="login-actions">
            <button class="btn btn-primary" on:click={() => push('/auth/login')}>
              Log In to Sign Up
            </button>
            <button class="btn btn-outline" on:click={() => push('/auth/signup')}>
              Create Account
            </button>
          </div>
        </div>
      {:else if alreadySignedUp}
        <div class="success-card">
          <div class="success-icon">✓</div>
          <h2>You're signed up!</h2>
          <p>You're already registered for this role. We'll send you a reminder before the event.</p>
          <a href="#/my-signups" class="btn btn-primary">View My Signups</a>
        </div>
      {:else if loadingUserData && !hasLoadedUserData}
        <div class="loading secondary">Preparing your signup form...</div>
      {:else}
        <form on:submit|preventDefault={handleSubmit}>
          <div class="form-section">
            <h3>Your Information</h3>
            
            <div class="form-group">
              <label for="email">Email (from your account)</label>
              <input
                type="email"
                id="email"
                value={$auth.profile?.email}
                disabled
              />
            </div>

            <div class="form-group">
              <label for="phone">Phone Number (optional)</label>
              <input
                type="tel"
                id="phone"
                bind:value={phone}
                placeholder="(555) 123-4567"
                disabled={submitting}
              />
              <small>Optional - we may use this to contact you on event day</small>
            </div>
          </div>

          {#if needsWaiver}
            <div class="form-section waiver-section">
              <h3>Liability Waiver</h3>
              
              <div class="waiver-text">
                {waiverText}
              </div>

              <div class="form-group">
                <label for="signature">Digital Signature (Full Name)</label>
                <input
                  type="text"
                  id="signature"
                  bind:value={signatureName}
                  placeholder="Your Full Name"
                  required
                  disabled={submitting}
                />
              </div>

              <div class="checkbox-group">
                <input
                  type="checkbox"
                  id="waiver-agree"
                  bind:checked={waiverAgreed}
                  required
                  disabled={submitting}
                />
                <label for="waiver-agree">
                  I have read and agree to the waiver above
                </label>
              </div>
            </div>
          {/if}

          <div class="form-actions">
            <button
              type="button"
              class="btn btn-secondary"
              on:click={() => push('/volunteer')}
              disabled={submitting}
            >
              Cancel
            </button>
            
            <button
              type="submit"
              class="btn btn-primary"
              disabled={submitting || (needsWaiver && (!waiverAgreed || !signatureName.trim()))}
            >
              {submitting ? 'Signing up...' : 'Confirm Signup'}
            </button>
          </div>
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
  .signup-page {
    max-width: 800px;
    margin: 0 auto;
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .loading.secondary {
    padding: 2rem;
  }

  .error-card,
  .success-card {
    background: white;
    padding: 3rem;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .success-icon {
    width: 80px;
    height: 80px;
    background: #28a745;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    margin: 0 auto 1.5rem;
  }

  .signup-container {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h1 {
    margin: 0 0 1.5rem 0;
    color: #1a1a1a;
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

  .alert-warning {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
  }

  .role-summary {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .role-summary h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .summary-details {
    display: grid;
    gap: 0.75rem;
  }

  .detail {
    display: flex;
    gap: 0.5rem;
  }

  .detail strong {
    min-width: 100px;
  }

  .description {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
  }

  .description p {
    margin: 0.5rem 0 0 0;
    line-height: 1.5;
  }

  .form-section {
    margin-bottom: 2rem;
  }

  .form-section h3 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .waiver-section {
    border: 2px solid #007bff;
    padding: 1.5rem;
    border-radius: 8px;
  }

  .waiver-text {
    background: white;
    padding: 1rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.6;
    font-size: 0.95rem;
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

  input[type="email"],
  input[type="tel"],
  input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  input:disabled {
    background: #e9ecef;
    cursor: not-allowed;
  }

  small {
    display: block;
    margin-top: 0.25rem;
    color: #6c757d;
    font-size: 0.875rem;
  }

  .checkbox-group {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .checkbox-group input[type="checkbox"] {
    margin-top: 0.25rem;
    width: auto;
  }

  .checkbox-group label {
    margin: 0;
    font-weight: normal;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
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

  .btn-secondary {
    background: white;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f8f9fa;
  }

  .btn-outline {
    background: white;
    color: #1f2937;
    border: 1px solid #cbd5e1;
    transition: background 0.2s, border-color 0.2s;
  }

  .btn-outline:hover {
    background: #f8fafc;
    border-color: #94a3b8;
  }

  .login-prompt {
    background: #f5f8ff;
    border: 1px solid #cfe0ff;
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
  }

  .login-prompt h3 {
    margin: 0 0 0.75rem 0;
    color: #1a1a1a;
  }

  .login-prompt p {
    margin: 0 0 1.5rem 0;
    color: #475569;
  }

  .login-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .login-actions .btn {
    width: 100%;
  }
</style>

