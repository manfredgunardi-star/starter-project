import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Tag, Spin } from 'antd'
import { usePurchaseOrders } from '../../hooks/usePurchase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search, Printer, FileDown } from 'lucide-react'
import { usePrintPO } from '../../hooks/usePrintPO'

const STATUS_COLOR = {
  draft: 'default',
  confirmed: 'blue',
  received: 'gold',
  done: 'success',
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { triggerPrint, triggerPDF, loadingIds } = usePrintPO()
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
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. PO atau supplier..."
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
          <option value="received">Received</option>
          <option value="done">Done</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. PO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Supplier</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada data PO
                </td>
              </tr>
            ) : (
              filtered.map(po => (
                <tr
                  key={po.id}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchase/orders/${po.id}`)}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{po.po_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(po.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{po.supplier?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>
                    <Tag color={STATUS_COLOR[po.status] || 'default'}>
                      {po.status}
                    </Tag>
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>
                    {formatCurrency(po.total)}
                  </td>
                  <td
                    style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {loadingIds[po.id] ? (
                      <Spin size="small" />
                    ) : (
                      <>
                        <button
                          title="Print PO"
                          onClick={() => triggerPrint(po.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#6b7280' }}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          title="Download PDF"
                          onClick={() => triggerPDF(po.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#6b7280' }}
                        >
                          <FileDown size={16} />
                        </button>
                      </>
                    )}
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
