import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useSalesInvoices } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function SalesInvoicesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { invoices, loading, error } = useSalesInvoices()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch = !search ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || inv.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [invoices, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat invoice..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Invoice Penjualan</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/invoices/new')}>
            <Plus size={20} /> Buat Invoice
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
            placeholder="Cari no. invoice atau customer..."
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
          <option value="posted">Posted</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </Space>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. Invoice</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Customer</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Jatuh Tempo</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Total</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Dibayar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">Belum ada invoice</td>
              </tr>
            ) : (
              filtered.map(inv => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/sales/invoices/${inv.id}`)}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{inv.invoice_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(inv.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{inv.customer?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                  <td className="px-6 py-3 text-sm"><StatusBadge status={inv.status} /></td>
                  <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-6 py-3 text-sm text-right text-green-600">{formatCurrency(inv.amount_paid)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
