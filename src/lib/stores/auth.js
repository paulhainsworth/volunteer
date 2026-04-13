import { writable, get } from 'svelte/store';
import { supabase, clearPersistedSupabaseAuthKeys } from '../supabaseClient';
import { TimeoutError, withSupabaseReadTimeout, withTimeout } from '../utils/withTimeout';

/** Whole bootstrap (session + profile retries) — outer safety net only */
const AUTH_BOOTSTRAP_TIMEOUT_MS = 120000;
/** Profile row fetch only — keep bounded; session read is not wrapped (see loadCurrentSession) */
const PROFILE_READ_TIMEOUT_MS = 12000;
/** If refresh hangs without returning, getSession never rejects — race so we can clear local storage */
const GET_SESSION_STALL_MS = 5000;

/**
 * Stale or invalid refresh tokens in localStorage can make getSession/refresh hang or fail and
 * block other Supabase requests (e.g. public role listings). Clear local session so anon reads work.
 * @param {unknown} error
 */
function shouldClearLocalSessionAfterAuthError(error) {
  if (!error || typeof error !== 'object') return false;
  const msg = String(/** @type {{ message?: string }} */ (error).message ?? '').toLowerCase();
  const code = String(/** @type {{ code?: string }} */ (error).code ?? '').toLowerCase();
  if (code === 'refresh_token_not_found' || code === 'invalid_grant') return true;
  if (msg.includes('invalid refresh token')) return true;
  if (msg.includes('refresh token')) return true;
  if (msg.includes('jwt') && (msg.includes('expired') || msg.includes('invalid'))) return true;
  return false;
}

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false
  });
  const getState = () => get({ subscribe });
  let authSubscriptionInitialized = false;

  const applySession = async (session) => {
    if (session?.user) {
      let profile = null;
      let retries = 0;
      const maxRetries = 5;

      while (!profile && retries < maxRetries) {
        try {
          const { data, error } = await withSupabaseReadTimeout(
            () => supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle(),
            'auth.applySession.profile',
            PROFILE_READ_TIMEOUT_MS
          );

          if (data) {
            profile = data;
          } else if (error) {
            throw error;
          } else {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (e) {
          if (e instanceof TimeoutError && retries < maxRetries - 1) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          if (e instanceof TimeoutError) {
            console.warn('Profile fetch timed out; continuing with session only until retry succeeds.');
            break;
          }
          throw e;
        }
      }

      set({
        user: session.user,
        profile,
        loading: false,
        isAdmin: profile?.role === 'admin'
      });
      return { user: session.user, profile };
    } else {
      set({ user: null, profile: null, loading: false, isAdmin: false });
      return { user: null, profile: null };
    }
  };

  /**
   * Apply session + load profile. Does not run getSession() stall recovery — safe to call right
   * after magic-link / OAuth redirect when loadCurrentSession() could falsely "stall" and wipe a
   * fresh session from localStorage.
   * @param {import('@supabase/supabase-js').Session} session
   */
  const applySessionWithProfile = async (session) => {
    if (!session?.user) return applySession(null);
    return applySession(session);
  };

  const loadCurrentSession = async () => {
    const h = typeof window !== 'undefined' ? window.location.hash || '' : '';
    const hashMayStillBeProcessing =
      h.length > 0 && /access_token|refresh_token|type=magiclink|type=recovery/i.test(h);

    const stallMarker = { __authStall: true };
    const stallMs = hashMayStillBeProcessing ? Math.max(GET_SESSION_STALL_MS, 15000) : GET_SESSION_STALL_MS;

    const raced = await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve(stallMarker), stallMs)),
    ]);

    let data;
    let error;

    if (raced && raced.__authStall) {
      if (hashMayStillBeProcessing) {
        console.warn(
          '[auth] getSession slow while URL still has auth hash — skipping stall recovery to avoid wiping new magic-link session'
        );
        const direct = await supabase.auth.getSession();
        ({ data, error } = direct);
      } else {
      console.warn(
        '[auth] getSession stalled (bad refresh often hangs without rejecting); clearing local session'
      );
      clearPersistedSupabaseAuthKeys(window.localStorage);
      clearPersistedSupabaseAuthKeys(window.sessionStorage);
      await supabase.auth.signOut({ scope: 'local' });
      const retryAfterStall = await Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve(stallMarker), GET_SESSION_STALL_MS)),
      ]);
      if (retryAfterStall && retryAfterStall.__authStall) {
        console.warn('[auth] getSession stalled again after clear; continuing signed out');
        ({ data, error } = { data: { session: null }, error: null });
      } else {
        ({ data, error } = retryAfterStall);
      }
      }
    } else {
      ({ data, error } = raced);
    }

    if (error && shouldClearLocalSessionAfterAuthError(error)) {
      console.warn('[auth] Clearing local session after recoverable auth error:', error.message);
      await supabase.auth.signOut({ scope: 'local' });
      const retry = await supabase.auth.getSession();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[auth] getSession failed; continuing signed out so public pages can load:', error);
      if (shouldClearLocalSessionAfterAuthError(error)) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          /* ignore */
        }
      }
      return applySession(null);
    }

    return applySession(data.session);
  };

  const setLoggedOutState = () => {
    set({ user: null, profile: null, loading: false, isAdmin: false });
  };

  return {
    subscribe,
    
    initialize: async () => {
      if (!authSubscriptionInitialized) {
        supabase.auth.onAuthStateChange(async (event, session) => {
          try {
            await applySession(session);
          } catch (error) {
            console.error('Auth state change handling failed:', error);
            if (session?.user) {
              console.warn('Session present after auth handler error; not clearing auth state.');
              void applySession(session).catch((err) =>
                console.error('Auth state retry after error failed:', err)
              );
            } else {
              setLoggedOutState();
            }
          }
        });
        authSubscriptionInitialized = true;
      }

      const bootstrapPromise = loadCurrentSession().catch((error) => {
        console.error('Auth bootstrap failed:', error);
        if (!(error instanceof TimeoutError)) {
          if (shouldClearLocalSessionAfterAuthError(error)) {
            void supabase.auth.signOut({ scope: 'local' });
          }
          setLoggedOutState();
        }
        throw error;
      });

      try {
        return await withTimeout(bootstrapPromise, {
          label: 'auth.initialize',
          timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS
        });
      } catch (error) {
        if (error instanceof TimeoutError) {
          console.warn(
            'Auth bootstrap timed out; finishing load in background without clearing session.'
          );
          update((state) => ({ ...state, loading: false }));
          void loadCurrentSession()
            .then(() => {})
            .catch((err) => console.error('Auth bootstrap background retry failed:', err));
          return { user: null, profile: null, timedOut: true };
        }

        return { user: null, profile: null, error };
      }
    },

    refreshSession: async () => {
      return loadCurrentSession();
    },

    /**
     * Reload profile from DB for an existing session without running stall recovery (use after OAuth/magic link).
     * @param {import('@supabase/supabase-js').Session | null} [knownSession]
     */
    hydrateFromSession: async (knownSession) => {
      if (knownSession?.user) {
        return applySessionWithProfile(knownSession);
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[auth] hydrateFromSession getSession:', error);
        return applySession(null);
      }
      return applySessionWithProfile(data.session);
    },

    /**
     * Wait for auth bootstrap + profile row (magic link often has session before profiles loads).
     * Call at the start of admin onMount guards.
     */
    ensureAdminRouteReady: async () => {
      for (let i = 0; i < 80; i++) {
        if (!getState().loading) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      let s = getState();
      if (s.user && !s.profile) {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session) {
          await applySessionWithProfile(data.session);
        }
        s = getState();
      }
      return s;
    },

    signUp: async (email, password, firstName, lastName, role = 'volunteer') => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            role
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return data;
    },

    /** @deprecated Use signInWithMagicLink instead - password auth removed */
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
      return data;
    },

    signInWithMagicLink: async (email) => {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin + '/' : '';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const INVOKE_TIMEOUT_MS = 45000;

      // Use fetch + anon JWT instead of supabase.functions.invoke: a stuck GoTrue refresh can
      // serialize/block all client requests, leaving the button on "Sending link..." forever.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-magic-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ to: email, redirectTo }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg = data?.error || res.statusText || 'Failed to send sign-in link';
          if (res.status === 429 || String(msg).includes('429') || String(msg).toLowerCase().includes('too many')) {
            throw new Error('Too many sign-in attempts. Please wait a few minutes and try again.');
          }
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(data));
        }
        if (data?.error) throw new Error(data.error);
      } catch (e) {
        if (e?.name === 'AbortError') {
          throw new Error(
            'Request timed out. The server may be waking up — please try again in a moment.'
          );
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    signOut: async () => {
      const SIGN_OUT_TIMEOUT = 15000; // 15s - Supabase server revoke can be slow
      let timeoutId;
      let timedOut = false;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error('Sign out timed out'));
        }, SIGN_OUT_TIMEOUT);
      });

      try {
        const { error } = await Promise.race([
          supabase.auth.signOut(),
          timeoutPromise
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        if (error) throw error;
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) {
          console.warn('Sign out timed out, clearing local session');
        } else {
          console.error('Sign out failed:', error);
        }
        // Ensure local session is cleared so refresh doesn't show logged in
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        set({ user: null, profile: null, loading: false, isAdmin: false });
      }
    },

    /** @deprecated Password auth removed - use signInWithMagicLink */
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/auth/reset-password`
      });
      if (error) throw error;
    },

    /** @deprecated Password auth removed */
    updatePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    }
  };
}

export const auth = createAuthStore();

