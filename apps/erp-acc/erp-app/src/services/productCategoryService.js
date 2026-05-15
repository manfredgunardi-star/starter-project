import { supabase } from '../lib/supabase'

export async function getProductCategories() {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createProductCategory(category) {
  const { data, error } = await supabase
    .from('product_categories')
    .insert({
      code: category.code,
      name: category.name,
      parent_id: category.parent_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProductCategory(id, category) {
  const { data, error } = await supabase
    .from('product_categories')
    .update({
      code: category.code,
      name: category.name,
      parent_id: category.parent_id || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProductCategory(id) {
  const { error } = await supabase.rpc('soft_delete_product_category', { p_id: id })
  if (error) throw error
}
