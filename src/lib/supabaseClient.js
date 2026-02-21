import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Diagnostic: confirm which project we're talking to (staging ref = wegivbjlxgwqjvzwnvkd, prod = hxlmpyqmerqsjtczhard)
if (typeof window !== 'undefined' && import.meta.env.DEV && supabaseUrl) {
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';
  console.info('[Supabase] Using project:', ref === 'wegivbjlxgwqjvzwnvkd' ? 'STAGING' : ref === 'hxlmpyqmerqsjtczhard' ? 'PRODUCTION' : ref);
}

const storage = typeof window !== 'undefined' ? window.sessionStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage
  }
});

