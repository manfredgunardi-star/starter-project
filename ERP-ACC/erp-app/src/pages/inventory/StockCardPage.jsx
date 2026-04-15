import { useState, useMemo } from 'react'
import { useStockCard } from '../../hooks/useInventory'
import { useProducts } from '../../hooks/useMasterData'
import { formatDate, formatDateInput, today } from '../../utils/date'
import { formatNumber } from '../../utils/currency'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import DateInput from '../../components/ui/DateInput'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Calendar, Download } from 'lucide-react'
import { Space, Row, Col, Card, Flex, Typography, Alert } from 'antd'

export default function StockCardPage() {
  const { products = [] } = useProducts()
  const [selectedProductId, setSelectedProductId] = useState('')
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(today())

  const { movements, loading } = useStockCard(selectedProductId, startDate, endDate)

  // Compute running balance
  const movementsWithBalance = useMemo(() => {
    let runningBalance = 0
    return movements.map(m => {
      const incoming = m.type === 'in' ? m.quantity_original : 0
      const outgoing = m.type === 'out' ? m.quantity_original : 0

      runningBalance += m.type === 'in' ? m.quantity_original : -m.quantity_original

      return {
        ...m,
        incoming,
        outgoing,
        balance: runningBalance,
      }
    })
  }, [movements])

  const selectedProduct = products.find(p => p.id === selectedProductId)
  const baseUnitName = selectedProduct?.base_unit?.name || '—'

  const productOptions = products.map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku || '—'})`,
  }))

  const typeLabel = {
    in: 'Masuk',
    out: 'Keluar',
    adjustment: 'Penyesuaian',
  }

  const typeColor = {
    in: 'text-green-600',
    out: 'text-red-600',
    adjustment: 'text-blue-600',
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>Kartu Stok</Typography.Title>

      {/* Filters */}
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Pilih Produk</label>
            <Select
              options={productOptions}
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              placeholder="Pilih produk untuk melihat kartu stok..."
            />
          </div>

          {selectedProduct && (
            <Alert
              type="info"
              showIcon={false}
              message={
                <Typography.Text style={{ color: '#1e3a5f' }}>
                  <strong>SKU:</strong> {selectedProduct.sku || '—'} |
                  <strong className="ml-3">Satuan Dasar:</strong> {baseUnitName}
                </Typography.Text>
              }
            />
          )}

          <Row gutter={16}>
            <Col span={12}>
              <DateInput
                label="Tanggal Mulai"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </Col>
            <Col span={12}>
              <DateInput
                label="Tanggal Akhir"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </Col>
          </Row>

          <Button
            variant="secondary"
            onClick={() => {
              setStartDate(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
              setEndDate(today())
              setSelectedProductId('')
            }}
            size="sm"
          >
            Reset Filter
          </Button>
        </Space>
      </Card>

      {/* Stock card table */}
      {!selectedProductId ? (
        <Card>
          <Flex justify="center" align="center" vertical style={{ padding: 32 }}>
            <Calendar size={40} style={{ color: '#9ca3af', marginBottom: 12 }} />
            <Typography.Text type="secondary">Pilih produk untuk melihat kartu stok</Typography.Text>
          </Flex>
        </Card>
      ) : loading ? (
        <LoadingSpinner message="Memuat kartu stok..." />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tanggal</th>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Keterangan</th>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Referensi</th>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Masuk</th>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Keluar</th>
                  <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movementsWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                      Tidak ada pergerakan stok untuk periode ini
                    </td>
                  </tr>
                ) : (
                  movementsWithBalance.map((movement, idx) => (
                    <tr
                      key={movement.id}
                      style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb'}
                    >
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>
                        {formatDate(movement.date)}
                      </td>
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
                        <span style={{ color: typeColor[movement.type]?.match(/#[0-9a-f]{6}/i)?.[0] || '#22c55e', fontWeight: 500 }}>
                          {typeLabel[movement.type] || '—'}
                        </span>
                        {movement.notes && (
                          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{movement.notes}</p>
                        )}
                      </td>
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#4b5563' }}>
                        {movement.reference_type && (
                          <>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>{movement.reference_type}</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{movement.reference_id?.slice(0, 8) || '—'}</div>
                          </>
                        )}
                        {!movement.reference_type && <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', color: '#16a34a', fontWeight: 500 }}>
                        {movement.incoming > 0 ? formatNumber(movement.incoming, 4) : ''}
                      </td>
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', color: '#dc2626', fontWeight: 500 }}>
                        {movement.outgoing > 0 ? formatNumber(movement.outgoing, 4) : ''}
                      </td>
                      <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 'bold',
                          paddingLeft: 8,
                          paddingRight: 8,
                          paddingTop: 4,
                          paddingBottom: 4,
                          borderRadius: 4,
                          backgroundColor: movement.balance > 0 ? '#dcfce7' : movement.balance < 0 ? '#fee2e2' : '#f3f4f6',
                          color: movement.balance > 0 ? '#166534' : movement.balance < 0 ? '#7f1d1d' : '#111827'
                        }}>
                          {formatNumber(movement.balance, 4)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Footer: Summary */}
              {movementsWithBalance.length > 0 && (
                <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
                  <tr>
                    <td colSpan={3} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      Saldo Akhir ({baseUnitName})
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>
                      {formatNumber(
                        movementsWithBalance.reduce((sum, m) => sum + m.incoming, 0),
                        4
                      )}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>
                      {formatNumber(
                        movementsWithBalance.reduce((sum, m) => sum + m.outgoing, 0),
                        4
                      )}
                    </td>
                    <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, textAlign: 'right' }}>
                      <span style={{ fontWeight: 'bold', paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: 4, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                        {movementsWithBalance.length > 0
                          ? formatNumber(movementsWithBalance[movementsWithBalance.length - 1].balance, 4)
                          : '0'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Summary info */}
          {movementsWithBalance.length > 0 && (
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Total Masuk</Typography.Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                    {formatNumber(movementsWithBalance.reduce((sum, m) => sum + m.incoming, 0), 2)}
                  </div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Total Keluar</Typography.Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>
                    {formatNumber(movementsWithBalance.reduce((sum, m) => sum + m.outgoing, 0), 2)}
                  </div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Saldo Akhir</Typography.Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>
                    {movementsWithBalance.length > 0
                      ? formatNumber(movementsWithBalance[movementsWithBalance.length - 1].balance, 2)
                      : '0'}
                  </div>
                </Card>
              </Col>
            </Row>
          )}
        </Space>
      )}
    </Space>
  )
}
