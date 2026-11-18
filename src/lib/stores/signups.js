import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { withSupabaseReadTimeout } from '../utils/withTimeout';

function createSignupsStore() {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    
    fetchMySignups: async (volunteerId) => {
      const { data, error } = await withSupabaseReadTimeout(
        () => supabase
          .from('signups')
          .select(`
            *,
            role:volunteer_roles!role_id(*)
          `)
          .eq('volunteer_id', volunteerId)
          .eq('status', 'confirmed')
          .order('role(event_date)', { ascending: true }),
        'signups.fetchMySignups'
      );

      if (error) throw error;

      set(data);
      return data;
    },

    confirmSignup: async (roleId, phone = null, consent = null) => {
      const { data, error } = await supabase.rpc('confirm_volunteer_signup', {
        p_role_id: roleId,
        p_phone: phone,
        p_consent: consent
      });
      if (error) throw error;

      update(signups => [...signups.filter(signup => signup.id !== data.signup.id), data.signup]);
      return data;
    },

    cancelSignup: async (signupId) => {
      const { error } = await supabase
        .from('signups')
        .update({ status: 'cancelled' })
        .eq('id', signupId);

      if (error) throw error;

      update(signups => signups.filter(s => s.id !== signupId));
    }
  };
}

export const signups = createSignupsStore();

