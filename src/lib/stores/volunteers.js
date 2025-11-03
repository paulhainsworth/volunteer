import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createVolunteersStore() {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    
    fetchVolunteers: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          signups:signups!volunteer_id(
            id,
            role:volunteer_roles!role_id(
              id,
              name,
              event_date,
              start_time,
              end_time
            ),
            status,
            signed_up_at
          ),
          waivers:waivers(
            id,
            agreed_at,
            waiver_version
          )
        `)
        .order('last_name', { ascending: true });

      if (error) throw error;

      // Calculate total hours for each volunteer
      const volunteersWithStats = data.map(volunteer => {
        const confirmedSignups = volunteer.signups?.filter(s => s.status === 'confirmed') || [];
        
        const totalHours = confirmedSignups.reduce((sum, signup) => {
          if (!signup.role) return sum;
          
          const start = new Date(`2000-01-01 ${signup.role.start_time}`);
          const end = new Date(`2000-01-01 ${signup.role.end_time}`);
          const hours = (end - start) / (1000 * 60 * 60);
          
          return sum + hours;
        }, 0);

        return {
          ...volunteer,
          signups: confirmedSignups,
          totalSignups: confirmedSignups.length,
          totalHours: Math.round(totalHours * 10) / 10,
          hasSignedWaiver: volunteer.waivers && volunteer.waivers.length > 0
        };
      });

      set(volunteersWithStats);
      return volunteersWithStats;
    }
  };
}

export const volunteers = createVolunteersStore();

