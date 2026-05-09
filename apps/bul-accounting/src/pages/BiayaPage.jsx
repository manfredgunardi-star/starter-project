import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getPurchaseInvoices, savePurchaseInvoice, updatePurchaseInvoice,
  getSuppliers, getTrucks,
  saveJournal, deleteJournal,
  getCustomCOA, getCOAOverrides,
  formatCurrency, formatDate
} from '../utils/accounting'
import { getMergedCOA, getDetailAccountsDynamic } from '../data/chartOfAccounts'
import DateFilterBar from '../components/DateFilterBar'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, X, RefreshCw, Search, Edit, Trash2,
  CheckCircle, AlertCircle, TrendingDown
} from 'lucide-react'

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_LABEL = { unpaid: 'Belum Bayar', paid: 'Lunas', cancelled: 'Dibatalkan' }
const STATUS_COLOR = {
  unpaid:    'bg-yellow-50 text-yellow-700',
  paid:      'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

// ─── Form Modal ──────────────────────────────────────────────────────────────
function PurchaseInvoiceForm({ editData, suppliers, mergedCOA, onSaved, onClose }) {
  const { currentUser } = useAuth()

  const [date, setDate]           = useState(editData?.date || new Date().toISOString().slice(0, 10))
  const [invoiceNo, setInvoiceNo] = useState(editData?.invoiceNo || '')
  const [supplierId, setSupplierId] = useState(editData?.supplierId || '')
  const [accountCode, setAccountCode] = useState(editData?.accountCode || '')
  const [amount, setAmount]       = useState(editData?.amount || '')
  const [description, setDescription] = useState(editData?.description || '')
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)

  const selectedSupplier = suppliers.find(s => s.id === supplierId)
  const expenseAccounts  = getDetailAccountsDynamic(mergedCOA).filter(a =>
    a.code.startsWith('5') || a.code.startsWith('6') || a.code.startsWith('8')
  )

  const handleSave = async () => {
    setError('')
    if (!date)        return setError('Tanggal wajib diisi')
    if (!supplierId)  return setError('Supplier wajib dipilih')
    if (!accountCode) return setError('Akun biaya wajib dipilih')
    if (!amount || parseFloat(amount) <= 0) return setError('Nominal wajib diisi')

    setSaving(true)
    try {
      const payload = {
        date, invoiceNo, supplierId,
        supplierName: selectedSupplier?.name || '',
        accountCode,
        amount: parseFloat(amount),
        description,
      }
      if (editData) {
        await updatePurchaseInvoice(editData.id, { ...payload, updatedBy: currentUser?.uid })
      } else {
        await savePurchaseInvoice({ ...payload, createdBy: currentUser?.uid, status: 'unpaid' })
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
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Tagihan' : 'Tambah Tagihan Biaya'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">No. Invoice Supplier</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="input-field" placeholder="INV/SUPP/001" />
            </div>
          </div>
          <div>
            <label className="label">Supplier</label>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="select-field">
              <option value="">-- Pilih Supplier --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierNo} — {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Akun Biaya</label>
            <select value={accountCode} onChange={e => setAccountCode(e.target.value)} className="select-field">
              <option value="">-- Pilih Akun Biaya --</option>
              {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nominal (Rp)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" placeholder="0" min="0" />
          </div>
          <div>
            <label className="label">Keterangan <span className="text-gray-400 font-normal">(opsional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" rows={2} placeholder="Keterangan tagihan..." />
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
            {editData ? 'Simpan Perubahan' : 'Simpan Tagihan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bayar Modal (buat jurnal pembayaran) ────────────────────────────────────
function BayarModal({ invoice, mergedCOA, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [account, setAccount] = useState('1112')
  const [keterangan, setKeterangan] = useState(
    `Bayar ${invoice.invoiceNo || invoice.id?.slice(0, 8)} - ${invoice.supplierName}`
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const kasOptions = [
    { code: '1111', name: 'Kas Kecil' },
    { code: '1112', name: 'Bank BCA Operasional' },
    { code: '1113', name: 'Bank Mandiri Operasional' },
  ]

  const handleBayar = async () => {
    setError('')
    setSaving(true)
    try {
      // Jurnal: Debit Akun Biaya, Kredit Kas/Bank
      const journal = await saveJournal({
        date,
        description: keterangan,
        type: account === '1111' ? 'kas' : 'bank',
        truckId: null,
        lines: [
          { accountCode: invoice.accountCode, debit: invoice.amount, credit: 0, keterangan },
          { accountCode: account,             debit: 0, credit: invoice.amount, keterangan },
        ],
        createdBy: currentUser?.uid,
      })
      await updatePurchaseInvoice(invoice.id, {
        status: 'paid',
        paidDate: date,
        journalId: journal.id,
        updatedBy: currentUser?.uid,
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
          <h2 className="text-base font-semibold text-gray-800">Tandai Lunas</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-red-50 rounded-lg p-3 text-sm">
            <p className="text-red-700 font-semibold">{invoice.supplierName}</p>
            <p className="text-red-600">{formatCurrency(invoice.amount)}</p>
          </div>
          <div>
            <label className="label">Tanggal Bayar</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Dibayar dari Akun</label>
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
          <button onClick={handleBayar} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" /> Tandai Lunas
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function BiayaPage() {
  const { currentUser, isSuperadmin } = useAuth()

  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate]       = useState(`${thisMonth}-01`)
  const [endDate, setEndDate]           = useState(new Date().toISOString().slice(0, 10))
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch]             = useState('')

  const [invoices, setInvoices]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [mergedCOA, setMergedCOA] = useState([])
  const [loading, setLoading]     = useState(false)

  const [showForm, setShowForm]       = useState(false)
  const [editData, setEditData]       = useState(null)
  const [bayarItem, setBayarItem]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadCOA = useCallback(async () => {
    const [custom, overrides] = await Promise.all([getCustomCOA(), getCOAOverrides()])
    setMergedCOA(getMergedCOA(custom, overrides))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, supp] = await Promise.all([getPurchaseInvoices(), getSuppliers()])
      // Filter tanggal client-side
      const filtered = inv.filter(i => {
        if (startDate && i.date < startDate) return false
        if (endDate && i.date > endDate) return false
        return true
      })
      setInvoices(filtered)
      setSuppliers(supp)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { loadCOA() }, [loadCOA])
  useEffect(() => { loadData() }, [loadData])

  const filtered = invoices.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return i.supplierName?.toLowerCase().includes(q) || i.invoiceNo?.toLowerCase().includes(q)
    }
    return true
  })

  const totalTagihan = filtered.reduce((s, i) => s + (i.amount || 0), 0)
  const totalLunas   = filtered.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0)
  const totalUnpaid  = filtered.filter(i => i.status === 'unpaid').reduce((s, i) => s + (i.amount || 0), 0)

  const handleDelete = async () => {
    if (deleteTarget.journalId) {
      await deleteJournal(deleteTarget.journalId, currentUser?.uid)
    }
    await updatePurchaseInvoice(deleteTarget.id, { status: 'cancelled', updatedBy: currentUser?.uid })
    setDeleteTarget(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Biaya</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manajemen tagihan &amp; hutang supplier</p>
        </div>
        {isSuperadmin() && (
          <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Tagihan
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Tagihan', value: totalTagihan, color: 'text-gray-800' },
          { label: 'Belum Dibayar', value: totalUnpaid,  color: 'text-yellow-700' },
          { label: 'Sudah Dibayar', value: totalLunas,   color: 'text-green-700' },
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
            <option value="unpaid">Belum Bayar</option>
            <option value="paid">Lunas</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari supplier / no. invoice..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-52" />
          </div>
          <button onClick={loadData} className="btn-secondary flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </DateFilterBar>
        <p className="text-sm text-gray-500 pt-1 border-t border-gray-100">{filtered.length} tagihan</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">Tidak ada tagihan pada periode ini</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => (
            <div key={inv.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-800">{formatDate(inv.date)}</span>
                    {inv.invoiceNo && <span className="text-xs text-gray-500 font-mono">{inv.invoiceNo}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status]}`}>
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-gray-800">{inv.supplierName}</p>
                  {inv.accountCode && (
                    <p className="text-xs text-gray-400 mt-0.5">Akun: {inv.accountCode}</p>
                  )}
                  {inv.description && <p className="text-sm text-gray-500 mt-0.5">{inv.description}</p>}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-lg font-bold text-rose-600">{formatCurrency(inv.amount)}</span>
                    {inv.paidDate && (
                      <span className="text-xs text-gray-400">Dibayar: {formatDate(inv.paidDate)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isSuperadmin() && inv.status === 'unpaid' && (
                    <button onClick={() => setBayarItem(inv)}
                      className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors">
                      <CheckCircle className="w-3 h-3" /> Tandai Lunas
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <PurchaseInvoiceForm editData={editData} suppliers={suppliers} mergedCOA={mergedCOA}
          onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {bayarItem && (
        <BayarModal invoice={bayarItem} mergedCOA={mergedCOA}
          onSaved={loadData} onClose={() => setBayarItem(null)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Batalkan Tagihan"
          message={`Tagihan akan dibatalkan${deleteTarget.journalId ? ' dan jurnal terkait akan dihapus' : ''}. Lanjutkan?`}
          confirmLabel="Batalkan"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
