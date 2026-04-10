import { supabase } from '../lib/supabase'

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export async function getDashboardMetrics() {
  const [
    salesResult,
    piutangResult,
    hutangResult,
    stockResult,
    recentSalesResult,
    recentPaymentsResult,
    cashResult,
  ] = await Promise.all([
    // Total penjualan bulan ini (invoices sales yang sudah posted)
    supabase
      .from('invoices')
      .select('total')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', monthStart())
      .lte('date', today()),

    // Piutang: invoice sales yang belum lunas
    supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial']),

    // Hutang: invoice purchase yang belum lunas
    supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('type', 'purchase')
      .in('status', ['posted', 'partial']),

    // Stok menipis: quantity_on_hand <= 10
    supabase
      .from('inventory_stock')
      .select(`
        quantity_on_hand,
        product:products(id, name, sku, base_unit:units!products_base_unit_id_fkey(name))
      `)
      .lte('quantity_on_hand', 10)
      .order('quantity_on_hand', { ascending: true })
      .limit(8),

    // 5 invoice penjualan terbaru
    supabase
      .from('invoices')
      .select('id, invoice_number, date, total, status, customer:customers(name)')
      .eq('type', 'sales')
      .order('created_at', { ascending: false })
      .limit(5),

    // 5 pembayaran terbaru
    supabase
      .from('payments')
      .select('id, payment_number, date, amount, type, customer:customers(name), supplier:suppliers(name)')
      .order('created_at', { ascending: false })
      .limit(5),

    // Saldo kas & bank
    supabase
      .from('accounts')
      .select('id, name, type, balance')
      .eq('is_active', true)
      .is('deleted_at', null),
  ])

  if (salesResult.error) throw salesResult.error
  if (piutangResult.error) throw piutangResult.error
  if (hutangResult.error) throw hutangResult.error
  if (stockResult.error) throw stockResult.error
  if (recentSalesResult.error) throw recentSalesResult.error
  if (recentPaymentsResult.error) throw recentPaymentsResult.error
  if (cashResult.error) throw cashResult.error

  const totalPenjualan = (salesResult.data || []).reduce((s, r) => s + Number(r.total), 0)
  const totalPiutang = (piutangResult.data || []).reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid)), 0)
  const totalHutang = (hutangResult.data || []).reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid)), 0)
  const totalKas = (cashResult.data || []).reduce((s, a) => s + Number(a.balance), 0)

  return {
    totalPenjualan,
    totalPiutang,
    totalHutang,
    totalKas,
    lowStock: (stockResult.data || []).map(s => ({ ...s, qty_on_hand: s.quantity_on_hand })),
    recentSales: recentSalesResult.data || [],
    recentPayments: recentPaymentsResult.data || [],
    accounts: cashResult.data || [],
  }
}
