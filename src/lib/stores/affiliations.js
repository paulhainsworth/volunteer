import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { getUserPostgrestClient } from '../supabaseUserRest';
import { withSupabaseReadTimeout } from '../utils/withTimeout';

const clientForReads = () => getUserPostgrestClient() ?? supabase;

function createAffiliationsStore() {
  const { subscribe, set } = writable([]);
  let cached = null;
  let pendingRead = null;

  const fetchAffiliations = async () => {
    if (cached) return cached;
    pendingRead ??= withSupabaseReadTimeout(
      () => clientForReads()
        .from('team_club_affiliations')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      'affiliations.fetchAffiliations'
    ).then(({ data, error }) => {
      if (error) throw error;
      cached = data || [];
      set(cached);
      return cached;
    }).finally(() => { pendingRead = null; });
    return pendingRead;
  };

  async function createAffiliation(name) {
    await fetchAffiliations();
    const { data, error } = await supabase.rpc('create_team_club_affiliation', { p_name: name }).single();
    if (error) throw error;
    cached = [...cached, data].sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name));
    set(cached);
    return data;
  }

  return {
    subscribe,
    fetchAffiliations,
    createAffiliation,
    getOptions: () => cached || []
  };
}

export const affiliations = createAffiliationsStore();
