/**
 * Start a guest account and return the volunteer to the selected role after verification.
 * No password - user signs in via magic link on return visits.
 */
import { supabase } from './supabaseClient';
import { auth } from './stores/auth';

// Keep the immediate-session welcome email tied to a successful first signup.
let pendingWelcome = null;

export async function createVolunteerAccount(pii, roleId) {
  const {
    first_name,
    last_name,
    email,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    team_club_affiliation_id
  } = pii;
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

  pendingWelcome = { userId: authData.user.id, roleId };
  await auth.hydrateFromSession(authData.session);
  return { pendingVerification: false };
}

export async function sendGuestWelcomeEmail(userId, roleId, email, firstName) {
  if (pendingWelcome?.userId !== userId || pendingWelcome.roleId !== roleId) return;
  pendingWelcome = null;
  await sendWelcomeEmail({ to: email, first_name: firstName });
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
