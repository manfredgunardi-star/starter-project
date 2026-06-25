import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};
const supabaseConfig = {
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
};

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

let cachedClient = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase belum dikonfigurasi.');
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return cachedClient;
}
