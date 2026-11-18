/**
 * Simplified volunteer signup flow: create user, sign up for role, send emails.
 * No password - user signs in via magic link on return visits.
 */
import { supabase } from './supabaseClient';
import { auth } from './stores/auth';
import { signups } from './stores/signups';
import { formatRoleScheduleDate, formatTimeRange } from './utils/timeDisplay';

const SITE_URL = typeof window !== 'undefined' ? `${window.location.origin}/#` : '';

export async function createVolunteerAndSignup(pii, roleId, waiverVersion) {
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
  const redirect = new URL('/', window.location.origin);
  redirect.searchParams.set('signup_role', roleId);

  // The generated password is never shown or stored by the app.
  const tempPassword = crypto.randomUUID();
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
      emailRedirectTo: redirect.href
    }
  });

  if (authError) throw authError;
  if (!authData?.user) throw new Error('User creation failed.');

  if (!authData.session) {
    return { pendingVerification: true };
  }

  const { created } = await signups.confirmSignup(roleId, phone, {
    version: waiverVersion,
    signature_name: volunteerName,
    is_minor,
    parent_guardian_name,
    parent_guardian_email,
    parent_guardian_phone,
    parent_signature_name
  });
  await auth.refreshSession();

  return { created, userId: authData.user.id, email, first_name, last_name };
}

export async function sendRoleConfirmationEmail({ to, first_name, role, roleId }) {
  const roleDate = formatRoleScheduleDate(role, 'long');
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
  const roleDate = formatRoleScheduleDate(role, 'long');
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
