import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getInvoices, saveInvoice, updateInvoice,
  getCustomers, getTrucks,
  saveJournal, deleteJournal,
  addInvoicePayment,
  formatCurrency, formatDate
} from '../utils/accounting'
import DateFilterBar from '../components/DateFilterBar'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, X, RefreshCw, Search, Edit, Trash2,
  CheckCircle, AlertCircle, FileText, ChevronDown, ChevronUp
} from 'lucide-react'

const KAS_NAMES = { '1111': 'Kas Kecil', '1112': 'Bank BCA', '1113': 'Bank Mandiri' }

// ─── Status helpers ─────────────────────────────────────────────────────────
const STATUS_LABEL = { draft: 'Draft', unpaid: 'Belum Lunas', partial: 'Sebagian', paid: 'Lunas', cancelled: 'Dibatalkan' }
const STATUS_COLOR = {
  draft:     'bg-gray-100 text-gray-600',
  unpaid:    'bg-yellow-50 text-yellow-700',
  partial:   'bg-orange-50 text-orange-700',
  paid:      'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

// ─── Form Modal ──────────────────────────────────────────────────────────────
function InvoiceForm({ editData, customers, trucks, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const [date, setDate]               = useState(editData?.date || new Date().toISOString().slice(0, 10))
  const [invoiceNo, setInvoiceNo]     = useState(editData?.invoiceNo || '')
  const [customerId, setCustomerId]   = useState(editData?.customerId || '')
  const [truckId, setTruckId]         = useState(editData?.truckId || '')
  const [amount, setAmount]           = useState(editData?.amount || '')
  const [description, setDescription] = useState(editData?.description || '')
  const [status, setStatus]           = useState(editData?.status || 'unpaid')
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)

  const selectedCustomer = customers.find(c => c.id === customerId)

  const handleSave = async () => {
    setError('')
    if (!date)       return setError('Tanggal wajib diisi')
    if (!customerId) return setError('Pelanggan wajib dipilih')
    if (!amount || parseFloat(amount) <= 0) return setError('Nominal wajib diisi')

    setSaving(true)
    try {
      const payload = {
        date, invoiceNo, customerId,
        customerName: selectedCustomer?.name || '',
        truckId: truckId || null,
        amount: parseFloat(amount),
        description,
        status,
      }
      if (editData) {
        await updateInvoice(editData.id, { ...payload, updatedBy: currentUser?.uid })
      } else {
        await saveInvoice({ ...payload, createdBy: currentUser?.uid })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Invoice' : 'Tambah Invoice'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">No. Invoice</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="input-field" placeholder="INV-001" />
            </div>
          </div>
          <div>
            <label className="label">Pelanggan</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="select-field">
              <option value="">-- Pilih Pelanggan --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.customerNo} — {c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Armada <span className="text-gray-400 font-normal">(opsional)</span></label>
              <select value={truckId} onChange={e => setTruckId(e.target.value)} className="select-field">
                <option value="">-- Tidak ada --</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.nopol}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="select-field">
                <option value="draft">Draft</option>
                <option value="unpaid">Belum Lunas</option>
                <option value="paid">Lunas</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nominal (Rp)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" placeholder="0" min="0" />
          </div>
          <div>
            <label className="label">Keterangan <span className="text-gray-400 font-normal">(opsional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" rows={2} placeholder="Keterangan invoice..." />
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
            {editData ? 'Simpan Perubahan' : 'Simpan Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pembayaran Modal ────────────────────────────────────────────────────────
function PembayaranModal({ invoice, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const sisaTagihan = invoice.amount - (invoice.totalPaid || 0)
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [jumlahBayar, setJumlahBayar] = useState(String(sisaTagihan))
  const [pph, setPph]             = useState('0')
  const [account, setAccount]     = useState('1112')
  const [keterangan, setKeterangan] = useState(`Pembayaran ${invoice.invoiceNo || invoice.id?.slice(0, 8)} - ${invoice.customerName}`)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const kasOptions = [
    { code: '1111', name: 'Kas Kecil' },
    { code: '1112', name: 'Bank BCA Operasional' },
    { code: '1113', name: 'Bank Mandiri Operasional' },
  ]

  const nominalBayar = parseFloat(jumlahBayar) || 0
  const nominalPph   = parseFloat(pph) || 0
  const netDiterima  = nominalBayar - nominalPph

  const handleSimpan = async () => {
    setError('')
    if (!date) return setError('Tanggal wajib diisi')
    if (nominalBayar <= 0) return setError('Jumlah bayar harus lebih dari 0')
    if (nominalBayar > sisaTagihan + 0.5) return setError(`Jumlah bayar melebihi sisa tagihan (${formatCurrency(sisaTagihan)})`)
    if (nominalPph < 0 || nominalPph > nominalBayar) return setError('PPh tidak valid')
    setSaving(true)
    try {
      const journalLines = nominalPph > 0
        ? [
            { accountCode: account, debit: netDiterima, credit: 0, keterangan },
            { accountCode: '1172',  debit: nominalPph,  credit: 0, keterangan: `PPh 23 - ${invoice.invoiceNo || invoice.customerName}` },
            { accountCode: '1121',  debit: 0, credit: nominalBayar, keterangan },
          ]
        : [
            { accountCode: account, debit: nominalBayar, credit: 0, keterangan },
            { accountCode: '1121',  debit: 0, credit: nominalBayar, keterangan },
          ]

      const journalId = await saveJournal({
        date,
        description: keterangan,
        type: account.startsWith('1111') ? 'kas' : 'bank',
        truckId: invoice.truckId || null,
        lines: journalLines,
        createdBy: currentUser?.uid,
        invoiceId: invoice.id,
      })

      await addInvoicePayment(invoice.id, {
        journalId,
        date,
        jumlahBayar: nominalBayar,
        pph: nominalPph,
        netDiterima,
        account,
        keterangan,
      })

      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-base font-semibold text-gray-800">Catat Pembayaran</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Info invoice */}
          <div className="bg-brand-50 rounded-lg p-3 text-sm space-y-1">
            <p className="text-brand-700 font-semibold">{invoice.customerName}</p>
            <div className="flex justify-between text-brand-600">
              <span>Total tagihan</span><span>{formatCurrency(invoice.amount)}</span>
            </div>
            {(invoice.totalPaid || 0) > 0 && (
              <div className="flex justify-between text-brand-600">
                <span>Sudah dibayar</span><span>{formatCurrency(invoice.totalPaid)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-brand-800 border-t border-brand-200 pt-1 mt-1">
              <span>Sisa tagihan</span><span>{formatCurrency(sisaTagihan)}</span>
            </div>
          </div>

          <div>
            <label className="label">Tanggal Bayar</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Jumlah yang Dibayarkan (Rp)</label>
            <input type="number" value={jumlahBayar} onChange={e => setJumlahBayar(e.target.value)} className="input-field" min="0" />
          </div>
          <div>
            <label className="label">PPh Dipotong Customer (Rp) <span className="text-gray-400 font-normal">— opsional</span></label>
            <input type="number" value={pph} onChange={e => setPph(e.target.value)} className="input-field" min="0" />
          </div>
          {nominalPph > 0 && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm flex justify-between text-gray-600">
              <span>Net diterima di bank</span>
              <span className="font-semibold">{formatCurrency(netDiterima)}</span>
            </div>
          )}
          <div>
            <label className="label">Diterima di Akun</label>
            <select value={account} onChange={e => setAccount(e.target.value)} className="select-field">
              {kasOptions.map(o => <option key={o.code} value={o.code}>{o.code} - {o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Keterangan Jurnal</label>
            <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} className="input-field" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSimpan} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" /> Simpan Pembayaran
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PenjualanPage() {
  const { currentUser, isSuperadmin } = useAuth()

  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate]   = useState(`${thisMonth}-01`)
  const [endDate, setEndDate]       = useState(new Date().toISOString().slice(0, 10))
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch]         = useState('')

  const [invoices, setInvoices]     = useState([])
  const [customers, setCustomers]   = useState([])
  const [trucks, setTrucks]         = useState([])
  const [loading, setLoading]       = useState(false)

  const [showForm, setShowForm]     = useState(false)
  const [editData, setEditData]     = useState(null)
  const [bayarItem, setBayarItem]   = useState(null) // PembayaranModal
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, journalId }
  const [expandedIds, setExpandedIds] = useState(new Set())

  const toggleExpand = (id) => setExpandedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, cust, tr] = await Promise.all([
        getInvoices({ startDate, endDate }),
        getCustomers(),
        getTrucks(),
      ])
      setInvoices(inv)
      setCustomers(cust)
      setTrucks(tr)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { loadData() }, [loadData])

  const filtered = invoices.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return i.customerName?.toLowerCase().includes(q) || i.invoiceNo?.toLowerCase().includes(q)
    }
    return true
  })

  const activeInvoices = filtered.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
  const totalTagihan = activeInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const totalTerbayar = activeInvoices.reduce((s, i) => {
    if (i.status === 'paid') return s + (i.amount || 0)
    return s + (i.totalPaid || 0)
  }, 0)
  const totalSisa = activeInvoices.reduce((s, i) => {
    if (i.status === 'paid') return s
    if (i.status === 'partial') return s + ((i.amount || 0) - (i.totalPaid || 0))
    return s + (i.amount || 0) // unpaid
  }, 0)

  const handleDelete = async () => {
    if (deleteTarget.journalId) {
      await deleteJournal(deleteTarget.journalId, currentUser?.uid)
    }
    await updateInvoice(deleteTarget.id, { status: 'cancelled', updatedBy: currentUser?.uid })
    setDeleteTarget(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Penjualan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manajemen invoice &amp; piutang pelanggan</p>
        </div>
        {isSuperadmin() && (
          <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Invoice
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Tagihan', value: totalTagihan,  color: 'text-gray-800' },
          { label: 'Sisa Tagihan',  value: totalSisa,     color: 'text-yellow-700' },
          { label: 'Terbayar',      value: totalTerbayar, color: 'text-green-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card space-y-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select-field w-36">
            <option value="all">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Belum Lunas</option>
            <option value="partial">Sebagian</option>
            <option value="paid">Lunas</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari pelanggan / no. invoice..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-52" />
          </div>
          <button onClick={loadData} className="btn-secondary flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </DateFilterBar>
        <p className="text-sm text-gray-500 pt-1 border-t border-gray-100">{filtered.length} invoice</p>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">Tidak ada invoice pada periode ini</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const payments = Array.isArray(inv.payments) ? inv.payments : []
            // Invoice lama (sebelum sistem payments[]): punya journalId top-level tapi tidak ada payments[]
            const isLegacyPaid = payments.length === 0 && !!inv.journalId && inv.status === 'paid'
            const hasHistory = payments.length > 0 || isLegacyPaid
            const isExpanded = expandedIds.has(inv.id)
            return (
              <div key={inv.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-800">{formatDate(inv.date)}</span>
                      {inv.invoiceNo && (
                        <span className="text-xs text-gray-500 font-mono">{inv.invoiceNo}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status]}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-gray-800">{inv.customerName}</p>
                    {inv.description && <p className="text-sm text-gray-500 mt-0.5">{inv.description}</p>}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className="text-lg font-bold text-brand-700">{formatCurrency(inv.amount)}</span>
                      {inv.status === 'partial' && (
                        <span className="text-sm text-orange-600">
                          Sisa: {formatCurrency(inv.amount - (inv.totalPaid || 0))}
                        </span>
                      )}
                      {inv.status === 'paid' && inv.paidDate && (
                        <span className="text-xs text-gray-400">Lunas: {formatDate(inv.paidDate)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Tombol Catat Pembayaran */}
                    {isSuperadmin() && (inv.status === 'unpaid' || inv.status === 'partial') && (
                      <button onClick={() => setBayarItem(inv)}
                        className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors">
                        <CheckCircle className="w-3 h-3" /> Catat Pembayaran
                      </button>
                    )}
                    {isSuperadmin() && (
                      <button onClick={() => { setEditData(inv); setShowForm(true) }}
                        className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg">
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {isSuperadmin() && inv.status !== 'cancelled' && (
                      <button onClick={() => setDeleteTarget({ id: inv.id, journalId: inv.journalId })}
                        className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Toggle riwayat pembayaran */}
                    {hasHistory && (
                      <button onClick={() => toggleExpand(inv.id)}
                        className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg"
                        title="Riwayat pembayaran">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Riwayat Pembayaran */}
                {isExpanded && hasHistory && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Riwayat Pembayaran
                    </p>
                    {isLegacyPaid ? (
                      // Invoice lama: tampilkan entri tunggal berdasarkan paidDate + amount
                      <div className="flex items-start justify-between gap-3 text-sm py-1.5 px-2 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-gray-400 text-xs shrink-0">{formatDate(inv.paidDate)}</span>
                          <span className="text-gray-400 italic text-xs">Pelunasan penuh</span>
                        </div>
                        <span className="font-semibold text-gray-800 shrink-0">{formatCurrency(inv.amount)}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {[...payments]
                          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                          .map((p, i) => (
                            <div key={p.journalId || i}
                              className="flex items-start justify-between gap-3 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-gray-400 text-xs shrink-0">{formatDate(p.date)}</span>
                                <span className="text-gray-600 truncate">{p.keterangan || '-'}</span>
                                {p.pph > 0 && (
                                  <span className="text-xs text-purple-600 shrink-0">
                                    PPh {formatCurrency(p.pph)}
                                  </span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-semibold text-gray-800">{formatCurrency(p.jumlahBayar)}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                  {KAS_NAMES[p.account] || p.account}
                                </span>
                              </div>
                            </div>
                          ))}
                        {payments.length > 1 && (
                          <div className="flex justify-between text-xs font-semibold text-gray-600 border-t border-gray-100 mt-2 pt-2 px-2">
                            <span>Total dibayar</span>
                            <span>{formatCurrency(inv.totalPaid || 0)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <InvoiceForm editData={editData} customers={customers} trucks={trucks}
          onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {bayarItem && (
        <PembayaranModal invoice={bayarItem} onSaved={loadData} onClose={() => setBayarItem(null)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Batalkan Invoice"
          message={`Invoice akan dibatalkan${deleteTarget.journalId ? ' dan jurnal terkait akan dihapus' : ''}. Lanjutkan?`}
          confirmLabel="Batalkan Invoice"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
