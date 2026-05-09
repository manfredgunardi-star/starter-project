import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getCompanyProfile, saveCompanyProfile,
  getKaryawan, saveKaryawan, updateKaryawan, deleteKaryawan,
  getRecurringTemplates, saveRecurringTemplate, deleteRecurringTemplate, executeRecurringJournal,
  updateRecurringTemplateNextRunDate,
  generateClosingJournals, formatCurrency,
} from '../utils/accounting'
import ConfirmDialog from '../components/ConfirmDialog'
import { getDetailAccounts } from '../data/chartOfAccounts'
import {
  Building2, Users, UserCheck, RefreshCw, Repeat, Archive,
  Plus, X, Edit, Trash2, AlertCircle, CheckCircle, Play, Save,
} from 'lucide-react'

// ─── Profil Perusahaan ──────────────────────────────────────────────────────
function ProfilTab() {
  const [form, setForm]       = useState({ name: '', address: '', phone: '', email: '', npwp: '', taxYear: new Date().getFullYear() })
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    getCompanyProfile().then(p => {
      if (p) setForm({ name: p.name || '', address: p.address || '', phone: p.phone || '', email: p.email || '', npwp: p.npwp || '', taxYear: p.taxYear || new Date().getFullYear() })
    }).catch(e => {
      setError(e.message || 'Gagal memuat profil perusahaan')
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      await saveCompanyProfile(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const set = (field) => e => setForm(f => ({ ...f, [field]: e.target.value }))

  if (loading) return <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="label">Nama Perusahaan</label>
        <input type="text" value={form.name} onChange={set('name')} className="input-field" placeholder="PT. Berkah Usaha Logistik" />
      </div>
      <div>
        <label className="label">Alamat</label>
        <textarea value={form.address} onChange={set('address')} className="input-field" rows={2} placeholder="Alamat lengkap..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Telepon</label>
          <input type="text" value={form.phone} onChange={set('phone')} className="input-field" placeholder="021-xxxxxxx" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="info@perusahaan.com" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">NPWP</label>
          <input type="text" value={form.npwp} onChange={set('npwp')} className="input-field" placeholder="00.000.000.0-000.000" />
        </div>
        <div>
          <label className="label">Tahun Pajak</label>
          <input type="number" value={form.taxYear} onChange={set('taxYear')} className="input-field" min="2000" max="2099" />
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
      {saved && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Profil berhasil disimpan</div>}
      <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
        {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
        Simpan Profil
      </button>
    </div>
  )
}

// ─── Pengguna ───────────────────────────────────────────────────────────────
function PenggunaTab() {
  const { getAllUsers, createUser, deleteUser, currentUser } = useAuth()
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [name, setName]       = useState('')
  const [role, setRole]       = useState('reader')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [deleteId, setDeleteId] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try { setUsers(await getAllUsers()) } finally { setLoading(false) }
  }, [getAllUsers])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleCreate = async () => {
    setError('')
    if (!email.trim() || !password.trim() || !name.trim()) return setError('Email, password, dan nama wajib diisi')
    setSaving(true)
    try {
      await createUser(email.trim(), password, name.trim(), role)
      setShowForm(false); setEmail(''); setPass(''); setName(''); setRole('reader')
      loadUsers()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await deleteUser(deleteId)
    setDeleteId(null)
    loadUsers()
  }

  const ROLE_LABEL = { superadmin: 'Superadmin', admin: 'Admin', reader: 'Reader' }
  const ROLE_COLOR = { superadmin: 'bg-red-100 text-red-700', admin: 'bg-brand-100 text-brand-700', reader: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Tambah Pengguna
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3 border border-brand-200">
          <h3 className="font-semibold text-gray-700">Pengguna Baru</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nama</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Nama lengkap" autoFocus />
            </div>
            <div>
              <label className="label">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} className="select-field">
                <option value="reader">Reader</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="email@perusahaan.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPass(e.target.value)} className="input-field" placeholder="Min. 6 karakter" />
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary">Batal</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />} Buat Pengguna
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left">Nama</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{u.name || '-'}</td>
                  <td className="p-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[u.role] || ROLE_COLOR.reader}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.id !== currentUser?.uid && (
                      <button onClick={() => setDeleteId(u.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Hapus Pengguna"
          message="Akun Firestore pengguna akan dihapus. Pengguna tidak bisa login lagi."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// ─── Karyawan ───────────────────────────────────────────────────────────────
function KaryawanTab() {
  const { currentUser } = useAuth()
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [name, setName]       = useState('')
  const [jabatan, setJabatan] = useState('')
  const [noKtp, setNoKtp]     = useState('')
  const [phone, setPhone]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try { setList(await getKaryawan()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const openForm = (k = null) => {
    setEditData(k)
    setName(k?.name || ''); setJabatan(k?.jabatan || ''); setNoKtp(k?.noKtp || ''); setPhone(k?.phone || '')
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Nama wajib diisi')
    setSaving(true)
    try {
      const payload = { name: name.trim(), jabatan, noKtp, phone }
      if (editData) await updateKaryawan(editData.id, payload)
      else await saveKaryawan({ ...payload, createdBy: currentUser?.uid })
      setShowForm(false); loadData()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await deleteKaryawan(deleteId)
    setDeleteId(null); loadData()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => openForm()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Tambah Karyawan
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3 border border-brand-200">
          <h3 className="font-semibold text-gray-700">{editData ? 'Edit Karyawan' : 'Karyawan Baru'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nama</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Nama lengkap" autoFocus />
            </div>
            <div>
              <label className="label">Jabatan</label>
              <input value={jabatan} onChange={e => setJabatan(e.target.value)} className="input-field" placeholder="Sopir, Admin, dll." />
            </div>
            <div>
              <label className="label">No. KTP</label>
              <input value={noKtp} onChange={e => setNoKtp(e.target.value)} className="input-field font-mono" placeholder="16 digit NIK" />
            </div>
            <div>
              <label className="label">No. HP</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="08xx-xxxx-xxxx" />
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />} {editData ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">Belum ada data karyawan</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead><tr className="table-header">
              <th className="p-3 text-left">Nama</th>
              <th className="p-3 text-left">Jabatan</th>
              <th className="p-3 text-left">No. KTP</th>
              <th className="p-3 text-left">No. HP</th>
              <th className="p-3 w-20"></th>
            </tr></thead>
            <tbody>
              {list.map(k => (
                <tr key={k.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{k.name}</td>
                  <td className="p-3 text-gray-600">{k.jabatan || '-'}</td>
                  <td className="p-3 font-mono text-xs text-gray-500">{k.noKtp || '-'}</td>
                  <td className="p-3 text-gray-600">{k.phone || '-'}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openForm(k)} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(k.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Hapus Karyawan"
          message="Data karyawan akan dihapus permanen."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// ─── Template Form Modal ──────────────────────────────────────────────────────
function TemplateFormModal({ onSaved, onClose }) {
  const { currentUser } = useAuth()
  const detailAccounts = getDetailAccounts()

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency]     = useState('monthly')
  const [firstRunDate, setFirstRunDate] = useState(new Date().toISOString().slice(0, 10))
  const [maxExecutions, setMaxExecutions] = useState('')
  const [lines, setLines] = useState([
    { accountCode: '', debit: 0, credit: 0, keterangan: '' },
    { accountCode: '', debit: 0, credit: 0, keterangan: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 1

  const updateLine = (idx, field, val) =>
    setLines(prev => prev.map((l, i) => i !== idx ? l : {
      ...l,
      [field]: field === 'debit' || field === 'credit' ? (parseFloat(val) || 0) : val,
    }))

  const addLine    = () => setLines(prev => [...prev, { accountCode: '', debit: 0, credit: 0, keterangan: '' }])
  const removeLine = (idx) => { if (lines.length > 2) setLines(prev => prev.filter((_, i) => i !== idx)) }

  const handleSave = async () => {
    setError('')
    if (!name.trim())        return setError('Nama template wajib diisi')
    if (!description.trim()) return setError('Deskripsi jurnal wajib diisi')
    if (!firstRunDate)       return setError('Tanggal pertama eksekusi wajib diisi')
    if (!isBalanced)         return setError('Jurnal belum balance — pastikan total debit = kredit')
    if (lines.some(l => !l.accountCode))       return setError('Semua baris harus memiliki akun')
    if (lines.some(l => !l.keterangan?.trim())) return setError('Keterangan setiap baris wajib diisi')

    setSaving(true)
    try {
      const dayOfMonth = new Date(firstRunDate + 'T00:00:00').getDate()
      await saveRecurringTemplate({
        name: name.trim(),
        description: description.trim(),
        frequency,
        dayOfMonth,
        nextRunDate: firstRunDate,
        maxExecutions: maxExecutions ? parseInt(maxExecutions) : null,
        executionCount: 0,
        lines,
        createdBy: currentUser?.uid,
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const FREQ_LABEL = { monthly: 'bulan', quarterly: 'triwulan', yearly: 'tahun' }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-5 border-b rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-800">Buat Template Jurnal Berulang</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Nama + Deskripsi */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nama Template</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Contoh: Depresiasi Bulanan" />
            </div>
            <div>
              <label className="label">Deskripsi Jurnal</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Deskripsi yang muncul di setiap jurnal" />
            </div>
          </div>

          {/* Frekuensi + Tgl Pertama + Maks Eksekusi */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Frekuensi</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} className="select-field">
                <option value="monthly">Bulanan</option>
                <option value="quarterly">Triwulan</option>
                <option value="yearly">Tahunan</option>
              </select>
            </div>
            <div>
              <label className="label">Tanggal Pertama Eksekusi</label>
              <input type="date" value={firstRunDate} onChange={e => setFirstRunDate(e.target.value)} className="input-field" />
              {firstRunDate && (
                <p className="text-xs text-gray-400 mt-1">
                  Tanggal {new Date(firstRunDate + 'T00:00:00').getDate()} setiap {FREQ_LABEL[frequency]}
                </p>
              )}
            </div>
            <div>
              <label className="label">Maks. Eksekusi <span className="text-gray-400 font-normal">(opsional)</span></label>
              <input type="number" min="1" value={maxExecutions} onChange={e => setMaxExecutions(e.target.value)}
                className="input-field" placeholder="Kosong = tidak terbatas" />
              {maxExecutions && (
                <p className="text-xs text-gray-400 mt-1">Selesai otomatis setelah {maxExecutions}×</p>
              )}
            </div>
          </div>

          {/* Baris Jurnal */}
          <div>
            <label className="label mb-2">Baris Jurnal</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left border-b border-gray-200 w-44">Akun</th>
                    <th className="p-2 text-right border-b border-gray-200 w-28">Debit (Rp)</th>
                    <th className="p-2 text-right border-b border-gray-200 w-28">Kredit (Rp)</th>
                    <th className="p-2 text-left border-b border-gray-200">Keterangan Baris</th>
                    <th className="p-2 border-b border-gray-200 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                      <td className="p-1">
                        <select value={line.accountCode} onChange={e => updateLine(idx, 'accountCode', e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded p-1 bg-white focus:ring-1 focus:ring-brand-500">
                          <option value="">-- Pilih Akun --</option>
                          {detailAccounts.map(a => (
                            <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1">
                        <input type="number" min="0" value={line.debit || ''} placeholder="0"
                          onChange={e => updateLine(idx, 'debit', e.target.value)}
                          className="w-full text-xs text-right border border-gray-200 rounded p-1 focus:ring-1 focus:ring-brand-500" />
                      </td>
                      <td className="p-1">
                        <input type="number" min="0" value={line.credit || ''} placeholder="0"
                          onChange={e => updateLine(idx, 'credit', e.target.value)}
                          className="w-full text-xs text-right border border-gray-200 rounded p-1 focus:ring-1 focus:ring-brand-500" />
                      </td>
                      <td className="p-1">
                        <input type="text" value={line.keterangan || ''} placeholder="Keterangan baris..."
                          onChange={e => updateLine(idx, 'keterangan', e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-brand-500" />
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                          className="text-gray-300 hover:text-red-500 disabled:opacity-30">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td className="p-2 text-xs font-semibold text-gray-600">Total</td>
                    <td className={`p-2 text-right text-xs font-mono font-semibold ${!isBalanced ? 'text-red-600' : 'text-green-700'}`}>
                      {formatCurrency(totalDebit)}
                    </td>
                    <td className={`p-2 text-right text-xs font-mono font-semibold ${!isBalanced ? 'text-red-600' : 'text-green-700'}`}>
                      {formatCurrency(totalCredit)}
                    </td>
                    <td colSpan={2} className="p-2 text-xs">
                      {isBalanced
                        ? <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Balance</span>
                        : <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Tidak Balance</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button onClick={addLine} className="mt-2 text-xs text-brand-600 hover:underline">+ Tambah Baris</button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSave} disabled={saving || !isBalanced} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Template
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Jurnal Berulang ─────────────────────────────────────────────────────────
function RecurringTab() {
  const { currentUser } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [deleteId, setDeleteId]   = useState(null)
  const [runId, setRunId]         = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [running, setRunning]     = useState(false)
  const [error, setError]         = useState('')
  const [editDateId, setEditDateId]     = useState(null)
  const [editDateValue, setEditDateValue] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try { setTemplates(await getRecurringTemplates()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async () => {
    await deleteRecurringTemplate(deleteId)
    setDeleteId(null); loadData()
  }

  const handleRun = async () => {
    const tmpl = templates.find(t => t.id === runId)
    if (!tmpl) return
    setRunning(true); setError('')
    try {
      const id = await executeRecurringJournal(tmpl, currentUser?.uid)
      setRunResult(id)
      loadData()
    } catch (e) { setError(e.message) } finally { setRunning(false); setRunId(null) }
  }

  const handleSaveDate = async (id) => {
    if (!editDateValue) { setEditDateId(null); return }
    try {
      await updateRecurringTemplateNextRunDate(id, editDateValue)
      setEditDateId(null)
      loadData()
    } catch (e) { setError(e.message) }
  }

  const FREQ_LABEL = { monthly: 'Bulanan', quarterly: 'Triwulan', yearly: 'Tahunan' }

  const activeTemplates    = templates.filter(t => t.status !== 'completed')
  const completedTemplates = templates.filter(t => t.status === 'completed')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Buat Template Baru
        </button>
      </div>

      {runResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Jurnal berhasil dibuat (ID: {runResult})
          <button onClick={() => setRunResult(null)} className="ml-auto text-green-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          <Repeat className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Belum ada template jurnal berulang.
          <br />
          <button onClick={() => setShowForm(true)} className="mt-2 text-brand-600 text-sm hover:underline">
            Buat template pertama
          </button>
        </div>
      ) : (
        <>
          {/* Active templates */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-purple-500" /> Template Aktif
                <span className="text-xs font-normal text-gray-400">({activeTemplates.length})</span>
              </span>
            </div>
            {activeTemplates.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Semua template sudah selesai</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="table-header">
                  <th className="p-3 text-left">Nama Template</th>
                  <th className="p-3 text-left">Deskripsi</th>
                  <th className="p-3 text-center">Frekuensi</th>
                  <th className="p-3 text-center">Eksekusi</th>
                  <th className="p-3 text-center">Berikutnya</th>
                  <th className="p-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {activeTemplates.map(t => {
                    const execCount = t.executionCount || 0
                    const maxExec   = t.maxExecutions || null
                    const remaining = maxExec ? maxExec - execCount : null
                    return (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">{t.name || t.description}</td>
                        <td className="p-3 text-gray-600 text-xs">{t.description}</td>
                        <td className="p-3 text-center">
                          <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{FREQ_LABEL[t.frequency] || t.frequency}</span>
                        </td>
                        <td className="p-3 text-center text-xs">
                          <span className="font-mono text-gray-700">{execCount}</span>
                          {maxExec ? (
                            <>
                              <span className="text-gray-400"> / {maxExec}</span>
                              {remaining <= 3 && (
                                <span className="ml-1 text-orange-500 font-medium">({remaining} lagi)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400"> / ∞</span>
                          )}
                        </td>
                        <td className="p-3 text-center text-xs text-gray-500">
                          {editDateId === t.id ? (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="date"
                                value={editDateValue}
                                onChange={e => setEditDateValue(e.target.value)}
                                className="border border-brand-400 rounded px-1 py-0.5 text-xs"
                                autoFocus
                              />
                              <button onClick={() => handleSaveDate(t.id)} className="text-green-600 hover:text-green-800" title="Simpan">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditDateId(null)} className="text-gray-400 hover:text-gray-600" title="Batal">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="cursor-pointer hover:text-brand-600"
                              title="Klik untuk edit tanggal"
                              onClick={() => { setEditDateId(t.id); setEditDateValue(t.nextRunDate || '') }}
                            >
                              {t.nextRunDate || '-'}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => setRunId(t.id)}
                              title="Jalankan sekarang"
                              className="p-1.5 hover:bg-green-50 text-green-500 hover:text-green-700 rounded-lg"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteId(t.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Completed templates */}
          {completedTemplates.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-500 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-gray-400" /> Template Selesai
                  <span className="text-xs font-normal text-gray-400">({completedTemplates.length})</span>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="table-header">
                  <th className="p-3 text-left">Nama Template</th>
                  <th className="p-3 text-left">Deskripsi</th>
                  <th className="p-3 text-center">Frekuensi</th>
                  <th className="p-3 text-center">Total Eksekusi</th>
                  <th className="p-3 text-center">Terakhir Dijalankan</th>
                  <th className="p-3 w-16"></th>
                </tr></thead>
                <tbody>
                  {completedTemplates.map(t => (
                    <tr key={t.id} className="border-t border-gray-100 bg-gray-50/50 opacity-70">
                      <td className="p-3 font-medium text-gray-600">{t.name || t.description}</td>
                      <td className="p-3 text-gray-500 text-xs">{t.description}</td>
                      <td className="p-3 text-center">
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{FREQ_LABEL[t.frequency] || t.frequency}</span>
                      </td>
                      <td className="p-3 text-center text-xs font-mono text-gray-600">
                        {t.executionCount || 0} / {t.maxExecutions || '-'}
                      </td>
                      <td className="p-3 text-center text-xs text-gray-500">
                        {t.lastExecuted ? t.lastExecuted.slice(0, 10) : '-'}
                      </td>
                      <td className="p-3">
                        <button onClick={() => setDeleteId(t.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm && (
        <TemplateFormModal
          onSaved={loadData}
          onClose={() => setShowForm(false)}
        />
      )}

      {runId && (() => {
        const tmpl = templates.find(t => t.id === runId)
        const execCount = tmpl?.executionCount || 0
        const maxExec   = tmpl?.maxExecutions || null
        const remaining = maxExec ? maxExec - execCount : null
        return (
          <ConfirmDialog
            title="Jalankan Jurnal Berulang"
            message={`Jurnal "${tmpl?.name || ''}" akan dibuat untuk tanggal ${tmpl?.nextRunDate || '-'}.${
              remaining === 1
                ? ' Ini adalah eksekusi terakhir — template akan otomatis selesai.'
                : remaining
                  ? ` Sisa ${remaining - 1} eksekusi setelah ini.`
                  : ''
            } Lanjutkan?`}
            confirmLabel={running ? 'Memproses...' : 'Jalankan'}
            onConfirm={handleRun}
            onCancel={() => setRunId(null)}
          />
        )
      })()}

      {deleteId && (
        <ConfirmDialog
          title="Hapus Template"
          message="Template jurnal berulang ini akan dihapus. Jurnal yang sudah dibuat tidak terpengaruh."
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// ─── Tutup Buku ──────────────────────────────────────────────────────────────
function TutupBukuTab() {
  const { currentUser } = useAuth()
  const [year, setYear]       = useState(new Date().getFullYear() - 1)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')
  const [confirm, setConfirm] = useState(false)

  const handleClose = async () => {
    setConfirm(false); setLoading(true); setError(''); setResult(null)
    try {
      const res = await generateClosingJournals(year, currentUser?.uid)
      setResult(res)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-800 space-y-1">
        <p className="font-semibold">Peringatan Penting</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>Tutup buku akan membuat jurnal penutup untuk semua akun pendapatan dan beban.</li>
          <li>Pastikan semua transaksi tahun yang bersangkutan sudah selesai diinput.</li>
          <li>Proses ini tidak menghapus data — jurnal penutup bisa dihapus manual jika ada kesalahan.</li>
        </ul>
      </div>

      <div>
        <label className="label">Tahun yang Ditutup</label>
        <input
          type="number"
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="input-field w-32"
          min="2000"
          max={new Date().getFullYear()}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-green-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Tutup buku tahun {year} berhasil!
          </p>
          <p className="text-sm text-green-700">
            {result.journalIds.length} jurnal penutup dibuat. Laba/Rugi bersih:{' '}
            <span className={`font-bold ${result.netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatCurrency(Math.abs(result.netIncome))} {result.netIncome < 0 ? '(Rugi)' : '(Laba)'}
            </span>
          </p>
          <p className="text-xs text-gray-500">Jurnal dapat dilihat di menu Jurnal Umum (filter tipe: Penutup).</p>
        </div>
      )}

      <button
        onClick={() => setConfirm(true)}
        disabled={loading}
        className="bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
        {loading ? 'Memproses...' : `Tutup Buku Tahun ${year}`}
      </button>

      {confirm && (
        <ConfirmDialog
          title={`Tutup Buku Tahun ${year}`}
          message={`Jurnal penutup untuk tahun ${year} akan dibuat. Pastikan semua entri sudah lengkap. Lanjutkan?`}
          confirmLabel="Tutup Buku"
          onConfirm={handleClose}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'profil',    label: 'Profil Perusahaan', icon: Building2 },
  { key: 'pengguna',  label: 'Pengguna',           icon: Users     },
  { key: 'karyawan',  label: 'Karyawan',           icon: UserCheck },
  { key: 'recurring', label: 'Jurnal Berulang',    icon: Repeat    },
  { key: 'closing',   label: 'Tutup Buku',         icon: Archive   },
]

export default function PengaturanPage() {
  const { isSuperadmin } = useAuth()
  const [tab, setTab] = useState('profil')

  if (!isSuperadmin()) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">Akses Terbatas</p>
        <p className="text-sm">Halaman ini hanya dapat diakses oleh Superadmin.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pengaturan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Konfigurasi sistem dan data master</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${tab === key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'profil'    && <ProfilTab />}
      {tab === 'pengguna'  && <PenggunaTab />}
      {tab === 'karyawan'  && <KaryawanTab />}
      {tab === 'recurring' && <RecurringTab />}
      {tab === 'closing'   && <TutupBukuTab />}
    </div>
  )
}
