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
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. pembayaran..."
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, minWidth: 280 }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 14 }}
        >
          <option value="">Semua Tipe</option>
          <option value="incoming">Masuk (dari Customer)</option>
          <option value="outgoing">Keluar (ke Supplier)</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>No. Pembayaran</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tanggal</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tipe</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Pihak</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Akun</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Ref. Invoice</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada data pembayaran
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontFamily: 'monospace', color: '#2563eb' }}>{p.payment_number}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#374151' }}>{formatDate(p.date)}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
                    <Tag color={p.type === 'incoming' ? 'success' : 'error'}>
                      {p.type === 'incoming' ? 'Masuk' : 'Keluar'}
                    </Tag>
                  </td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#111827' }}>
                    {p.customer?.name || p.supplier?.name || '—'}
                  </td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#374151' }}>{p.account?.name || '—'}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontFamily: 'monospace', color: '#6b7280' }}>
                    {p.invoice?.invoice_number || '—'}
                  </td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', fontWeight: 500, color: '#111827' }}>
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
