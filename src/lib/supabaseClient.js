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

if (typeof window !== 'undefined' && storageKey) {
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

