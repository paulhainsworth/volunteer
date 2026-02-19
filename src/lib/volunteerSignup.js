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
  const { first_name, last_name, email, phone, emergency_contact_name, emergency_contact_phone } = pii;

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
        emergency_contact_phone: emergency_contact_phone || ''
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

export async function sendWelcomeEmail({ to, first_name }) {
  const signInUrl = `${SITE_URL}/auth/login`;
  const browseUrl = `${SITE_URL}/volunteer`;

  await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject: 'Welcome to 2026 Berkeley Omnium',
      html: `
        <h2>Welcome to Berkeley Omnium 2026!</h2>
        <p>Hi ${first_name || 'there'},</p>
        <p>Thanks for signing up to volunteer. We're excited to have you.</p>
        <p><strong>To return to the volunteer site:</strong></p>
        <p><a href="${signInUrl}">Click here to sign in</a> — we'll send a verification link to your email. No password needed.</p>
        <p>Or <a href="${browseUrl}">browse volunteer opportunities</a> (you can sign in when you're ready to manage your signups).</p>
        <p>– Berkeley Omnium Volunteer Team</p>
      `
    }
  });
}
