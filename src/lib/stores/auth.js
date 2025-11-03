import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false
  });

  return {
    subscribe,
    
    initialize: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Retry profile fetch in case trigger hasn't completed yet
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
          profile: profile,
          loading: false,
          isAdmin: profile?.role === 'admin'
        });
      } else {
        set({ user: null, profile: null, loading: false, isAdmin: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          // Retry profile fetch in case trigger hasn't completed yet
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
            profile: profile,
            loading: false,
            isAdmin: profile?.role === 'admin'
          });
        } else {
          set({ user: null, profile: null, loading: false, isAdmin: false });
        }
      });
    },

    signUp: async (email, password, firstName, lastName, role = 'volunteer') => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            role: role
          }
        }
      });

      if (error) throw error;

      // Profile is created automatically by database trigger
      // The trigger reads first_name and last_name from user metadata
      // Wait a brief moment for trigger to complete
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

      // Update last_login
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      return data;
    },

    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ user: null, profile: null, loading: false, isAdmin: false });
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

