<script>
  import { onMount, tick } from 'svelte';
  import { roles } from '../../lib/stores/roles';
  import { signups } from '../../lib/stores/signups';
  import { waiver as waiverStore } from '../../lib/stores/waiver';
  import { auth } from '../../lib/stores/auth';
  import { push } from 'svelte-spa-router';
  import { formatTimeRange, calculateDuration, formatRoleScheduleDate } from '../../lib/utils/timeDisplay';
  import { createVolunteerAccount, sendGuestWelcomeEmail, sendVolunteerNotification } from '../../lib/volunteerSignup';
  import { affiliations } from '../../lib/stores/affiliations';
  import { notify } from '../../lib/stores/notifications';

  export let params = {};

  let loading = true;
  let error = '';
  let role = null;
  let phone = '';
  let waiverText = '';
  let waiverAgreed = false;
  let signatureName = '';
  let minorAssent = '';
  let submitting = false;
  let success = false;
  let needsWaiver = false;
  let isAuthenticated = false;
  let hasLoadedUserData = false;
  let loadingUserData = false;
  let alreadySignedUp = false;

  // Guest signup (same flow as Volunteer Hub “Sign Up” → PII modal)
  let guestForm = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    team_club_affiliation_id: ''
  };
  let guestSubmitting = false;
  let guestError = '';
  let guestInvalidField = '';
  let awaitingVerification = false;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Consent for the signed-in confirmation step
  let isMinor = false;
  let parentGuardianName = '';
  let parentGuardianEmail = '';
  let parentGuardianPhone = '';
  let parentSignatureName = '';
  $: showWaiverForDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.hash.split('?')[1] || '').get('demoWaiver') === '1';

  // Extract UUID from params.id; share dialogs sometimes append text like " Sign up to volunteer: Role Name"
  // to the URL when copying, which breaks role lookup
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  $: roleId = (() => {
    const raw = params.id || '';
    const match = raw.match(UUID_RE);
    return match ? match[0] : raw;
  })();

  async function loadAuthenticatedData() {
    loadingUserData = true;

    try {
      const status = await waiverStore.checkWaiverStatus(roleId);
      needsWaiver = status.needsToSign;

      if (needsWaiver) {
        const currentWaiver = await waiverStore.fetchCurrentWaiver();
        waiverText = currentWaiver.waiver_text;
      } else {
        waiverText = '';
      }

      phone = $auth.profile?.phone || '';
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

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId)) {
      error = "That link isn't a shift.";
      loading = false;
      return;
    }

    try {
      role = await roles.fetchRole(roleId);

      if (!$auth.user) {
        affiliations.fetchAffiliations().catch(() => {});
      }

      if (isAuthenticated && $auth.user) {
        await loadAuthenticatedData();
        const mySignups = (await signups.fetchMySignups($auth.user.id)) ?? [];
        alreadySignedUp = mySignups.some((s) => s.role_id === roleId || s.role?.id === roleId);
      }
    } catch (err) {
      const missing = err?.code === 'PGRST116' || /invalid input syntax for type uuid/i.test(err?.message || '');
      error = missing ? "That link isn't a shift." : 'Could not load this shift.';
    } finally {
      loading = false;
      // If URL had extra text appended (e.g. from share dialog), clean it so future shares work
      if (role && typeof window !== 'undefined' && params.id !== roleId) {
        const cleanHash = `#/signup/${roleId}`;
        if (window.location.hash !== cleanHash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search + cleanHash);
        }
      }
    }
  });

  $: isAuthenticated = !!$auth.user;

  $: if (isAuthenticated && role && !hasLoadedUserData && !loadingUserData && $auth.user) {
    (async () => {
      await loadAuthenticatedData();
      const mySignups = (await signups.fetchMySignups($auth.user.id)) ?? [];
      alreadySignedUp = mySignups.some((s) => s.role_id === roleId || s.role?.id === roleId);
    })();
  }

  $: if (!isAuthenticated) {
    hasLoadedUserData = false;
    needsWaiver = false;
    waiverText = '';
    waiverAgreed = false;
    signatureName = '';
    phone = '';
    minorAssent = '';
  }

  function firstGuestIssue() {
    const f = guestForm;
    if (!f.first_name?.trim()) return ['guest-first', 'Enter a first name.'];
    if (!f.last_name?.trim()) return ['guest-last', 'Enter a last name.'];
    const email = f.email?.trim() || '';
    if (!email) return ['guest-email', 'Enter an email address.'];
    if (!EMAIL_RE.test(email)) return ['guest-email', 'Enter an email address like name@example.com.'];
    if (!f.emergency_contact_name?.trim()) return ['guest-emergency-name', 'Enter an emergency contact name.'];
    if (!f.emergency_contact_phone?.trim()) return ['guest-emergency-phone', 'Enter an emergency contact phone.'];
    if (!f.team_club_affiliation_id?.trim()) return ['guest-affiliation', 'Select a team or club.'];
    return null;
  }

  async function submitGuestSignup() {
    const issue = firstGuestIssue();
    if (issue) {
      guestInvalidField = issue[0];
      guestError = issue[1];
      await tick();
      document.getElementById(guestInvalidField)?.focus();
      return;
    }
    if (!role) {
      guestInvalidField = '';
      guestError = 'Could not load this shift.';
      return;
    }
    guestSubmitting = true;
    guestInvalidField = '';
    guestError = '';
    const f = guestForm;

    try {
      const result = await createVolunteerAccount(
        {
          first_name: f.first_name.trim(),
          last_name: f.last_name.trim(),
          email: f.email.trim(),
          phone: f.phone?.trim() || null,
          emergency_contact_name: f.emergency_contact_name?.trim() || null,
          emergency_contact_phone: f.emergency_contact_phone?.trim() || null,
          team_club_affiliation_id: f.team_club_affiliation_id.trim()
        },
        roleId
      );

      if (result.pendingVerification) {
        awaitingVerification = true;
        return;
      }
    } catch (err) {
      guestError = err.message || 'Signup failed. Please try again.';
    } finally {
      guestSubmitting = false;
    }
  }

  async function handleSubmit() {
    const { user, profile } = $auth;
    error = '';

    if (!isAuthenticated || !user) {
      error = 'Please sign in to volunteer for this opportunity.';
      return;
    }

    if ((needsWaiver || showWaiverForDemo) && !waiverAgreed) {
      error = 'You must agree to the waiver to continue';
      return;
    }

    if ((needsWaiver || showWaiverForDemo) && !isMinor && !signatureName.trim()) {
      error = 'Please enter your full name as your digital signature';
      return;
    }

    if ((needsWaiver || showWaiverForDemo) && isMinor) {
      if (!parentGuardianName.trim()) {
        error = 'Parent/guardian full name is required for volunteers under 18';
        return;
      }
      if (!parentGuardianEmail.trim()) {
        error = 'Parent/guardian email is required for volunteers under 18';
        return;
      }
      if (!parentSignatureName.trim()) {
        error = 'Parent/guardian must sign (enter their full name) for volunteers under 18';
        return;
      }
    }

    if (showWaiverForDemo) {
      notify('Prototype: waiver/signup form shown for demo only. Backend not called. Remove ?demoWaiver=1 from the URL to use the real flow.');
      return;
    }

    submitting = true;

    try {
      const consent = needsWaiver ? {
        version: $waiverStore.version,
        signature_name: isMinor ? minorAssent.trim() || null : signatureName,
        is_minor: isMinor,
        parent_guardian_name: isMinor ? parentGuardianName : null,
        parent_guardian_email: isMinor ? parentGuardianEmail : null,
        parent_guardian_phone: isMinor ? parentGuardianPhone : null,
        parent_signature_name: isMinor ? parentSignatureName : null
      } : null;
      const { created } = await signups.confirmSignup(roleId, phone, consent);
      if (created) {
        sendGuestWelcomeEmail(user.id, roleId, user.email, profile?.first_name)
          .catch((err) => console.error('Welcome email failed:', err));
        sendVolunteerNotification('confirmation', roleId).catch((err) => console.error('Confirmation email failed:', err));
        if (isMinor && parentGuardianEmail.trim()) {
          sendVolunteerNotification('guardian_signup', roleId).catch((err) => console.error('Parent/guardian confirmation email failed:', err));
        }
      }

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
      <a href="#/volunteer" class="btn btn-primary">Back to shifts</a>
    </div>
  {:else if awaitingVerification}
    <div class="success-card" role="status">
      <h2>Check your email to finish signing up</h2>
      <p>Follow the link to return to this shift and complete the waiver. If you are under 18, ask your parent or guardian to sign then. A spot has not been reserved.</p>
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
        {#if !isAuthenticated}
          <p class="signup-stakes">The waiver comes next. Nothing is held yet. If you are under 18, a parent or guardian signs before the seat is confirmed. The emergency contact is for race day.</p>
        {/if}

        <div class="summary-details">
          <div class="detail">
            <strong>Date:</strong>
            {formatRoleScheduleDate(role, 'long')}
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
        <div class="guest-signup">
          <h3 class="guest-signup-title">Sign up for {role.name}</h3>
          <p class="guest-signup-subtitle">We'll email you a link to finish.</p>

          {#if guestError && !guestInvalidField}
            <div class="alert alert-error" role="alert">{guestError}</div>
          {/if}

          <div class="form-row">
            <div class="form-group">
              <label for="guest-first">First Name *</label>
              <input id="guest-first" type="text" bind:value={guestForm.first_name} placeholder="First name" disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-first'} aria-describedby={guestInvalidField === 'guest-first' ? 'guest-first-error' : null} />
              {#if guestInvalidField === 'guest-first'}
                <p id="guest-first-error" class="field-error" role="alert">{guestError}</p>
              {/if}
            </div>
            <div class="form-group">
              <label for="guest-last">Last Name *</label>
              <input id="guest-last" type="text" bind:value={guestForm.last_name} placeholder="Last name" disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-last'} aria-describedby={guestInvalidField === 'guest-last' ? 'guest-last-error' : null} />
              {#if guestInvalidField === 'guest-last'}
                <p id="guest-last-error" class="field-error" role="alert">{guestError}</p>
              {/if}
            </div>
          </div>
          <div class="form-group">
            <label for="guest-email">Email Address *</label>
            <input id="guest-email" type="email" bind:value={guestForm.email} placeholder="you@example.com" disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-email'} aria-describedby={guestInvalidField === 'guest-email' ? 'guest-email-error' : null} />
            {#if guestInvalidField === 'guest-email'}
              <p id="guest-email-error" class="field-error" role="alert">{guestError}</p>
            {/if}
          </div>
          <div class="form-group">
            <label for="guest-phone">Phone Number (optional)</label>
            <input id="guest-phone" type="tel" bind:value={guestForm.phone} placeholder="(555) 123-4567" disabled={guestSubmitting} />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="guest-emergency-name">Emergency Contact Name *</label>
              <input id="guest-emergency-name" type="text" bind:value={guestForm.emergency_contact_name} placeholder="Full name" disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-emergency-name'} aria-describedby={guestInvalidField === 'guest-emergency-name' ? 'guest-emergency-name-error' : null} />
              {#if guestInvalidField === 'guest-emergency-name'}
                <p id="guest-emergency-name-error" class="field-error" role="alert">{guestError}</p>
              {/if}
            </div>
            <div class="form-group">
              <label for="guest-emergency-phone">Emergency Contact Phone *</label>
              <input id="guest-emergency-phone" type="tel" bind:value={guestForm.emergency_contact_phone} placeholder="(555) 123-4567" disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-emergency-phone'} aria-describedby={guestInvalidField === 'guest-emergency-phone' ? 'guest-emergency-phone-error' : null} />
              {#if guestInvalidField === 'guest-emergency-phone'}
                <p id="guest-emergency-phone-error" class="field-error" role="alert">{guestError}</p>
              {/if}
            </div>
          </div>
          <div class="form-group">
            <label for="guest-affiliation">Team / Club Affiliation *</label>
            <select id="guest-affiliation" bind:value={guestForm.team_club_affiliation_id} disabled={guestSubmitting} required aria-invalid={guestInvalidField === 'guest-affiliation'} aria-describedby={guestInvalidField === 'guest-affiliation' ? 'guest-affiliation-error' : null}>
              <option value="">-- Select team or club --</option>
              {#each $affiliations as aff (aff.id)}
                <option value={aff.id}>{aff.name}</option>
              {/each}
            </select>
            {#if guestInvalidField === 'guest-affiliation'}
              <p id="guest-affiliation-error" class="field-error" role="alert">{guestError}</p>
            {/if}
          </div>

          <div class="guest-form-actions">
            <button
              type="button"
              class="btn btn-primary btn-guest-submit"
              on:click={submitGuestSignup}
              disabled={guestSubmitting}
            >
              {guestSubmitting ? 'Sending the link…' : 'Email me the link'}
            </button>
            <p class="guest-login-hint">
              Already have an account?
              <button type="button" class="link-button" on:click={() => push('/auth/login')}>Log in</button>
            </p>
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

          {#if needsWaiver || showWaiverForDemo}
            <div class="form-section waiver-section">
              <h3>Liability Waiver</h3>
              
              <div class="waiver-text">
                {#if waiverText}
                  {waiverText}
                {:else if showWaiverForDemo}
                  <em>Demo mode: the full USA Cycling waiver text would load here. Check "I will be under 18" to see the parent consent section.</em>
                {/if}
              </div>

              <div class="checkbox-group minor-toggle">
                <input
                  type="checkbox"
                  id="under-18"
                  bind:checked={isMinor}
                  disabled={submitting}
                />
                <label for="under-18">
                  {role?.event_date ? 'I will be under 18 on the day of the event' : 'I am under 18 today'}
                </label>
              </div>

              {#if isMinor}
                <div class="form-group">
                  <label for="signature">Your Full Name (optional volunteer assent)</label>
                  <input
                    type="text"
                    id="signature"
                    bind:value={minorAssent}
                    placeholder="Your Full Name"
                    disabled={submitting}
                  />
                  <small>You may also sign to acknowledge your participation; the parent/guardian signature below is legally required.</small>
                </div>
                <div class="parent-consent-section">
                  <h4>Parent / Legal Guardian Consent</h4>
                  <p class="parent-consent-intro">
                    For volunteers under 18, a parent or legal guardian must sign the waiver on your behalf. 
                    The USA Cycling waiver states that if you are younger than 18, your parent or legal guardian must execute the waiver below.
                  </p>
                  <div class="form-group">
                    <label for="parent-name">Parent/Guardian Full Name *</label>
                    <input
                      type="text"
                      id="parent-name"
                      bind:value={parentGuardianName}
                      placeholder="Full legal name"
                      disabled={submitting}
                    />
                  </div>
                  <div class="form-group">
                    <label for="parent-email">Parent/Guardian Email *</label>
                    <input
                      type="email"
                      id="parent-email"
                      bind:value={parentGuardianEmail}
                      placeholder="email@example.com"
                      disabled={submitting}
                    />
                  </div>
                  <div class="form-group">
                    <label for="parent-phone">Parent/Guardian Phone (optional)</label>
                    <input
                      type="tel"
                      id="parent-phone"
                      bind:value={parentGuardianPhone}
                      placeholder="(555) 123-4567"
                      disabled={submitting}
                    />
                  </div>
                  <p class="parent-attestation">
                    I am the parent or legal guardian of <strong>{[$auth.profile?.first_name, $auth.profile?.last_name].filter(Boolean).join(' ') || 'the volunteer'}</strong> and I have read and agree to the waiver above on their behalf.
                  </p>
                  <div class="form-group">
                    <label for="parent-signature">Parent/Guardian Digital Signature (Full Name) *</label>
                    <input
                      type="text"
                      id="parent-signature"
                      bind:value={parentSignatureName}
                      placeholder="Parent/guardian full name"
                      disabled={submitting}
                    />
                  </div>
                </div>
              {:else}
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
              {/if}

              {#if !isMinor}
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
              {:else}
                <div class="checkbox-group">
                  <input
                    type="checkbox"
                    id="waiver-agree"
                    bind:checked={waiverAgreed}
                    required
                    disabled={submitting}
                  />
                  <label for="waiver-agree">
                    I have read the waiver above and confirm that my parent/guardian will sign on my behalf (or I have entered their consent above).
                  </label>
                </div>
              {/if}
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
              disabled={submitting || (needsWaiver && (!waiverAgreed || (isMinor ? (!parentGuardianName.trim() || !parentGuardianEmail.trim() || !parentSignatureName.trim()) : !signatureName.trim())))}
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
    color: var(--text-secondary);
  }

  .loading.secondary {
    padding: 2rem;
  }

  .error-card,
  .success-card {
    background: var(--bg-primary);
    padding: 3rem;
    border-radius: 12px;
    text-align: center;
    border: 1px solid var(--border-color);
  }

  .error-card p,
  .success-card p {
    text-wrap: pretty;
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
    background: var(--bg-primary);
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  h1 {
    margin: 0 0 1.5rem 0;
    color: var(--text-primary);
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

  .alert-warning {
    background: var(--warning-surface);
    color: var(--warning-text);
    border: 1px solid var(--warning-border);
  }

  .role-summary {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .role-summary h2 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .role-summary h2:has(+ .signup-stakes) {
    margin-bottom: 0.5rem;
  }

  .signup-stakes {
    margin: 0 0 1rem 0;
    max-width: 65ch;
    color: var(--text-secondary);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .field-error {
    margin: 0.35rem 0 0 0;
    color: var(--danger-text);
    font-size: 0.875rem;
    text-wrap: pretty;
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
    border-top: 1px solid var(--border-color);
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
    color: var(--text-primary);
  }

  .waiver-section {
    border: 2px solid var(--primary-color);
    padding: 1.5rem;
    border-radius: 8px;
  }

  .waiver-text {
    background: var(--bg-primary);
    padding: 1rem;
    border: 1px solid var(--input-border);
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
    color: var(--text-primary);
  }

  input[type="email"],
  input[type="tel"],
  input[type="text"],
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    font-size: 1rem;
    background: var(--bg-primary);
  }

  input:disabled {
    background: var(--bg-tertiary);
    cursor: not-allowed;
  }

  small {
    display: block;
    margin-top: 0.25rem;
    color: var(--text-secondary);
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

  .checkbox-group.minor-toggle {
    margin-bottom: 1rem;
  }

  .parent-consent-section {
    margin-top: 1.5rem;
    padding: 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .parent-consent-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: var(--text-muted);
  }

  .parent-consent-intro {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .parent-attestation {
    margin: 1rem 0 0.75rem 0;
    font-size: 0.95rem;
    color: var(--text-primary);
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
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

  .btn-primary:active:not(:disabled) {
    background: #00458e;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn:focus-visible,
  .link-button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .btn-secondary {
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
  }

  .guest-signup {
    margin-top: 0.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-color);
  }

  .guest-signup-title {
    margin: 0 0 0.35rem 0;
    color: var(--text-primary);
    font-size: 1.25rem;
  }

  .guest-signup-subtitle {
    margin: 0 0 1.25rem 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
    text-wrap: pretty;
  }

  .guest-signup input,
  .guest-signup select {
    min-height: 44px;
    color: var(--text-primary);
  }

  .guest-signup input::placeholder {
    color: var(--text-muted);
  }

  .guest-signup input:focus-visible,
  .guest-signup select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .guest-signup input[aria-invalid='true'],
  .guest-signup select[aria-invalid='true'] {
    border-color: var(--danger-border);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }

    .error-card,
    .success-card {
      padding: 1.5rem;
    }
  }

  .guest-form-actions {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .btn-guest-submit {
    width: 100%;
    min-height: 44px;
    padding: 0.85rem 1.25rem;
    font-size: 1.05rem;
    white-space: nowrap;
  }

  .guest-login-hint {
    margin: 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .link-button {
    background: none;
    border: none;
    padding: 0;
    color: var(--primary-color);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    font-size: inherit;
  }

  .link-button:hover {
    color: var(--link-hover);
  }
</style>

