import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Same key GoTrue uses for persisted session JSON (read access_token for PostgREST without blocked client). */
export const storageKey = (() => {
  if (!supabaseUrl) return undefined;
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  } catch {
    return undefined;
  }
})();

/**
 * Structured log for auth recovery / storage actions (instrument migration §4.4).
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
export function authRecoveryLog(reason, detail = {}) {
  if (typeof console === 'undefined' || !console.info) return;
  try {
    console.info('[authRecovery]', reason, detail);
  } catch {
    /* ignore */
  }
}

/**
 * Remove persisted GoTrue tokens (e.g. before applying fresh hash tokens, or after stall recovery).
 * @param {Storage} [store]
 * @param {string} [reason] — optional log reason
 */
export function clearPersistedSupabaseAuthKeys(
  store = typeof window !== 'undefined' ? window.localStorage : null,
  reason = 'clearPersistedSupabaseAuthKeys'
) {
  if (!store || !storageKey) return;
  try {
    for (const k of Object.keys(store)) {
      if (k === storageKey || k.startsWith(`${storageKey}-`)) {
        store.removeItem(k);
      }
    }
    authRecoveryLog(reason, { storage: store === window?.localStorage ? 'localStorage' : 'sessionStorage' });
  } catch {
    /* ignore quota / privacy */
  }
}

if (typeof window !== 'undefined' && storageKey) {
  const h = window.location.hash || '';
  // Email magic links put new tokens in the hash. A stale refresh in localStorage can hang
  // getSession and block hash handling — drop old tokens so detectSessionInUrl can apply the new ones.
  // Clear sessionStorage too: migration below would otherwise copy stale keys back into localStorage.
  // Narrow: only when fragment clearly contains auth tokens (not arbitrary hash routes).
  if (/access_token|refresh_token|type=magiclink|type=recovery/i.test(h)) {
    authRecoveryLog('module_init_clear_stale_before_hash_session', { hashPrefix: h.slice(0, 80) });
    clearPersistedSupabaseAuthKeys(window.localStorage, 'module_init_hash_tokens_localStorage');
    clearPersistedSupabaseAuthKeys(window.sessionStorage, 'module_init_hash_tokens_sessionStorage');
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

