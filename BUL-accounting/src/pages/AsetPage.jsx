import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAssets, saveAsset, updateAsset, saveJournal, getJournals, formatCurrency, formatDate } from '../utils/accounting'
import { DEPRECIATION_MAP, COA } from '../data/chartOfAccounts'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, X, Edit, RefreshCw, AlertCircle, Building2, TrendingDown, BookOpen, CheckCircle, Upload, FileSpreadsheet } from 'lucide-react'

// Aset tetap yang bisa dipilih (sesuai DEPRECIATION_MAP)
const ASSET_ACCOUNTS = Object.entries(DEPRECIATION_MAP).map(([code, info]) => ({
  code, name: info.name, usefulLife: info.usefulLife,
}))

// Akun detail COA (untuk validasi akun lawan)
const VALID_DETAIL_CODES = new Set(COA.filter(a => a.type === 'detail').map(a => a.code))

// Helper: nama akun dari kode
const getAkunName = (code) => {
  const a = COA.find(c => c.code === code)
  return a ? `${a.code} - ${a.name}` : code
}

// Helper: parse angka dari string (format ribuan dengan titik)
function parseNum(str) {
  const s = (str || '').trim()
  if (!s) return 0
  const parts = s.split('.')
  if (parts.length > 2) return parseFloat(s.replace(/\./g, '')) || 0
  return parseFloat(s.replace(',', '.')) || 0
}

// ─── Import Aset Modal ────────────────────────────────────────────────────────
function ImportAsetModal({ onSaved, onClose, currentUser }) {
  const [step, setStep] = React.useState('upload') // 'upload' | 'preview' | 'result'
  const [parsed, setParsed] = React.useState([])
  const [importing, setImporting] = React.useState(false)
  const [importProgress, setImportProgress] = React.useState(0)
  const [result, setResult] = React.useState(null)
  const [fileError, setFileError] = React.useState('')

  // Akun lawan yang umum untuk perolehan aset
  const AKUN_LAWAN_COMMON = [
    { code: '1111', label: '1111 - Kas Kecil (tunai)' },
    { code: '1112', label: '1112 - Bank BCA (transfer)' },
    { code: '1113', label: '1113 - Bank Mandiri (transfer)' },
    { code: '2210', label: '2210 - Hutang Bank Jangka Panjang' },
    { code: '2220', label: '2220 - Hutang Leasing Kendaraan' },
    { code: '2153', label: '2153 - Hutang Pemegang Saham' },
  ]

  const downloadTemplate = () => {
    const rows = [
      '# Akun Lawan: 1111=Kas, 1112=Bank BCA, 1113=Bank Mandiri, 2210=Hutang Bank, 2220=Hutang Leasing, 2153=Hutang Pemegang Saham',
      '# Kode Akun Aset: 1212=Bangunan, 1213=Truck, 1214=Kendaraan Ops, 1215=Alat Bengkel, 1216=Peralatan Kantor, 1217=Furnitur, 1218=Komputer, 1219=GPS',
      'Nama Aset;Kode Akun;Harga Perolehan;Tanggal Perolehan;Usia Ekonomis (thn);Akun Lawan;Keterangan',
      'Hino Dutro 130HD - B 1234 AB;1213;400000000;2022-03-15;8;2220;Kredit leasing BCA Finance',
      'Hino 500 Series - D 5678 CD;1213;550000000;2023-07-01;8;2220;Kredit leasing Mandiri Tunas Finance',
      'Toyota Kijang Innova - B 9999 ZZ;1214;180000000;2021-01-10;8;1112;Beli tunai via Bank BCA',
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template-import-aset.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = (e) => {
    setFileError('')
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      if (lines.length < 2) { setFileError('File kosong atau hanya berisi header/komentar.'); return }

      const dataRows = lines.slice(1).map(line => {
        const p = line.split(';')
        return {
          nama:          (p[0] || '').trim(),
          accountCode:   (p[1] || '').trim(),
          hargaPerolehan: parseNum(p[2]),
          tanggalPerolehan: (p[3] || '').trim(),
          usiaEkonomis:  parseInt((p[4] || '').trim()) || 0,
          akunLawan:     (p[5] || '').trim(),
          keterangan:    (p[6] || '').trim(),
        }
      }).filter(r => r.nama)

      if (!dataRows.length) { setFileError('Tidak ada baris data yang valid.'); return }

      const result = dataRows.map((row, i) => {
        const errors = []
        if (!row.nama) errors.push('Nama aset kosong')
        const depInfo = DEPRECIATION_MAP[row.accountCode]
        if (!depInfo) errors.push(`Kode akun aset tidak valid: "${row.accountCode}" — gunakan: ${Object.keys(DEPRECIATION_MAP).join(', ')}`)
        if (!row.hargaPerolehan || row.hargaPerolehan <= 0) errors.push('Harga perolehan harus > 0')
        if (!row.tanggalPerolehan || !/^\d{4}-\d{2}-\d{2}$/.test(row.tanggalPerolehan))
          errors.push('Format tanggal tidak valid — gunakan YYYY-MM-DD')
        if (!row.usiaEkonomis || row.usiaEkonomis <= 0) errors.push('Usia ekonomis harus > 0')
        if (!VALID_DETAIL_CODES.has(row.akunLawan))
          errors.push(`Akun lawan tidak valid: "${row.akunLawan}" — gunakan kode akun detail COA`)

        const penyusutanPerBulan = depInfo && row.hargaPerolehan && row.usiaEkonomis
          ? row.hargaPerolehan / (row.usiaEkonomis * 12) : 0

        return { ...row, depInfo, penyusutanPerBulan, valid: errors.length === 0, errors, rowNum: i + 2 }
      })

      setParsed(result)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleImport = async () => {
    setImporting(true)
    const success = [], failed = []
    const toImport = parsed.filter(r => r.valid)

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i]
      setImportProgress(i + 1)
      try {
        // 1. Simpan data aset
        await saveAsset({
          name: row.nama,
          accountCode: row.accountCode,
          hargaPerolehan: row.hargaPerolehan,
          tanggalPerolehan: row.tanggalPerolehan,
          usiaEkonomis: row.usiaEkonomis,
          keterangan: row.keterangan,
          penyusutanPerBulan: row.penyusutanPerBulan,
          depreciationInfo: row.depInfo || null,
          createdBy: currentUser?.uid,
          status: 'active',
          sourceImport: true,
        })
        // 2. Auto-generate jurnal perolehan: Dr [aset] / Cr [akun lawan]
        await saveJournal({
          date: row.tanggalPerolehan,
          description: `Perolehan Aset: ${row.nama}`,
          type: 'umum',
          lines: [
            {
              accountCode: row.accountCode,
              debit: row.hargaPerolehan,
              credit: 0,
              keterangan: `Perolehan ${row.nama}`,
            },
            {
              accountCode: row.akunLawan,
              debit: 0,
              credit: row.hargaPerolehan,
              keterangan: `${getAkunName(row.akunLawan)} — ${row.nama}`,
            },
          ],
          createdBy: currentUser?.uid,
          sourceImport: true,
        })
        success.push(row.nama)
      } catch (e) {
        failed.push({ nama: row.nama, reason: e.message })
      }
    }

    setResult({ success, failed, skipped: parsed.filter(r => !r.valid).length })
    setStep('result')
    onSaved()
    setImporting(false)
  }

  const validCount   = parsed.filter(r => r.valid).length
  const invalidCount = parsed.filter(r => !r.valid).length

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Import Aset Tetap (CSV)</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">

          {step === 'upload' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">Format CSV (pisahkan kolom dengan titik-koma):</p>
                <p className="font-mono text-xs bg-white rounded p-2 border border-blue-100">
                  Nama Aset ; Kode Akun ; Harga Perolehan ; Tanggal Perolehan ; Usia Ekonomis (thn) ; Akun Lawan ; Keterangan
                </p>
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold">Akun Lawan yang umum:</p>
                  <p>1112 = Bank BCA &nbsp;|&nbsp; 1113 = Bank Mandiri &nbsp;|&nbsp; 2220 = Hutang Leasing &nbsp;|&nbsp; 2210 = Hutang Bank &nbsp;|&nbsp; 2153 = Hutang Pemegang Saham</p>
                </div>
                <p className="text-xs">Import ini akan <strong>otomatis membuat jurnal perolehan</strong>: Dr [Akun Aset] / Cr [Akun Lawan] sebesar Harga Perolehan.</p>
              </div>
              <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-sm w-fit">
                <FileSpreadsheet className="w-4 h-4" /> Download Template CSV
              </button>
              <div>
                <label className="label">Upload File CSV</label>
                <input type="file" accept=".csv,.txt" onChange={handleFile}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer" />
              </div>
              {fileError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{fileError}
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{validCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Aset siap diimport</p>
                </div>
                <div className={`rounded-lg p-3 text-center border ${invalidCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-2xl font-bold ${invalidCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{invalidCount}</p>
                  <p className={`text-xs mt-0.5 ${invalidCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>Baris bermasalah (dilewati)</p>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {parsed.map((row, i) => (
                  <div key={i} className={`rounded-lg border p-3 text-xs ${row.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{row.nama}</p>
                        {row.valid && (
                          <div className="mt-1 text-gray-500 space-y-0.5">
                            <p>{row.depInfo?.name} ({row.accountCode}) • Perolehan: {formatCurrency(row.hargaPerolehan)} • {row.usiaEkonomis} thn</p>
                            <p>Jurnal: Dr {row.accountCode} / Cr {row.akunLawan} • Susut/bln: {formatCurrency(row.penyusutanPerBulan)}</p>
                          </div>
                        )}
                        {!row.valid && row.errors.map((err, ei) => (
                          <p key={ei} className="text-red-600 mt-0.5">• {err}</p>
                        ))}
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${row.valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {row.valid ? '✓ Valid' : '✗ Error'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'result' && result && (
            <div className="space-y-3 py-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-green-700">{result.success.length}</p>
                <p className="text-green-600 font-medium mt-1">aset berhasil diimport + jurnal perolehan dibuat</p>
              </div>
              {result.failed.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">{result.failed.length} aset gagal:</p>
                  {result.failed.map((f, i) => (
                    <p key={i} className="text-xs text-red-600">• {f.nama}: {f.reason}</p>
                  ))}
                </div>
              )}
              {result.skipped > 0 && (
                <p className="text-xs text-gray-400 text-center">{result.skipped} baris dilewati karena tidak valid</p>
              )}
            </div>
          )}

          {importing && (
            <div className="text-center text-sm text-gray-500">
              Mengimport aset {importProgress}/{parsed.filter(r => r.valid).length}...
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-5 pb-5 shrink-0 pt-3 border-t">
          {step === 'preview' && (
            <button onClick={() => { setParsed([]); setStep('upload') }} className="text-sm text-gray-500 hover:text-gray-700">
              ← Upload ulang
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="btn-secondary">{step === 'result' ? 'Tutup' : 'Batal'}</button>
            {step === 'preview' && validCount > 0 && (
              <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import {validCount} Aset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AsetForm({ editData, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const [name, setName]                     = useState(editData?.name || '')
  const [accountCode, setAccountCode]       = useState(editData?.accountCode || '')
  const [hargaPerolehan, setHargaPerolehan] = useState(editData?.hargaPerolehan || '')
  const [tanggalPerolehan, setTanggalPerolehan] = useState(editData?.tanggalPerolehan || '')
  const [usiaEkonomis, setUsiaEkonomis]     = useState(editData?.usiaEkonomis || '')
  const [keterangan, setKeterangan]         = useState(editData?.keterangan || '')
  const [error, setError]                   = useState('')
  const [saving, setSaving]                 = useState(false)

  // Auto-fill usia ekonomis saat pilih akun
  const handleAccountChange = (code) => {
    setAccountCode(code)
    const info = DEPRECIATION_MAP[code]
    if (info && !usiaEkonomis) setUsiaEkonomis(info.usefulLife)
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim())       return setError('Nama aset wajib diisi')
    if (!accountCode)       return setError('Kategori aset wajib dipilih')
    if (!hargaPerolehan || parseFloat(hargaPerolehan) <= 0) return setError('Harga perolehan wajib diisi')
    if (!tanggalPerolehan)  return setError('Tanggal perolehan wajib diisi')
    if (!usiaEkonomis || parseInt(usiaEkonomis) <= 0) return setError('Usia ekonomis wajib diisi')
    setSaving(true)
    try {
      const payload = {
        name: name.trim(), accountCode,
        hargaPerolehan: parseFloat(hargaPerolehan),
        tanggalPerolehan, usiaEkonomis: parseInt(usiaEkonomis),
        keterangan,
        // Penyusutan per bulan (garis lurus)
        penyusutanPerBulan: parseFloat(hargaPerolehan) / (parseInt(usiaEkonomis) * 12),
        depreciationInfo: DEPRECIATION_MAP[accountCode] || null,
      }
      if (editData) {
        await updateAsset(editData.id, { ...payload, updatedBy: currentUser?.uid })
      } else {
        await saveAsset({ ...payload, createdBy: currentUser?.uid, status: 'active' })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const previewPenyusutan = hargaPerolehan && usiaEkonomis
    ? parseFloat(hargaPerolehan) / (parseInt(usiaEkonomis) * 12)
    : null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Aset' : 'Tambah Aset Tetap'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Nama Aset</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field"
              placeholder="Contoh: Hino Dutro 130 HD - B 1234 XYZ" autoFocus />
          </div>
          <div>
            <label className="label">Kategori Aset</label>
            <select value={accountCode} onChange={e => handleAccountChange(e.target.value)} className="select-field">
              <option value="">-- Pilih Kategori --</option>
              {ASSET_ACCOUNTS.map(a => (
                <option key={a.code} value={a.code}>{a.code} - {a.name} (usia {a.usefulLife} thn)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Harga Perolehan (Rp)</label>
              <input type="number" value={hargaPerolehan} onChange={e => setHargaPerolehan(e.target.value)}
                className="input-field" placeholder="0" min="0" />
            </div>
            <div>
              <label className="label">Tanggal Perolehan</label>
              <input type="date" value={tanggalPerolehan} onChange={e => setTanggalPerolehan(e.target.value)}
                className="input-field" />
            </div>
          </div>
          <div>
            <label className="label">Usia Ekonomis (tahun)</label>
            <input type="number" value={usiaEkonomis} onChange={e => setUsiaEkonomis(e.target.value)}
              className="input-field" placeholder="8" min="1" max="50" />
          </div>

          {/* Preview penyusutan */}
          {previewPenyusutan && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm">
              <p className="text-brand-700 font-medium flex items-center gap-1">
                <TrendingDown className="w-4 h-4" /> Preview Penyusutan (Garis Lurus)
              </p>
              <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-brand-600">
                <div>Per Bulan<br /><span className="font-bold text-sm">{formatCurrency(previewPenyusutan)}</span></div>
                <div>Per Tahun<br /><span className="font-bold text-sm">{formatCurrency(previewPenyusutan * 12)}</span></div>
                <div>Total<br /><span className="font-bold text-sm">{formatCurrency(parseFloat(hargaPerolehan))}</span></div>
              </div>
            </div>
          )}

          <div>
            <label className="label">Keterangan <span className="text-gray-400 font-normal">(opsional)</span></label>
            <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)}
              className="input-field" rows={2} placeholder="Catatan tambahan..." />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            {editData ? 'Simpan Perubahan' : 'Tambah Aset'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bulk Depreciation Modal ──────────────────────────────────────────────────
// Helper: hasilkan array semua bulan (YYYY-MM) antara from dan to (inklusif)
function monthsBetween(from, to) {
  const result = []
  let [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (fy < ty || (fy === ty && fm <= tm)) {
    result.push(`${fy}-${String(fm).padStart(2, '0')}`)
    fm++; if (fm > 12) { fm = 1; fy++ }
  }
  return result
}

// Helper: cek apakah aset eligible untuk periode tertentu
function isEligibleForPeriod(asset, period) {
  const info = DEPRECIATION_MAP[asset.accountCode]
  if (!info || !asset.penyusutanPerBulan) return false
  const maxMonths = (asset.usiaEkonomis || 0) * 12
  const start = new Date(asset.tanggalPerolehan)
  const endOfPeriod = new Date(`${period}-28`)
  const months = (endOfPeriod.getFullYear() - start.getFullYear()) * 12 + (endOfPeriod.getMonth() - start.getMonth())
  return months > 0 && months <= maxMonths
}

// Helper: tanggal akhir bulan
function lastDayOfMonth(period) {
  const d = new Date(parseInt(period.slice(0, 4)), parseInt(period.slice(5, 7)), 0)
  return `${period}-${String(d.getDate()).padStart(2, '0')}`
}

function BulkDeprecModal({ assets, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const todayYM = new Date().toISOString().slice(0, 7)
  const [fromPeriod, setFromPeriod] = useState(todayYM)
  const [toPeriod, setToPeriod]     = useState(todayYM)
  const [saving, setSaving]         = useState(false)
  const [result, setResult]         = useState(null) // { success, duplicate, skipped }
  const [error, setError]           = useState('')

  // Validasi range
  const rangeValid = fromPeriod <= toPeriod

  // Bulan-bulan dalam range
  const months = rangeValid ? monthsBetween(fromPeriod, toPeriod) : []

  // Preview: semua kombinasi aset × bulan yang eligible
  const preview = months.flatMap(m =>
    assets
      .filter(a => isEligibleForPeriod(a, m))
      .map(a => ({ asset: a, period: m }))
  )

  const totalJurnalBaru  = preview.length
  const totalNominal     = preview.reduce((s, p) => s + (p.asset.penyusutanPerBulan || 0), 0)

  const handleGenerate = async () => {
    setError('')
    setSaving(true)
    const success = [], duplicate = [], skipped = []
    try {
      // Ambil semua jurnal penyesuaian yang sudah ada (sekali saja)
      const existingJournals = await getJournals({ type: 'penyesuaian' })
      // Buat Set untuk cek duplikat: "NamaAset::YYYY-MM"
      const existingKeys = new Set()
      for (const j of existingJournals) {
        for (const line of (j.lines || [])) {
          // format keterangan: "Penyusutan NamaAset — YYYY-MM"
          const m = (line.keterangan || '').match(/^Penyusutan (.+) — (\d{4}-\d{2})$/)
          if (m) existingKeys.add(`${m[1]}::${m[2]}`)
        }
      }

      for (const { asset, period } of preview) {
        const info = DEPRECIATION_MAP[asset.accountCode]
        if (!info) { skipped.push(`${asset.name} (${period})`); continue }

        const key = `${asset.name}::${period}`
        if (existingKeys.has(key)) {
          duplicate.push(`${asset.name} (${period})`)
          continue
        }

        const nominal     = asset.penyusutanPerBulan
        const keterangan  = `Penyusutan ${asset.name} — ${period}`
        await saveJournal({
          date:        lastDayOfMonth(period),
          description: `Jurnal Penyusutan ${period}`,
          type:        'penyesuaian',
          truckId:     null,
          lines: [
            { accountCode: info.expenseAccount, debit: nominal, credit: 0,       keterangan },
            { accountCode: info.accumAccount,   debit: 0,       credit: nominal, keterangan },
          ],
          createdBy: currentUser?.uid,
        })
        success.push(`${asset.name} (${period})`)
        existingKeys.add(key) // cegah duplikat dalam satu run jika periode overlap
      }

      setResult({ success, duplicate, skipped })
      if (success.length > 0) onSaved()
    } catch (e) {
      setError(e.message || 'Gagal membuat jurnal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Buat Jurnal Penyusutan</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {!result ? (
            <>
              {/* Range periode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Dari Periode</label>
                  <input type="month" value={fromPeriod} onChange={e => setFromPeriod(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label">Sampai Periode</label>
                  <input type="month" value={toPeriod} onChange={e => setToPeriod(e.target.value)} className="input-field" />
                </div>
              </div>
              {!rangeValid && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> "Dari" tidak boleh lebih besar dari "Sampai"
                </p>
              )}

              {/* Preview */}
              {rangeValid && (
                <div>
                  <p className="label mb-2">
                    Preview jurnal yang akan dibuat
                    <span className="ml-1 font-normal text-gray-400">
                      ({months.length} bulan × {assets.filter(a => DEPRECIATION_MAP[a.accountCode] && a.penyusutanPerBulan).length} aset maks)
                    </span>
                  </p>
                  {preview.length === 0 ? (
                    <p className="text-sm text-gray-400">Tidak ada aset yang memenuhi syarat untuk rentang periode ini</p>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {preview.map(({ asset, period: p }, i) => {
                        const info = DEPRECIATION_MAP[asset.accountCode]
                        return (
                          <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <p className="font-medium text-gray-800">{asset.name}</p>
                              <p className="text-xs text-gray-400">{p} · Debit {info?.expenseAccount} / Kredit {info?.accumAccount}</p>
                            </div>
                            <span className="font-semibold text-rose-600">{formatCurrency(asset.penyusutanPerBulan)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {preview.length > 0 && (
                <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-700">Total jurnal akan dibuat</span>
                    <span className="font-bold text-brand-800">{totalJurnalBaru} jurnal</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-700">Total nominal</span>
                    <span className="font-bold text-brand-800">{formatCurrency(totalNominal)}</span>
                  </div>
                  <p className="text-xs text-brand-600 pt-1">Duplikat periode yang sudah ada akan otomatis dilewati.</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}
            </>
          ) : (
            /* Result screen */
            <div className="space-y-3">
              {result.success.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="font-semibold text-green-800 flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4" /> {result.success.length} jurnal berhasil dibuat
                  </p>
                  <div className="max-h-40 overflow-y-auto">
                    {result.success.map(n => (
                      <p key={n} className="text-sm text-green-700 pl-6">• {n}</p>
                    ))}
                  </div>
                </div>
              )}
              {result.duplicate.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-yellow-800 mb-1">{result.duplicate.length} dilewati — sudah ada di Firestore</p>
                  <div className="max-h-32 overflow-y-auto">
                    {result.duplicate.map(n => (
                      <p key={n} className="text-xs text-yellow-700 pl-4">• {n}</p>
                    ))}
                  </div>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-600">{result.skipped.length} dilewati — tidak ada mapping DEPRECIATION_MAP</p>
                </div>
              )}
              {result.success.length === 0 && result.duplicate.length > 0 && (
                <p className="text-sm text-center text-gray-500">Semua jurnal untuk rentang periode ini sudah pernah dibuat.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary">{result ? 'Tutup' : 'Batal'}</button>
          {!result && (
            <button
              onClick={handleGenerate}
              disabled={saving || !rangeValid || preview.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              Generate {totalJurnalBaru} Jurnal
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AsetPage() {
  const { currentUser, isSuperadmin } = useAuth()
  const [assets, setAssets]           = useState([])
  const [loading, setLoading]         = useState(false)
  const [showForm, setShowForm]       = useState(false)
  const [editData, setEditData]       = useState(null)
  const [showDeprecModal, setShowDeprecModal] = useState(false)
  const [showImport, setShowImport]   = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try { setAssets(await getAssets()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalNilai        = assets.reduce((s, a) => s + (a.hargaPerolehan || 0), 0)
  const totalPenyusutanBln = assets.reduce((s, a) => s + (a.penyusutanPerBulan || 0), 0)

  // Hitung akumulasi penyusutan hingga hari ini
  const calcAccumDeprec = (asset) => {
    if (!asset.tanggalPerolehan || !asset.penyusutanPerBulan) return 0
    const start = new Date(asset.tanggalPerolehan)
    const now   = new Date()
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
    const maxMonths = (asset.usiaEkonomis || 0) * 12
    return Math.min(months, maxMonths) * asset.penyusutanPerBulan
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Aset Tetap</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manajemen aset tetap &amp; penyusutan</p>
        </div>
        <div className="flex gap-2">
          {isSuperadmin() && assets.length > 0 && (
            <button onClick={() => setShowDeprecModal(true)} className="btn-secondary flex items-center gap-2">
              <TrendingDown className="w-4 h-4" /> Buat Jurnal Penyusutan
            </button>
          )}
          {isSuperadmin() && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
                <Upload className="w-4 h-4" /> Import CSV
              </button>
              <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Tambah Aset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total Nilai Perolehan</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalNilai)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Penyusutan / Bulan</p>
          <p className="text-lg font-bold text-rose-600">{formatCurrency(totalPenyusutanBln)}</p>
        </div>
      </div>

      {/* Asset list */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : assets.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">Belum ada data aset tetap</div>
      ) : (
        <div className="space-y-3">
          {assets.map(a => {
            const accumDeprec  = calcAccumDeprec(a)
            const nilaiBuku    = (a.hargaPerolehan || 0) - accumDeprec
            const persenSusut  = a.hargaPerolehan ? (accumDeprec / a.hargaPerolehan) * 100 : 0
            const depInfo      = DEPRECIATION_MAP[a.accountCode]

            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-brand-600" />
                      </div>
                      <p className="font-semibold text-gray-800">{a.name}</p>
                      {depInfo && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{depInfo.name}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Harga Perolehan</p>
                        <p className="font-semibold text-gray-800">{formatCurrency(a.hargaPerolehan)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Akum. Penyusutan</p>
                        <p className="font-semibold text-rose-600">{formatCurrency(accumDeprec)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Nilai Buku</p>
                        <p className={`font-semibold ${nilaiBuku <= 0 ? 'text-gray-400' : 'text-emerald-700'}`}>
                          {nilaiBuku > 0 ? formatCurrency(nilaiBuku) : 'Sudah habis'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Usia Ekonomis</p>
                        <p className="font-semibold text-gray-700">{a.usiaEkonomis} tahun</p>
                      </div>
                    </div>
                    {/* Progress bar penyusutan */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Perolehan: {formatDate(a.tanggalPerolehan)}</span>
                        <span>{Math.min(persenSusut, 100).toFixed(0)}% tersusut</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-400 rounded-full transition-all"
                          style={{ width: `${Math.min(persenSusut, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {isSuperadmin() && (
                    <button onClick={() => { setEditData(a); setShowForm(true) }}
                      className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg shrink-0">
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <AsetForm editData={editData} onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {showDeprecModal && (
        <BulkDeprecModal assets={assets} onSaved={loadData} onClose={() => setShowDeprecModal(false)} />
      )}
      {showImport && (
        <ImportAsetModal currentUser={currentUser} onSaved={loadData} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
