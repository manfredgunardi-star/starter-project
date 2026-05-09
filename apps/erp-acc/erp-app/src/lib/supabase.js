import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Environment variables tidak ditemukan!\n' +
    'Pastikan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dikonfigurasi di Vercel atau file .env.local'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
