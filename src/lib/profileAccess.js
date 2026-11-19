import { supabase } from './supabaseClient';
import { withSupabaseReadTimeout } from './utils/withTimeout';

export function readOwnProfile() {
  return supabase.rpc('get_own_volunteer_profile').maybeSingle();
}

export async function fetchEmergencyContacts(profileIds) {
  if (!profileIds.length) return [];
  const { data, error } = await withSupabaseReadTimeout(
    () => supabase.rpc('get_volunteer_emergency_contacts', { p_profile_ids: profileIds }),
    'profile.fetchEmergencyContacts'
  );
  if (error) throw error;
  return data;
}
