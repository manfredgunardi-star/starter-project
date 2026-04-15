import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePayments } from '../../hooks/useCashBank'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'
import { Space, Flex, Tag, Typography, Alert } from 'antd'

export default function PaymentsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { payments, loading, error } = usePayments()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const filtered = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = !search ||
        p.payment_number?.toLowerCase().includes(search.toLowerCase()) ||
        p.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.supplier?.name?.toLowerCase().includes(search.toLowerCase())
      const matchType = !typeFilter || p.type === typeFilter
      return matchSearch && matchType
    })
  }, [payments, search, typeFilter])

  if (loading) return <LoadingSpinner message="Memuat pembayaran..." />
  if (error) return <Alert type="error" message={error} showIcon />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Typography.Title level={2} style={{ margin: 0 }}>Pembayaran</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/cash/payments/new')}>
            <Plus size={20} /> Tambah Pembayaran
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
            placeholder="Cari no. pembayaran..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ minWidth: 280 }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Semua Tipe</option>
          <option value="incoming">Masuk (dari Customer)</option>
          <option value="outgoing">Keluar (ke Supplier)</option>
        </select>
      </Space>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. Pembayaran</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tipe</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Pihak</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Akun</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Ref. Invoice</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                  Belum ada data pembayaran
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{p.payment_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(p.date)}</td>
                  <td className="px-6 py-3 text-sm">
                    <Tag color={p.type === 'incoming' ? 'success' : 'error'}>
                      {p.type === 'incoming' ? 'Masuk' : 'Keluar'}
                    </Tag>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-900">
                    {p.customer?.name || p.supplier?.name || '—'}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">{p.account?.name || '—'}</td>
                  <td className="px-6 py-3 text-sm font-mono text-gray-500">
                    {p.invoice?.invoice_number || '—'}
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(p.amount)}
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
