import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createSignupsStore() {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    
    fetchMySignups: async (volunteerId) => {
      const { data, error } = await supabase
        .from('signups')
        .select(`
          *,
          role:volunteer_roles!role_id(*)
        `)
        .eq('volunteer_id', volunteerId)
        .eq('status', 'confirmed')
        .order('role(event_date)', { ascending: true });

      if (error) throw error;

      set(data);
      return data;
    },

    createSignup: async (volunteerId, roleId, phone = null) => {
      // Check if already signed up
      const { data: existing } = await supabase
        .from('signups')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .eq('role_id', roleId)
        .single();

      if (existing) {
        throw new Error('You are already signed up for this role');
      }

      // Check if role is full
      const { data: role } = await supabase
        .from('volunteer_roles')
        .select('positions_total')
        .eq('id', roleId)
        .single();

      const { data: signups } = await supabase
        .from('signups')
        .select('id')
        .eq('role_id', roleId)
        .eq('status', 'confirmed');

      if (signups && signups.length >= role.positions_total) {
        throw new Error('This role is already full');
      }

      // Create signup
      const { data, error } = await supabase
        .from('signups')
        .insert({
          volunteer_id: volunteerId,
          role_id: roleId,
          phone: phone,
          status: 'confirmed',
          waiver_signed: true
        })
        .select(`
          *,
          role:volunteer_roles!role_id(*)
        `)
        .single();

      if (error) throw error;

      update(signups => [...signups, data]);
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

