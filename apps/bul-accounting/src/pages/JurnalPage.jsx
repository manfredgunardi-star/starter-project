import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getJournals, deleteJournal, getJournal, removeInvoicePayment, getTrucks, getCustomCOA, getCOAOverrides, formatCurrency, batchImportJournals } from '../utils/accounting'
import { getMergedCOA } from '../data/chartOfAccounts'
import { exportJournalsToExcel } from '../utils/exportUtils'
import JournalEntryForm from '../components/JournalEntryForm'
import JournalList from '../components/JournalList'
import DateFilterBar from '../components/DateFilterBar'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, RefreshCw, Search, FileSpreadsheet, Upload, X, AlertCircle, CheckCircle } from 'lucide-react'

// ─── Helper: parse angka dari string (handle format ribuan dengan titik) ────
function parseNumber(str) {
  const s = (str || '').trim()
  if (!s) return 0
  const parts = s.split('.')
  // Jika >1 titik → titik adalah pemisah ribuan (format ID)
  if (parts.length > 2) return parseFloat(s.replace(/\./g, '')) || 0
  // Jika ada koma → koma adalah desimal (format ID)
  return parseFloat(s.replace(/,/g, '.')) || 0
}

// ─── Import Jurnal Modal ──────────────────────────────────────────────────────
function ImportJurnalModal({ mergedCOA, onSaved, onClose, currentUser }) {
  const [step, setStep] = React.useState('upload') // 'upload' | 'preview' | 'result'
  const [parsed, setParsed] = React.useState([])
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [fileError, setFileError] = React.useState('')

  const validCodes = React.useMemo(
    () => new Set(mergedCOA.filter(a => a.type === 'detail' && !a.inactive).map(a => a.code)),
    [mergedCOA]
  )

  const downloadTemplate = () => {
    const rows = [
      'No.Jurnal;Tanggal;Deskripsi Jurnal;Kode Akun;Debit;Kredit;Keterangan Baris',
      'JU-001;2025-12-05;Penjualan jasa angkut;1112;5000000;;Terima transfer BCA',
      'JU-001;2025-12-05;Penjualan jasa angkut;4100;;5000000;Pendapatan jasa angkut',
      'JU-002;2025-12-10;Bayar solar truck B1234AB;5110;1500000;;Solar unit 1',
      'JU-002;2025-12-10;Bayar solar truck B1234AB;1112;;1500000;Transfer BCA',
      'JU-003;2025-12-31;Penyusutan Desember 2025;5270;4500000;;Penyusutan truck',
      'JU-003;2025-12-31;Penyusutan Desember 2025;1222;;4500000;Akum. penyusutan truck',
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template-import-jurnal.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = (e) => {
    setFileError('')
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) { setFileError('File kosong atau hanya berisi header.'); return }

      const rows = lines.slice(1).map(line => {
        const p = line.split(';')
        return {
          ref:         (p[0] || '').trim(),
          date:        (p[1] || '').trim(),
          description: (p[2] || '').trim(),
          accountCode: (p[3] || '').trim(),
          debit:       parseNumber(p[4]),
          credit:      parseNumber(p[5]),
          keterangan:  (p[6] || '').trim(),
        }
      }).filter(r => r.ref)

      if (!rows.length) { setFileError('Tidak ada baris data yang valid.'); return }

      // Group by No.Jurnal
      const groups = {}
      for (const row of rows) {
        if (!groups[row.ref]) {
          groups[row.ref] = { ref: row.ref, date: row.date, description: row.description, type: 'umum', lines: [], errors: [] }
        }
        groups[row.ref].lines.push({ accountCode: row.accountCode, debit: row.debit, credit: row.credit, keterangan: row.keterangan })
      }

      // Validate each journal group
      const result = Object.values(groups).map(g => {
        const errors = []
        if (!g.date || !/^\d{4}-\d{2}-\d{2}$/.test(g.date))
          errors.push('Format tanggal tidak valid — gunakan YYYY-MM-DD (cth: 2025-12-05)')
        if (!g.description)
          errors.push('Kolom Deskripsi Jurnal kosong')
        const badCodes = g.lines.filter(l => !validCodes.has(l.accountCode)).map(l => l.accountCode).filter(Boolean)
        if (badCodes.length)
          errors.push(`Kode akun tidak dikenal: ${[...new Set(badCodes)].join(', ')}`)
        const totalDr = g.lines.reduce((s, l) => s + l.debit, 0)
        const totalCr = g.lines.reduce((s, l) => s + l.credit, 0)
        if (Math.abs(totalDr - totalCr) > 0.5)
          errors.push(`Tidak balance: Debit ${formatCurrency(totalDr)} ≠ Kredit ${formatCurrency(totalCr)}`)
        return { ...g, valid: errors.length === 0, errors }
      })

      setParsed(result)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const toImport = parsed.filter(j => j.valid)
      const { success, failed } = await batchImportJournals(toImport, currentUser?.uid)
      setResult({ success: success.length, failed: failed.length + parsed.filter(j => !j.valid).length })
      setStep('result')
      onSaved()
    } catch (e) {
      setFileError(e.message || 'Gagal import jurnal')
    } finally {
      setImporting(false)
    }
  }

  const validCount   = parsed.filter(j => j.valid).length
  const invalidCount = parsed.filter(j => !j.valid).length

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Import Jurnal Umum (CSV)</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">

          {step === 'upload' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">Format CSV (pisahkan kolom dengan titik-koma):</p>
                <p className="font-mono text-xs bg-white rounded p-2 border border-blue-100">
                  No.Jurnal ; Tanggal (YYYY-MM-DD) ; Deskripsi Jurnal ; Kode Akun ; Debit ; Kredit ; Keterangan Baris
                </p>
                <p className="text-xs">Baris dengan <strong>No.Jurnal yang sama</strong> akan digabung menjadi satu jurnal. Isi angka tanpa titik/koma pemisah ribuan.</p>
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
                  <p className="text-xs text-green-600 mt-0.5">Jurnal siap diimport</p>
                </div>
                <div className={`rounded-lg p-3 text-center border ${invalidCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-2xl font-bold ${invalidCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{invalidCount}</p>
                  <p className={`text-xs mt-0.5 ${invalidCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>Jurnal bermasalah (dilewati)</p>
                </div>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {parsed.map((j, i) => (
                  <div key={i} className={`rounded-lg border p-2.5 text-xs ${j.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-700 truncate">{j.ref} — {j.date} — {j.description}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${j.valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {j.valid ? `✓ ${j.lines.length} baris` : '✗ Error'}
                      </span>
                    </div>
                    {!j.valid && j.errors.map((err, ei) => (
                      <p key={ei} className="text-red-600 mt-1 pl-2">• {err}</p>
                    ))}
                  </div>
                ))}
              </div>

              {invalidCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Jurnal bermasalah akan dilewati. Perbaiki file CSV lalu upload ulang untuk mengimport semua data.
                </div>
              )}
            </>
          )}

          {step === 'result' && result && (
            <div className="space-y-3 py-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-green-700">{result.success}</p>
                <p className="text-green-600 font-medium mt-1">jurnal berhasil diimport</p>
              </div>
              {result.failed > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                  <p className="text-red-600 text-sm mt-0.5">jurnal dilewati (tidak valid)</p>
                </div>
              )}
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
                Import {validCount} Jurnal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function JurnalPage() {
  const { currentUser, isSuperadmin } = useAuth()

  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterType, setFilterType] = useState('all')
  const [filterTruck, setFilterTruck] = useState('all')
  const [search, setSearch] = useState('')

  const [journals, setJournals] = useState([])
  const [trucks, setTrucks] = useState([])
  const [mergedCOA, setMergedCOA] = useState([])
  const [loading, setLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const loadCOA = useCallback(async () => {
    const [custom, overrides] = await Promise.all([getCustomCOA(), getCOAOverrides()])
    setMergedCOA(getMergedCOA(custom, overrides))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [js, ts] = await Promise.all([getJournals({ startDate, endDate }), getTrucks()])
      setJournals(js)
      setTrucks(ts)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { loadCOA() }, [loadCOA])
  useEffect(() => { loadData() }, [loadData])

  const filtered = journals.filter(j => {
    if (filterType !== 'all' && j.type !== filterType) return false
    if (filterTruck !== 'all' && j.truckId !== filterTruck) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        j.description?.toLowerCase().includes(q) ||
        j.lines?.some(l => l.keterangan?.toLowerCase().includes(q) || l.accountCode?.includes(q))
      )
    }
    return true
  })

  const totalDebit = filtered.reduce((s, j) =>
    s + (j.lines?.reduce((ls, l) => ls + (l.debit || 0), 0) || 0), 0)
  const totalCredit = filtered.reduce((s, j) =>
    s + (j.lines?.reduce((ls, l) => ls + (l.credit || 0), 0) || 0), 0)

  const handleDelete = async () => {
    // Jika jurnal ini adalah pembayaran invoice, revert status invoice dulu
    const journal = await getJournal(deleteId)
    if (journal?.invoiceId) {
      await removeInvoicePayment(journal.invoiceId, deleteId)
    }
    await deleteJournal(deleteId, currentUser?.uid)
    setDeleteId(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Jurnal Umum</h1>
          <p className="text-sm text-gray-500 mt-0.5">Semua transaksi akuntansi</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => filtered.length && exportJournalsToExcel(filtered, `jurnal-${startDate}-${endDate}`)}
            disabled={!filtered.length}
            className="btn-secondary flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          {isSuperadmin() && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Import CSV
              </button>
              <button
                onClick={() => { setEditData(null); setShowForm(true) }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Tambah Jurnal
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="card space-y-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="select-field w-36">
            <option value="all">Semua Jenis</option>
            <option value="umum">Umum</option>
            <option value="kas">Kas</option>
            <option value="bank">Bank</option>
            <option value="penyesuaian">Penyesuaian</option>
            <option value="penutup">Penutup</option>
          </select>
          <select value={filterTruck} onChange={e => setFilterTruck(e.target.value)} className="select-field w-36">
            <option value="all">Semua Armada</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.nopol}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari keterangan..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-44"
            />
          </div>
          <button onClick={loadData} className="btn-secondary flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </DateFilterBar>

        {/* Summary */}
        <div className="flex flex-wrap gap-5 text-sm pt-2 border-t border-gray-100">
          <span className="text-gray-500">{filtered.length} jurnal</span>
          <span className="text-emerald-700 font-medium">Total Debit: {formatCurrency(totalDebit)}</span>
          <span className="text-rose-600 font-medium">Total Kredit: {formatCurrency(totalCredit)}</span>
        </div>
      </div>

      {/* List */}
      <JournalList
        journals={filtered}
        mergedCOA={mergedCOA}
        loading={loading}
        onEdit={isSuperadmin() ? (j) => { setEditData(j); setShowForm(true) } : null}
        onDelete={isSuperadmin() ? (id) => setDeleteId(id) : null}
      />

      {/* Form modal */}
      {showForm && (
        <JournalEntryForm
          editData={editData}
          trucks={trucks}
          mergedCOA={mergedCOA}
          onSaved={loadData}
          onClose={() => { setShowForm(false); setEditData(null) }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportJurnalModal
          mergedCOA={mergedCOA}
          currentUser={currentUser}
          onSaved={loadData}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          title="Hapus Jurnal"
          message="Jurnal akan dihapus permanen dan dicatat di audit trail. Lanjutkan?"
          confirmLabel="Hapus"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
