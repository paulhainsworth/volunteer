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
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

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

    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      return data;
    },

    signOut: async () => {
      const SIGN_OUT_TIMEOUT = 5000;
      let timeoutId;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Sign out timed out')),
          SIGN_OUT_TIMEOUT
        );
      });

      try {
        const { error } = await Promise.race([
          supabase.auth.signOut(),
          timeoutPromise
        ]);

        if (error) {
          throw error;
        }
      } catch (error) {
        console.error('Sign out failed:', error);
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        set({ user: null, profile: null, loading: false, isAdmin: false });
      }
    },

    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/auth/reset-password`
      });
      if (error) throw error;
    },

    updatePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
    }
  };
}

export const auth = createAuthStore();

