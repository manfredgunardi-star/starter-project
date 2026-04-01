import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getCustomers, getNextCustomerNo, saveCustomer, updateCustomer, deleteCustomer } from '../utils/accounting'
import { db } from '../firebase'
import { collection, getDocs } from 'firebase/firestore'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, X, Edit, Trash2, RefreshCw, Search, AlertCircle, Users, Download, CheckSquare, Square } from 'lucide-react'

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ existingCustomers, onImported, onClose }) {
  const { currentUser } = useAuth()
  const [candidates, setCandidates] = useState([])   // { name, address, npwp }
  const [selected, setSelected]     = useState({})   // { name: true/false }
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [done, setDone]             = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'integration_queue'))
        const existingNames = new Set(
          existingCustomers.map(c => (c.name || '').trim().toLowerCase())
        )
        // Kumpulkan pelanggan unik dari semua invoice di integration_queue
        const seen = new Map()
        snap.docs.forEach(d => {
          const data = d.data()
          if (data.type !== 'invoice') return
          const pd = data.pelangganData
          const name = (pd?.name || data.pt || '').trim()
          if (!name) return
          const key = name.toLowerCase()
          if (!existingNames.has(key) && !seen.has(key)) {
            seen.set(key, { name, address: pd?.address || '', npwp: pd?.npwp || '' })
          }
        })
        const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
        setCandidates(list)
        // Default: semua dicentang
        const sel = {}
        list.forEach(c => { sel[c.name] = true })
        setSelected(sel)
      } catch (e) {
        setError('Gagal memuat data: ' + e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [existingCustomers])

  const toggleAll = () => {
    const allChecked = candidates.every(c => selected[c.name])
    const next = {}
    candidates.forEach(c => { next[c.name] = !allChecked })
    setSelected(next)
  }

  const toggle = (name) => setSelected(s => ({ ...s, [name]: !s[name] }))

  const selectedList = candidates.filter(c => selected[c.name])

  const handleImport = async () => {
    if (selectedList.length === 0) return setError('Pilih minimal satu pelanggan')
    setSaving(true)
    setError('')
    try {
      // Ambil customerNo terbaru sekali, lalu increment manual
      const snap = await getDocs(collection(db, 'customers'))
      const nums = snap.docs
        .map(d => parseInt(d.data().customerNo?.replace('CUST-', '') || '0'))
        .filter(n => !isNaN(n))
      let counter = Math.max(0, ...nums)

      for (const c of selectedList) {
        counter++
        await saveCustomer({
          customerNo: `CUST-${String(counter).padStart(3, '0')}`,
          name: c.name,
          address: c.address || '',
          npwp: c.npwp || '',
          phone: '',
          email: '',
          createdBy: currentUser?.uid,
          sourceIntegration: true,
        })
      }
      setDone(true)
      onImported()
    } catch (e) {
      setError('Gagal mengimpor: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const allChecked = candidates.length > 0 && candidates.every(c => selected[c.name])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Impor dari BUL-Monitor</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pelanggan dari riwayat invoice yang belum terdaftar</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : done ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-green-600 font-semibold">Berhasil mengimpor {selectedList.length} pelanggan</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Semua pelanggan dari BUL-Monitor sudah terdaftar
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select all */}
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-3">
                {allChecked ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                <span>Pilih semua ({candidates.length})</span>
              </button>
              {candidates.map(c => (
                <button key={c.name} onClick={() => toggle(c.name)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selected[c.name] ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                  {selected[c.name]
                    ? <CheckSquare className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                    : <Square className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                    {c.address && <p className="text-xs text-gray-500 truncate">{c.address}</p>}
                    {c.npwp && <p className="text-xs text-gray-400">NPWP: {c.npwp}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
        </div>

        {!done && candidates.length > 0 && (
          <div className="flex justify-between items-center gap-3 px-5 pb-5 pt-3 border-t shrink-0">
            <span className="text-sm text-gray-500">{selectedList.length} dipilih</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary">Batal</button>
              <button onClick={handleImport} disabled={saving || selectedList.length === 0}
                className="btn-primary flex items-center gap-2">
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                <Download className="w-4 h-4" /> Impor {selectedList.length > 0 ? `(${selectedList.length})` : ''}
              </button>
            </div>
          </div>
        )}
        {done && (
          <div className="px-5 pb-5 pt-3 border-t shrink-0 flex justify-end">
            <button onClick={onClose} className="btn-primary">Tutup</button>
          </div>
        )}
      </div>
    </div>
  )
}

function CustomerForm({ editData, nextNo, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const [customerNo, setCustomerNo] = useState(editData?.customerNo || nextNo || '')
  const [name, setName]             = useState(editData?.name || '')
  const [address, setAddress]       = useState(editData?.address || '')
  const [phone, setPhone]           = useState(editData?.phone || '')
  const [email, setEmail]           = useState(editData?.email || '')
  const [npwp, setNpwp]             = useState(editData?.npwp || '')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Nama pelanggan wajib diisi')
    setSaving(true)
    try {
      const payload = { customerNo, name: name.trim(), address, phone, email, npwp }
      if (editData) {
        await updateCustomer(editData.id, { ...payload, updatedBy: currentUser?.uid })
      } else {
        await saveCustomer({ ...payload, createdBy: currentUser?.uid })
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
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">No. Pelanggan</label>
              <input type="text" value={customerNo} onChange={e => setCustomerNo(e.target.value)} className="input-field" placeholder="CUST-001" />
            </div>
            <div>
              <label className="label">Nama Pelanggan</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="PT. Contoh" autoFocus />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} className="input-field" rows={2} placeholder="Alamat lengkap..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">No. Telepon</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="08xx-xxxx-xxxx" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="email@perusahaan.com" />
            </div>
          </div>
          <div>
            <label className="label">NPWP <span className="text-gray-400 font-normal">(opsional)</span></label>
            <input type="text" value={npwp} onChange={e => setNpwp(e.target.value)} className="input-field" placeholder="00.000.000.0-000.000" />
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
            {editData ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PelangganPage() {
  const { isSuperadmin } = useAuth()
  const [customers, setCustomers] = useState([])
  const [nextNo, setNextNo]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editData, setEditData]   = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [showImport, setShowImport] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [c, no] = await Promise.all([getCustomers(), getNextCustomerNo()])
      setCustomers(c)
      setNextNo(no)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customerNo?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const handleDelete = async () => {
    await deleteCustomer(deleteId)
    setDeleteId(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pelanggan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Data master pelanggan</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / no. pelanggan..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-52" />
          </div>
          {isSuperadmin() && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" /> Impor dari BUL-Monitor
              </button>
              <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Tambah Pelanggan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card p-4 flex items-center gap-3">
        <Users className="w-5 h-5 text-brand-500" />
        <span className="text-sm text-gray-600">{customers.length} pelanggan terdaftar</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">
          {search ? 'Tidak ada pelanggan yang cocok' : 'Belum ada data pelanggan'}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left">No.</th>
                <th className="p-3 text-left">Nama Pelanggan</th>
                <th className="p-3 text-left">Telepon</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">NPWP</th>
                {isSuperadmin() && <th className="p-3 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-brand-600 font-semibold">{c.customerNo}</td>
                  <td className="p-3 font-medium text-gray-800">{c.name}</td>
                  <td className="p-3 text-gray-600">{c.phone || '-'}</td>
                  <td className="p-3 text-gray-600">{c.email || '-'}</td>
                  <td className="p-3 text-gray-500 text-xs">{c.npwp || '-'}</td>
                  {isSuperadmin() && (
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditData(c); setShowForm(true) }}
                          className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(c.id)}
                          className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <ImportModal
          existingCustomers={customers}
          onImported={loadData}
          onClose={() => setShowImport(false)}
        />
      )}
      {showForm && (
        <CustomerForm editData={editData} nextNo={nextNo}
          onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {deleteId && (
        <ConfirmDialog
          title="Hapus Pelanggan"
          message="Data pelanggan akan dihapus. Invoice terkait tidak akan terpengaruh."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
