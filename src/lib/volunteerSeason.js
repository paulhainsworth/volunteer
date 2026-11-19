import { supabasePublic } from './supabasePublic';
import { withSupabaseReadTimeout } from './utils/withTimeout';

export async function readVolunteerSeason() {
  const { data, error } = await withSupabaseReadTimeout(() => supabasePublic
    .from('volunteer_season')
    .select('active_year')
    .eq('id', 1)
    .maybeSingle(), 'volunteerSeason.read');

  // Keep existing listings available during rollout, before the migration is applied.
  if (error?.code === 'PGRST205') return null;
  if (error) throw error;
  return data;
}

export function isArchivedShift(role, activeYear) {
  const date = role?.event_date || role?.completion_month;
  return Boolean(activeYear && date && date < `${activeYear}-01-01`);
}

export function activeShiftQuery(query, activeYear) {
  if (!activeYear) return query;
  const cutoff = `${activeYear}-01-01`;
  return query.or(`event_date.gte.${cutoff},and(event_date.is.null,completion_month.gte.${cutoff}),and(event_date.is.null,completion_month.is.null)`);
}
