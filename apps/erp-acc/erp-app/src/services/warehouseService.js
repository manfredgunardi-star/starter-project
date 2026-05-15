import { supabase } from '../lib/supabase'

export async function getWarehouses() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getDefaultWarehouse() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createWarehouse(w) {
  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      code: w.code,
      name: w.name,
      address: w.address || null,
      is_default: w.is_default ?? false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWarehouse(id, w) {
  const { data, error } = await supabase
    .from('warehouses')
    .update({
      code: w.code,
      name: w.name,
      address: w.address || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setDefaultWarehouse(id) {
  const { data: target, error: targetError } = await supabase
    .from('warehouses')
    .select('id')
    .eq('id', id)
    .eq('is_active', true)
    .single()
  if (targetError) throw targetError
  if (!target) throw new Error('Gudang aktif tidak ditemukan')

  const { error: clearError } = await supabase
    .from('warehouses')
    .update({ is_default: false })
    .eq('is_default', true)
  if (clearError) throw clearError

  const { data, error } = await supabase
    .from('warehouses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('is_active', true)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWarehouse(id) {
  const { error } = await supabase.rpc('soft_delete_warehouse', { p_id: id })
  if (error) throw error
}
