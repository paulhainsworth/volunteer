<script>
  import { onMount } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { signups } from '../../lib/stores/signups';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

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
  let needsWaiver = true;

  onMount(async () => {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }

    try {
      // Fetch role details
      role = await roles.fetchRole(params.id);

      // Check waiver status
      const status = await waiverStore.checkWaiverStatus($auth.user.id);
      needsWaiver = status.needsToSign;

      if (needsWaiver) {
        const currentWaiver = await waiverStore.fetchCurrentWaiver();
        waiverText = currentWaiver.text;
      }

      // Pre-fill signature with user's name
      if ($auth.profile?.first_name && $auth.profile?.last_name) {
        signatureName = `${$auth.profile.first_name} ${$auth.profile.last_name}`;
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  function calculateDuration(startTime, endTime) {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return hours;
  }

  async function handleSubmit() {
    error = '';

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
      await signups.createSignup($auth.user.id, params.id, phone || null);

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
            {format(new Date(role.event_date), 'EEEE, MMMM d, yyyy')}
          </div>
          
          <div class="detail">
            <strong>Time:</strong>
            {formatTime(role.start_time)} - {formatTime(role.end_time)} ({duration} hours)
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
</style>

