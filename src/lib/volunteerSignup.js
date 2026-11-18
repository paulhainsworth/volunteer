/**
 * Simplified volunteer signup flow: create user, sign up for role, send emails.
 * No password - user signs in via magic link on return visits.
 */
import { supabase } from './supabaseClient';
import { auth } from './stores/auth';
import { signups } from './stores/signups';
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
    signature_name: is_minor ? null : volunteerName,
    is_minor,
    parent_guardian_name,
    parent_guardian_email,
    parent_guardian_phone,
    parent_signature_name
  });
  await auth.refreshSession();

  return { created, userId: authData.user.id, email, first_name, last_name };
}

export async function sendVolunteerNotification(kind, reference) {
  const { error } = await supabase.functions.invoke('send-email', {
    body: { notification: { kind, reference } }
  });
  if (error) throw error;
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
