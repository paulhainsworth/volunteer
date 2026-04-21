import { auth } from '../stores/auth';
import { authObs } from './authObservability';

/**
 * After `auth.initialize()`, waits for Supabase to recover the session from URL tokens (PKCE or hash),
 * hydrates profile, then navigates away from the auth callback URL.
 *
 * Keep logic in one place so both legacy landing (`/` + `#access_token=…`) and `#/auth/callback`
 * behave the same. Do not call `refreshSession()` here — it can race stall recovery and clear storage.
 *
 * @param {{ hashSnapshot: string, hadPkceCode: boolean }} opts
 *   `hashSnapshot` — fragment captured before `initialize()` may rewrite the URL.
 */
export async function completeMagicLinkAfterRedirect(opts) {
  const { hashSnapshot, hadPkceCode } = opts;
  const hash = hashSnapshot;
  const { supabase } = await import('../supabaseClient');
  const { replace } = await import('svelte-spa-router');

  authObs('magic_link_complete_loop_start', { hadPkceCode });

  for (let i = 0; i < 40; i++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      authObs('magic_link_session_recovered', { attempts: i + 1 });
      const { profile } = await auth.hydrateFromSession(session);
      const needsOnboarding = !profile?.emergency_contact_name;
      const fromMagicLink = hash.includes('type=magiclink') || hadPkceCode;
      const postLogin =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('post_login')
          : null;
      if (needsOnboarding) {
        if (postLogin === 'waiver') {
          sessionStorage.setItem('postOnboardingRoute', '/volunteer/waiver');
        }
        await replace('/onboarding');
      } else if (postLogin === 'waiver') {
        await replace('/volunteer/waiver');
      } else if (fromMagicLink) {
        await replace('/my-signups');
      } else {
        await replace('/');
      }
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
