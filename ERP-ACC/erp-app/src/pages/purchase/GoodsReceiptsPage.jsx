import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Tag } from 'antd'
import { useGoodsReceipts } from '../../hooks/usePurchase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function GoodsReceiptsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
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
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Penerimaan Barang</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/purchase/receipts/new')}>
            <Plus size={20} /> Tambah GR
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
            placeholder="Cari no. GR atau supplier..."
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
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. GR</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Supplier</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref. PO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada data penerimaan barang
                </td>
              </tr>
            ) : (
              filtered.map(gr => (
                <tr
                  key={gr.id}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchase/receipts/${gr.id}`)}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{gr.gr_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(gr.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{gr.supplier?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
                    {gr.purchase_order_id
                      ? gr.purchase_order?.po_number
                      : <Tag color="warning">Tanpa PO</Tag>
                    }
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>
                    <Tag color={gr.status === 'draft' ? 'default' : 'success'}>
                      {gr.status}
                    </Tag>
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
