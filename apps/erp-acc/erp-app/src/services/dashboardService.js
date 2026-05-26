import { supabase } from '../lib/supabase'

export async function getDashboardMetrics() {
  const { data, error } = await supabase.rpc('get_dashboard_metrics')
  if (error) throw error

  return {
    totalPenjualan:      Number(data.total_penjualan)       || 0,
    totalPiutang:        Number(data.total_piutang)         || 0,
    totalHutang:         Number(data.total_hutang)          || 0,
    totalKas:            Number(data.total_kas)             || 0,
    totalOverduePiutang: Number(data.total_overdue_piutang) || 0,
    totalOverdueHutang:  Number(data.total_overdue_hutang)  || 0,
    lastMonthPenjualan:  Number(data.last_month_penjualan)  || 0,
    lowStock:   (data.low_stock       ?? []).map(s => ({ ...s, qty_on_hand: s.quantity_on_hand })),
    recentSales:    data.recent_sales    ?? [],
    recentPayments: data.recent_payments ?? [],
    accounts:       data.accounts        ?? [],
  }
}

function sixMonthsAgo() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 5) // bulan ini + 5 bulan sebelumnya = 6 bulan total
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function getMonthlyTrend() {
  const start = sixMonthsAgo()
  const [salesRes, purchaseRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('date, total')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', start),
    supabase
      .from('invoices')
      .select('date, total')
      .eq('type', 'purchase')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', start),
  ])
  if (salesRes.error) throw salesRes.error
  if (purchaseRes.error) throw purchaseRes.error

  // Bangun 6 bucket bulan: dari 5 bulan lalu hingga bulan ini
  const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS_ID[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
      revenue: 0,
      expense: 0,
    })
  }

  const monthMap = new Map(months.map(m => [m.key, m]))

  for (const inv of salesRes.data || []) {
    const key = inv.date.slice(0, 7)
    const m = monthMap.get(key)
    if (m) m.revenue += Number(inv.total) || 0
  }
  for (const inv of purchaseRes.data || []) {
    const key = inv.date.slice(0, 7)
    const m = monthMap.get(key)
    if (m) m.expense += Number(inv.total) || 0
  }

  return months
}
