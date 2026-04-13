import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePurchaseInvoices } from '../../hooks/usePurchase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function PurchaseInvoicesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { purchaseInvoices, loading, error } = usePurchaseInvoices()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return purchaseInvoices.filter(inv => {
      const matchSearch = !search ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.supplier?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || inv.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [purchaseInvoices, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat invoice pembelian..." />
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Invoice Pembelian</h1>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/purchase/invoices/new')}>
            <Plus size={20} /> Buat Invoice
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. invoice atau supplier..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="partial">Partial</option>
          <option value="paid">Lunas</option>
        </select>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. Invoice</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Supplier</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Jatuh Tempo</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Total</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Dibayar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                  Belum ada data invoice pembelian
                </td>
              </tr>
            ) : (
              filtered.map(inv => (
                <tr
                  key={inv.id}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase/invoices/${inv.id}`)}
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{inv.invoice_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(inv.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{inv.supplier?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      inv.status === 'draft' ? 'bg-gray-100 text-gray-800'
                      : inv.status === 'posted' ? 'bg-blue-100 text-blue-800'
                      : inv.status === 'partial' ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                    }`}>
                      {inv.status === 'paid' ? 'Lunas' : inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(inv.total)}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-700">
                    {formatCurrency(inv.amount_paid)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
