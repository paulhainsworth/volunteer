<script>
  import { onMount } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { sendVolunteerNotification } from '../../lib/volunteerSignup';
  import { push } from 'svelte-spa-router';

  let loading = true;
  let error = '';
  let waiverText = '';
  let waiverAgreed = false;
  let signatureName = '';
  let minorAssent = '';
  let waiverVersion;
  let submitting = false;
  let returnUrl = '/my-signups';
  let ageDeclaration = '';
  $: isMinor = ageDeclaration === 'minor';
  let parentGuardianName = '';
  let parentGuardianEmail = '';
  let parentGuardianPhone = '';
  let parentSignatureName = '';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  $: emailValue = parentGuardianEmail.trim();
  $: emailFormatBad = isMinor && emailValue !== '' && !EMAIL_RE.test(emailValue);
  $: blocker = !ageDeclaration
    ? 'Select whether you are under 18 today.'
    : !waiverAgreed
      ? 'You must agree to the waiver to continue.'
      : !isMinor && !signatureName.trim()
        ? 'Please enter your full name as your digital signature.'
        : isMinor && !parentGuardianName.trim()
          ? 'Parent/guardian full name is required for volunteers under 18.'
          : isMinor && !emailValue
            ? 'Parent/guardian email is required for volunteers under 18.'
            : isMinor && !EMAIL_RE.test(emailValue)
              ? 'Enter a valid parent/guardian email.'
              : isMinor && !parentSignatureName.trim()
                ? 'Parent/guardian must sign (enter their full name) for volunteers under 18.'
                : '';
  $: emailMessage = emailFormatBad
    ? 'Enter a valid parent/guardian email.'
    : blocker === 'Parent/guardian email is required for volunteers under 18.'
      ? blocker
      : '';

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
      const status = await waiverStore.checkWaiverStatus();
      if (!status.needsToSign) {
        push(returnUrl);
        return;
      }
      const current = await waiverStore.fetchCurrentWaiver();
      waiverVersion = current?.version;
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
    if (blocker) return;

    submitting = true;
    try {
      const waiverId = await waiverStore.signWaiver({
        version: waiverVersion,
        is_minor: isMinor,
        signature_name: isMinor ? minorAssent.trim() || null : signatureName.trim(),
        ...(isMinor && {
          parent_guardian_name: parentGuardianName.trim(),
          parent_guardian_email: parentGuardianEmail.trim(),
          parent_guardian_phone: parentGuardianPhone.trim() || null,
          parent_signature_name: parentSignatureName.trim()
        })
      });
      if (isMinor && parentGuardianEmail?.trim()) {
        sendVolunteerNotification('guardian_waiver', waiverId).catch((err) => console.error('Parent/guardian confirmation email failed:', err));
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

      <fieldset class="age-group">
        <legend>How old are you today?</legend>
        <label class="age-choice">
          <input type="radio" name="waiver-age" value="minor" bind:group={ageDeclaration} disabled={submitting} />
          <span>I am under 18 today</span>
        </label>
        <label class="age-choice">
          <input type="radio" name="waiver-age" value="adult" bind:group={ageDeclaration} disabled={submitting} />
          <span>I am 18 or older today</span>
        </label>
      </fieldset>

      {#if isMinor}
        <div class="form-group">
          <label for="volunteer-sig">Your full name (optional volunteer assent)</label>
          <input type="text" id="volunteer-sig" bind:value={minorAssent} placeholder="Your full name" disabled={submitting} />
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
            <input type="email" id="parent-email" bind:value={parentGuardianEmail} placeholder="email@example.com" disabled={submitting} aria-invalid={emailMessage ? true : undefined} aria-describedby={emailMessage ? 'parent-email-error' : undefined} />
            {#if emailMessage}
              <p id="parent-email-error" class="field-error" role="alert">{emailMessage}</p>
            {/if}
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
      {:else if ageDeclaration}
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
      {#if blocker && blocker !== emailMessage}
        <p id="waiver-missing" class="field-error waiver-missing" role="status">{blocker}</p>
      {/if}
      <a href="#{returnUrl}" class="btn btn-secondary" class:disabled={submitting}>Cancel</a>
      <button
        type="button"
        class="btn btn-primary"
        on:click={handleSubmit}
        disabled={submitting || !!blocker}
        aria-describedby={blocker && blocker !== emailMessage ? 'waiver-missing' : (emailMessage ? 'parent-email-error' : undefined)}
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
    color: var(--text-primary);
  }

  .header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .loading {
    color: var(--text-secondary);
    padding: 2rem 0;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .alert-error {
    background: var(--danger-surface);
    color: var(--danger-text);
    border: 1px solid var(--danger-border);
  }

  .waiver-section {
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .waiver-section h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .waiver-text {
    max-height: 280px;
    overflow-y: auto;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
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

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .form-group input {
    width: 100%;
    max-width: 400px;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    font-size: 1rem;
  }

  .form-group input[aria-invalid='true'] {
    border-color: var(--danger-border);
  }

  .age-group {
    border: none;
    margin: 0 0 1rem;
    padding: 0;
    min-inline-size: 0;
  }

  .age-group legend {
    margin-bottom: 0.5rem;
    padding: 0;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .age-choice {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0 0 0.25rem;
    padding: 0.25rem 0;
    font-weight: 400;
    font-size: 1rem;
    line-height: 1.4;
    color: var(--text-primary);
  }

  .age-choice input {
    width: 1rem;
    height: 1rem;
    margin: 0.2rem 0 0;
    flex: 0 0 auto;
  }

  .field-error {
    margin: 0.35rem 0 0;
    color: var(--danger-text);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .parent-consent-section {
    margin: 1rem 0;
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .parent-consent-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .parent-consent-intro,
  .parent-attestation {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: center;
  }

  .waiver-missing {
    flex: 1 0 100%;
    margin: 0;
    max-width: 65ch;
  }

  .btn {
    display: inline-block;
    box-sizing: border-box;
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    border: 1px solid transparent;
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.25;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }

  .btn-primary {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
    border-color: #0056b3;
  }

  .btn-primary:active:not(:disabled) {
    background: #00458e;
    border-color: #00458e;
  }

  .btn-primary:disabled {
    background: var(--bg-primary);
    color: var(--text-primary);
    border-color: #007bff;
    opacity: 1;
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
