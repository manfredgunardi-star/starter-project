import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Spin, Tag } from 'antd'
import { useSalesInvoices } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search, Printer, FileDown } from 'lucide-react'
import { usePrintInvoice } from '../../hooks/usePrintInvoice'

export default function SalesInvoicesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { invoices, loading, error } = useSalesInvoices()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const { triggerPrint, triggerPDF, loadingIds } = usePrintInvoice()

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
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. invoice atau customer..."
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
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Invoice</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Jatuh Tempo</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Dibayar</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>Belum ada invoice</td>
              </tr>
            ) : (
              filtered.map(inv => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/sales/invoices/${inv.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
                    {inv.invoice_number}
                    {!inv.goods_delivery_id && (
                      <Tag color="warning" style={{ marginLeft: 8 }}>Tanpa GD</Tag>
                    )}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(inv.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{inv.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={inv.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(inv.total)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right' }}>{formatCurrency(inv.amount_paid)}</td>
                  <td
                    style={{ padding: '8px 16px', textAlign: 'center' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {loadingIds[inv.id] ? (
                      <Spin size="small" />
                    ) : (
                      <Space size={4}>
                        <button
                          title="Cetak"
                          onClick={() => triggerPrint(inv.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          title="Unduh PDF"
                          onClick={() => triggerPDF(inv.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <FileDown size={16} />
                        </button>
                      </Space>
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
