import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const storageKey = (() => {
  if (!supabaseUrl) return undefined;
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  } catch {
    return undefined;
  }
})();

/**
 * Remove persisted GoTrue tokens (e.g. before applying fresh hash tokens, or after stall recovery).
 * @param {Storage} [store]
 */
export function clearPersistedSupabaseAuthKeys(store = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!store || !storageKey) return;
  try {
    for (const k of Object.keys(store)) {
      if (k === storageKey || k.startsWith(`${storageKey}-`)) {
        store.removeItem(k);
      }
    }
  } catch {
    /* ignore quota / privacy */
  }
}

if (typeof window !== 'undefined' && storageKey) {
  const h = window.location.hash || '';
  // Email magic links put new tokens in the hash. A stale refresh in localStorage can hang
  // getSession and block hash handling — drop old tokens so detectSessionInUrl can apply the new ones.
  // Clear sessionStorage too: migration below would otherwise copy stale keys back into localStorage.
  if (/access_token|refresh_token|type=magiclink|type=recovery/i.test(h)) {
    clearPersistedSupabaseAuthKeys(window.localStorage);
    clearPersistedSupabaseAuthKeys(window.sessionStorage);
  }

  // Older builds used sessionStorage for auth (tab-scoped magic links). Migrate into
  // localStorage so admin sessions survive reloads and work across tabs.
  const keysToMigrate = Object.keys(window.sessionStorage).filter(
    (key) => key === storageKey || key.startsWith(`${storageKey}-`)
  );

  for (const key of keysToMigrate) {
    if (!window.localStorage.getItem(key)) {
      const value = window.sessionStorage.getItem(key);
      if (value != null) {
        window.localStorage.setItem(key, value);
      }
    }
  }
}

const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey,
    storage
  }
});

