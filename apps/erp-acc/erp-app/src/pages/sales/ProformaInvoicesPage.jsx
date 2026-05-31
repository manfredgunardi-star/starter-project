import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Spin } from 'antd'
import { getProformaInvoices } from '../../services/proformaService'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search, Printer, FileDown } from 'lucide-react'
import { usePrintProformaInvoice } from '../../hooks/usePrintProformaInvoice'

export default function ProformaInvoicesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const [proformas, setProformas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const { triggerPrint, triggerPDF, loadingIds } = usePrintProformaInvoice()

  useEffect(() => {
    let cancelled = false

    async function loadProformas() {
      setLoading(true)
      setError(null)
      try {
        const data = await getProformaInvoices()
        if (!cancelled) {
          setProformas(data || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProformas()

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return proformas.filter(p => {
      return !search ||
        p.proforma_number?.toLowerCase().includes(search.toLowerCase()) ||
        p.customer?.name?.toLowerCase().includes(search.toLowerCase())
    })
  }, [proformas, search])

  if (loading) return <LoadingSpinner message="Memuat proforma invoice..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Proforma Invoice</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/proforma/new')}>
            <Plus size={20} /> Buat Proforma Invoice
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
            placeholder="Cari no. proforma atau customer..."
            style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Proforma</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Berlaku Hingga</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>Belum ada proforma invoice</td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/sales/proforma/${p.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
                    {p.proforma_number}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(p.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{p.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{p.valid_until ? formatDate(p.valid_until) : '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(p.total)}</td>
                  <td
                    style={{ padding: '8px 16px', textAlign: 'center' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {loadingIds[p.id] ? (
                      <Spin size="small" />
                    ) : (
                      <Space size={4}>
                        <button
                          title="Cetak"
                          onClick={() => triggerPrint(p.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          title="Unduh PDF"
                          onClick={() => triggerPDF(p.id)}
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
