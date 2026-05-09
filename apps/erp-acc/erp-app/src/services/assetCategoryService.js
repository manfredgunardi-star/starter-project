import { supabase } from '../lib/supabase'

// ---- ASSET CATEGORIES ----

/**
 * List all active asset categories with joined COA data
 */
export async function listCategories() {
  const { data, error } = await supabase
    .from('asset_categories')
    .select(`
      id,
      code,
      name,
      default_useful_life_months,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      is_active,
      created_at,
      created_by,
      updated_at,
      updated_by,
      asset_account:coa!asset_categories_asset_account_id_fkey(id, code, name),
      accumulated_account:coa!asset_categories_accumulated_depreciation_account_id_fkey(id, code, name),
      expense_account:coa!asset_categories_depreciation_expense_account_id_fkey(id, code, name)
    `)
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

/**
 * Get a single asset category by ID
 */
export async function getCategory(id) {
  const { data, error } = await supabase
    .from('asset_categories')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Create a new asset category
 */
export async function createCategory(input) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('asset_categories')
    .insert({
      code: input.code,
      name: input.name,
      default_useful_life_months: input.default_useful_life_months || null,
      asset_account_id: input.asset_account_id,
      accumulated_depreciation_account_id: input.accumulated_depreciation_account_id,
      depreciation_expense_account_id: input.depreciation_expense_account_id,
      created_by: user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Update an asset category
 * Prevents account field changes if category is used by active assets
 */
export async function updateCategory(id, patch) {
  // Check if category has active assets AND if any account fields are being changed
  const accountFieldsChanged =
    'asset_account_id' in patch ||
    'accumulated_depreciation_account_id' in patch ||
    'depreciation_expense_account_id' in patch

  if (accountFieldsChanged) {
    const { count, error: checkError } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
      .eq('is_active', true)
    if (checkError) throw checkError
    if (count > 0) {
      throw new Error('Kategori sudah dipakai aset aktif – akun tidak bisa diubah')
    }
  }

  const { data: { user } } = await supabase.auth.getUser()

  const updateData = {
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  }

  const { data, error } = await supabase
    .from('asset_categories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Soft delete an asset category
 * Prevents deletion if category is used by active assets
 */
export async function softDeleteCategory(id) {
  // Check if category has active assets
  const { count, error: checkError } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('is_active', true)
  if (checkError) throw checkError
  if (count > 0) {
    throw new Error('Kategori masih dipakai aset aktif')
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('asset_categories')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}
