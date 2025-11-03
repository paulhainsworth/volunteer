import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createWaiverStore() {
  const { subscribe, set, update } = writable({
    text: '',
    version: 1,
    loading: false
  });

  return {
    subscribe,
    
    fetchCurrentWaiver: async () => {
      update(state => ({ ...state, loading: true }));
      
      const { data, error } = await supabase
        .from('waiver_settings')
        .select('*')
        .single();

      if (error) throw error;

      set({
        text: data.waiver_text,
        version: data.version,
        loading: false
      });

      return data;
    },

    checkWaiverStatus: async (volunteerId) => {
      const currentWaiver = await this.fetchCurrentWaiver();
      
      const { data, error } = await supabase
        .from('waivers')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .gte('waiver_version', currentWaiver.version)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return {
        hasSigned: !!data,
        needsToSign: !data
      };
    },

    signWaiver: async (volunteerId, signatureName, ipAddress = null) => {
      const currentWaiver = await this.fetchCurrentWaiver();

      const { data, error } = await supabase
        .from('waivers')
        .insert({
          volunteer_id: volunteerId,
          signature_name: signatureName,
          ip_address: ipAddress,
          waiver_version: currentWaiver.version,
          waiver_text: currentWaiver.text
        })
        .select()
        .single();

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

