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

async function assertTaxCodeNotReferenced(id) {
  const checks = [
    {
      label: 'produk aktif',
      count: await countReferences('products', 'default_tax_code_id', id, { activeOnly: true }),
    },
    {
      label: 'pelanggan aktif',
      count: await countReferences('customers', 'default_tax_code_id', id, { activeOnly: true }),
    },
    {
      label: 'supplier aktif',
      count: await countReferences('suppliers', 'default_tax_code_id', id, { activeOnly: true }),
    },
    {
      label: 'item sales order',
      count: await countReferences('sales_order_items', 'tax_code_id', id),
    },
    {
      label: 'item purchase order',
      count: await countReferences('purchase_order_items', 'tax_code_id', id),
    },
    {
      label: 'item invoice',
      count: await countReferences('invoice_items', 'tax_code_id', id),
    },
  ]

  const reference = checks.find(check => check.count > 0)
  if (reference) {
    throw new Error(`Kode pajak masih digunakan oleh ${reference.count} ${reference.label}`)
  }
}

export async function getTaxCodes() {
  const { data, error } = await supabase
    .from('tax_codes')
    .select(`
      *,
      output_account:coa!tax_codes_output_account_id_fkey(id, code, name, type),
      input_account:coa!tax_codes_input_account_id_fkey(id, code, name, type)
    `)
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

export async function createTaxCode(tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .insert({
      code: tc.code,
      name: tc.name,
      rate: tc.rate ?? 0,
      is_inclusive: tc.is_inclusive ?? false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaxCode(id, tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .update({
      code: tc.code,
      name: tc.name,
      rate: tc.rate ?? 0,
      is_inclusive: tc.is_inclusive ?? false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTaxCode(id) {
  await assertTaxCodeNotReferenced(id)

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('tax_codes')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', id)
  if (error) throw error
}
