import { supabase } from '../lib/supabase'

export async function getUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      role,
      is_active,
      created_at
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getUser(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function updateUserProfile(id, { full_name, role, is_active }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name, role, is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deactivateUser(id) {
  const { data: me } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: me.user.id,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function reactivateUser(id) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      deleted_at: null,
      deleted_by: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createUser({ email, password, full_name, role }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Sesi tidak aktif. Silakan login ulang.')
  }

  const TIMEOUT_MS = 15_000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let data, error
  try {
    const result = await supabase.functions.invoke('create-user', {
      body: { email, password, full_name, role },
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    })
    data = result.data
    error = result.error
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof DOMException) {
      throw new Error('Pembuatan user time-out (15 detik). Coba lagi atau periksa edge function.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (error) {
    let message = error.message
    try {
      if (error.context) {
        const body = await error.context.json()
        if (body?.error) message = body.error
        else if (body?.message) message = body.message
      }
    } catch {
      // fallback ke generic message
    }
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  return data?.user
}
