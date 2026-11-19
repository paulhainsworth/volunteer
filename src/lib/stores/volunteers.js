import { derived, writable } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { fetchEmergencyContacts } from '../profileAccess';
import { withSupabaseReadTimeout } from '../utils/withTimeout';
import { isArchivedShift, readVolunteerSeason } from '../volunteerSeason';

const roster = writable({ activeYear: null, active: [], archived: [] });
export const archivedVolunteers = derived(roster, ($roster) => $roster.archived);
export const activeRosterYear = derived(roster, ($roster) => $roster.activeYear);

function createVolunteersStore() {
  const { subscribe } = derived(roster, ($roster) => $roster.active);

  return {
    subscribe,
    
    fetchVolunteers: async ({ includeEmergencyContacts = false } = {}) => {
      const [season, { data, error }] = await Promise.all([readVolunteerSeason(), withSupabaseReadTimeout(
        () => supabase
          .from('profiles')
          .select(`
            id, email, role, first_name, last_name, phone, team_club_affiliation_id,
            signups:signups!volunteer_id(
              id,
              role:volunteer_roles!role_id(
                id,
                name,
                event_date,
                completion_month,
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
          .order('last_name', { ascending: true }),
        'volunteers.fetchVolunteers'
      )]);

      if (error) throw error;

      const emergencyContacts = includeEmergencyContacts
        ? await fetchEmergencyContacts(data.map(({ id }) => id))
        : [];
      const contactsByProfile = new Map(emergencyContacts.map(({ profile_id, ...contact }) => [profile_id, contact]));

      const activeYear = season?.active_year ?? null;
      const active = [];
      const archived = [];
      for (const volunteer of data) {
        const confirmed = volunteer.signups?.filter((signup) => signup.status === 'confirmed') ?? [];
        const current = confirmed.filter((signup) => !isArchivedShift(signup.role, activeYear));
        const isArchived = volunteer.role === 'volunteer' && confirmed.length > 0 && current.length === 0;
        const confirmedSignups = isArchived ? confirmed : current;
        
        const totalHours = confirmedSignups.reduce((sum, signup) => {
          if (!signup.role) return sum;
          
          const start = new Date(`2000-01-01 ${signup.role.start_time}`);
          const end = new Date(`2000-01-01 ${signup.role.end_time}`);
          const hours = (end - start) / (1000 * 60 * 60);
          
          return sum + hours;
        }, 0);

        const list = isArchived ? archived : active;
        list.push({
          ...volunteer,
          ...contactsByProfile.get(volunteer.id),
          signups: confirmedSignups,
          totalSignups: confirmedSignups.length,
          totalHours: Math.round(totalHours * 10) / 10,
          hasSignedWaiver: volunteer.waivers && volunteer.waivers.length > 0
        });
      }

      roster.set({ activeYear, active, archived });
      return active;
    }
  };
}

export const volunteers = createVolunteersStore();

