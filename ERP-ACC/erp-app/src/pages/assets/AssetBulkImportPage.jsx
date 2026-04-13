import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ArrowLeft, Download, Upload, CheckCircle, XCircle } from 'lucide-react'
import { createAsset } from '../../services/assetService'
import { listCategories } from '../../services/assetCategoryService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'

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
      alert('Pilih akun kas/bank terlebih dahulu.')
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
    <div className="space-y-6 p-6">
      <button
        onClick={() => navigate('/assets')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={18} /> Kembali ke Daftar Aset
      </button>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Import Aset</h1>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm"
        >
          <Download size={16} /> Download Template
        </button>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Upload File Excel</h2>
        <p className="text-sm text-gray-500">
          Download template di atas, isi data aset, lalu upload file .xlsx.
          Format tanggal: <code className="bg-gray-100 px-1 rounded">YYYY-MM-DD</code>.
        </p>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <Upload size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-gray-500">Klik untuk pilih file .xlsx</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Preview rows */}
      {rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h2 className="font-semibold text-gray-800">Preview ({rows.length} baris)</h2>
            <div className="flex gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle size={14} /> {validRows.length} valid
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <XCircle size={14} /> {invalidRows.length} error
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-gray-500">Nama</th>
                  <th className="px-3 py-2 text-left text-gray-500">Kategori</th>
                  <th className="px-3 py-2 text-left text-gray-500">Tgl Perolehan</th>
                  <th className="px-3 py-2 text-right text-gray-500">Harga</th>
                  <th className="px-3 py-2 text-right text-gray-500">Residu</th>
                  <th className="px-3 py-2 text-right text-gray-500">Umur (bln)</th>
                  <th className="px-3 py-2 text-left text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.rowNum} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2 text-gray-500">{row.rowNum}</td>
                    <td className="px-3 py-2 text-gray-900">{row.data.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{row.data.category_id ? categories.find(c => c.id === row.data.category_id)?.code : '—'}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{row.data.acquisition_date || '—'}</td>
                    <td className="px-3 py-2 text-right">{row.data.acquisition_cost ? formatCurrency(row.data.acquisition_cost) : '—'}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(row.data.salvage_value)}</td>
                    <td className="px-3 py-2 text-right">{row.data.useful_life_months || '—'}</td>
                    <td className="px-3 py-2">
                      {row.valid ? (
                        <span className="flex items-center gap-1 text-green-600"><CheckCircle size={12} /> Valid</span>
                      ) : (
                        <span title={row.errors.join('\n')} className="flex items-center gap-1 text-red-600 cursor-help">
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
            <div className="p-4 border-t border-red-100 bg-red-50">
              <p className="text-xs font-medium text-red-700 mb-2">Detail error:</p>
              <ul className="text-xs text-red-600 space-y-1">
                {invalidRows.map(row => (
                  <li key={row.rowNum}>
                    <span className="font-medium">Baris {row.rowNum}:</span> {row.errors.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Payment selector + import button */}
      {validRows.length > 0 && !summary && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Pembayaran</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bayar dari Akun Kas/Bank <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={e => setPaymentAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">-- Pilih akun --</option>
              {cashBankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Akan diterapkan untuk semua {validRows.length} baris yang valid.
            </p>
          </div>

          {/* Progress bar */}
          {importing && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Mengimpor...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !paymentAccountId}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
          >
            {importing ? `Mengimpor... (${progress}%)` : `Import ${validRows.length} Aset Valid`}
          </button>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Hasil Import</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="text-green-600 shrink-0" size={28} />
              <div>
                <div className="text-2xl font-bold text-green-700">{summary.success}</div>
                <div className="text-sm text-green-600">Aset berhasil diimpor</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
              <XCircle className="text-red-500 shrink-0" size={28} />
              <div>
                <div className="text-2xl font-bold text-red-700">{summary.failed}</div>
                <div className="text-sm text-red-600">Gagal diimpor</div>
              </div>
            </div>
          </div>
          {summary.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <ul className="text-xs text-red-600 space-y-1">
                {summary.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/assets')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Lihat Daftar Aset
            </button>
            <button
              onClick={() => { setRows([]); setSummary(null); setProgress(0); if (fileRef.current) fileRef.current.value = '' }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              Import Lagi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
