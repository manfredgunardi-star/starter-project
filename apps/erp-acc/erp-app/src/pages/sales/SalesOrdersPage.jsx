import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useSalesOrders } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function SalesOrdersPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { orders, loading, error } = useSalesOrders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search ||
        o.so_number?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || o.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [orders, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat sales orders..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Sales Order</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/orders/new')}>
            <Plus size={20} /> Buat SO
          </Button>
        )}
      </Flex>

      {/* Filters */}
      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. SO atau customer..."
            style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="invoiced">Invoiced</option>
          <option value="done">Done</option>
        </select>
      </Space>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. SO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada sales order
                </td>
              </tr>
            ) : (
              filtered.map(order => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/sales/orders/${order.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{order.so_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(order.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{order.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={order.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
