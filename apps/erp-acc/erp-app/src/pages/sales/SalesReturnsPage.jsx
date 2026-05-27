import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useSalesReturns } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function SalesReturnsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { returns, loading, error } = useSalesReturns()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    if (!returns) return []
    return returns.filter(r => {
      const matchSearch = !search ||
        r.sr_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || r.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [returns, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat retur penjualan..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Retur Penjualan</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/returns/new')}>
            <Plus size={20} /> Buat Retur
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
            placeholder="Cari no. retur atau customer..."
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
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Retur</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref SO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada retur penjualan
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/sales/returns/${r.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.sr_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(r.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{r.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.sales_order?.so_number || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
