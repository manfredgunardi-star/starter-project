import { supabase } from '../lib/supabase'

export async function getAccountBalances(startDate, endDate) {
  const { data, error } = await supabase.rpc('get_account_balances', {
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw error
  return data
}

export async function getLedger(coaId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_ledger', {
    p_coa_id: coaId,
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw error
  return data
}

export async function getCashFlowData(startDate, endDate) {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      type, amount, date,
      customer:customers(name),
      supplier:suppliers(name),
      account:accounts(name),
      invoice:invoices(invoice_number)
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
  if (error) throw error
  return data
}

export async function getARAgingData(asOfDate) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, date, due_date, total, amount_paid, status,
      customer:customers(id, name)
    `)
    .eq('type', 'sales')
    .in('status', ['posted', 'partial'])
    .lte('date', asOfDate)
    .order('customer_id')
    .order('due_date')
  if (error) throw error
  return data
}

export async function getAPAgingData(asOfDate) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, date, due_date, total, amount_paid, status,
      supplier:suppliers(id, name)
    `)
    .eq('type', 'purchase')
    .in('status', ['posted', 'partial'])
    .lte('date', asOfDate)
    .order('supplier_id')
    .order('due_date')
  if (error) throw error
  return data
}
