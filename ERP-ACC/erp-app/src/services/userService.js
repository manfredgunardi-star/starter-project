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
