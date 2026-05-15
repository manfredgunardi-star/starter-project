import { supabase } from '../lib/supabase'

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

async function countReferences(table, column, value, options = {}) {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)

  if (options.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function assertProductCategoryNotReferenced(id) {
  const checks = [
    {
      label: 'sub-kategori aktif',
      count: await countReferences('product_categories', 'parent_id', id, { activeOnly: true }),
    },
    {
      label: 'produk aktif',
      count: await countReferences('products', 'category_id', id, { activeOnly: true }),
    },
  ]

  const reference = checks.find(check => check.count > 0)
  if (reference) {
    throw new Error(`Kategori produk masih digunakan oleh ${reference.count} ${reference.label}`)
  }
}

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
  await assertProductCategoryNotReferenced(id)

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('product_categories')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', id)
  if (error) throw error
}
