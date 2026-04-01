import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getTrucks, saveTruck, updateTruck, deleteTruck } from '../utils/accounting'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, X, Edit, Trash2, RefreshCw, Search, AlertCircle, Truck } from 'lucide-react'

// Helper: baca field lama atau baru (backward compat)
const readField = (obj, ...keys) => { for (const k of keys) if (obj?.[k]) return obj[k]; return '' }

function TruckForm({ editData, onSaved, onClose }) {
  const { currentUser } = useAuth()
  // Support field lama (name, merk, dll) maupun baru (nopol, model)
  const [nopol, setNopol]   = useState(readField(editData, 'nopol', 'platNomor', 'name'))
  const [model, setModel]   = useState(readField(editData, 'model', 'merk', 'merek', 'tipe'))
  const [tahun, setTahun]   = useState(readField(editData, 'tahun', 'tahunBuat'))
  const [warna, setWarna]   = useState(readField(editData, 'warna', 'color'))
  const [sopir, setSopir]   = useState(readField(editData, 'sopir', 'namaSopir', 'driverName'))
  const [status, setStatus] = useState(editData?.status || 'active')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!nopol.trim()) return setError('No. polisi wajib diisi')
    if (!model.trim()) return setError('Model kendaraan wajib diisi')
    setSaving(true)
    try {
      const payload = {
        nopol: nopol.trim().toUpperCase(),
        model: model.trim(),
        tahun, warna, sopir, status,
        name: nopol.trim().toUpperCase(), // for sorting
      }
      if (editData) {
        await updateTruck(editData.id, payload)
      } else {
        await saveTruck({ ...payload, createdBy: currentUser?.uid })
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
          <h2 className="text-lg font-semibold text-gray-800">{editData ? 'Edit Armada' : 'Tambah Armada'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">No. Polisi</label>
              <input type="text" value={nopol} onChange={e => setNopol(e.target.value)} className="input-field"
                placeholder="B 1234 XYZ" autoFocus style={{ textTransform: 'uppercase' }} />
            </div>
            <div>
              <label className="label">Model / Tipe</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)} className="input-field"
                placeholder="Hino Dutro 130 HD" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Tahun</label>
              <input type="number" value={tahun} onChange={e => setTahun(e.target.value)} className="input-field"
                placeholder="2020" min="1990" max="2099" />
            </div>
            <div>
              <label className="label">Warna</label>
              <input type="text" value={warna} onChange={e => setWarna(e.target.value)} className="input-field"
                placeholder="Putih" />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="select-field">
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
                <option value="maintenance">Dalam Servis</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nama Sopir <span className="text-gray-400 font-normal">(opsional)</span></label>
            <input type="text" value={sopir} onChange={e => setSopir(e.target.value)} className="input-field"
              placeholder="Nama sopir tetap..." />
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
            {editData ? 'Simpan Perubahan' : 'Tambah Armada'}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = { active: 'Aktif', inactive: 'Tidak Aktif', maintenance: 'Dalam Servis' }
const STATUS_COLOR = {
  active:      'bg-green-50 text-green-700',
  inactive:    'bg-gray-100 text-gray-500',
  maintenance: 'bg-yellow-50 text-yellow-700',
}

export default function ArmadaPage() {
  const { isSuperadmin } = useAuth()
  const [trucks, setTrucks]       = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editData, setEditData]   = useState(null)
  const [deleteId, setDeleteId]   = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try { setTrucks(await getTrucks()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = trucks.filter(t =>
    !search ||
    t.nopol?.toLowerCase().includes(search.toLowerCase()) ||
    t.model?.toLowerCase().includes(search.toLowerCase()) ||
    t.sopir?.toLowerCase().includes(search.toLowerCase())
  )

  // Data lama mungkin tidak punya field status → anggap aktif
  const active      = trucks.filter(t => !t.status || t.status === 'active').length
  const maintenance = trucks.filter(t => t.status === 'maintenance').length

  const handleDelete = async () => {
    await deleteTruck(deleteId)
    setDeleteId(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Armada</h1>
          <p className="text-sm text-gray-500 mt-0.5">Data master kendaraan &amp; sopir</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nopol / model / sopir..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-52" />
          </div>
          {isSuperadmin() && (
            <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Armada
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Armada',  value: trucks.length,  color: 'text-gray-800' },
          { label: 'Aktif',         value: active,         color: 'text-green-700' },
          { label: 'Dalam Servis',  value: maintenance,    color: 'text-yellow-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Grid cards */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">
          {search ? 'Tidak ada armada yang cocok' : 'Belum ada data armada'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-base">
                      {readField(t, 'nopol', 'platNomor', 'name') || '(no data)'}
                    </p>
                    <p className="text-xs text-gray-500">{readField(t, 'tahun', 'tahunBuat')}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status] || STATUS_COLOR.active}`}>
                  {STATUS_LABEL[t.status] || 'Aktif'}
                </span>
              </div>
              <p className="text-sm text-gray-700 font-medium">
                {readField(t, 'model', 'merk', 'merek', 'tipe')}
              </p>
              {readField(t, 'warna', 'color') && (
                <p className="text-xs text-gray-400 mt-0.5">{readField(t, 'warna', 'color')}</p>
              )}
              {readField(t, 'sopir', 'namaSopir', 'driverName') && (
                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                  Sopir: <span className="font-medium text-gray-700">{readField(t, 'sopir', 'namaSopir', 'driverName')}</span>
                </p>
              )}
              {isSuperadmin() && (
                <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100 justify-end">
                  <button onClick={() => { setEditData(t); setShowForm(true) }}
                    className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteId(t.id)}
                    className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TruckForm editData={editData} onSaved={loadData} onClose={() => { setShowForm(false); setEditData(null) }} />
      )}
      {deleteId && (
        <ConfirmDialog
          title="Hapus Armada"
          message="Data armada akan dihapus permanen. Jurnal yang sudah terkait tidak akan terpengaruh."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
