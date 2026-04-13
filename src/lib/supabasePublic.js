import { PostgrestClient } from '@supabase/postgrest-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const base = supabaseUrl ? String(supabaseUrl).replace(/\/$/, '') : '';
const restUrl = base ? `${base}/rest/v1` : '';

const anonHeaders = {
  apikey: supabaseAnonKey ?? '',
  Authorization: `Bearer ${supabaseAnonKey ?? ''}`,
};

/**
 * PostgREST-only client (anon JWT in headers). No GoTrue — avoids a second client fighting the
 * main `supabase` instance for the same storage key and avoids auth refresh work blocking reads.
 */
export const supabasePublic = new PostgrestClient(restUrl, {
  schema: 'public',
  headers: anonHeaders,
});
