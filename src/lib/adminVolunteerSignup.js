import { createOrganizerSignup } from './organizerVolunteerSignup';
import { supabase } from './supabaseClient';
import { sendWelcomeEmail } from './volunteerSignup';

async function ensureActiveAdminSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    throw new Error('Your admin session is not active in this tab. Please refresh this page or sign in again, then retry.');
  }

  const session = sessionData.session;
  const expiresAt = session.expires_at || 0;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // Avoid a blocking refresh when the current token is still comfortably valid.
  if (expiresAt > nowInSeconds + 300) {
    return session;
  }

  const refreshResult = await Promise.race([
    supabase.auth.refreshSession(),
    new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: new Error('Session refresh timed out') }), 5000))
  ]);

  if (refreshResult?.data?.session) {
    return refreshResult.data.session;
  }

  if (expiresAt > nowInSeconds + 60) {
    return session;
  }

  throw new Error('Your admin session expired. Please refresh this page or sign in again, then retry.');
}

function sendWelcomeEmailInBackground(options) {
  void sendWelcomeEmail(options).catch((err) => {
    console.warn('Welcome email did not complete:', err);
  });
}


export async function createVolunteerAsAdmin(body) {
  const activeSession = await ensureActiveAdminSession();
  await createOrganizerSignup(body, { Authorization: `Bearer ${activeSession.access_token}` });

  sendWelcomeEmailInBackground({
    to: body.email,
    first_name: body.first_name,
    promptWaiverAndEmergencyContact: true
  });
}
