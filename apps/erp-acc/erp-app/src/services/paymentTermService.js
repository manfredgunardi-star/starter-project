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

async function assertPaymentTermNotReferenced(id) {
  const checks = [
    {
      label: 'pelanggan aktif',
      count: await countReferences('customers', 'default_payment_term_id', id, { activeOnly: true }),
    },
    {
      label: 'supplier aktif',
      count: await countReferences('suppliers', 'default_payment_term_id', id, { activeOnly: true }),
    },
    {
      label: 'sales order',
      count: await countReferences('sales_orders', 'payment_term_id', id),
    },
    {
      label: 'purchase order',
      count: await countReferences('purchase_orders', 'payment_term_id', id),
    },
    {
      label: 'invoice',
      count: await countReferences('invoices', 'payment_term_id', id),
    },
  ]

  const reference = checks.find(check => check.count > 0)
  if (reference) {
    throw new Error(`Syarat pembayaran masih digunakan oleh ${reference.count} ${reference.label}`)
  }
}

export async function getPaymentTerms() {
  const { data, error } = await supabase
    .from('payment_terms')
    .select('*')
    .eq('is_active', true)
    .order('net_days')
  if (error) throw error
  return data
}

export async function createPaymentTerm(term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .insert({
      code: term.code,
      name: term.name,
      net_days: term.net_days ?? 0,
      discount_percent: term.discount_percent ?? 0,
      discount_days: term.discount_days ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePaymentTerm(id, term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .update({
      code: term.code,
      name: term.name,
      net_days: term.net_days ?? 0,
      discount_percent: term.discount_percent ?? 0,
      discount_days: term.discount_days ?? 0,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePaymentTerm(id) {
  await assertPaymentTermNotReferenced(id)

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('payment_terms')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', id)
  if (error) throw error
}
