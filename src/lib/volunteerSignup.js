/**
 * Simplified volunteer signup flow: create user, sign up for role, send emails.
 * No password - user signs in via magic link on return visits.
 */
import { supabase } from './supabaseClient';
import { auth } from './stores/auth';
import { signups } from './stores/signups';
import { waiver as waiverStore } from './stores/waiver';
import { formatEventDateInPacific, formatTimeRange } from './utils/timeDisplay';

const SITE_URL = typeof window !== 'undefined' ? `${window.location.origin}/#` : '';

/** True if the error is the signups volunteer_id FK violation (profile not yet created by trigger). */
function isSignupFkError(err) {
  const msg = err?.message || String(err);
  return msg.includes('foreign key constraint') && msg.includes('signups_volunteer_id_fkey');
}

export async function createVolunteerAndSignup(pii, roleId) {
  const {
    first_name,
    last_name,
    email,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    team_club_affiliation_id,
    is_minor,
    parent_guardian_name,
    parent_guardian_email,
    parent_guardian_phone,
    parent_signature_name
  } = pii;
  const volunteerName = `${first_name} ${last_name}`.trim();
  const parentPayload =
    is_minor && parent_guardian_name && parent_guardian_email && parent_signature_name
      ? {
          parent_guardian_name,
          parent_guardian_email,
          parent_guardian_phone: parent_guardian_phone || null,
          parent_signature_name
        }
      : null;

  // Create auth user (passwordless - they'll use magic link to sign in later)
  const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      data: {
        first_name,
        last_name,
        role: 'volunteer',
        phone: phone || '',
        emergency_contact_name: emergency_contact_name || '',
        emergency_contact_phone: emergency_contact_phone || '',
        team_club_affiliation_id: team_club_affiliation_id || ''
      },
      emailRedirectTo: `${window.location.origin}/#/volunteer`
    }
  });

  if (authError) throw authError;
  if (!authData?.user) throw new Error('User creation failed.');

  const userId = authData.user.id;
  const hasSession = !!authData.session;
  // Profile is created by handle_new_user trigger; it may be a moment before it's visible. Retry signup on FK.

  // Sign waiver (only works when we have a session; otherwise they'll sign on first login or via edge function)
  if (hasSession) {
    try {
      await waiverStore.signWaiver(userId, volunteerName, null, parentPayload ?? undefined);
    } catch (waiverErr) {
      console.warn('Waiver sign failed (may already be signed):', waiverErr);
    }
  }

  if (hasSession) {
    // Create signup via client (RLS allows volunteer_id = auth.uid())
    const maxAttempts = 10;
    const delayMs = 500;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await signups.createSignup(userId, roleId, phone || null);
        break;
      } catch (err) {
        const isLast = attempt === maxAttempts - 1;
        if (isLast || !isSignupFkError(err)) {
          if (isLast && isSignupFkError(err)) {
            throw new Error(
              'Your account was created but signup didn\'t complete. Please sign in and try signing up for this role again.'
            );
          }
          throw err;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  } else {
    // No session (e.g. "Confirm email" is on). Create signup via Edge Function (service role).
    const maxAttempts = 8;
    const delayMs = 500;
    const signupBody = {
      user_id: userId,
      role_id: roleId,
      phone: phone || null
    };
    if (parentPayload) {
      signupBody.waiver_minor = true;
      signupBody.parent_guardian_name = parentPayload.parent_guardian_name;
      signupBody.parent_guardian_email = parentPayload.parent_guardian_email;
      signupBody.parent_guardian_phone = parentPayload.parent_guardian_phone;
      signupBody.parent_signature_name = parentPayload.parent_signature_name;
      signupBody.volunteer_signature_name = volunteerName;
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data, error } = await supabase.functions.invoke('create-signup-for-new-user', {
        body: signupBody
      });
      if (!error && data?.ok) break;
      const msg = data?.error ?? error?.message ?? 'Create signup failed';
      const isFk = String(msg).toLowerCase().includes('foreign key') || String(msg).toLowerCase().includes('violates');
      const isLast = attempt === maxAttempts - 1;
      if (isLast || !isFk) {
        if (isLast && isFk) {
          throw new Error(
            'Your account was created but signup didn\'t complete. Please sign in and try signing up for this role again.'
          );
        }
        throw new Error(typeof msg === 'string' ? msg : data?.details ?? 'Signup failed');
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Refresh auth so UI shows logged-in state (signUp returns session when confirm email is off)
  await auth.refreshSession();

  return { userId, email, first_name, last_name };
}

export async function sendRoleConfirmationEmail({ to, first_name, role, roleId }) {
  const roleDate = formatEventDateInPacific(role.event_date, 'long');
  const roleTime = formatTimeRange(role);
  const roleUrl = `${SITE_URL}/signup/${roleId}`;

  await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject: `You're signed up: ${role.name} – Berkeley Omnium 2026`,
      html: `
        <h2>Thanks for volunteering!</h2>
        <p>Hi ${first_name || 'there'},</p>
        <p>You're signed up for:</p>
        <ul>
          <li><strong>${role.name}</strong></li>
          <li>Date: ${roleDate}</li>
          <li>Time: ${roleTime}</li>
          ${role.location ? `<li>Location: ${role.location}</li>` : ''}
        </ul>
        <p><a href="${roleUrl}">View role details</a></p>
        <p>We'll send reminders before the event. See you there!</p>
        <p>– Berkeley Omnium Volunteer Team</p>
      `
    }
  });
}

/**
 * Sends confirmation to the parent/guardian who signed the waiver for a minor volunteer (PII modal or role-specific flow).
 */
export async function sendParentGuardianConfirmationEmail({
  to,
  parent_guardian_name,
  volunteer_first_name,
  volunteer_last_name,
  role,
  roleId
}) {
  const volunteerName = [volunteer_first_name, volunteer_last_name].filter(Boolean).join(' ').trim() || 'the volunteer';
  const roleDate = formatEventDateInPacific(role.event_date, 'long');
  const roleTime = formatTimeRange(role);
  const roleUrl = `${SITE_URL}/signup/${roleId}`;

  await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject: `Confirmation: You signed the waiver for ${volunteerName} – Berkeley Omnium 2026`,
      html: `
        <h2>Parent/Guardian confirmation</h2>
        <p>Hi ${parent_guardian_name || 'there'},</p>
        <p>You signed the liability waiver on behalf of <strong>${volunteerName}</strong>, who is now signed up to volunteer at the 2026 Berkeley Omnium.</p>
        <p><strong>Role details:</strong></p>
        <ul>
          <li><strong>${role.name}</strong></li>
          <li>Date: ${roleDate}</li>
          <li>Time: ${roleTime}</li>
          ${role.location ? `<li>Location: ${role.location}</li>` : ''}
        </ul>
        <p><a href="${roleUrl}">View role details</a></p>
        <p>${volunteerName} will also receive a confirmation and welcome email at the address they provided.</p>
        <p>– Berkeley Omnium Volunteer Team</p>
      `
    }
  });
}

/**
 * Sends confirmation to the parent/guardian who signed the waiver on the Sign Waiver page (no specific role; volunteer may have multiple signups).
 */
export async function sendParentGuardianWaiverSignedEmail({
  to,
  parent_guardian_name,
  volunteer_first_name,
  volunteer_last_name
}) {
  const volunteerName = [volunteer_first_name, volunteer_last_name].filter(Boolean).join(' ').trim() || 'the volunteer';
  const mySignupsUrl = `${SITE_URL}/my-signups`;

  await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject: `Confirmation: You signed the waiver for ${volunteerName} – Berkeley Omnium 2026`,
      html: `
        <h2>Parent/Guardian confirmation</h2>
        <p>Hi ${parent_guardian_name || 'there'},</p>
        <p>You signed the liability waiver on behalf of <strong>${volunteerName}</strong>. They are all set to volunteer at the 2026 Berkeley Omnium.</p>
        <p>When ${volunteerName} signs in to the volunteer hub, they can view their signups and role details.</p>
        <p><a href="${mySignupsUrl}">Volunteer hub – My Signups</a></p>
        <p>– Berkeley Omnium Volunteer Team</p>
      `
    }
  });
}

/**
 * Sends welcome email with a one-click magic link (no extra email step).
 * redirectTo is the current origin so the link sends users back to the same env (localhost / preview / production).
 * That URL must be in Supabase Dashboard → Auth → URL Configuration → Redirect URLs, or Supabase will use Site URL (often production).
 * When promptWaiverAndEmergencyContact is true (e.g. volunteer was added by admin/leader), the email includes
 * verbiage asking them to sign in to sign the waiver and provide emergency contact. Omit for self-signup via PII modal.
 */
export async function sendWelcomeEmail({ to, first_name, promptWaiverAndEmergencyContact = false }) {
  // Use site root so Supabase appends "#access_token=..."; if we used "#/volunteer" we'd get "#/volunteer#access_token=..." and the client can't parse the hash.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTo = origin ? `${origin}/` : '';

  await supabase.functions.invoke('send-welcome-with-magic-link', {
    body: { to, first_name: first_name || '', redirectTo, promptWaiverAndEmergencyContact }
  });
}
