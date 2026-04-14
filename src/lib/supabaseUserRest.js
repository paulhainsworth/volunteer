import { PostgrestClient } from '@supabase/postgrest-js';
import { storageKey } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const base = supabaseUrl ? String(supabaseUrl).replace(/\/$/, '') : '';
const restUrl = base ? `${base}/rest/v1` : '';

/**
 * Read access_token from the same localStorage entry the Supabase client uses.
 * Synchronous — does not call getSession() (avoids queuing behind a stuck GoTrue refresh).
 */
export function getPersistedAccessToken() {
  if (typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.access_token === 'string' ? parsed.access_token : null;
  } catch {
    return null;
  }
}

/**
 * PostgREST client with the user JWT — same RLS as `supabase.from()`, without the shared client mutex.
 * Returns null if there is no persisted session (caller should fall back to main `supabase`).
 */
export function getUserPostgrestClient() {
  const token = getPersistedAccessToken();
  if (!token || !restUrl) return null;
  return new PostgrestClient(restUrl, {
    schema: 'public',
    headers: {
      apikey: supabaseAnonKey ?? '',
      Authorization: `Bearer ${token}`,
    },
  });
}
