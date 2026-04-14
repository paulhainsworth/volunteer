import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { getUserPostgrestClient } from '../supabaseUserRest';
import { withSupabaseReadTimeout } from '../utils/withTimeout';

const clientForReads = () => getUserPostgrestClient() ?? supabase;

function createAffiliationsStore() {
  const { subscribe, set } = writable([]);
  let cached = null;

  const fetchAffiliations = async () => {
    if (cached) return cached;
    const { data, error } = await withSupabaseReadTimeout(
      () => clientForReads()
        .from('team_club_affiliations')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      'affiliations.fetchAffiliations'
    );
    if (error) throw error;
    const list = data || [];
    cached = list;
    set(list);
    return list;
  };

  return {
    subscribe,
    fetchAffiliations,
    getOptions: () => cached || []
  };
}

export const affiliations = createAffiliationsStore();
