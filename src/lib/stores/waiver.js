import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createWaiverStore() {
  const { subscribe, set, update } = writable({
    text: '',
    version: 1,
    loading: false
  });

  const fetchCurrentWaiver = async () => {
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
  };

  return {
    subscribe,
    
    fetchCurrentWaiver,

    checkWaiverStatus: async (volunteerId) => {
      const currentWaiver = await fetchCurrentWaiver();
      
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

    /**
     * @param {string} volunteerId
     * @param {string} signatureName - volunteer's name (or minor's name for assent)
     * @param {string|null} [ipAddress]
     * @param {{ parent_guardian_name?: string, parent_guardian_email?: string, parent_guardian_phone?: string, parent_signature_name?: string }} [parent] - for minors
     */
    signWaiver: async (volunteerId, signatureName, ipAddress = null, parent = null) => {
      const currentWaiver = await fetchCurrentWaiver();

      const row = {
        volunteer_id: volunteerId,
        signature_name: signatureName,
        ip_address: ipAddress,
        waiver_version: currentWaiver.version,
        waiver_text: currentWaiver.waiver_text
      };
      if (parent?.parent_guardian_name != null) row.parent_guardian_name = parent.parent_guardian_name;
      if (parent?.parent_guardian_email != null) row.parent_guardian_email = parent.parent_guardian_email;
      if (parent?.parent_guardian_phone != null) row.parent_guardian_phone = parent.parent_guardian_phone;
      if (parent?.parent_signature_name != null) row.parent_signature_name = parent.parent_signature_name;
      if (parent?.parent_guardian_name != null) row.parent_signed_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('waivers')
        .insert(row)
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

