import { writable, get } from 'svelte/store';
import { supabase } from '../supabaseClient';

/**
 * Auth store.
 *
 * Architecture rules (the old version violated these and produced wedged "semi-logged-in"
 * sessions that only incognito mode escaped):
 *
 * 1. NEVER await Supabase calls inside the onAuthStateChange callback. supabase-js holds an
 *    internal auth lock while dispatching events; `supabase.from()` needs that same lock to
 *    read the session, so awaiting it inside the callback deadlocks the whole client. All
 *    profile loading is scheduled onto a fresh macrotask instead.
 * 2. Never clear Supabase's localStorage entries by hand. supabase-js owns that storage;
 *    it clears it itself on SIGNED_OUT and on invalid refresh tokens.
 * 3. One client for everything. No parallel PostgREST clients reading tokens straight out
 *    of localStorage — those bypass token refresh and go stale after an hour.
 */
function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false
  });
  const getState = () => get({ subscribe });

  let listenerInitialized = false;
  /** applySession calls are serialized so a caller's result is always in the store by the time it resolves (route guards read the store right after navigation). */
  let applyQueue = Promise.resolve();
  /** Resolves once the first session hydration finishes — route guards await this before reading user/profile. */
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  /** Fetch the profile row, retrying briefly — for brand-new users the row is created by a DB trigger and can lag the session by a moment. */
  const fetchProfile = async (userId) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (data) return data;
      if (error) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };

  const doApplySession = async (session) => {
    if (!session?.user) {
      set({ user: null, profile: null, loading: false, isAdmin: false });
      return { user: null, profile: null };
    }

    const prev = getState();
    const sameUser = prev.user?.id === session.user.id;

    // Show the user as signed in right away; keep the previous profile while reloading so
    // nav/role guards don't flicker for an already-hydrated user.
    update((s) => ({
      ...s,
      user: session.user,
      profile: sameUser ? s.profile : null,
      isAdmin: sameUser ? s.isAdmin : false
    }));

    let profile = null;
    try {
      profile = await fetchProfile(session.user.id);
    } catch (error) {
      console.error('[auth] profile fetch failed:', error);
      if (sameUser && prev.profile) profile = prev.profile;
    }

    set({
      user: session.user,
      profile,
      loading: false,
      isAdmin: profile?.role === 'admin'
    });
    return { user: session.user, profile };
  };

  /** Serialized session apply. Safe to call from anywhere EXCEPT inside the auth event callback (schedule it instead). */
  const applySession = (session) => {
    const run = applyQueue.then(() => doApplySession(session));
    applyQueue = run.catch(() => {});
    return run;
  };

  const initListener = () => {
    if (listenerInitialized) return;
    listenerInitialized = true;
    supabase.auth.onAuthStateChange((event, session) => {
      // Rule 1: leave the callback before touching the client again.
      setTimeout(() => {
        applySession(session).catch((error) =>
          console.error('[auth] applying auth state change failed:', error)
        );
      }, 0);
    });
  };

  return {
    subscribe,

    /** Idempotent. Sets up the auth listener and hydrates from the persisted session. */
    initialize: async () => {
      initListener();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[auth] getSession failed; continuing signed out:', error);
          return await applySession(null);
        }
        return await applySession(data.session);
      } finally {
        resolveReady();
      }
    },

    /** Resolves after the first session hydration. Await before reading user/profile in route guards. */
    ready: () => readyPromise,

    refreshSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[auth] refreshSession getSession:', error);
        return applySession(null);
      }
      return applySession(data.session);
    },

    /**
     * Reload the profile row for the current (or given) session — used after Profile /
     * Onboarding saves so the store reflects the new row.
     * @param {import('@supabase/supabase-js').Session | null} [knownSession]
     */
    hydrateFromSession: async (knownSession) => {
      if (knownSession?.user) return applySession(knownSession);
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[auth] hydrateFromSession getSession:', error);
        return applySession(null);
      }
      return applySession(data.session);
    },

    /**
     * Wait for auth bootstrap + profile row before admin route guards run.
     */
    ensureAdminRouteReady: async () => {
      await readyPromise;
      let s = getState();
      if (s.user && !s.profile) {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session) await applySession(data.session);
        s = getState();
      }
      return s;
    },

    /**
     * Exchange a magic-link token_hash (from #/auth/confirm) for a session.
     * Returns { user, profile } once the profile is loaded.
     */
    verifyMagicLinkToken: async (tokenHash) => {
      const { data, error } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: tokenHash
      });
      if (error) throw error;
      if (!data.session) throw new Error('Sign-in succeeded but no session was returned.');
      return applySession(data.session);
    },

    signInWithMagicLink: async (email) => {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin + '/' : '';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const INVOKE_TIMEOUT_MS = 45000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-magic-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey
          },
          body: JSON.stringify({ to: email, redirectTo }),
          signal: controller.signal
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
          throw new Error('Request timed out. The server may be waking up — please try again in a moment.');
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
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
        // Give the profiles trigger a beat before callers query the new row.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return data;
    },

    signOut: async () => {
      try {
        // Local scope: revoking the refresh token server-side isn't worth blocking the UI on.
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.error('[auth] sign out failed:', error);
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
