<script>
  import { onMount } from 'svelte';
  import { KIDS_CLINIC_USAC_WAIVER_TEXT } from '../lib/data/kidsClinicUsacWaiver.js';
  import { submitKidsClinicSignup } from '../lib/submitKidsClinicSignup.js';

  const SESSION_RESULT_KEY = 'kids_clinic_signup_result';

  let showSubmittedBanner = false;
  let showEmailNotSentWarning = false;
  let parentFirstName = '';
  let parentLastName = '';
  let parentEmail = '';
  let childName = '';
  let childGender = '';
  let childAge = '';
  let waiverConsent = false;
  let submitting = false;
  let formError = '';

  onMount(() => {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem(SESSION_RESULT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(SESSION_RESULT_KEY);
    try {
      const o = JSON.parse(raw);
      if (o?.submitted) {
        showSubmittedBanner = true;
        showEmailNotSentWarning = o.emailSent === false;
      }
    } catch {
      showSubmittedBanner = true;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  function scrollToSignup() {
    document.getElementById('kids-signup-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    formError = '';
    if (!waiverConsent) {
      formError = 'Please confirm you are the parent or legal guardian and consent to the waiver.';
      return;
    }
    const ageNum = Number(childAge);
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 17) {
      formError = 'Please enter a valid age (1–17).';
      return;
    }
    submitting = true;
    try {
      const result = await submitKidsClinicSignup({
        parent_first_name: parentFirstName.trim(),
        parent_last_name: parentLastName.trim(),
        parent_email: parentEmail.trim(),
        child_name: childName.trim(),
        child_gender: childGender,
        child_age: ageNum,
        waiver_consent: true,
      });
      sessionStorage.setItem(
        SESSION_RESULT_KEY,
        JSON.stringify({ submitted: true, emailSent: result?.emailSent !== false })
      );
      window.location.reload();
    } catch (err) {
      formError = err?.message || 'Something went wrong. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="kids-page">
  {#if showSubmittedBanner}
    {#if showEmailNotSentWarning}
      <div class="submitted-banner banner-warn" role="status">
        <strong>Thank you — your signup is saved.</strong>
        We could not send the confirmation email automatically. Please check your spam folder, confirm your email
        address, or write to
        <a href="mailto:berkeleyomnium@gmail.com">berkeleyomnium@gmail.com</a>
        if you need the event details. See you at Ohlone Park!
      </div>
    {:else}
      <div class="submitted-banner" role="status">
        <strong>Thank you — your signup is submitted.</strong>
        We sent a confirmation email with event details. See you at Ohlone Park!
      </div>
    {/if}
  {/if}

  <header class="kids-header">
    <h1 class="title-main">Free Kids Skills Clinic and Race</h1>
    <p class="title-sub">
      Presented by Berkeley Bicycle Club and Cal Cycling as part of the 2026 Berkeley Omnium
    </p>
    <p class="meta-line"><strong>Sunday April 19, 2026</strong></p>
    <p class="meta-line location-line">
      <span class="pin" aria-hidden="true">📍</span>
      <strong>Ohlone Park (McGee/Hearst)</strong>
    </p>
  </header>

  <section class="hero-wrap" aria-label="Event photo">
    <div class="hero-inner">
      <img
        class="hero-img"
        src="/kids-clinic-hero.png"
        alt="Kids lined up on bicycles at the Berkeley Omnium kids event, with ages 5–10 recommendation"
        width="1024"
        height="425"
        loading="eager"
      />
    </div>
  </section>

  <section class="schedule-section" aria-labelledby="schedule-heading">
    <h2 id="schedule-heading" class="schedule-title">What happens:</h2>
    <ul class="schedule-list">
      <li>
        <span class="time">11:00am – 11:45am</span>
        Kids play and skills clinic hosted by Trek. Bring a bike + helmet.
      </li>
      <li>
        <span class="time">11:45am – 11:55am</span>
        Kids race with medals and podiums for winners.
      </li>
      <li>
        <span class="time">12:00pm</span>
        Free ice cream post clinic and race for the kids (while supplies last) by Mr. Dewie’s Cashew Ice Cream.
      </li>
    </ul>
  </section>

  <div class="info-blocks">
    <p class="info-orange">
      Food truck on site with drinks, tacos, and burritos for purchase.
    </p>
    <p class="info-green">
      Ohlone Park has a great kids playground to hang out before and after the event.
    </p>
  </div>

  <div class="cta-row">
    <button type="button" class="btn-signup" on:click={scrollToSignup}>Sign up</button>
  </div>

  <footer class="kids-footer">
    <div class="footer-logos">
      <div class="cal-cycling">Cal <span class="cal-script">Cycling</span></div>
      <img src="/bbc-logo.png" alt="Berkeley Bicycle Club" class="footer-bbc" />
    </div>
    <p class="footer-contact">
      <strong>Questions?</strong>
      Contact <a href="mailto:berkeleyomnium@gmail.com">berkeleyomnium@gmail.com</a>
    </p>
    <p class="footer-link">
      <a href="https://berkeleybikeclub.org/races">berkeleybikeclub.org/races</a>
    </p>
  </footer>

  <section id="kids-signup-form" class="signup-section" aria-labelledby="signup-heading">
    <h2 id="signup-heading" class="signup-heading">Registration &amp; waiver</h2>
    <p class="signup-lead">
      Parent or legal guardian: complete the form below. You must read the waiver and consent before submitting.
    </p>

    <form class="signup-form" on:submit={handleSubmit}>
      <div class="field-row">
        <label class="field">
          <span>Parent first name</span>
          <input type="text" name="parent_first_name" bind:value={parentFirstName} required autocomplete="given-name" />
        </label>
        <label class="field">
          <span>Parent last name</span>
          <input type="text" name="parent_last_name" bind:value={parentLastName} required autocomplete="family-name" />
        </label>
      </div>
      <label class="field">
        <span>Parent email</span>
        <input type="email" name="parent_email" bind:value={parentEmail} required autocomplete="email" />
      </label>
      <label class="field">
        <span>Child’s full name</span>
        <input type="text" name="child_name" bind:value={childName} required autocomplete="name" />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Gender</span>
          <select name="child_gender" bind:value={childGender} required>
            <option value="" disabled>Select…</option>
            <option value="girl">Girl</option>
            <option value="boy">Boy</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        <label class="field">
          <span>Age</span>
          <input
            type="number"
            name="child_age"
            bind:value={childAge}
            min="1"
            max="17"
            required
            inputmode="numeric"
          />
        </label>
      </div>

      <div class="waiver-box-wrap">
        <span class="waiver-label" id="waiver-label">Waiver agreement (read carefully)</span>
        <div class="waiver-scroll" role="region" aria-labelledby="waiver-label">
          <pre class="waiver-text">{KIDS_CLINIC_USAC_WAIVER_TEXT}</pre>
        </div>
      </div>

      <label class="consent-row">
        <input type="checkbox" bind:checked={waiverConsent} />
        <span
          >I am the parent or legal guardian of this child, and I consent to the terms of the waiver agreement above.</span
        >
      </label>

      {#if formError}
        <p class="form-error" role="alert">{formError}</p>
      {/if}

      <button type="submit" class="btn-submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit registration'}
      </button>
    </form>
  </section>
</div>

<style>
  .kids-page {
    --cream: #faf6ef;
    --blue-deep: #1a56b0;
    --blue-brush: #2563c4;
    --orange: #e85d04;
    --green: #15803d;
    background: var(--cream);
    color: #111827;
    min-height: 100vh;
    padding: 1.5rem 1rem 3rem;
    max-width: 720px;
    margin: 0 auto;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  .submitted-banner {
    background: #d1fae5;
    border: 1px solid #6ee7b7;
    color: #065f46;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    margin-bottom: 1.5rem;
    line-height: 1.5;
    font-size: 0.95rem;
  }

  .submitted-banner.banner-warn {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .submitted-banner.banner-warn a {
    color: #1a56b0;
    font-weight: 700;
  }

  .kids-header {
    text-align: center;
    margin-bottom: 1.25rem;
  }

  .title-main {
    margin: 0 0 0.5rem;
    font-size: clamp(1.35rem, 4vw, 1.85rem);
    font-weight: 800;
    color: var(--blue-deep);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }

  .title-sub {
    margin: 0 0 1rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--blue-deep);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.35;
  }

  .meta-line {
    margin: 0.25rem 0;
    font-size: 0.95rem;
  }

  .location-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }

  .pin {
    font-size: 1.1rem;
  }

  .hero-wrap {
    margin: 0 -0.25rem 1.5rem;
  }

  .hero-inner {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 12px 32px rgba(26, 86, 176, 0.15);
  }

  .hero-img {
    display: block;
    width: 100%;
    height: auto;
  }

  .schedule-section {
    background: var(--blue-brush);
    color: #fff;
    padding: 1.25rem 1.35rem 1.4rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    box-shadow: 0 8px 24px rgba(37, 99, 196, 0.35);
  }

  .schedule-title {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .schedule-list {
    margin: 0;
    padding-left: 1.1rem;
    font-weight: 700;
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .schedule-list li {
    margin-bottom: 0.65rem;
  }

  .schedule-list li:last-child {
    margin-bottom: 0;
  }

  .time {
    display: block;
    font-weight: 800;
    margin-bottom: 0.15rem;
  }

  .info-blocks p {
    margin: 0 0 0.75rem;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.45;
  }

  .info-orange {
    color: var(--orange);
  }
  .info-green {
    color: var(--green);
  }

  .cta-row {
    text-align: center;
    margin: 1.5rem 0 2rem;
  }

  .btn-signup {
    background: var(--blue-deep);
    color: #fff;
    border: none;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.85rem 2.5rem;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(26, 86, 176, 0.35);
  }

  .btn-signup:hover {
    filter: brightness(1.06);
  }

  .btn-signup:focus-visible {
    outline: 3px solid #fbbf24;
    outline-offset: 2px;
  }

  .kids-footer {
    text-align: center;
    margin-bottom: 2.5rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid rgba(17, 24, 39, 0.12);
  }

  .footer-logos {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .cal-cycling {
    font-weight: 800;
    font-size: 1.25rem;
    color: #fbbf24;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
    letter-spacing: 0.02em;
  }

  .cal-script {
    font-weight: 900;
    font-style: italic;
    color: #fff;
    background: #1e3a5f;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    margin-left: 0.15rem;
  }

  .footer-bbc {
    height: 56px;
    width: auto;
  }

  .footer-contact,
  .footer-link {
    margin: 0.35rem 0;
    font-size: 0.88rem;
  }

  .footer-contact a,
  .footer-link a {
    color: var(--blue-deep);
    font-weight: 700;
  }

  .signup-section {
    padding-top: 0.5rem;
  }

  .signup-heading {
    margin: 0 0 0.5rem;
    font-size: 1.35rem;
    color: var(--blue-deep);
  }

  .signup-lead {
    margin: 0 0 1.25rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #374151;
  }

  .signup-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 540px) {
    .field-row {
      grid-template-columns: 1fr;
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: #374151;
  }

  .field input,
  .field select {
    padding: 0.55rem 0.65rem;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    font-size: 1rem;
    background: #fff;
  }

  .field input:focus-visible,
  .field select:focus-visible {
    outline: 2px solid var(--blue-deep);
    outline-offset: 1px;
  }

  .waiver-box-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .waiver-label {
    font-size: 0.88rem;
    font-weight: 700;
    color: #374151;
  }

  .waiver-scroll {
    max-height: 220px;
    overflow: auto;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    padding: 0.75rem 1rem;
  }

  .waiver-text {
    margin: 0;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 0.68rem;
    line-height: 1.35;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1f2937;
  }

  .consent-row {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
    font-size: 0.9rem;
    line-height: 1.45;
    cursor: pointer;
  }

  .consent-row input {
    margin-top: 0.2rem;
    flex-shrink: 0;
    width: 1.1rem;
    height: 1.1rem;
  }

  .form-error {
    margin: 0;
    color: #b91c1c;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .btn-submit {
    margin-top: 0.25rem;
    background: var(--orange);
    color: #fff;
    border: none;
    font-weight: 800;
    padding: 0.85rem 1.25rem;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  .btn-submit:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .btn-submit:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-submit:focus-visible {
    outline: 3px solid var(--blue-deep);
    outline-offset: 2px;
  }
</style>
