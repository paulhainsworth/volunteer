import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { withSupabaseReadTimeout } from '../utils/withTimeout';

function createWaiverStore() {
  const { subscribe, set, update } = writable({
    text: '',
    version: 1,
    loading: false
  });

  const fetchCurrentWaiver = async () => {
    update(state => ({ ...state, loading: true }));

    try {
      const { data, error } = await withSupabaseReadTimeout(
        () => supabase
          .from('waiver_settings')
          .select('*')
          .single(),
        'waiver.fetchCurrentWaiver'
      );

      if (error) throw error;

      set({
        text: data.waiver_text,
        version: data.version,
        loading: false
      });

      return data;
    } catch (error) {
      update(state => ({ ...state, loading: false }));
      throw error;
    }
  };

  return {
    subscribe,
    
    fetchCurrentWaiver,

    checkWaiverStatus: async (roleId = null) => {
      const { data, error } = await withSupabaseReadTimeout(
        () => supabase.rpc('volunteer_waiver_is_current', { p_role_id: roleId }),
        'waiver.checkWaiverStatus'
      );
      if (error) throw error;
      return { hasSigned: data === true, needsToSign: data !== true };
    },

    signWaiver: async (consent) => {
      const { data, error } = await supabase.rpc('sign_volunteer_waiver', { p_consent: consent });
      if (error) throw error;
      return data;
    },

    updateWaiverText: async (newText) => {
      const { data, error } = await supabase
        .from('waiver_settings')
        .update({
          waiver_text: newText,
          version: supabase.raw('version + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
        .select()
        .single();

      if (error) throw error;

      set({
        text: data.waiver_text,
        version: data.version,
        loading: false
      });

      return data;
    }
  };
}

export const waiver = createWaiverStore();

