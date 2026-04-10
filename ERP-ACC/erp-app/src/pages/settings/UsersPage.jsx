import { useState, useEffect } from 'react'
import { getUsers, updateUserProfile, deactivateUser, reactivateUser } from '../../services/userService'
import { useToast } from '../../components/ui/ToastContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Edit2, Trash2, RotateCcw } from 'lucide-react'

const ROLE_LABELS = {
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer',
}

const ROLE_BADGE = {
  admin: 'bg-red-100 text-red-700',
  staff: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-700',
}

function UserForm({ user, onSave, onCancel, isSaving, onError }) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [role, setRole] = useState(user?.role || 'viewer')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!fullName.trim()) {
      onError('Nama lengkap tidak boleh kosong')
      return
    }
    onSave({ full_name: fullName, role })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          disabled={isSaving}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          disabled={isSaving}
        >
          <option value="viewer">Viewer</option>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={isSaving}>
          Simpan
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          Batal
        </Button>
      </div>
    </form>
  )
}

function UserRow({ user, onEdit, onDeactivate, onReactivate, isProcessing }) {
  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50">
      <td className="px-4 py-2 text-sm text-gray-900">{user.full_name || '—'}</td>
      <td className="px-4 py-2 text-xs font-mono text-gray-500">{user.id.slice(0, 8)}…</td>
      <td className="px-4 py-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role] || 'bg-gray-100'}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-gray-600">{formatDate(user.created_at)}</td>
      <td className="px-4 py-2">
        {user.is_active ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Aktif</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Nonaktif</span>
        )}
      </td>
      <td className="px-4 py-2 text-sm flex gap-2">
        <button
          onClick={() => onEdit(user)}
          className="text-blue-600 hover:text-blue-800 disabled:text-gray-400"
          disabled={isProcessing}
          title="Edit"
        >
          <Edit2 size={16} />
        </button>
        {user.is_active ? (
          <button
            onClick={() => onDeactivate(user.id)}
            className="text-red-600 hover:text-red-800 disabled:text-gray-400"
            disabled={isProcessing}
            title="Nonaktifkan"
          >
            <Trash2 size={16} />
          </button>
        ) : (
          <button
            onClick={() => onReactivate(user.id)}
            className="text-green-600 hover:text-green-800 disabled:text-gray-400"
            disabled={isProcessing}
            title="Aktifkan kembali"
          >
            <RotateCcw size={16} />
          </button>
        )}
      </td>
    </tr>
  )
}

export default function UsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getUsers()
      setUsers(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (user) => {
    setEditingUser(user)
  }

  const handleSave = async (updates) => {
    setIsSaving(true)
    try {
      await updateUserProfile(editingUser.id, { ...editingUser, ...updates, is_active: true })
      toast.success('User berhasil diperbarui')
      setEditingUser(null)
      await loadUsers()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!window.confirm('Nonaktifkan user ini?')) return
    try {
      await deactivateUser(id)
      toast.success('User berhasil dinonaktifkan')
      await loadUsers()
    } catch (err) {
      toast.error('Gagal menonaktifkan: ' + err.message)
    }
  }

  const handleReactivate = async (id) => {
    if (!window.confirm('Aktifkan kembali user ini?')) return
    try {
      await reactivateUser(id)
      toast.success('User berhasil diaktifkan kembali')
      await loadUsers()
    } catch (err) {
      toast.error('Gagal mengaktifkan: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Manajemen Users</h1>

      {loading && <LoadingSpinner message="Memuat users..." />}
      {error && <div className="text-red-600 text-sm">{error}</div>}

      {editingUser && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit User</h2>
          <UserForm
            user={editingUser}
            onSave={handleSave}
            onCancel={() => setEditingUser(null)}
            isSaving={isSaving}
            onError={(msg) => toast.error(msg)}
          />
        </div>
      )}

      {users && !loading && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-200">
            {users.length} user
          </div>
          {users.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Tidak ada user.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Nama</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">User ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Role</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Bergabung</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                    onReactivate={handleReactivate}
                    isProcessing={isSaving}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
