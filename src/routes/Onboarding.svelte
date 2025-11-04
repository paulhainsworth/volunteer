<script>
  import { onMount } from 'svelte';
  import { auth } from '../lib/stores/auth';
  import { supabase } from '../lib/supabaseClient';
  import { push } from 'svelte-spa-router';

  let loading = false;
  let error = '';

  let emergencyContactName = '';
  let emergencyContactPhone = '';
  let emergencyContactRelationship = '';

  onMount(() => {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }

    // If emergency contact already exists, redirect to dashboard
    if ($auth.profile?.emergency_contact_name) {
      redirectToDashboard();
    }
  });

  function redirectToDashboard() {
    if ($auth.isAdmin) {
      push('/admin');
    } else if ($auth.profile?.role === 'volunteer_leader') {
      push('/leader');
    } else {
      push('/volunteer');
    }
  }

  async function handleSubmit() {
    error = '';

    if (!emergencyContactName.trim()) {
      error = 'Emergency contact name is required';
      return;
    }

    if (!emergencyContactPhone.trim()) {
      error = 'Emergency contact phone is required';
      return;
    }

    if (!emergencyContactRelationship) {
      error = 'Please select the relationship';
      return;
    }

    loading = true;

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
          emergency_contact_relationship: emergencyContactRelationship
        })
        .eq('id', $auth.user.id);

      if (updateError) throw updateError;

      // Refresh auth state to get updated profile
      await auth.initialize();

      // Redirect to dashboard
      redirectToDashboard();
    } catch (err) {
      error = err.message || 'Failed to save emergency contact';
    } finally {
      loading = false;
    }
  }
</script>

<div class="onboarding-page">
  <div class="onboarding-container">
    <div class="welcome-section">
      <h1>🚴 Welcome to the 2026 Berkeley Omnium!</h1>
      <p class="welcome-text">
        Thank you for volunteering to help make this event a success! 
        Your time and dedication are what make our cycling community thrive.
      </p>
      
      <div class="info-box">
        <h3>What Happens Next?</h3>
        <ul>
          <li>Browse available volunteer opportunities</li>
          <li>Sign up for roles that fit your schedule</li>
          <li>Receive reminders before your shifts</li>
          <li>Meet fellow cycling enthusiasts!</li>
        </ul>
      </div>
    </div>

    <div class="form-section">
      <h2>One Last Step: Emergency Contact</h2>
      <p class="form-intro">
        For your safety, please provide an emergency contact. This information is kept 
        confidential and only used by race organizers in case of emergency.
      </p>

      {#if error}
        <div class="alert alert-error">
          {error}
        </div>
      {/if}

      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="emergency_contact_name">Emergency Contact Name *</label>
          <input
            type="text"
            id="emergency_contact_name"
            bind:value={emergencyContactName}
            required
            placeholder="Jane Doe"
            disabled={loading}
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="emergency_contact_phone">Emergency Contact Phone *</label>
            <input
              type="tel"
              id="emergency_contact_phone"
              bind:value={emergencyContactPhone}
              required
              placeholder="(555) 987-6543"
              disabled={loading}
            />
          </div>

          <div class="form-group">
            <label for="emergency_contact_relationship">Relationship *</label>
            <select
              id="emergency_contact_relationship"
              bind:value={emergencyContactRelationship}
              required
              disabled={loading}
            >
              <option value="">Select relationship...</option>
              <option value="Spouse">Spouse</option>
              <option value="Partner">Partner</option>
              <option value="Parent">Parent</option>
              <option value="Child">Child</option>
              <option value="Sibling">Sibling</option>
              <option value="Friend">Friend</option>
              <option value="Coworker">Coworker</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div class="privacy-note">
          🔒 Your emergency contact information is private and only accessible to race organizers.
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-full"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Complete Setup & Get Started'}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  .onboarding-page {
    min-height: calc(100vh - 200px);
    padding: 2rem 1rem;
  }

  .onboarding-container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .welcome-section {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 3rem 2rem;
    text-align: center;
  }

  .welcome-section h1 {
    margin: 0 0 1rem 0;
    font-size: 2.5rem;
  }

  .welcome-text {
    font-size: 1.2rem;
    line-height: 1.6;
    margin: 0 0 2rem 0;
    opacity: 0.95;
  }

  .info-box {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    border-radius: 12px;
    text-align: left;
    max-width: 500px;
    margin: 0 auto;
  }

  .info-box h3 {
    margin: 0 0 1rem 0;
    color: white;
  }

  .info-box ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .info-box li {
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }

  .form-section {
    padding: 2rem;
  }

  .form-section h2 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .form-intro {
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

  input,
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  input:disabled,
  select:disabled {
    background: #f8f9fa;
    cursor: not-allowed;
  }

  .privacy-note {
    background: #e7f3ff;
    border-left: 4px solid #007bff;
    padding: 1rem;
    margin-bottom: 1.5rem;
    color: #004085;
    font-size: 0.9rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 1rem;
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
    padding: 1rem 1.5rem;
  }

  @media (max-width: 768px) {
    .welcome-section {
      padding: 2rem 1.5rem;
    }

    .welcome-section h1 {
      font-size: 1.8rem;
    }

    .welcome-text {
      font-size: 1rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>

