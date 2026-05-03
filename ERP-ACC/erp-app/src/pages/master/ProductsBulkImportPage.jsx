import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ArrowLeft, Download, Upload, CheckCircle, XCircle } from 'lucide-react'
import { createProduct, getUnits } from '../../services/masterDataService'
import { formatCurrency } from '../../utils/currency'
import { Space, Row, Col, Card, Flex, Typography, Alert } from 'antd'

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'sku', 'category', 'unit_name', 'buy_price', 'sell_price', 'is_taxable'],
    ['Pasir Halus', 'PSHLS-001', 'Material', 'Ton', '150000', '200000', 'tidak'],
    ['Batu Kali', 'BTKAL-001', 'Material', 'M3', '250000', '320000', 'tidak'],
  ])
  ws['!cols'] = [
    { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')
  XLSX.writeFile(wb, 'product-import-template.xlsx')
}

function parseRows(jsonRows, unitMap) {
  return jsonRows.map((r, i) => {
    const rowNum = i + 2
    const errors = []
    const name = String(r.name || '').trim()
    const sku = String(r.sku || '').trim()
    const category = String(r.category || '').trim()
    const unitName = String(r.unit_name || '').trim()
    const buyPrice = Number(r.buy_price ?? 0)
    const sellPrice = Number(r.sell_price ?? 0)
    const isTaxableRaw = String(r.is_taxable || '').trim().toLowerCase()
    const isTaxable = isTaxableRaw === 'ya'

    if (!name) errors.push('name wajib diisi')
    if (!unitName) {
      errors.push('unit_name wajib diisi')
    } else if (!unitMap[unitName.toLowerCase()]) {
      errors.push(`Satuan '${unitName}' tidak ditemukan di sistem`)
    }
    if (isNaN(buyPrice) || buyPrice < 0) errors.push('buy_price tidak boleh negatif')
    if (isNaN(sellPrice) || sellPrice < 0) errors.push('sell_price tidak boleh negatif')

    const unitId = unitMap[unitName.toLowerCase()] || null
    return {
      rowNum,
      valid: errors.length === 0,
      errors,
      displayUnit: unitName,
      data: {
        name,
        sku: sku || null,
        category: category || null,
        base_unit_id: unitId,
        buy_price: buyPrice,
        sell_price: sellPrice,
        is_taxable: isTaxable,
        tax_rate: isTaxable ? 11 : 0,
      },
    }
  })
}

export default function ProductsBulkImportPage() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [unitMap, setUnitMap] = useState({}) // name.toLowerCase() → id
  const [rows, setRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    getUnits().then(units => {
      const map = {}
      units.forEach(u => { map[u.name.toLowerCase()] = u.id })
      setUnitMap(map)
    })
  }, [])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws)
      setRows(parseRows(json, unitMap))
      setSummary(null)
      setProgress(0)
    }
    reader.readAsArrayBuffer(file)
  }

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)

  async function handleImport() {
    setImporting(true)
    setSummary(null)
    setProgress(0)
    let success = 0
    const errors = []
    for (let i = 0; i < validRows.length; i++) {
      try {
        await createProduct(validRows[i].data, [])
        success++
      } catch (err) {
        errors.push(`Baris ${validRows[i].rowNum} (${validRows[i].data.name}): ${err.message}`)
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }
    setSummary({ success, failed: errors.length, errors })
    setImporting(false)
  }

  return (
    <Space direction="vertical" style={{ width: '100%', padding: 24 }}>
      <button
        onClick={() => navigate('/master/products')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
        onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
      >
        <ArrowLeft size={18} /> Kembali ke Daftar Produk
      </button>

      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>Bulk Import Produk</Typography.Title>
        <button
          onClick={downloadTemplate}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, fontSize: 14, backgroundColor: 'white', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
        >
          <Download size={16} /> Download Template
        </button>
      </Flex>

      <Card title={<Typography.Text strong>Upload File Excel</Typography.Text>}>
        <Typography.Text type="secondary">
          Download template di atas, isi data produk, lalu upload file .xlsx.
          Kolom <code style={{ backgroundColor: '#f3f4f6', padding: '1px 3px', borderRadius: 2 }}>unit_name</code> harus
          sesuai dengan nama satuan yang tersedia di Master Data → Satuan (case-insensitive).
        </Typography.Text>
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer', marginTop: 12 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.backgroundColor = '#eff6ff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <Upload size={32} style={{ margin: '0 auto 12px', color: '#9ca3af', display: 'block' }} />
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Klik untuk pilih file .xlsx</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
      </Card>

      {rows.length > 0 && (
        <Card
          title={
            <Flex justify="space-between" align="center">
              <Typography.Text strong>Preview ({rows.length} baris)</Typography.Text>
              <Space>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 14 }}>
                  <CheckCircle size={14} /> {validRows.length} valid
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontSize: 14 }}>
                  <XCircle size={14} /> {invalidRows.length} error
                </span>
              </Space>
            </Flex>
          }
          bodyStyle={{ padding: 0 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  {['#', 'Nama', 'SKU', 'Kategori', 'Satuan', 'Harga Beli', 'Harga Jual', 'PPN', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.rowNum} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: row.valid ? 'transparent' : '#fef2f2' }}>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{row.rowNum}</td>
                    <td style={{ padding: '8px 12px', color: '#111827' }}>{row.data.name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151', fontFamily: 'monospace' }}>{row.data.sku || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.data.category || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.displayUnit || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(row.data.buy_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(row.data.sell_price)}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.data.is_taxable ? 'Ya' : 'Tidak'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {row.valid ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a' }}><CheckCircle size={12} /> Valid</span>
                      ) : (
                        <span title={row.errors.join('\n')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', cursor: 'help' }}>
                          <XCircle size={12} /> {row.errors.length} error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invalidRows.length > 0 && (
            <div style={{ padding: 16, borderTop: '1px solid #fee2e2', backgroundColor: '#fef2f2' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#b91c1c', marginBottom: 8 }}>Detail error:</p>
              <ul style={{ fontSize: 12, color: '#dc2626', margin: 0, paddingLeft: 16 }}>
                {invalidRows.map(row => (
                  <li key={row.rowNum} style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>Baris {row.rowNum}:</span> {row.errors.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {validRows.length > 0 && !summary && (
        <Card>
          {importing && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Mengimpor...</span><span>{progress}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: 9999, height: 8 }}>
                <div style={{ backgroundColor: '#2563eb', height: 8, borderRadius: 9999, transition: 'width 0.3s ease', width: `${progress}%` }} />
              </div>
            </div>
          )}
          <button
            onClick={handleImport}
            disabled={importing}
            style={{ width: '100%', padding: '8px 0', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, fontWeight: 500, border: 'none', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}
          >
            {importing ? `Mengimpor... (${progress}%)` : `Import ${validRows.length} Produk Valid`}
          </button>
        </Card>
      )}

      {summary && (
        <Card title={<Typography.Text strong>Hasil Import</Typography.Text>}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                <CheckCircle style={{ color: '#16a34a', flexShrink: 0 }} size={28} />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>{summary.success}</div>
                  <div style={{ fontSize: 14, color: '#16a34a' }}>Produk berhasil diimpor</div>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                <XCircle style={{ color: '#ef4444', flexShrink: 0 }} size={28} />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#b91c1c' }}>{summary.failed}</div>
                  <div style={{ fontSize: 14, color: '#dc2626' }}>Gagal diimpor</div>
                </div>
              </div>
            </Col>
          </Row>
          {summary.errors.length > 0 && (
            <Alert type="error" style={{ marginTop: 16 }} description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {summary.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            } />
          )}
          <Space style={{ marginTop: 16 }}>
            <button
              onClick={() => navigate('/master/products')}
              style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer' }}
            >
              Lihat Daftar Produk
            </button>
            <button
              onClick={() => { setRows([]); setSummary(null); setProgress(0); if (fileRef.current) fileRef.current.value = '' }}
              style={{ padding: '8px 16px', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, backgroundColor: 'white', cursor: 'pointer' }}
            >
              Import Lagi
            </button>
          </Space>
        </Card>
      )}
    </Space>
  )
}
