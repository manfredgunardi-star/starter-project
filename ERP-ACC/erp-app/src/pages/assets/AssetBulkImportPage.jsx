import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ArrowLeft, Download, Upload, CheckCircle, XCircle } from 'lucide-react'
import { createAsset } from '../../services/assetService'
import { listCategories } from '../../services/assetCategoryService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { Space, Row, Col, Card, Flex, Typography, Alert, message } from 'antd'

// ---- Template ----
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'category_code', 'acquisition_date', 'acquisition_cost',
     'salvage_value', 'useful_life_months', 'location', 'description'],
    ['Contoh Laptop', 'EQP', '2026-01-15', '15000000', '0', '48', 'Kantor Pusat', 'Laptop kerja'],
  ])
  ws['!cols'] = [
    { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Assets')
  XLSX.writeFile(wb, 'asset-import-template.xlsx')
}

// ---- Parse + validate ----
function parseRows(jsonRows, categoryMap) {
  return jsonRows.map((r, i) => {
    const rowNum = i + 2 // header = row 1
    const errors = []
    const name = String(r.name || '').trim()
    const categoryCode = String(r.category_code || '').trim().toUpperCase()
    const acquisitionDate = String(r.acquisition_date || '').trim()
    const acquisitionCost = Number(r.acquisition_cost)
    const salvageValue = Number(r.salvage_value ?? 0)
    const usefulLifeMonths = Number(r.useful_life_months)
    const location = String(r.location || '').trim()
    const description = String(r.description || '').trim()

    if (!name) errors.push('name wajib diisi')
    if (!categoryCode) errors.push('category_code wajib diisi')
    else if (!categoryMap[categoryCode]) errors.push(`category_code '${categoryCode}' tidak ditemukan`)
    if (!acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) errors.push('acquisition_date harus format YYYY-MM-DD')
    if (!acquisitionCost || acquisitionCost <= 0) errors.push('acquisition_cost harus > 0')
    if (isNaN(usefulLifeMonths) || usefulLifeMonths <= 0) errors.push('useful_life_months harus > 0')
    if (salvageValue < 0) errors.push('salvage_value tidak boleh negatif')
    if (acquisitionCost > 0 && salvageValue >= acquisitionCost) errors.push('salvage_value harus < acquisition_cost')

    const category = categoryMap[categoryCode]
    return {
      rowNum,
      valid: errors.length === 0,
      errors,
      data: {
        name,
        category_id: category?.id || null,
        acquisition_date: acquisitionDate,
        acquisition_cost: acquisitionCost,
        salvage_value: salvageValue,
        useful_life_months: usefulLifeMonths,
        location: location || null,
        description: description || null,
      },
    }
  })
}

export default function AssetBulkImportPage() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [categories, setCategories] = useState([])
  const [cashBankAccounts, setCashBankAccounts] = useState([])
  const [rows, setRows] = useState([])
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState(null) // { success, failed, errors }

  useEffect(() => {
    listCategories().then(setCategories)
    supabase
      .from('coa')
      .select('id, code, name')
      .or('code.like.1-11%,code.like.1-12%')
      .order('code')
      .then(({ data }) => setCashBankAccounts(data || []))
  }, [])

  const categoryMap = Object.fromEntries(categories.map(c => [c.code, c]))

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws)
      setRows(parseRows(json, categoryMap))
      setSummary(null)
      setProgress(0)
    }
    reader.readAsArrayBuffer(file)
  }

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)

  async function handleImport() {
    if (!paymentAccountId) {
      message.warning('Pilih akun kas/bank terlebih dahulu.')
      return
    }
    setImporting(true)
    setSummary(null)
    setProgress(0)

    let success = 0
    const errors = []

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        await createAsset({
          ...row.data,
          payment: {
            method: 'cash_bank',
            cash_bank_account_id: paymentAccountId,
            cash_bank_amount: row.data.acquisition_cost,
          },
        })
        success++
      } catch (err) {
        errors.push(`Baris ${row.rowNum} (${row.data.name}): ${err.message}`)
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setSummary({ success, failed: errors.length, errors })
    setImporting(false)
  }

  return (
    <Space direction="vertical" style={{ width: '100%', padding: 24 }}>
      <button
        onClick={() => navigate('/assets')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280' }}
        onMouseEnter={(e) => e.target.style.color = '#374151'}
        onMouseLeave={(e) => e.target.style.color = '#6b7280'}
      >
        <ArrowLeft size={18} /> Kembali ke Daftar Aset
      </button>

      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>Bulk Import Aset</Typography.Title>
        <button
          onClick={downloadTemplate}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, fontSize: 14, backgroundColor: 'white', cursor: 'pointer' }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
        >
          <Download size={16} /> Download Template
        </button>
      </Flex>

      {/* Upload area */}
      <Card title={<Typography.Text strong>Upload File Excel</Typography.Text>}>
        <Typography.Text type="secondary">
          Download template di atas, isi data aset, lalu upload file .xlsx.
          Format tanggal: <code style={{ backgroundColor: '#f3f4f6', padding: '1px 3px', borderRadius: 2 }}>YYYY-MM-DD</code>.
        </Typography.Text>
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.target.style.borderColor = '#60a5fa'; e.target.style.backgroundColor = '#eff6ff' }}
          onMouseLeave={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.backgroundColor = 'transparent' }}
        >
          <Upload size={32} style={{ margin: '0 auto 12px', color: '#9ca3af', display: 'block' }} />
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Klik untuk pilih file .xlsx</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </Card>

      {/* Preview rows */}
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
            <table style={{ minWidth: '100%', fontSize: 12 }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>Nama</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>Kategori</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>Tgl Perolehan</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>Harga</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>Residu</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>Umur (bln)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>Status</th>
                </tr>
              </thead>
              <tbody style={{ borderCollapse: 'collapse' }}>
                {rows.map((row) => (
                  <tr key={row.rowNum} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: row.valid ? 'transparent' : '#fef2f2' }}>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{row.rowNum}</td>
                    <td style={{ padding: '8px 12px', color: '#111827' }}>{row.data.name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.data.category_id ? categories.find(c => c.id === row.data.category_id)?.code : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151', fontFamily: 'monospace' }}>{row.data.acquisition_date || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.data.acquisition_cost ? formatCurrency(row.data.acquisition_cost) : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(row.data.salvage_value)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.data.useful_life_months || '—'}</td>
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

          {/* Error details */}
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

      {/* Payment selector + import button */}
      {validRows.length > 0 && !summary && (
        <Card title={<Typography.Text strong>Pembayaran</Typography.Text>}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
              Bayar dari Akun Kas/Bank <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={e => setPaymentAccountId(e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            >
              <option value="">-- Pilih akun --</option>
              {cashBankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Akan diterapkan untuk semua {validRows.length} baris yang valid.
            </p>
          </div>

          {/* Progress bar */}
          {importing && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Mengimpor...</span>
                <span>{progress}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: 9999, height: 8 }}>
                <div
                  style={{ backgroundColor: '#2563eb', height: 8, borderRadius: 9999, transition: 'width 0.3s ease', width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !paymentAccountId}
            style={{ width: '100%', padding: '8px 0', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, fontWeight: 500, border: 'none', cursor: importing || !paymentAccountId ? 'not-allowed' : 'pointer', opacity: importing || !paymentAccountId ? 0.6 : 1 }}
            onMouseEnter={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#1d4ed8')}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
          >
            {importing ? `Mengimpor... (${progress}%)` : `Import ${validRows.length} Aset Valid`}
          </button>
        </Card>
      )}

      {/* Summary */}
      {summary && (
        <Card title={<Typography.Text strong>Hasil Import</Typography.Text>}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                <CheckCircle style={{ color: '#16a34a', flexShrink: 0 }} size={28} />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>{summary.success}</div>
                  <div style={{ fontSize: 14, color: '#16a34a' }}>Aset berhasil diimpor</div>
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
            <Alert
              type="error"
              style={{ marginTop: 16 }}
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {summary.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              }
            />
          )}
          <Space style={{ marginTop: 16 }}>
            <button
              onClick={() => navigate('/assets')}
              style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
            >
              Lihat Daftar Aset
            </button>
            <button
              onClick={() => { setRows([]); setSummary(null); setProgress(0); if (fileRef.current) fileRef.current.value = '' }}
              style={{ padding: '8px 16px', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, backgroundColor: 'white', cursor: 'pointer' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
            >
              Import Lagi
            </button>
          </Space>
        </Card>
      )}
    </Space>
  )
}
