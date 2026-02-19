import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createAuthStore() {
  const { subscribe, set } = writable({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false
  });

  const applySession = async (session) => {
    if (session?.user) {
      let profile = null;
      let retries = 0;
      const maxRetries = 5;

      while (!profile && retries < maxRetries) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (data) {
          profile = data;
        } else {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 500));
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

  const loadCurrentSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return applySession(session);
  };

  return {
    subscribe,
    
    initialize: async () => {
      await loadCurrentSession();

      supabase.auth.onAuthStateChange(async (event, session) => {
        await applySession(session);
      });
    },

    refreshSession: async () => {
      return loadCurrentSession();
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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Use base URL only - Supabase appends tokens to hash; nested #/volunteer#access_token breaks parsing
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin + '/' : ''
        }
      });
      if (error) throw error;
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

