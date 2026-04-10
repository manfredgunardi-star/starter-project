import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardMetrics } from '../services/dashboardService'
import { formatCurrency } from '../utils/currency'
import { formatDate } from '../utils/date'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  ShoppingCart,
  Banknote,
  Package,
  ArrowRight,
} from 'lucide-react'

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-600',
  posted: 'bg-blue-100 text-blue-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
}

function MetricCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className={`rounded-lg border p-5 flex items-start gap-4 ${color}`}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium opacity-75">{label}</p>
        <p className="text-2xl font-bold truncate">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionHeader({ title, linkTo, linkLabel }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {linkTo && (
        <Link to={linkTo} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          {linkLabel} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDashboardMetrics()
      .then(setMetrics)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Memuat dashboard..." />
  if (error) return <div className="text-red-600 text-sm">{error}</div>
  if (!metrics) return null

  const currentMonth = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={TrendingUp}
          label="Penjualan Bulan Ini"
          value={formatCurrency(metrics.totalPenjualan)}
          color="bg-green-50 border-green-200 text-green-900"
          sub={currentMonth}
        />
        <MetricCard
          icon={Banknote}
          label="Total Piutang"
          value={formatCurrency(metrics.totalPiutang)}
          color="bg-blue-50 border-blue-200 text-blue-900"
          sub="Invoice belum lunas"
        />
        <MetricCard
          icon={TrendingDown}
          label="Total Hutang"
          value={formatCurrency(metrics.totalHutang)}
          color="bg-red-50 border-red-200 text-red-900"
          sub="Invoice pembelian belum lunas"
        />
        <MetricCard
          icon={Wallet}
          label="Total Kas & Bank"
          value={formatCurrency(metrics.totalKas)}
          color="bg-purple-50 border-purple-200 text-purple-900"
          sub={`${metrics.accounts.length} akun`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales Invoices */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionHeader title="Invoice Penjualan Terbaru" linkTo="/sales/invoices" linkLabel="Lihat semua" />
          {metrics.recentSales.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Belum ada invoice.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {metrics.recentSales.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <Link to={`/sales/invoices/${inv.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                        {inv.invoice_number}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{inv.customer?.name || '—'}</p>
                    </td>
                    <td className="py-2 text-xs text-gray-500">{formatDate(inv.date)}</td>
                    <td className="py-2 text-right">
                      <p className="font-medium text-gray-900">{formatCurrency(inv.total)}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_BADGE[inv.status] || 'bg-gray-100'}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionHeader title="Pembayaran Terbaru" linkTo="/cash/payments" linkLabel="Lihat semua" />
          {metrics.recentPayments.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Belum ada pembayaran.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {metrics.recentPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-gray-600">{p.payment_number}</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.type === 'incoming' ? p.customer?.name : p.supplier?.name || '—'}
                      </p>
                    </td>
                    <td className="py-2 text-xs text-gray-500">{formatDate(p.date)}</td>
                    <td className="py-2 text-right">
                      <p className={`font-medium ${p.type === 'incoming' ? 'text-green-700' : 'text-red-700'}`}>
                        {p.type === 'incoming' ? '+' : '−'}{formatCurrency(p.amount)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionHeader title="Stok Menipis" linkTo="/inventory/stock" linkLabel="Lihat stok" />
          {metrics.lowStock.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Tidak ada stok yang menipis.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {metrics.lowStock.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{s.product?.name || '—'}</p>
                      <p className="text-xs text-gray-400">{s.product?.sku}</p>
                    </td>
                    <td className="py-2 text-right">
                      <span className={`font-bold text-sm ${s.qty_on_hand <= 0 ? 'text-red-700' : 'text-orange-600'}`}>
                        {s.qty_on_hand}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">{s.product?.base_unit?.name}</span>
                    </td>
                    <td className="py-2 pl-2">
                      {s.qty_on_hand <= 0 ? (
                        <AlertTriangle size={14} className="text-red-500" />
                      ) : (
                        <Package size={14} className="text-orange-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Cash & Bank Accounts */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionHeader title="Saldo Kas & Bank" linkTo="/cash/accounts" linkLabel="Kelola akun" />
          {metrics.accounts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Belum ada akun kas/bank.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {metrics.accounts.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{a.type}</p>
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {formatCurrency(a.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
