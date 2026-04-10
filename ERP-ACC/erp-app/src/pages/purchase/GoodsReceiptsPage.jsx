import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoodsReceipts } from '../../hooks/usePurchase'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function GoodsReceiptsPage() {
  const navigate = useNavigate()
  const { goodsReceipts, loading, error } = useGoodsReceipts()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return goodsReceipts.filter(gr => {
      const matchSearch = !search ||
        gr.gr_number?.toLowerCase().includes(search.toLowerCase()) ||
        gr.supplier?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || gr.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [goodsReceipts, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat penerimaan barang..." />
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Penerimaan Barang</h1>
        <Button variant="primary" onClick={() => navigate('/purchase/receipts/new')}>
          <Plus size={20} /> Tambah GR
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. GR atau supplier..."
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
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. GR</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Supplier</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Ref. PO</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  Belum ada data penerimaan barang
                </td>
              </tr>
            ) : (
              filtered.map(gr => (
                <tr
                  key={gr.id}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase/receipts/${gr.id}`)}
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{gr.gr_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(gr.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{gr.supplier?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm font-mono text-gray-500">
                    {gr.purchase_order?.po_number || '—'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      gr.status === 'draft'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {gr.status}
                    </span>
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
