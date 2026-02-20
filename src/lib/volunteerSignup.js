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
  const { first_name, last_name, email, phone, emergency_contact_name, emergency_contact_phone, team_club_affiliation_id } = pii;

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
  // Profile is created by handle_new_user trigger; it may be a moment before it's visible. Retry signup on FK.

  // Sign waiver
  try {
    await waiverStore.signWaiver(userId, `${first_name} ${last_name}`.trim());
  } catch (waiverErr) {
    console.warn('Waiver sign failed (may already be signed):', waiverErr);
  }

  // Create signup for role (retry on volunteer_id FK — profile may not exist yet)
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
 * Sends welcome email with a one-click magic link (no extra email step).
 * redirectTo is the current origin so the link sends users back to the same env (localhost / preview / production).
 * That URL must be in Supabase Dashboard → Auth → URL Configuration → Redirect URLs, or Supabase will use Site URL (often production).
 */
export async function sendWelcomeEmail({ to, first_name }) {
  // Use site root so Supabase appends "#access_token=..."; if we used "#/volunteer" we'd get "#/volunteer#access_token=..." and the client can't parse the hash.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTo = origin ? `${origin}/` : '';

  await supabase.functions.invoke('send-welcome-with-magic-link', {
    body: { to, first_name: first_name || '', redirectTo }
  });
}
