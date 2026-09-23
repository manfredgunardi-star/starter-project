import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const kunci = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !kunci) {
  // Tampil jelas di konsol saat .env.local belum diisi.
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diatur (lihat .env.example)');
}

export const supabase = createClient(url ?? 'http://127.0.0.1:54321', kunci ?? 'kunci-kosong', {
  auth: { persistSession: true, autoRefreshToken: true },
});
