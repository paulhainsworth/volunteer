import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The single Supabase client for the whole app — auth, reads, and writes all go through it
 * so RLS always sees the current session and tokens are refreshed in one place.
 *
 * Magic links land on #/auth/confirm with a token_hash that we exchange via verifyOtp(),
 * so auth tokens never appear in the URL. detectSessionInUrl stays off: there is nothing
 * to detect, and it can never race the hash-based SPA router.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
