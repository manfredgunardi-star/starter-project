import { supabase } from '../lib/supabase'

export async function listCostCenters() {
  const { data, error } = await supabase
    .from('cost_centers')
    .select('id, code, name, description, is_active')
    .eq('is_active', true)
    .order('code')

  if (error) throw error
  return data || []
}

export async function saveCostCenter({ id = null, code, name, description = null }) {
  const { data, error } = await supabase.rpc('save_cost_center', {
    p_id: id,
    p_code: code,
    p_name: name,
    p_description: description,
  })

  if (error) throw error
  return data
}

export async function softDeleteCostCenter(id) {
  const { error } = await supabase.rpc('soft_delete_cost_center', { p_id: id })
  if (error) throw error
}
