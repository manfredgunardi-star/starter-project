import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Tag } from 'antd'
import { usePurchaseOrders } from '../../hooks/usePurchase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

const STATUS_COLOR = {
  draft: 'default',
  confirmed: 'blue',
  received: 'gold',
  done: 'success',
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { purchaseOrders, loading, error } = usePurchaseOrders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchSearch = !search ||
        po.po_number?.toLowerCase().includes(search.toLowerCase()) ||
        po.supplier?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || po.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [purchaseOrders, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat PO..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Purchase Order</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/purchase/orders/new')}>
            <Plus size={20} /> Buat PO
          </Button>
        )}
      </Flex>

      <Space>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. PO atau supplier..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ width: 280 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="received">Received</option>
          <option value="done">Done</option>
        </select>
      </Space>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. PO</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Supplier</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  Belum ada data PO
                </td>
              </tr>
            ) : (
              filtered.map(po => (
                <tr
                  key={po.id}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase/orders/${po.id}`)}
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{po.po_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(po.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{po.supplier?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm">
                    <Tag color={STATUS_COLOR[po.status] || 'default'}>
                      {po.status}
                    </Tag>
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(po.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
