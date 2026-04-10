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
