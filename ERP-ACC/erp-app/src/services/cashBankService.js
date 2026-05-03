import { supabase } from '../lib/supabase'

export async function getPayments(type) {
  const query = supabase
    .from('payments')
    .select(`
      *,
      invoice:invoices(invoice_number),
      customer:customers(name),
      supplier:suppliers(name),
      account:accounts(name)
    `)
    .order('date', { ascending: false })

  const { data, error } = type ? await query.eq('type', type) : await query
  if (error) throw error
  return data
}

export async function savePayment(payment) {
  // Atomic: INSERT payment + post journal in a single RPC transaction.
  // Period check and role check are enforced server-side (migration 017).
  const { data, error } = await supabase.rpc('save_and_post_payment', {
    p_payment: {
      date:        payment.date,
      type:        payment.type,
      invoice_id:  payment.invoice_id  || null,
      customer_id: payment.customer_id || null,
      supplier_id: payment.supplier_id || null,
      account_id:  payment.account_id,
      amount:      Number(payment.amount),
      notes:       payment.notes || null,
    },
  })
  if (error) throw error
  return data
}

export async function getAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, type, balance')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function saveTransfer({ from_account_id, to_account_id, amount, date, notes }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.rpc('post_transfer', {
    p_from_account_id: from_account_id,
    p_to_account_id: to_account_id,
    p_amount: Number(amount),
    p_date: date,
    p_notes: notes || null,
    p_user_id: user?.id ?? null,
  })
  if (error) throw error
  return data
}

export async function saveReconciliation({ account_id, date, statement_balance }) {
  // Atomic: SELECT balance FOR UPDATE + INSERT reconciliation in a single RPC transaction.
  // Prevents lost-update race when two requests read the same account balance concurrently.
  // See migration 022_account_balance_lock.sql.
  const { data, error } = await supabase.rpc('save_reconciliation', {
    p_account_id:       account_id,
    p_date:             date,
    p_statement_balance: Number(statement_balance),
  })
  if (error) throw error
  return data
}

export async function getOutstandingInvoicesByCustomer(customerId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total, amount_paid, status')
    .eq('type', 'sales')
    .eq('customer_id', customerId)
    .in('status', ['posted', 'partial'])
    .order('date')
  if (error) throw error
  return data
}
