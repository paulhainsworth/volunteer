<script>
  import { onMount } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { sendParentGuardianWaiverSignedEmail } from '../../lib/volunteerSignup';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let error = '';
  let waiverText = '';
  let waiverAgreed = false;
  let signatureName = '';
  let submitting = false;
  let returnUrl = '/my-signups';
  let isMinor = false;
  let parentGuardianName = '';
  let parentGuardianEmail = '';
  let parentGuardianPhone = '';
  let parentSignatureName = '';

  onMount(async () => {
    if (!$auth.user) {
      push('/auth/login');
      return;
    }
    if ($auth.profile?.role !== 'volunteer') {
      push('/');
      return;
    }
    if (!$auth.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(hash.slice(queryIndex));
      const r = params.get('return');
      if (r && r.startsWith('/')) returnUrl = r;
    }

    try {
      const status = await waiverStore.checkWaiverStatus($auth.user.id);
      if (!status.needsToSign) {
        push(returnUrl);
        return;
      }
      const current = await waiverStore.fetchCurrentWaiver();
      waiverText = current?.waiver_text ?? current?.text ?? '';
      signatureName = [$auth.profile?.first_name, $auth.profile?.last_name].filter(Boolean).join(' ').trim() || '';
    } catch (err) {
      error = err.message || 'Could not load waiver.';
    } finally {
      loading = false;
    }
  });

  async function handleSubmit() {
    error = '';
    if (!waiverAgreed) {
      error = 'You must agree to the waiver to continue.';
      return;
    }
    if (!isMinor && !signatureName.trim()) {
      error = 'Please enter your full name as your digital signature.';
      return;
    }
    if (isMinor) {
      if (!parentGuardianName.trim()) error = 'Parent/guardian full name is required for volunteers under 18.';
      else if (!parentGuardianEmail.trim()) error = 'Parent/guardian email is required for volunteers under 18.';
      else if (!parentSignatureName.trim()) error = 'Parent/guardian must sign (enter their full name) for volunteers under 18.';
      if (error) return;
    }

    submitting = true;
    try {
      const parentPayload = isMinor && parentGuardianName && parentGuardianEmail && parentSignatureName
        ? {
            parent_guardian_name: parentGuardianName.trim(),
            parent_guardian_email: parentGuardianEmail.trim(),
            parent_guardian_phone: parentGuardianPhone?.trim() || null,
            parent_signature_name: parentSignatureName.trim()
          }
        : undefined;
      await waiverStore.signWaiver(
        $auth.user.id,
        signatureName.trim() || [$auth.profile?.first_name, $auth.profile?.last_name].filter(Boolean).join(' ').trim(),
        null,
        parentPayload
      );
      if (isMinor && parentGuardianEmail?.trim()) {
        sendParentGuardianWaiverSignedEmail({
          to: parentGuardianEmail.trim(),
          parent_guardian_name: parentGuardianName?.trim() || null,
          volunteer_first_name: $auth.profile?.first_name,
          volunteer_last_name: $auth.profile?.last_name
        }).catch((err) => console.error('Parent/guardian confirmation email failed:', err));
      }
      push(returnUrl);
    } catch (err) {
      error = err.message || 'Failed to sign waiver.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="sign-waiver-page">
  <div class="header">
    <h1>Sign the volunteer waiver</h1>
    <p>You need to sign the liability waiver before using the volunteer hub.</p>
  </div>

  {#if loading}
    <p class="loading">Loading waiver...</p>
  {:else if error && !waiverText}
    <div class="alert alert-error">{error}</div>
    <a href="#{returnUrl}" class="btn btn-secondary">Back</a>
  {:else}
    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    <div class="waiver-section">
      <h2>Liability Waiver</h2>
      <div class="waiver-text">{waiverText}</div>

      <div class="checkbox-group minor-toggle">
        <input type="checkbox" id="under-18" bind:checked={isMinor} disabled={submitting} />
        <label for="under-18">I will be under 18 on the day of the event</label>
      </div>

      {#if isMinor}
        <div class="form-group">
          <label for="volunteer-sig">Your full name (volunteer assent)</label>
          <input type="text" id="volunteer-sig" bind:value={signatureName} placeholder="Your full name" disabled={submitting} />
        </div>
        <div class="parent-consent-section">
          <h3>Parent / legal guardian consent</h3>
          <p class="parent-consent-intro">For volunteers under 18, a parent or legal guardian must sign the waiver on your behalf.</p>
          <div class="form-group">
            <label for="parent-name">Parent/guardian full name *</label>
            <input type="text" id="parent-name" bind:value={parentGuardianName} placeholder="Full legal name" disabled={submitting} />
          </div>
          <div class="form-group">
            <label for="parent-email">Parent/guardian email *</label>
            <input type="email" id="parent-email" bind:value={parentGuardianEmail} placeholder="email@example.com" disabled={submitting} />
          </div>
          <div class="form-group">
            <label for="parent-phone">Parent/guardian phone (optional)</label>
            <input type="tel" id="parent-phone" bind:value={parentGuardianPhone} placeholder="(555) 123-4567" disabled={submitting} />
          </div>
          <p class="parent-attestation">I am the parent or legal guardian of <strong>{signatureName || 'the volunteer'}</strong> and I have read and agree to the waiver above on their behalf.</p>
          <div class="form-group">
            <label for="parent-sig">Parent/guardian digital signature (full name) *</label>
            <input type="text" id="parent-sig" bind:value={parentSignatureName} placeholder="Parent/guardian full name" disabled={submitting} />
          </div>
        </div>
      {:else}
        <div class="form-group">
          <label for="adult-sig">Digital signature (full name)</label>
          <input type="text" id="adult-sig" bind:value={signatureName} placeholder="Your full name" disabled={submitting} />
        </div>
      {/if}

      <div class="checkbox-group">
        <input type="checkbox" id="agree" bind:checked={waiverAgreed} disabled={submitting} />
        <label for="agree">
          {#if isMinor}
            I have read the waiver above and agree to it on behalf of {signatureName || 'the volunteer'}.
          {:else}
            I have read and agree to the waiver above
          {/if}
        </label>
      </div>
    </div>

    <div class="actions">
      <a href="#{returnUrl}" class="btn btn-secondary" class:disabled={submitting}>Cancel</a>
      <button
        type="button"
        class="btn btn-primary"
        on:click={handleSubmit}
        disabled={submitting || !waiverAgreed || (!isMinor && !signatureName.trim()) || (isMinor && (!parentGuardianName.trim() || !parentGuardianEmail.trim() || !parentSignatureName.trim()))}
      >
        {submitting ? 'Signing...' : 'Sign waiver'}
      </button>
    </div>
  {/if}
</div>

<style>
  .sign-waiver-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 0;
  }

  .header {
    margin-bottom: 1.5rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #1a1a1a;
  }

  .header p {
    margin: 0;
    color: #6c757d;
    font-size: 1rem;
  }

  .loading {
    color: #6c757d;
    padding: 2rem 0;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .waiver-section {
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }

  .waiver-section h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: #212529;
  }

  .waiver-text {
    max-height: 280px;
    overflow-y: auto;
    padding: 0.75rem;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    font-size: 0.9rem;
    line-height: 1.5;
    margin-bottom: 1rem;
    white-space: pre-wrap;
  }

  .checkbox-group {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .checkbox-group.minor-toggle {
    margin-bottom: 0.75rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  .form-group input {
    width: 100%;
    max-width: 400px;
    padding: 0.6rem 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  .parent-consent-section {
    margin: 1rem 0;
    padding: 1rem;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }

  .parent-consent-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: #212529;
  }

  .parent-consent-intro,
  .parent-attestation {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    color: #495057;
    line-height: 1.4;
  }

  .actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .btn {
    display: inline-block;
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    text-decoration: none;
    border: none;
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
    background: #6c757d;
    color: white;
    border: 1px solid #5a6268;
  }

  .btn-secondary:hover {
    background: #5a6268;
  }

  .btn-secondary.disabled {
    pointer-events: none;
    opacity: 0.7;
  }
</style>
