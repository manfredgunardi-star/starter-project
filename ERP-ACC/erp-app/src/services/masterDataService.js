import { supabase } from '../lib/supabase'

// ---- UNITS ----
// units table: id, name, created_at (no is_active, no updated_at)
export async function getUnits() {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createUnit(unit) {
  const { data, error } = await supabase
    .from('units')
    .insert({ name: unit.name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUnit(id, unit) {
  const { data, error } = await supabase
    .from('units')
    .update({ name: unit.name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteUnit(id) {
  // units has no is_active — hard delete (units are reference/config data)
  const { error } = await supabase
    .from('units')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ---- PRODUCTS ----
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      base_unit:units!products_base_unit_id_fkey(id, name),
      conversions:unit_conversions(
        id,
        from_unit_id,
        to_unit_id,
        conversion_factor,
        from_unit:units!unit_conversions_from_unit_id_fkey(id, name),
        to_unit:units!unit_conversions_to_unit_id_fkey(id, name)
      )
    `)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createProduct(product, conversions = []) {
  // Insert product
  const { data: newProduct, error: productError } = await supabase
    .from('products')
    .insert({
      sku: product.sku || null,
      name: product.name,
      category: product.category || null,
      base_unit_id: product.base_unit_id,
      buy_price: product.buy_price || 0,
      sell_price: product.sell_price || 0,
      is_taxable: product.is_taxable || false,
      tax_rate: product.is_taxable ? (product.tax_rate || 11) : 11,
    })
    .select()
    .single()
  if (productError) throw productError

  // Insert unit conversions
  if (conversions.length > 0) {
    const conversionRows = conversions.map(c => ({
      product_id: newProduct.id,
      from_unit_id: c.from_unit_id,
      to_unit_id: newProduct.base_unit_id,
      conversion_factor: Number(c.conversion_factor),
    }))
    const { error: convError } = await supabase
      .from('unit_conversions')
      .insert(conversionRows)
    if (convError) throw convError
  }

  return newProduct
}

export async function updateProduct(id, product, conversions = []) {
  // Update product
  const { data: updatedProduct, error: productError } = await supabase
    .from('products')
    .update({
      sku: product.sku || null,
      name: product.name,
      category: product.category || null,
      base_unit_id: product.base_unit_id,
      buy_price: product.buy_price || 0,
      sell_price: product.sell_price || 0,
      is_taxable: product.is_taxable || false,
      tax_rate: product.is_taxable ? (product.tax_rate || 11) : 11,
    })
    .eq('id', id)
    .select()
    .single()
  if (productError) throw productError

  // Replace all conversions: delete old, insert new
  const { error: delError } = await supabase
    .from('unit_conversions')
    .delete()
    .eq('product_id', id)
  if (delError) throw delError

  if (conversions.length > 0) {
    const conversionRows = conversions.map(c => ({
      product_id: id,
      from_unit_id: c.from_unit_id,
      to_unit_id: updatedProduct.base_unit_id,
      conversion_factor: Number(c.conversion_factor),
    }))
    const { error: convError } = await supabase
      .from('unit_conversions')
      .insert(conversionRows)
    if (convError) throw convError
  }

  return updatedProduct
}

export async function softDeleteProduct(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('products')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- COA (Chart of Accounts) ----

// auto-determines normal_balance from account type
export function coaNormalBalance(type) {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit'
}

export async function getCOA() {
  const { data, error } = await supabase
    .from('coa')
    .select('*, parent:coa!coa_parent_id_fkey(id, code, name)')
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

export async function createCOA(coa) {
  const { data, error } = await supabase
    .from('coa')
    .insert({
      code: coa.code,
      name: coa.name,
      type: coa.type,
      normal_balance: coaNormalBalance(coa.type),
      parent_id: coa.parent_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCOA(id, coa) {
  const { data, error } = await supabase
    .from('coa')
    .update({
      code: coa.code,
      name: coa.name,
      type: coa.type,
      normal_balance: coaNormalBalance(coa.type),
      parent_id: coa.parent_id || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteCOA(id) {
  // Check if this account is referenced in journal_items
  const { count, error: checkError } = await supabase
    .from('journal_items')
    .select('id', { count: 'exact', head: true })
    .eq('coa_id', id)
  if (checkError) throw checkError
  if (count > 0) throw new Error('Akun ini sudah digunakan dalam jurnal dan tidak dapat dihapus')

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('coa')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- CUSTOMERS ----
export async function getCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createCustomer(customer) {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: customer.name,
      address: customer.address || null,
      phone: customer.phone || null,
      email: customer.email || null,
      npwp: customer.npwp || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(id, customer) {
  const { data, error } = await supabase
    .from('customers')
    .update({
      name: customer.name,
      address: customer.address || null,
      phone: customer.phone || null,
      email: customer.email || null,
      npwp: customer.npwp || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteCustomer(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('customers')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- SUPPLIERS ----
export async function getSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createSupplier(supplier) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: supplier.name,
      address: supplier.address || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      npwp: supplier.npwp || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSupplier(id, supplier) {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: supplier.name,
      address: supplier.address || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      npwp: supplier.npwp || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteSupplier(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('suppliers')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- CASH/BANK ACCOUNTS ----
export async function getCashBankAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*, coa:coa_id(id, code, name)')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createCashBankAccount(account) {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name: account.name,
      type: account.type,
      coa_id: account.coa_id,
    })
    .select('*, coa:coa_id(id, code, name)')
    .single()
  if (error) throw error
  return data
}

export async function updateCashBankAccount(id, account) {
  const { data, error } = await supabase
    .from('accounts')
    .update({
      name: account.name,
      type: account.type,
      coa_id: account.coa_id,
    })
    .eq('id', id)
    .select('*, coa:coa_id(id, code, name)')
    .single()
  if (error) throw error
  return data
}

export async function softDeleteCashBankAccount(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('accounts')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// Get COA accounts filtered for Kas/Bank (codes starting with 1-11xxx or 1-12xxx)
export async function getCOAForCashBank() {
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name')
    .eq('is_active', true)
    .or('code.ilike.1-11%,code.ilike.1-12%')
    .order('code')
  if (error) throw error
  return data
}
