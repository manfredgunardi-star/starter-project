import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Tag } from 'antd'
import { useGoodsDeliveries } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function GoodsDeliveriesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
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
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Pengiriman Barang</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/deliveries/new')}>
            <Plus size={20} /> Buat Pengiriman
          </Button>
        )}
      </Flex>

      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. GD atau customer..."
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
          <option value="posted">Posted</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. GD</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref. SO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>Belum ada pengiriman</td>
              </tr>
            ) : (
              filtered.map(d => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/sales/deliveries/${d.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{d.gd_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(d.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{d.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
                    {d.sales_order_id
                      ? d.sales_order?.so_number
                      : <Tag color="warning">Tanpa SO</Tag>
                    }
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={d.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
