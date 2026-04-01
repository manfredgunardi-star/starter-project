import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, saveJournal, updateJournal } from '../utils/accounting'
import { getDetailAccountsDynamic } from '../data/chartOfAccounts'
import { X, Plus, Trash2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'

/**
 * Modal form untuk membuat / mengedit jurnal.
 *
 * Props:
 *   editData   – journal object saat edit, null saat create
 *   trucks     – array truck [{id, nopol, model}]
 *   mergedCOA  – hasil getMergedCOA() dari parent
 *   onSaved    – callback() setelah berhasil simpan (parent reload data)
 *   onClose    – callback() untuk tutup modal
 */
export default function JournalEntryForm({ editData, trucks = [], mergedCOA = [], onSaved, onClose }) {
  const { currentUser } = useAuth()

  const defaultLine = () => ({ accountCode: '', debit: '', credit: '', keterangan: '', truckId: '' })

  const [date, setDate] = useState(editData?.date || new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(editData?.description || '')
  const [truckId, setTruckId] = useState(editData?.truckId || '')
  const [type, setType] = useState(editData?.type || 'umum')
  const [lines, setLines] = useState(
    editData?.lines?.length >= 2
      ? editData.lines.map(l => ({ ...l, debit: l.debit || '', credit: l.credit || '' }))
      : [defaultLine(), defaultLine()]
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const detailAccounts = getDetailAccountsDynamic(mergedCOA)

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1

  const updateLine = (idx, field, value) => {
    setLines(lines.map((l, i) => (i !== idx ? l : { ...l, [field]: value })))
  }
  const addLine = () => setLines([...lines, defaultLine()])
  const removeLine = (idx) => {
    if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setError('')
    if (!date) return setError('Tanggal wajib diisi')
    if (lines.some(l => !l.accountCode)) return setError('Kode akun setiap baris wajib diisi')
    // Keterangan per-baris WAJIB
    if (lines.some(l => !l.keterangan?.trim())) return setError('Keterangan setiap baris jurnal wajib diisi')
    if (lines.some(l => (parseFloat(l.debit) || 0) === 0 && (parseFloat(l.credit) || 0) === 0))
      return setError('Nominal debit atau kredit setiap baris wajib diisi')
    if (!isBalanced) return setError(`Jurnal tidak seimbang — selisih ${formatCurrency(Math.abs(totalDebit - totalCredit))}`)

    setSaving(true)
    try {
      const journalData = {
        date,
        description, // opsional — bisa kosong
        truckId: truckId || null,
        type,
        lines: lines.map(l => ({
          accountCode: l.accountCode,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          keterangan: l.keterangan.trim(),
          truckId: l.truckId || null,
        })),
      }
      if (editData) {
        await updateJournal(editData.id, { ...journalData, updatedBy: currentUser?.uid })
      } else {
        await saveJournal({ ...journalData, createdBy: currentUser?.uid })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan jurnal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {editData ? 'Edit Jurnal' : 'Tambah Jurnal'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Jenis Jurnal</label>
              <select value={type} onChange={e => setType(e.target.value)} className="select-field">
                <option value="umum">Jurnal Umum</option>
                <option value="kas">Kas</option>
                <option value="bank">Bank</option>
                <option value="penyesuaian">Penyesuaian</option>
                <option value="penutup">Penutup</option>
              </select>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              {/* description TIDAK wajib */}
              <label className="label">
                Keterangan Jurnal{' '}
                <span className="text-gray-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input-field"
                placeholder="Keterangan jurnal keseluruhan..."
              />
            </div>
            <div>
              <label className="label">Armada</label>
              <select value={truckId} onChange={e => setTruckId(e.target.value)} className="select-field">
                <option value="">-- Tidak ada --</option>
                {trucks.map(t => (
                  <option key={t.id} value={t.id}>{t.nopol} {t.model}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Journal lines table */}
          <div>
            <label className="label">Baris Jurnal</label>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="table-header">
                    <th className="p-2 text-left border-b border-gray-200">Akun</th>
                    <th className="p-2 text-right border-b border-gray-200 w-32">Debit (Rp)</th>
                    <th className="p-2 text-right border-b border-gray-200 w-32">Kredit (Rp)</th>
                    <th className="p-2 text-left border-b border-gray-200">
                      Keterangan <span className="text-red-400">*</span>
                    </th>
                    <th className="p-2 border-b border-gray-200 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border-b border-gray-100 p-1">
                        <select
                          value={line.accountCode}
                          onChange={e => updateLine(idx, 'accountCode', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                        >
                          <option value="">-- Pilih Akun --</option>
                          {detailAccounts.map(a => (
                            <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-gray-100 p-1">
                        <input
                          type="number"
                          value={line.debit}
                          onChange={e => updateLine(idx, 'debit', e.target.value)}
                          className="w-full text-right text-sm border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          min="0"
                          placeholder="0"
                        />
                      </td>
                      <td className="border-b border-gray-100 p-1">
                        <input
                          type="number"
                          value={line.credit}
                          onChange={e => updateLine(idx, 'credit', e.target.value)}
                          className="w-full text-right text-sm border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          min="0"
                          placeholder="0"
                        />
                      </td>
                      <td className="border-b border-gray-100 p-1">
                        <input
                          type="text"
                          value={line.keterangan}
                          onChange={e => updateLine(idx, 'keterangan', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          placeholder="Keterangan baris..."
                        />
                      </td>
                      <td className="border-b border-gray-100 p-1 text-center">
                        {lines.length > 2 && (
                          <button
                            onClick={() => removeLine(idx)}
                            className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-sm">
                    <td className="p-2 border-t border-gray-200">Total</td>
                    <td className="p-2 text-right border-t border-gray-200 text-green-700">
                      {formatCurrency(totalDebit)}
                    </td>
                    <td className="p-2 text-right border-t border-gray-200 text-red-600">
                      {formatCurrency(totalCredit)}
                    </td>
                    <td className="p-2 border-t border-gray-200 text-center" colSpan={2}>
                      {isBalanced ? (
                        <span className="text-green-600 flex items-center justify-center gap-1 text-xs">
                          <CheckCircle className="w-3 h-3" /> Seimbang
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center justify-center gap-1 text-xs">
                          <AlertCircle className="w-3 h-3" />
                          Selisih {formatCurrency(Math.abs(totalDebit - totalCredit))}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button onClick={addLine} className="mt-2 btn-secondary flex items-center gap-1 text-xs py-1">
              <Plus className="w-3 h-3" /> Tambah Baris
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t shrink-0">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            {editData ? 'Simpan Perubahan' : 'Simpan Jurnal'}
          </button>
        </div>
      </div>
    </div>
  )
}
