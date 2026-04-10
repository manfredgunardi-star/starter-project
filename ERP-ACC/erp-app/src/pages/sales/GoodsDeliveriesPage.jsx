import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoodsDeliveries } from '../../hooks/useSales'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function GoodsDeliveriesPage() {
  const navigate = useNavigate()
  const { deliveries, loading, error } = useGoodsDeliveries()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return deliveries.filter(d => {
      const matchSearch = !search ||
        d.gd_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || d.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [deliveries, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat pengiriman..." />
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Pengiriman Barang</h1>
        <Button variant="primary" onClick={() => navigate('/sales/deliveries/new')}>
          <Plus size={20} /> Buat Pengiriman
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. GD atau customer..."
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
        </select>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. GD</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Customer</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Ref. SO</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">Belum ada pengiriman</td>
              </tr>
            ) : (
              filtered.map(d => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/sales/deliveries/${d.id}`)}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{d.gd_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(d.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{d.customer?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm font-mono text-gray-500">{d.sales_order?.so_number || '—'}</td>
                  <td className="px-6 py-3 text-sm"><StatusBadge status={d.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
