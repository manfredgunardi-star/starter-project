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
  const { data: { user } } = await supabase.auth.getUser()

  const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'PAY' })
  if (numErr) throw numErr

  const payload = {
    payment_number: num,
    date: payment.date,
    type: payment.type,
    invoice_id: payment.invoice_id || null,
    customer_id: payment.customer_id || null,
    supplier_id: payment.supplier_id || null,
    account_id: payment.account_id,
    amount: Number(payment.amount),
    notes: payment.notes || null,
    created_by: user?.id ?? null,
  }

  const { data, error } = await supabase.from('payments').insert(payload).select('id').single()
  if (error) throw error

  // Auto-post: creates journal, updates invoice balance, updates account balance
  const { error: postErr } = await supabase.rpc('post_payment', { p_payment_id: data.id })
  if (postErr) throw postErr

  return data.id
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
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('balance')
    .eq('id', account_id)
    .single()
  if (accErr) throw accErr

  const { data, error } = await supabase
    .from('bank_reconciliations')
    .insert({
      account_id,
      date,
      statement_balance: Number(statement_balance),
      system_balance: account.balance,
      is_reconciled: Math.abs(Number(statement_balance) - account.balance) < 0.01,
    })
    .select('id, statement_balance, system_balance, is_reconciled')
    .single()
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
