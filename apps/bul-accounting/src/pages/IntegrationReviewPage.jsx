import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribePendingQueue, subscribeAllQueue, approveIntegrationItem, rejectIntegrationItem, cancelIntegrationItem } from '../utils/integrationUtils'
import { formatCurrency, formatDate, getTrucks } from '../utils/accounting'
import { getDetailAccounts } from '../data/chartOfAccounts'
import { Send, Lock, CheckCircle, XCircle, Clock, Eye, AlertCircle, FileText, RefreshCw, Trash2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'

// ─── Inline Journal Editor ────────────────────────────────────────────────────
function JournalEditor({ initialDate, initialDescription, initialLines, onDataChange }) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(initialDescription || '')
  const [lines, setLines] = useState(
    initialLines?.length
      ? initialLines.map(l => ({ ...l }))
      : [
          { accountCode: '', debit: 0, credit: 0, keterangan: '', truckId: '' },
          { accountCode: '', debit: 0, credit: 0, keterangan: '', truckId: '' },
        ]
  )

  const detailAccounts = getDetailAccounts()
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1

  const calcBalanced = (ls) => {
    const d = ls.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
    const c = ls.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
    return Math.abs(d - c) < 1
  }

  const updateLine = (idx, field, value) => {
    const updated = lines.map((l, i) =>
      i !== idx ? l : {
        ...l,
        [field]: field === 'debit' || field === 'credit' ? (parseFloat(value) || 0) : value,
      }
    )
    setLines(updated)
    onDataChange({ date, description, lines: updated, isBalanced: calcBalanced(updated) })
  }

  const handleDateChange = (v) => { setDate(v); onDataChange({ date: v, description, lines, isBalanced }) }
  const handleDescChange = (v) => { setDescription(v); onDataChange({ date, description: v, lines, isBalanced }) }

  const addLine = () => {
    const updated = [...lines, { accountCode: '', debit: 0, credit: 0, keterangan: '', truckId: '' }]
    setLines(updated)
    onDataChange({ date, description, lines: updated, isBalanced: calcBalanced(updated) })
  }

  const removeLine = (idx) => {
    if (lines.length <= 2) return
    const updated = lines.filter((_, i) => i !== idx)
    setLines(updated)
    onDataChange({ date, description, lines: updated, isBalanced: calcBalanced(updated) })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Tanggal Jurnal</label>
          <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label">Deskripsi</label>
          <input type="text" value={description} onChange={e => handleDescChange(e.target.value)} className="input-field" placeholder="Deskripsi jurnal..." />
        </div>
      </div>

      <div>
        <label className="label mb-1">Baris Jurnal</label>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left border border-gray-200 w-48">Akun</th>
                <th className="p-2 text-right border border-gray-200 w-28">Debit (Rp)</th>
                <th className="p-2 text-right border border-gray-200 w-28">Kredit (Rp)</th>
                <th className="p-2 text-left border border-gray-200">Keterangan</th>
                <th className="p-2 border border-gray-200 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="p-1 border border-gray-200">
                    <select
                      value={line.accountCode}
                      onChange={e => updateLine(idx, 'accountCode', e.target.value)}
                      className="w-full text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded p-1"
                    >
                      <option value="">-- Pilih Akun --</option>
                      {detailAccounts.map(a => (
                        <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1 border border-gray-200">
                    <input
                      type="number"
                      min="0"
                      value={line.debit || ''}
                      onChange={e => updateLine(idx, 'debit', e.target.value)}
                      className="w-full text-xs text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded p-1"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-1 border border-gray-200">
                    <input
                      type="number"
                      min="0"
                      value={line.credit || ''}
                      onChange={e => updateLine(idx, 'credit', e.target.value)}
                      className="w-full text-xs text-right border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded p-1"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-1 border border-gray-200">
                    <input
                      type="text"
                      value={line.keterangan || ''}
                      onChange={e => updateLine(idx, 'keterangan', e.target.value)}
                      className="w-full text-xs border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded p-1"
                      placeholder="Keterangan baris..."
                    />
                  </td>
                  <td className="p-1 border border-gray-200 text-center">
                    <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 text-xs" title="Hapus baris">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-xs">
                <td className="p-2 border border-gray-200">Total</td>
                <td className={`p-2 border border-gray-200 text-right font-mono ${!isBalanced ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(totalDebit)}
                </td>
                <td className={`p-2 border border-gray-200 text-right font-mono ${!isBalanced ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(totalCredit)}
                </td>
                <td colSpan={2} className="p-2 border border-gray-200">
                  {isBalanced
                    ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Balance</span>
                    : <span className="text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Tidak Balance</span>
                  }
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={addLine} className="mt-2 text-xs text-blue-600 hover:underline">+ Tambah Baris</button>
      </div>
    </div>
  )
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({ item, onClose, onApproved, onRejected }) {
  const { currentUser } = useAuth()
  const [mode, setMode] = useState('approve') // 'approve' | 'reject'
  const [journalData, setJournalData] = useState({
    date: item.tanggal?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    description: item.suggestedJournal?.description || '',
    lines: item.suggestedJournal?.lines || [],
    isBalanced: true,
  })
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleApprove = async () => {
    if (!journalData.isBalanced) { setError('Jurnal belum balance. Periksa kembali debit dan kredit.'); return }
    if (!journalData.date) { setError('Tanggal jurnal wajib diisi.'); return }
    if (journalData.lines.some(l => !l.accountCode)) { setError('Semua baris jurnal harus memiliki akun.'); return }
    if (journalData.lines.some(l => !l.keterangan?.trim())) { setError('Keterangan setiap baris jurnal wajib diisi.'); return }

    setLoading(true); setError('')
    try {
      await approveIntegrationItem(
        item,
        journalData.lines,
        journalData.date,
        journalData.description,
        currentUser?.uid || currentUser?.email || 'unknown'
      )
      onApproved()
    } catch (e) {
      setError('Gagal approve: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('Alasan penolakan wajib diisi.'); return }
    setLoading(true); setError('')
    try {
      await rejectIntegrationItem(item, rejectReason, currentUser?.uid || currentUser?.email || 'unknown')
      onRejected()
    } catch (e) {
      setError('Gagal reject: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-gray-800">
              Review {item.type === 'uang_jalan' ? 'Uang Jalan' : 'Invoice'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {item.type === 'uang_jalan' ? item.nomorSJ : item.noInvoice} — dikirim oleh {item.sentBy}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Warnings master data mismatch */}
          {item.warnings?.length > 0 && (
            <div className="border border-orange-300 rounded-xl p-4 bg-orange-50">
              <h3 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
                <AlertCircle size={14} /> Peringatan Master Data
              </h3>
              <ul className="space-y-1">
                {item.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-orange-700 flex items-start gap-2">
                    <AlertCircle size={11} className="mt-0.5 flex-shrink-0" /> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Data sumber (read-only) */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText size={14} /> Data dari BUL-Monitor
            </h3>
            {item.type === 'uang_jalan' ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><p className="text-gray-500">No. SJ</p><p className="font-semibold">{item.nomorSJ}</p></div>
                  <div><p className="text-gray-500">Tanggal</p><p className="font-semibold">{formatDate(item.tanggal)}</p></div>
                  <div><p className="text-gray-500">Supir</p><p className="font-semibold">{item.namaSupir}</p></div>
                  <div><p className="text-gray-500">No. Polisi</p><p className="font-semibold">{item.nomorPolisi || '-'}</p></div>
                  <div><p className="text-gray-500">Rute</p><p className="font-semibold">{item.rute}</p></div>
                  <div><p className="text-gray-500">PT</p><p className="font-semibold">{item.pt}</p></div>
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-gray-500">Uang Jalan</p>
                    <p className="font-bold text-blue-700 text-base">{formatCurrency(item.uangJalan)}</p>
                  </div>
                </div>

                {/* Info Invoice terkait */}
                {item.invoiceInfo ? (
                  <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                    <p className="font-semibold text-blue-800 mb-2 flex items-center gap-1">
                      <FileText size={12} /> SJ ini sudah masuk Invoice:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-gray-500">No. Invoice</p><p className="font-semibold text-blue-700">{item.invoiceInfo.noInvoice}</p></div>
                      <div><p className="text-gray-500">Tgl Invoice</p><p className="font-semibold">{formatDate(item.invoiceInfo.tglInvoice)}</p></div>
                    </div>
                    {item.invoiceInfo.otherSJNomors?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-gray-500 mb-1">SJ lain dalam invoice yang sama:</p>
                        <div className="flex flex-wrap gap-1">
                          {item.invoiceInfo.otherSJNomors.map((nomor, i) => (
                            <span key={i} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{nomor}</span>
                          ))}
                        </div>
                        <p className="text-blue-600 mt-1 text-xs">
                          ⚠️ Pastikan SJ-SJ di atas juga sudah atau akan dijurnal agar HPP invoice konsisten.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-orange-200 rounded-lg p-3 bg-orange-50">
                    <p className="text-orange-700 text-xs flex items-center gap-1">
                      <AlertCircle size={12} />
                      SJ ini <strong>belum diinvoice</strong> di BUL-Monitor. Jurnal WIP (akun 1151) akan dicatat, HPP diakui saat invoice disetujui.
                    </p>
                  </div>
                )}

                {/* Biaya tambahan per SJ */}
                {item.biayaTambahan?.length > 0 && (
                  <div className="border border-yellow-200 rounded-lg p-3 bg-yellow-50 mt-3">
                    <p className="font-semibold text-yellow-800 text-xs mb-2 flex items-center gap-1">
                      <DollarSign size={12} /> Biaya Tambahan ({item.biayaTambahan.length} item)
                    </p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-yellow-100">
                          <th className="p-1.5 text-left border border-yellow-200">Jenis</th>
                          <th className="p-1.5 text-left border border-yellow-200">Keterangan</th>
                          <th className="p-1.5 text-right border border-yellow-200">Nominal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.biayaTambahan.map((b, i) => (
                          <tr key={i}>
                            <td className="p-1.5 border border-yellow-200">{b.jenisBiaya || '-'}</td>
                            <td className="p-1.5 border border-yellow-200">{b.keteranganBiaya || '-'}</td>
                            <td className="p-1.5 border border-yellow-200 text-right font-mono">{formatCurrency(b.nominal)}</td>
                          </tr>
                        ))}
                        <tr className="bg-yellow-100 font-semibold">
                          <td colSpan={2} className="p-1.5 border border-yellow-200">Total Biaya Tambahan</td>
                          <td className="p-1.5 border border-yellow-200 text-right font-mono">
                            {formatCurrency(item.biayaTambahan.reduce((s, b) => s + (Number(b.nominal) || 0), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-yellow-700 text-xs mt-1.5">
                      💡 Jurnal biaya tambahan sudah dimasukkan ke baris jurnal di bawah (akun 5130 - Upah Sopir). Akuntan dapat mengubah akun sesuai kebutuhan.
                    </p>
                  </div>
                )}
              </div>
            ) : item.type === 'transaksi_kas' ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-gray-500">Tanggal</p><p className="font-semibold">{formatDate(item.tanggal)}</p></div>
                  <div>
                    <p className="text-gray-500">Tipe</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${item.tipe === 'pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {item.tipe === 'pemasukan' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {item.tipe === 'pemasukan' ? 'Kas Masuk' : 'Kas Keluar'}
                    </span>
                  </div>
                  <div><p className="text-gray-500">PT / Pihak</p><p className="font-semibold">{item.pt || '-'}</p></div>
                </div>
                <div>
                  <p className="text-gray-500">Keterangan</p>
                  <p className="font-semibold">{item.keterangan}</p>
                </div>
                <div>
                  <p className="text-gray-500">Nominal</p>
                  <p className={`font-bold text-lg ${item.tipe === 'pemasukan' ? 'text-green-700' : 'text-red-700'}`}>
                    {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                  </p>
                </div>
                {item.tipe === 'pengeluaran' && (
                  <div className="border border-orange-200 rounded-lg p-2 bg-orange-50">
                    <p className="text-orange-700 text-xs flex items-center gap-1">
                      <AlertCircle size={11} />
                      Akun beban (Debit) dikosongkan — akuntan wajib memilih akun yang sesuai sebelum menyetujui.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-gray-500">No. Invoice</p><p className="font-semibold">{item.noInvoice}</p></div>
                  <div><p className="text-gray-500">Tanggal</p><p className="font-semibold">{formatDate(item.tanggal)}</p></div>
                  <div><p className="text-gray-500">PT</p><p className="font-semibold">{item.pt}</p></div>
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left border border-gray-200">No. SJ</th>
                      <th className="p-2 text-left border border-gray-200">Tanggal</th>
                      <th className="p-2 text-left border border-gray-200">Rute</th>
                      <th className="p-2 text-right border border-gray-200">Qty</th>
                      <th className="p-2 text-right border border-gray-200">Nilai</th>
                      <th className="p-2 text-right border border-gray-200">Uang Jalan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.suratJalanList || []).map((sj, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="p-2 border border-gray-200">{sj.nomorSJ}</td>
                        <td className="p-2 border border-gray-200">{formatDate(sj.tanggal)}</td>
                        <td className="p-2 border border-gray-200">{sj.rute}</td>
                        <td className="p-2 border border-gray-200 text-right">{sj.qtyBongkar} {sj.satuan}</td>
                        <td className="p-2 border border-gray-200 text-right font-mono">{formatCurrency(sj.nilai)}</td>
                        <td className="p-2 border border-gray-200 text-right font-mono">{formatCurrency(sj.uangJalan)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="p-2 border border-gray-200">Total</td>
                      <td className="p-2 border border-gray-200 text-right">{item.totalQty}</td>
                      <td className="p-2 border border-gray-200 text-right font-mono text-blue-700">{formatCurrency(item.totalNilai)}</td>
                      <td className="p-2 border border-gray-200 text-right font-mono text-orange-600">{formatCurrency(item.totalUJ ?? item.suratJalanList?.reduce((s, sj) => s + (sj.uangJalan || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
                {/* Ringkasan kalkulasi piutang net */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nilai Invoice (Bruto)</span>
                    <span className="font-mono font-semibold">{formatCurrency(item.totalNilai)}</span>
                  </div>
                  <div className="flex justify-between text-orange-700">
                    <span>− Total Uang Jalan (Uang Muka Pelanggan)</span>
                    <span className="font-mono">({formatCurrency(item.totalUJ ?? item.suratJalanList?.reduce((s, sj) => s + (sj.uangJalan || 0), 0))})</span>
                  </div>
                  {(item.totalBiayaLain > 0) && (
                    <div className="flex justify-between text-gray-600">
                      <span>HPP Biaya Tambahan (non-upah, dari WIP)</span>
                      <span className="font-mono">{formatCurrency(item.totalBiayaLain)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-blue-300 pt-1 font-semibold text-blue-800">
                    <span>Piutang Bersih (Dr 1121)</span>
                    <span className="font-mono">{formatCurrency(item.piutangNet ?? (item.totalNilai - (item.totalUJ ?? 0)))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('approve')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${mode === 'approve' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              <CheckCircle size={15} /> Setujui & Buat Jurnal
            </button>
            <button
              onClick={() => setMode('reject')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${mode === 'reject' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              <XCircle size={15} /> Tolak
            </button>
          </div>

          {/* Approve: Journal Editor */}
          {mode === 'approve' && (
            <div className="border border-green-200 rounded-xl p-4 bg-green-50/30">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-600" /> Jurnal yang akan dibuat
                <span className="text-xs font-normal text-gray-400">(bisa diedit sebelum menyetujui)</span>
              </h3>
              <JournalEditor
                initialDate={journalData.date}
                initialDescription={journalData.description}
                initialLines={journalData.lines}
                onDataChange={setJournalData}
              />
            </div>
          )}

          {/* Reject: Reason */}
          {mode === 'reject' && (
            <div className="border border-red-200 rounded-xl p-4 bg-red-50/30">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <XCircle size={14} className="text-red-600" /> Alasan Penolakan
              </h3>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="input-field text-sm w-full"
                rows={3}
                placeholder="Tuliskan alasan penolakan agar operator bul-monitor bisa memperbaiki data..."
              />
              <p className="text-xs text-gray-400 mt-1">Data SJ/Invoice akan dikembalikan ke status sebelumnya dan bisa diedit ulang.</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 justify-end rounded-b-2xl">
          <button onClick={onClose} disabled={loading} className="btn-secondary text-sm">Batal</button>
          {mode === 'approve' ? (
            <button onClick={handleApprove} disabled={loading || !journalData.isBalanced} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              <CheckCircle size={15} />
              {loading ? 'Memproses...' : 'Setujui & Buat Jurnal'}
            </button>
          ) : (
            <button onClick={handleReject} disabled={loading || !rejectReason.trim()} className="btn-danger text-sm flex items-center gap-2 disabled:opacity-50">
              <XCircle size={15} />
              {loading ? 'Memproses...' : 'Tolak'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────
function CancelModal({ item, onClose, onCancelled }) {
  const { currentUser } = useAuth()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCancel = async () => {
    if (!reason.trim()) { setError('Alasan pembatalan wajib diisi.'); return }
    setLoading(true); setError('')
    try {
      await cancelIntegrationItem(item, reason, currentUser?.uid || currentUser?.email || 'unknown')
      onCancelled()
    } catch (e) {
      setError('Gagal membatalkan: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Trash2 size={16} className="text-red-600" /> Batalkan Jurnal
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <p className="font-semibold mb-1">⚠️ Tindakan ini akan:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Menghapus jurnal terkait dari Pembukuan</li>
            <li>Mengembalikan status SJ/Invoice di BUL-Monitor menjadi dapat diedit kembali</li>
            <li>Tidak dapat dibatalkan setelah dikonfirmasi</li>
          </ul>
          <p className="mt-2 font-semibold">
            {item.type === 'uang_jalan' ? item.nomorSJ : item.noInvoice}
            {item.journalId && <span className="font-normal ml-1 text-xs">(Jurnal: {item.journalId})</span>}
          </p>
        </div>
        <div className="space-y-2">
          <label className="label">Alasan Pembatalan</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="input-field text-sm w-full"
            rows={3}
            placeholder="Tuliskan alasan pembatalan jurnal..."
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 mt-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={loading} className="btn-secondary text-sm flex-1">Batal</button>
          <button
            onClick={handleCancel}
            disabled={loading || !reason.trim()}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {loading ? 'Memproses...' : 'Batalkan Jurnal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IntegrationReviewPage() {
  const { currentUser, userRole } = useAuth()
  const [allItems, setAllItems] = useState([])
  const [tab, setTab] = useState('pending')   // 'pending' | 'history'
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'uang_jalan' | 'invoice'
  const [selectedItem, setSelectedItem] = useState(null)
  const [cancelItem, setCancelItem] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkCancelConfirm, setBulkCancelConfirm] = useState(false)
  const [bulkCancelReason, setBulkCancelReason] = useState('')
  const [bulkCancelLoading, setBulkCancelLoading] = useState(false)

  useEffect(() => {
    const unsub = subscribeAllQueue(setAllItems)
    return () => unsub()
  }, [])

  // Reset seleksi saat ganti tab atau filter
  useEffect(() => {
    setSelectedIds(new Set())
    setBulkConfirm(false)
    setBulkCancelConfirm(false)
    setBulkCancelReason('')
  }, [tab, typeFilter])

  const pendingItems = allItems.filter(i => i.status === 'pending')
  const historyItems = allItems.filter(i => i.status !== 'pending')

  const displayItems = (tab === 'pending' ? pendingItems : historyItems)
    .filter(i => typeFilter === 'all' || i.type === typeFilter)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setSelectedItem(null)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const isSuperadmin = userRole === 'superadmin'

  // Item eligible untuk bulk approve: suggested journal sudah lengkap dan balance
  const isEligibleForBulk = (item) => {
    const lines = item.suggestedJournal?.lines || []
    if (lines.length === 0 || !item.tanggal) return false
    if (lines.some(l => !l.accountCode)) return false
    if (lines.some(l => !l.keterangan?.trim())) return false
    const totalD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
    const totalC = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
    return Math.abs(totalD - totalC) < 1
  }

  const eligibleInView = tab === 'pending' ? displayItems.filter(isEligibleForBulk) : []
  const selectedInView = eligibleInView.filter(i => selectedIds.has(i.id))
  const allInViewSelected = eligibleInView.length > 0 && selectedInView.length === eligibleInView.length

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleSelectAll = () => setSelectedIds(prev => {
    const next = new Set(prev)
    if (allInViewSelected) { eligibleInView.forEach(i => next.delete(i.id)) }
    else { eligibleInView.forEach(i => next.add(i.id)) }
    return next
  })

  const handleBulkApprove = async () => {
    const toApprove = selectedInView
    setBulkLoading(true); setBulkConfirm(false)
    let berhasil = 0, gagal = 0
    const gagalList = []
    for (const item of toApprove) {
      try {
        await approveIntegrationItem(
          item,
          item.suggestedJournal.lines,
          item.tanggal.slice(0, 10),
          item.suggestedJournal.description || item.nomorSJ || item.noInvoice || '',
          currentUser?.uid || currentUser?.email || 'unknown'
        )
        berhasil++
      } catch (e) {
        gagal++
        gagalList.push(item.type === 'uang_jalan' ? item.nomorSJ : item.noInvoice)
      }
    }
    setBulkLoading(false)
    setSelectedIds(new Set())
    const gagalText = gagal > 0 ? ` ${gagal} gagal: ${gagalList.join(', ')}` : ''
    showSuccess(`✅ ${berhasil} item berhasil diapprove.${gagalText}`)
  }

  // Bulk cancel (history tab) — hanya item status 'approved', hanya superadmin
  const isEligibleForBulkCancel = (item) => isSuperadmin && item.status === 'approved'

  const eligibleCancelInView = tab === 'history' ? displayItems.filter(isEligibleForBulkCancel) : []
  const selectedCancelInView = eligibleCancelInView.filter(i => selectedIds.has(i.id))
  const allCancelInViewSelected = eligibleCancelInView.length > 0 && selectedCancelInView.length === eligibleCancelInView.length

  const toggleSelectAllCancel = () => setSelectedIds(prev => {
    const next = new Set(prev)
    if (allCancelInViewSelected) { eligibleCancelInView.forEach(i => next.delete(i.id)) }
    else { eligibleCancelInView.forEach(i => next.add(i.id)) }
    return next
  })

  const handleBulkCancel = async () => {
    if (!bulkCancelReason.trim()) return
    const toCancel = selectedCancelInView
    setBulkCancelLoading(true); setBulkCancelConfirm(false)
    let berhasil = 0, gagal = 0
    const gagalList = []
    for (const item of toCancel) {
      try {
        await cancelIntegrationItem(item, bulkCancelReason.trim(), currentUser?.uid || currentUser?.email || 'unknown')
        berhasil++
      } catch (e) {
        gagal++
        gagalList.push(item.type === 'uang_jalan' ? item.nomorSJ : item.noInvoice)
      }
    }
    setBulkCancelLoading(false)
    setSelectedIds(new Set())
    setBulkCancelReason('')
    const gagalText = gagal > 0 ? ` ${gagal} gagal: ${gagalList.join(', ')}` : ''
    showSuccess(`✅ ${berhasil} jurnal berhasil dibatalkan.${gagalText}`)
  }

  const statusBadge = (status) => {
    const map = {
      pending: { color: 'bg-blue-100 text-blue-700', icon: <Clock size={11} />, label: 'Menunggu Review' },
      approved: { color: 'bg-green-100 text-green-700', icon: <CheckCircle size={11} />, label: 'Disetujui' },
      rejected: { color: 'bg-red-100 text-red-700', icon: <XCircle size={11} />, label: 'Ditolak' },
      cancelled: { color: 'bg-gray-100 text-gray-600', icon: <Trash2 size={11} />, label: 'Dibatalkan' },
    }
    const s = map[status] || map.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
        {s.icon} {s.label}
      </span>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Send size={20} className="text-blue-600" /> Review Integrasi
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Data masuk dari BUL-Monitor untuk diverifikasi dan dijurnal</p>
        </div>
        {pendingItems.length > 0 && (
          <span className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full">
            {pendingItems.length} menunggu
          </span>
        )}
      </div>

      {/* Success alert */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab === 'pending' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Clock size={14} /> Menunggu Review
          {pendingItems.length > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
              {pendingItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab === 'history' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <RefreshCw size={14} /> Riwayat
        </button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'Semua' },
          { key: 'uang_jalan', label: 'Uang Jalan' },
          { key: 'invoice', label: 'Invoice' },
          { key: 'transaksi_kas', label: 'Transaksi Kas' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${typeFilter === key ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bulk Approve Bar */}
      {tab === 'pending' && eligibleInView.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-blue-800">
            <input type="checkbox" checked={allInViewSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-blue-600" />
            {allInViewSelected ? 'Batalkan Semua' : `Pilih Semua (${eligibleInView.length} item eligible)`}
          </label>
          {selectedInView.length > 0 && !bulkConfirm && (
            <>
              <span className="text-blue-600 text-sm">{selectedInView.length} dipilih</span>
              <button onClick={() => setBulkConfirm(true)} disabled={bulkLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50">
                <CheckCircle size={14} /> Approve {selectedInView.length} Item
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-blue-600 hover:text-blue-800 text-sm underline">
                Batalkan Pilihan
              </button>
            </>
          )}
          {bulkConfirm && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-amber-700 font-medium">
                ⚠️ Approve {selectedInView.length} item dengan jurnal suggested? Jurnal tidak bisa diedit.
              </span>
              <button onClick={handleBulkApprove} disabled={bulkLoading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                {bulkLoading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {bulkLoading ? 'Memproses...' : 'Ya, Approve Semua'}
              </button>
              <button onClick={() => setBulkConfirm(false)} disabled={bulkLoading}
                className="text-gray-600 hover:text-gray-800 text-sm underline disabled:opacity-50">
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Cancel Bar (history tab) */}
      {tab === 'history' && eligibleCancelInView.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-red-800">
            <input type="checkbox" checked={allCancelInViewSelected} onChange={toggleSelectAllCancel} className="w-4 h-4 accent-red-600" />
            {allCancelInViewSelected ? 'Batalkan Semua' : `Pilih Semua (${eligibleCancelInView.length} item approved)`}
          </label>
          {selectedCancelInView.length > 0 && !bulkCancelConfirm && (
            <>
              <span className="text-red-600 text-sm">{selectedCancelInView.length} dipilih</span>
              <button onClick={() => setBulkCancelConfirm(true)} disabled={bulkCancelLoading}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50">
                <Trash2 size={14} /> Batalkan {selectedCancelInView.length} Jurnal
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-red-600 hover:text-red-800 text-sm underline">
                Batalkan Pilihan
              </button>
            </>
          )}
          {bulkCancelConfirm && (
            <div className="flex flex-col gap-2 w-full mt-1">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ Batalkan {selectedCancelInView.length} jurnal? Jurnal akan dihapus dan data di BUL-Monitor akan dibuka kembali.
              </p>
              <textarea
                value={bulkCancelReason}
                onChange={e => setBulkCancelReason(e.target.value)}
                rows={2}
                placeholder="Alasan pembatalan (berlaku untuk semua item yang dipilih)..."
                className="input-field text-sm w-full max-w-lg"
              />
              <div className="flex gap-2">
                <button onClick={handleBulkCancel} disabled={bulkCancelLoading || !bulkCancelReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                  {bulkCancelLoading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {bulkCancelLoading ? 'Memproses...' : 'Ya, Batalkan Semua'}
                </button>
                <button onClick={() => { setBulkCancelConfirm(false); setBulkCancelReason('') }} disabled={bulkCancelLoading}
                  className="text-gray-600 hover:text-gray-800 text-sm underline disabled:opacity-50">
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {displayItems.length === 0 ? (
          <div className="text-center py-12">
            <Send size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">
              {tab === 'pending' ? 'Tidak ada data yang menunggu review.' : 'Belum ada riwayat.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    {tab === 'pending' && eligibleInView.length > 0 && (
                      <input type="checkbox" checked={allInViewSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                    )}
                    {tab === 'history' && eligibleCancelInView.length > 0 && (
                      <input type="checkbox" checked={allCancelInViewSelected} onChange={toggleSelectAllCancel} className="w-4 h-4 accent-red-600 cursor-pointer" />
                    )}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Jenis</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">No. SJ / Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">PT / Supir</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Rute / Deskripsi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Nominal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                  {tab === 'history' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Keterangan</th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayItems.map(item => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${selectedIds.has(item.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      {item.status === 'pending' && isEligibleForBulk(item) && (
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer" />
                      )}
                      {isEligibleForBulkCancel(item) && (
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 accent-red-600 cursor-pointer" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{formatDate(item.tanggal)}</td>
                    <td className="px-4 py-3">
                      {item.type === 'uang_jalan' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Uang Jalan</span>
                      )}
                      {item.type === 'invoice' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Invoice</span>
                      )}
                      {item.type === 'transaksi_kas' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tipe === 'pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {item.tipe === 'pemasukan' ? 'Kas Masuk' : 'Kas Keluar'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 text-xs">
                      {item.type === 'uang_jalan' ? item.nomorSJ : item.type === 'invoice' ? item.noInvoice : (item.keterangan || '-')}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {item.pt || '-'}{item.namaSupir ? ` / ${item.namaSupir}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                      {item.type === 'uang_jalan' ? item.rute : item.type === 'transaksi_kas' ? '' : item.suggestedJournal?.description}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-xs">
                      {item.type === 'uang_jalan'
                        ? formatCurrency(item.uangJalan)
                        : item.type === 'invoice'
                        ? formatCurrency(item.totalNilai)
                        : formatCurrency(item.nominal)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(item.status)}</td>
                    {tab === 'history' && (
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                        {item.status === 'approved'
                          ? `Jurnal: ${item.journalId}`
                          : item.status === 'cancelled'
                          ? item.cancellationReason || '-'
                          : item.rejectionReason || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {item.status === 'pending' ? (
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="btn-primary text-xs flex items-center gap-1"
                          >
                            <Eye size={12} /> Review
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                          >
                            <Eye size={12} /> Detail
                          </button>
                        )}
                        {item.status === 'approved' && isSuperadmin && (
                          <button
                            onClick={() => setCancelItem(item)}
                            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                            title="Batalkan jurnal"
                          >
                            <Trash2 size={12} /> Batalkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedItem && selectedItem.status === 'pending' && (
        <ReviewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onApproved={() => showSuccess(`✅ Data berhasil disetujui. Jurnal telah dibuat di Pembukuan.`)}
          onRejected={() => showSuccess(`Data telah ditolak. Operator BUL-Monitor akan diberitahu.`)}
        />
      )}

      {/* Detail Modal (history, read-only) */}
      {selectedItem && selectedItem.status !== 'pending' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">Detail Riwayat</h2>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Status</span>{statusBadge(selectedItem.status)}</div>
              <div className="flex justify-between"><span className="text-gray-500">Jenis</span><span className="font-medium">{selectedItem.type === 'uang_jalan' ? 'Uang Jalan' : selectedItem.type === 'invoice' ? 'Invoice' : selectedItem.tipe === 'pemasukan' ? 'Kas Masuk' : 'Kas Keluar'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Nomor / Keterangan</span><span className="font-medium">{selectedItem.type === 'uang_jalan' ? selectedItem.nomorSJ : selectedItem.type === 'invoice' ? selectedItem.noInvoice : selectedItem.keterangan}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tanggal</span><span>{formatDate(selectedItem.tanggal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Nominal</span><span className="font-mono font-semibold">{formatCurrency(selectedItem.type === 'uang_jalan' ? selectedItem.uangJalan : selectedItem.type === 'invoice' ? selectedItem.totalNilai : selectedItem.nominal)}</span></div>
              {selectedItem.status === 'approved' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                    <CheckCircle size={12} /> Jurnal Dibuat
                  </p>
                  <p className="text-xs text-gray-600">ID: <span className="font-mono text-green-700 select-all">{selectedItem.journalId}</span></p>
                  <p className="text-xs text-gray-500">Lihat di menu <strong>Jurnal Umum</strong> untuk detail entri.</p>
                </div>
              )}
              {selectedItem.status === 'rejected' && <div className="flex justify-between"><span className="text-gray-500">Alasan Tolak</span><span className="text-red-600 text-xs">{selectedItem.rejectionReason}</span></div>}
              {selectedItem.status === 'cancelled' && (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">Alasan Batal</span><span className="text-gray-600 text-xs">{selectedItem.cancellationReason}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Dibatalkan oleh</span><span className="text-xs">{selectedItem.cancelledBy || '-'}</span></div>
                </>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Dikirim oleh</span><span>{selectedItem.sentBy}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Direview oleh</span><span>{selectedItem.reviewedBy || '-'}</span></div>
            </div>
            <button onClick={() => setSelectedItem(null)} className="btn-secondary text-sm w-full mt-5">Tutup</button>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelItem && (
        <CancelModal
          item={cancelItem}
          onClose={() => setCancelItem(null)}
          onCancelled={() => {
            setCancelItem(null)
            showSuccess(`Jurnal berhasil dibatalkan. Status SJ/Invoice di BUL-Monitor akan dikembalikan.`)
          }}
        />
      )}
    </div>
  )
}
