import { useState, useMemo } from 'react'
import { useStock } from '../../hooks/useInventory'
import { formatCurrency, formatNumber } from '../../utils/currency'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Search, RefreshCw } from 'lucide-react'
import { Space, Row, Col, Card, Flex, Typography, Alert, Tag } from 'antd'

const LOW_STOCK_THRESHOLD = 10

export default function StockPage() {
  const { stock, loading, error, refetch } = useStock()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return stock
    return stock.filter(s => {
      const name = s.product?.name?.toLowerCase() || ''
      const sku = s.product?.sku?.toLowerCase() || ''
      return name.includes(q) || sku.includes(q)
    })
  }, [stock, search])

  const totalValue = useMemo(
    () => filtered.reduce((sum, s) => sum + s.quantity_on_hand * s.avg_cost, 0),
    [filtered]
  )

  if (loading) return <LoadingSpinner message="Memuat data stok..." />

  if (error) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Title level={3}>Stok</Typography.Title>
        <Alert type="error" message={error} showIcon />
      </Space>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Stok On Hand</Typography.Title>
        <button
          onClick={refetch}
          style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, color: '#4b5563', backgroundColor: '#f3f4f6', borderRadius: 4, border: 'none', cursor: 'pointer' }}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </Flex>

      {/* Search bar */}
      <div style={{ position: 'relative', maxWidth: 448 }}>
        <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari produk atau SKU..."
          style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8 }}
        />
      </div>

      {/* Stock table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Produk</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>SKU</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Satuan</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Stok</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Harga Rata-rata</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Nilai Stok</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  {search ? 'Produk tidak ditemukan' : 'Belum ada data stok'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isLow = item.quantity_on_hand < LOW_STOCK_THRESHOLD && item.quantity_on_hand > 0
                const isZero = item.quantity_on_hand <= 0
                const nilai = item.quantity_on_hand * item.avg_cost

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontWeight: 500, color: '#111827' }}>
                      {item.product?.name || '—'}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#6b7280', fontFamily: 'monospace' }}>
                      {item.product?.sku || '-'}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#374151' }}>
                      {item.product?.base_unit?.name || '-'}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right' }}>
                      <span style={{
                        color: isZero ? '#dc2626' : isLow ? '#ea580c' : '#111827',
                        fontWeight: isZero || isLow ? 600 : 400
                      }}>
                        {formatNumber(item.quantity_on_hand, 2)}
                        {isZero && (
                          <span style={{ marginLeft: 8, fontSize: 12, backgroundColor: '#fee2e2', color: '#b91c1c', paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2, borderRadius: 4 }}>
                            Habis
                          </span>
                        )}
                        {isLow && !isZero && (
                          <span style={{ marginLeft: 8, fontSize: 12, backgroundColor: '#fed7aa', color: '#b45309', paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2, borderRadius: 4 }}>
                            Menipis
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', color: '#374151' }}>
                      {formatCurrency(item.avg_cost)}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', color: '#111827', fontWeight: 500 }}>
                      {formatCurrency(nilai)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Footer: total */}
          {filtered.length > 0 && (
            <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
              <tr>
                <td colSpan={5} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                  Total Nilai Stok
                </td>
                <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontWeight: 'bold', color: '#111827', textAlign: 'right' }}>
                  {formatCurrency(totalValue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Summary stats */}
      <Row gutter={16}>
        <Col span={8}>
          <Card size="small">
            <Typography.Text type="secondary">Total Produk</Typography.Text>
            <div className="text-2xl font-bold text-gray-900">{filtered.length}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
            <Typography.Text style={{ color: '#c2410c' }}>Stok Menipis</Typography.Text>
            <div className="text-2xl font-bold" style={{ color: '#c2410c' }}>
              {filtered.filter(s => s.quantity_on_hand > 0 && s.quantity_on_hand < LOW_STOCK_THRESHOLD).length}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
            <Typography.Text type="danger">Stok Habis</Typography.Text>
            <div className="text-2xl font-bold text-red-700">
              {filtered.filter(s => s.quantity_on_hand <= 0).length}
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
