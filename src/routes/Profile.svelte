<script>
  import { onMount } from 'svelte';
  import { auth } from '../lib/stores/auth';
  import { affiliations } from '../lib/stores/affiliations';
  import { supabase } from '../lib/supabaseClient';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let saving = false;
  let error = '';
  let success = '';

  let formData = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    team_club_affiliation_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  };

  onMount(async () => {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }

    try {
      await affiliations.fetchAffiliations();

      // Fetch current profile
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', $auth.user.id)
        .single();

      if (fetchError) throw fetchError;

      formData = {
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        team_club_affiliation_id: data.team_club_affiliation_id || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        emergency_contact_relationship: data.emergency_contact_relationship || ''
      };
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    error = '';
    success = '';
    saving = true;

    try {
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          team_club_affiliation_id: formData.team_club_affiliation_id || null,
          emergency_contact_name: formData.emergency_contact_name,
          emergency_contact_phone: formData.emergency_contact_phone,
          emergency_contact_relationship: formData.emergency_contact_relationship
        })
        .eq('id', $auth.user.id);

      if (updateError) throw updateError;

      // Update email if changed (requires Supabase auth update)
      if (formData.email !== $auth.user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email
        });

        if (emailError) throw emailError;
        
        success = 'Profile updated! Check your new email for a confirmation link.';
      } else {
        success = 'Profile updated successfully!';
      }

      // Refresh auth state
      await auth.initialize();
    } catch (err) {
      error = err.message || 'Failed to update profile';
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    window.history.back();
  }
</script>

<div class="profile-page">
  <div class="profile-container">
    <div class="header">
      <h1>My Profile</h1>
      <p>Update your personal information</p>
    </div>

    {#if error}
      <div class="alert alert-error">
        {error}
      </div>
    {/if}

    {#if success}
      <div class="alert alert-success">
        {success}
      </div>
    {/if}

    {#if loading}
      <div class="loading">Loading your profile...</div>
    {:else}
      <form on:submit|preventDefault={handleSave}>
        <div class="form-section">
          <h3>Personal Information</h3>
          
          <div class="form-row">
            <div class="form-group">
              <label for="first_name">First Name *</label>
              <input
                type="text"
                id="first_name"
                bind:value={formData.first_name}
                required
                placeholder="John"
                disabled={saving}
              />
            </div>

            <div class="form-group">
              <label for="last_name">Last Name *</label>
              <input
                type="text"
                id="last_name"
                bind:value={formData.last_name}
                required
                placeholder="Doe"
                disabled={saving}
              />
            </div>
          </div>

          <div class="form-group">
            <label for="email">Email Address *</label>
            <input
              type="email"
              id="email"
              bind:value={formData.email}
              required
              placeholder="you@example.com"
              disabled={saving}
            />
            <small>Changing your email will require confirmation</small>
          </div>

          <div class="form-group">
            <label for="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              bind:value={formData.phone}
              placeholder="(555) 123-4567"
              disabled={saving}
            />
            <small>Optional - used for event day communications</small>
          </div>

          <div class="form-group">
            <label for="team_club_affiliation">Team / Club Affiliation</label>
            <select
              id="team_club_affiliation"
              bind:value={formData.team_club_affiliation_id}
              disabled={saving}
            >
              <option value="">— None selected —</option>
              {#each $affiliations as aff (aff.id)}
                <option value={aff.id}>{aff.name}</option>
              {/each}
            </select>
            <small>Optional - your team or club</small>
          </div>

          <div class="role-display">
            <span class="label">Your Role:</span>
            <span class="role-badge {$auth.profile?.role}">
              {#if $auth.isAdmin}
                👑 Admin
              {:else if $auth.profile?.role === 'volunteer_leader'}
                ⭐ Volunteer Leader
              {:else}
                👤 Volunteer
              {/if}
            </span>
          </div>
        </div>

        <div class="form-section">
          <h3>Emergency Contact</h3>
          <p class="section-description">
            This information is only visible to race organizers and will be used in case of emergency
          </p>

          <div class="form-group">
            <label for="emergency_contact_name">Emergency Contact Name</label>
            <input
              type="text"
              id="emergency_contact_name"
              bind:value={formData.emergency_contact_name}
              placeholder="Jane Doe"
              disabled={saving}
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="emergency_contact_phone">Emergency Contact Phone</label>
              <input
                type="tel"
                id="emergency_contact_phone"
                bind:value={formData.emergency_contact_phone}
                placeholder="(555) 987-6543"
                disabled={saving}
              />
            </div>

            <div class="form-group">
              <label for="emergency_contact_relationship">Relationship</label>
              <select
                id="emergency_contact_relationship"
                bind:value={formData.emergency_contact_relationship}
                disabled={saving}
              >
                <option value="">Select relationship...</option>
                <option value="Spouse">Spouse</option>
                <option value="Partner">Partner</option>
                <option value="Parent">Parent</option>
                <option value="Child">Child</option>
                <option value="Sibling">Sibling</option>
                <option value="Friend">Friend</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            on:click={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
          
          <button
            type="submit"
            class="btn btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .profile-page {
    max-width: 800px;
    margin: 0 auto;
  }

  .profile-container {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #dee2e6;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    margin: 0;
    color: #6c757d;
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

  .loading {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .form-section {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #dee2e6;
  }

  .form-section:last-of-type {
    border-bottom: none;
  }

  .form-section h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .section-description {
    margin: 0 0 1.5rem 0;
    color: #6c757d;
    font-size: 0.9rem;
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

  small {
    display: block;
    margin-top: 0.25rem;
    color: #6c757d;
    font-size: 0.875rem;
  }

  .role-display {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
    margin-top: 1rem;
  }

  .role-display .label {
    font-weight: 600;
    color: #495057;
  }

  .role-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 600;
  }

  .role-badge.admin {
    background: #e7f3ff;
    color: #004085;
  }

  .role-badge.volunteer_leader {
    background: #fff3cd;
    color: #856404;
  }

  .role-badge.volunteer {
    background: #e2e3e5;
    color: #495057;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
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

  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
    }
  }
</style>

