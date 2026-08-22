import React, { useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getOpenInvoicesByCustomer, recordMultiInvoicePayment,
  formatCurrency, formatDate,
} from '../utils/accounting'
import { sisaTagihan, validateAllocations, summarizeAllocations } from '../utils/payments'
import { KAS_ACCOUNTS } from '../data/kasAccounts'
import { X, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

/**
 * Menerima satu pembayaran pelanggan yang melunasi beberapa invoice sekaligus.
 * Komponen ini murni UI: seluruh perhitungan dan aturan akuntansi ada di
 * utils/payments.js dan utils/accounting.js.
 */
export default function MultiPaymentModal({ customers, onSaved, onClose }) {
  const { currentUser } = useAuth()

  const [customerId, setCustomerId] = useState('')
  const [rows, setRows]             = useState([])
  const [loadingInv, setLoadingInv] = useState(false)
  const [sudahMuat, setSudahMuat]   = useState(false)

  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10))
  const [account, setAccount]       = useState('1112')
  const [keterangan, setKeterangan] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  // Error per-baris dari server (mis. saldo berubah karena user lain sudah
  // membayar invoice ini sejak modal dimuat). Digabung dengan cek.errors
  // (client-side) saat render, dan direset saat ganti pelanggan / berhasil simpan.
  const [serverErrors, setServerErrors] = useState({})

  const selectedCustomer = customers.find(c => c.id === customerId)

  const pilihCustomer = useCallback(async (id) => {
    setCustomerId(id)
    setRows([])
    setError('')
    setServerErrors({})
    setSudahMuat(false)
    if (!id) return

    setLoadingInv(true)
    try {
      const inv = await getOpenInvoicesByCustomer(id)
      setRows(inv.map(i => ({
        invoiceId: i.id,
        invoiceNo: i.invoiceNo || '',
        truckId: i.truckId || null,
        date: i.date || '',
        amount: i.amount || 0,
        totalPaid: i.totalPaid || 0,
        selected: false,
        jumlahBayar: '',
        pph: '0',
      })))
      const nama = customers.find(c => c.id === id)?.name || ''
      setKeterangan(`Pembayaran dari ${nama}`)
      setSudahMuat(true)
    } catch (e) {
      setError(e.message || 'Gagal memuat invoice')
    } finally {
      setLoadingInv(false)
    }
  }, [customers])

  const ubahBaris = (invoiceId, patch) =>
    setRows(prev => prev.map(r => (r.invoiceId === invoiceId ? { ...r, ...patch } : r)))

  const toggleBaris = (r) =>
    ubahBaris(r.invoiceId, r.selected
      ? { selected: false, jumlahBayar: '', pph: '0' }
      : { selected: true, jumlahBayar: String(sisaTagihan(r)), pph: '0' })

  const centangSemua = (on) =>
    setRows(prev => prev.map(r => (on
      ? { ...r, selected: true, jumlahBayar: String(sisaTagihan(r)), pph: r.pph || '0' }
      : { ...r, selected: false, jumlahBayar: '', pph: '0' })))

  const cek = validateAllocations(rows)
  const ringkas = summarizeAllocations(rows)
  const semuaTercentang = rows.length > 0 && rows.every(r => r.selected)

  const handleSimpan = async () => {
    setError('')
    if (!cek.valid) return setError(cek.formError || 'Periksa kembali baris yang ditandai merah')
    if (!keterangan.trim()) return setError('Keterangan jurnal wajib diisi')

    setSaving(true)
    try {
      await recordMultiInvoicePayment({
        rows, account, date,
        keterangan: keterangan.trim(),
        createdBy: currentUser?.uid,
      })
      setServerErrors({})
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan pembayaran')
      setServerErrors(e.errors && typeof e.errors === 'object' ? e.errors : {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Terima Pembayaran</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Pelanggan</label>
            <select value={customerId} onChange={e => pilihCustomer(e.target.value)} className="select-field">
              <option value="">-- Pilih Pelanggan --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.customerNo} — {c.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Menampilkan seluruh invoice yang belum lunas, tanpa dibatasi filter tanggal halaman.
            </p>
          </div>

          {loadingInv && (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
          )}

          {sudahMuat && rows.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {selectedCustomer?.name} tidak punya invoice yang belum lunas.
            </div>
          )}

          {rows.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 w-10">
                      <input type="checkbox" checked={semuaTercentang}
                        onChange={e => centangSemua(e.target.checked)} />
                    </th>
                    <th className="p-2 text-left font-medium">Tanggal</th>
                    <th className="p-2 text-left font-medium">No. Invoice</th>
                    <th className="p-2 text-right font-medium">Tagihan</th>
                    <th className="p-2 text-right font-medium">Sisa</th>
                    <th className="p-2 text-right font-medium w-36">Jumlah Bayar</th>
                    <th className="p-2 text-right font-medium w-32">PPh</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    // Error client-side (validateAllocations) lebih baru, jadi
                    // diutamakan dibanding error server dari submit sebelumnya.
                    const err = cek.errors[r.invoiceId] || serverErrors[r.invoiceId]
                    return (
                      <tr key={r.invoiceId}
                        className={`border-t border-gray-100 ${err ? 'bg-red-50' : ''}`}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={r.selected} onChange={() => toggleBaris(r)} />
                        </td>
                        <td className="p-2 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="p-2 font-mono text-xs">
                          {r.invoiceNo || '-'}
                          {err && <div className="text-red-600 font-sans text-xs mt-0.5">{err}</div>}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{formatCurrency(r.amount)}</td>
                        <td className="p-2 text-right whitespace-nowrap font-semibold text-orange-600">
                          {formatCurrency(sisaTagihan(r))}
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" disabled={!r.selected} value={r.jumlahBayar}
                            onChange={e => ubahBaris(r.invoiceId, { jumlahBayar: e.target.value })}
                            className="input-field text-right disabled:bg-gray-50 disabled:text-gray-300" />
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" disabled={!r.selected} value={r.pph}
                            onChange={e => ubahBaris(r.invoiceId, { pph: e.target.value })}
                            className="input-field text-right disabled:bg-gray-50 disabled:text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Tanggal Bayar</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label">Diterima di Akun</label>
                  <select value={account} onChange={e => setAccount(e.target.value)} className="select-field">
                    {KAS_ACCOUNTS.map(o => <option key={o.code} value={o.code}>{o.code} - {o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Keterangan Jurnal</label>
                  <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} className="input-field" />
                </div>
              </div>

              <div className="bg-brand-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="flex justify-between text-brand-600">
                  <span>Total Tagihan ({ringkas.count} invoice)</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalGross)}</span>
                </div>
                <div className="flex justify-between text-brand-600">
                  <span>Total PPh Dipotong</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalPph)}</span>
                </div>
                <div className="flex justify-between font-semibold text-brand-800 border-t border-brand-200 pt-1 mt-1">
                  <span>Net Masuk ke Bank</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalNet)}</span>
                </div>
                <p className="text-xs text-brand-500 pt-1">
                  Angka Net harus cocok dengan mutasi rekening Anda.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t shrink-0">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSimpan} disabled={saving || !cek.valid}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" /> Simpan Pembayaran
          </button>
        </div>
      </div>
    </div>
  )
}
