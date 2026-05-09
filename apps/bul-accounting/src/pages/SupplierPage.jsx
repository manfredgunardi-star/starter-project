import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSuppliers, getNextSupplierNo, saveSupplier, updateSupplier, deleteSupplier } from '../utils/accounting'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, X, Edit, Trash2, RefreshCw, Search, AlertCircle, Package } from 'lucide-react'

const KATEGORI = ['BBM', 'Sparepart', 'Bengkel/Servis', 'Vendor Lainnya']

function SupplierForm({ editData, nextNo, onSaved, onClose }) {
  const { currentUser } = useAuth()
  const [supplierNo, setSupplierNo] = useState(editData?.supplierNo || nextNo || '')
  const [name, setName]             = useState(editData?.name || '')
  const [kategori, setKategori]     = useState(editData?.kategori || '')
  const [address, setAddress]       = useState(editData?.address || '')
  const [phone, setPhone]           = useState(editData?.phone || '')
  const [email, setEmail]           = useState(editData?.email || '')
  const [npwp, setNpwp]             = useState(editData?.npwp || '')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Nama supplier wajib diisi')
    setSaving(true)
    try {
      const payload = { supplierNo, name: name.trim(), kategori, address, phone, email, npwp }
      if (editData) {
        await updateSupplier(editData.id, { ...payload, updatedBy: currentUser?.uid })
      } else {
        await saveSupplier({ ...payload, createdBy: currentUser?.uid })
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
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Supplier' : 'Tambah Supplier'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">No. Supplier</label>
              <input type="text" value={supplierNo} onChange={e => setSupplierNo(e.target.value)} className="input-field" placeholder="SUPP-001" />
            </div>
            <div>
              <label className="label">Kategori</label>
              <select value={kategori} onChange={e => setKategori(e.target.value)} className="select-field">
                <option value="">-- Pilih Kategori --</option>
                {KATEGORI.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nama Supplier</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Nama perusahaan / toko" autoFocus />
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
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="email@supplier.com" />
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
            {editData ? 'Simpan Perubahan' : 'Tambah Supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SupplierPage() {
  const { isSuperadmin } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [nextNo, setNextNo]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editData, setEditData]   = useState(null)
  const [deleteId, setDeleteId]   = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, no] = await Promise.all([getSuppliers(), getNextSupplierNo()])
      setSuppliers(s)
      setNextNo(no)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = suppliers.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.supplierNo?.toLowerCase().includes(search.toLowerCase()) ||
    s.kategori?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    await deleteSupplier(deleteId)
    setDeleteId(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Supplier</h1>
          <p className="text-sm text-gray-500 mt-0.5">Data master supplier</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / no. supplier..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-52" />
          </div>
          {isSuperadmin() && (
            <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Supplier
            </button>
          )}
        </div>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <Package className="w-5 h-5 text-brand-500" />
        <span className="text-sm text-gray-600">{suppliers.length} supplier terdaftar</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">
          {search ? 'Tidak ada supplier yang cocok' : 'Belum ada data supplier'}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left">No.</th>
                <th className="p-3 text-left">Nama Supplier</th>
                <th className="p-3 text-left">Kategori</th>
                <th className="p-3 text-left">Telepon</th>
                <th className="p-3 text-left">Email</th>
                {isSuperadmin() && <th className="p-3 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-brand-600 font-semibold">{s.supplierNo}</td>
                  <td className="p-3 font-medium text-gray-800">{s.name}</td>
                  <td className="p-3">
                    {s.kategori && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.kategori}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">{s.phone || '-'}</td>
                  <td className="p-3 text-gray-600">{s.email || '-'}</td>
                  {isSuperadmin() && (
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditData(s); setShowForm(true) }}
                          className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(s.id)}
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

      {showForm && (
        <SupplierForm editData={editData} nextNo={nextNo}
          onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {deleteId && (
        <ConfirmDialog
          title="Hapus Supplier"
          message="Data supplier akan dihapus. Tagihan terkait tidak akan terpengaruh."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
