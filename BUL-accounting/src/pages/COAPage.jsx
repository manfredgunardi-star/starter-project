import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getMergedCOA, getNormalBalance } from '../data/chartOfAccounts'
import {
  getCustomCOA, getCOAOverrides, addCustomAccount,
  deactivateAccount, reactivateAccount,
  deactivateBuiltinAccount, reactivateBuiltinAccount,
} from '../utils/accounting'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, X, Search, RefreshCw, AlertCircle, ChevronRight } from 'lucide-react'

const LEVEL_INDENT = ['', 'pl-0', 'pl-4', 'pl-8', 'pl-12']
const TYPE_STYLES = {
  header: 'font-semibold text-gray-700 bg-gray-50',
  detail: 'text-gray-800',
}
const CATEGORY_COLORS = {
  '1': 'text-blue-700',
  '2': 'text-red-700',
  '3': 'text-purple-700',
  '4': 'text-green-700',
  '5': 'text-orange-700',
  '6': 'text-yellow-700',
  '7': 'text-teal-700',
  '8': 'text-pink-700',
  '9': 'text-gray-600',
}

function AccountForm({ mergedCOA, onSaved, onClose }) {
  const [code, setCode]               = useState('')
  const [name, setName]               = useState('')
  const [parent, setParent]           = useState('')
  const [type, setType]               = useState('detail')
  const [normalBalance, setNormalBal] = useState('debit')
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)

  // Auto-derive normalBalance from code prefix
  useEffect(() => {
    if (code) {
      const nb = getNormalBalance(code)
      setNormalBal(nb)
    }
  }, [code])

  const handleSave = async () => {
    setError('')
    if (!code.trim()) return setError('Kode akun wajib diisi')
    if (!/^\d{4,6}$/.test(code.trim())) return setError('Kode akun harus 4–6 digit angka')
    if (!name.trim()) return setError('Nama akun wajib diisi')
    if (mergedCOA.some(a => a.code === code.trim())) return setError('Kode akun sudah digunakan')

    const level = parent ? (mergedCOA.find(a => a.code === parent)?.level ?? 1) + 1 : 0

    setSaving(true)
    try {
      await addCustomAccount({ code: code.trim(), name: name.trim(), parent: parent || null, level, type, normalBalance })
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const headerAccounts = mergedCOA.filter(a => a.type === 'header' && !a.inactive)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Tambah Akun Custom</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Kode Akun</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} className="input-field font-mono"
                placeholder="mis. 5191" autoFocus />
            </div>
            <div>
              <label className="label">Tipe</label>
              <select value={type} onChange={e => setType(e.target.value)} className="select-field">
                <option value="detail">Detail (bisa dijurnal)</option>
                <option value="header">Header (grup)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nama Akun</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field"
              placeholder="Nama akun..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Parent (opsional)</label>
              <select value={parent} onChange={e => setParent(e.target.value)} className="select-field">
                <option value="">-- Tidak ada --</option>
                {headerAccounts.map(a => (
                  <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Saldo Normal</label>
              <select value={normalBalance} onChange={e => setNormalBal(e.target.value)} className="select-field">
                <option value="debit">Debit</option>
                <option value="credit">Kredit</option>
              </select>
            </div>
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
            Tambah Akun
          </button>
        </div>
      </div>
    </div>
  )
}

export default function COAPage() {
  const { isSuperadmin } = useAuth()
  const [mergedCOA, setMergedCOA] = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // { account, action: 'deactivate'|'reactivate' }
  const [filter, setFilter]       = useState('all') // 'all' | 'active' | 'inactive' | 'custom'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [custom, overrides] = await Promise.all([getCustomCOA(), getCOAOverrides()])
      setMergedCOA(getMergedCOA(custom, overrides))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleToggle = async () => {
    const { account, action } = confirmAction
    setConfirmAction(null)
    try {
      if (action === 'deactivate') {
        if (account.custom) await deactivateAccount(account.firestoreId)
        else await deactivateBuiltinAccount(account.code)
      } else {
        if (account.custom) await reactivateAccount(account.firestoreId)
        else await reactivateBuiltinAccount(account.code)
      }
      loadData()
    } catch (e) {
      alert('Gagal: ' + e.message)
    }
  }

  const filtered = mergedCOA.filter(a => {
    if (filter === 'active'   && a.inactive) return false
    if (filter === 'inactive' && !a.inactive) return false
    if (filter === 'custom'   && !a.custom) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalActive   = mergedCOA.filter(a => !a.inactive && a.type === 'detail').length
  const totalInactive = mergedCOA.filter(a => a.inactive).length
  const totalCustom   = mergedCOA.filter(a => a.custom).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Chart of Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daftar akun buku besar</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kode / nama..."
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-48" />
          </div>
          {isSuperadmin() && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Akun
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Akun Detail Aktif', value: totalActive,   color: 'text-green-700' },
          { label: 'Akun Tidak Aktif',  value: totalInactive, color: 'text-red-600'   },
          { label: 'Akun Custom',        value: totalCustom,   color: 'text-brand-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'all',      label: 'Semua' },
          { key: 'active',   label: 'Aktif' },
          { key: 'inactive', label: 'Tidak Aktif' },
          { key: 'custom',   label: 'Custom' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400 text-sm">
          {search ? 'Tidak ada akun yang cocok' : 'Belum ada data'}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left w-32">Kode</th>
                <th className="p-3 text-left">Nama Akun</th>
                <th className="p-3 text-center w-24">Tipe</th>
                <th className="p-3 text-center w-24">Saldo</th>
                <th className="p-3 text-center w-24">Status</th>
                {isSuperadmin() && <th className="p-3 w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.custom ? `custom-${a.firestoreId || a.code}` : a.code}
                  className={`border-t border-gray-100 ${a.inactive ? 'opacity-40' : 'hover:bg-gray-50'} ${a.type === 'header' ? 'bg-gray-50/60' : ''}`}
                >
                  <td className={`p-3 font-mono text-xs font-bold ${CATEGORY_COLORS[a.code.charAt(0)] || 'text-gray-600'}`}>
                    {a.code}
                  </td>
                  <td className={`p-3 ${LEVEL_INDENT[a.level] || 'pl-12'}`}>
                    <span className={a.type === 'header' ? 'font-semibold text-gray-700' : 'text-gray-800'}>
                      {a.type === 'header' && <ChevronRight className="w-3 h-3 inline mr-1 text-gray-400" />}
                      {a.name}
                    </span>
                    {a.custom && (
                      <span className="ml-2 text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-medium">custom</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.type === 'header' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
                      {a.type === 'header' ? 'Header' : 'Detail'}
                    </span>
                  </td>
                  <td className="p-3 text-center text-xs text-gray-500 capitalize">
                    {a.type === 'detail' ? a.normalBalance : '—'}
                  </td>
                  <td className="p-3 text-center">
                    {a.inactive ? (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Non-aktif</span>
                    ) : (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Aktif</span>
                    )}
                  </td>
                  {isSuperadmin() && (
                    <td className="p-3 text-right">
                      {a.inactive ? (
                        <button
                          onClick={() => setConfirmAction({ account: a, action: 'reactivate' })}
                          className="text-xs text-green-600 hover:underline"
                        >
                          Aktifkan
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction({ account: a, action: 'deactivate' })}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Non-aktifkan
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AccountForm mergedCOA={mergedCOA} onSaved={loadData} onClose={() => setShowForm(false)} />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.action === 'deactivate' ? 'Non-aktifkan Akun' : 'Aktifkan Akun'}
          message={
            confirmAction.action === 'deactivate'
              ? `Akun ${confirmAction.account.code} - ${confirmAction.account.name} tidak akan tersedia di dropdown jurnal.`
              : `Akun ${confirmAction.account.code} - ${confirmAction.account.name} akan aktif kembali.`
          }
          confirmLabel={confirmAction.action === 'deactivate' ? 'Non-aktifkan' : 'Aktifkan'}
          confirmVariant={confirmAction.action === 'deactivate' ? 'danger' : 'primary'}
          onConfirm={handleToggle}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
