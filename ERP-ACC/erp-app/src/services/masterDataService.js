import { supabase } from '../lib/supabase'

// ---- UNITS ----
export async function getUnits() {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createUnit(unit) {
  const { data, error } = await supabase
    .from('units')
    .insert({
      ...unit,
      is_active: true,
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUnit(id, unit) {
  const { data, error } = await supabase
    .from('units')
    .update({
      ...unit,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteUnit(id) {
  const { error } = await supabase
    .from('units')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString()
    })
    .eq('id', id)
  if (error) throw error
}
