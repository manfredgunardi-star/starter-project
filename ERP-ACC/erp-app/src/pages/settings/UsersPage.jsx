import { useState, useEffect } from 'react'
import { getUsers, createUser, updateUserProfile, deactivateUser, reactivateUser } from '../../services/userService'
import { useToast } from '../../components/ui/ToastContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Edit2, Trash2, RotateCcw, Plus } from 'lucide-react'
import { Space, Typography, Tag, Alert, Card, Form, Input, Select, Flex, Tooltip } from 'antd'

const { Title, Text } = Typography

const ROLE_LABELS = {
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer',
}

const ROLE_TAG_COLOR = {
  admin: 'error',
  staff: 'blue',
  viewer: 'default',
}

function UserForm({ user, onSave, onCancel, isSaving, onError }) {
  const [form] = Form.useForm()

  const handleFinish = (values) => {
    if (!values.full_name?.trim()) {
      onError('Nama lengkap tidak boleh kosong')
      return
    }
    onSave({ full_name: values.full_name, role: values.role })
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ full_name: user?.full_name || '', role: user?.role || 'viewer' }}
      onFinish={handleFinish}
    >
      <Form.Item label="Nama Lengkap" name="full_name" rules={[{ required: true, message: 'Nama wajib diisi' }]}>
        <Input disabled={isSaving} />
      </Form.Item>
      <Form.Item label="Role" name="role">
        <Select
          disabled={isSaving}
          options={[
            { value: 'viewer', label: 'Viewer' },
            { value: 'staff', label: 'Staff' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
      </Form.Item>
      <Space>
        <Button type="submit" variant="primary" loading={isSaving}>Simpan</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>Batal</Button>
      </Space>
    </Form>
  )
}

function CreateUserForm({ onSave, onCancel, isSaving, onError }) {
  const [form] = Form.useForm()
  const [password, setPassword] = useState('')

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let p = ''
    for (let i = 0; i < 10; i++) {
      p += chars[Math.floor(Math.random() * chars.length)]
    }
    setPassword(p)
    form.setFieldValue('password', p)
  }

  const handleFinish = (values) => {
    const trimmedEmail = values.email?.trim()
    const trimmedName = values.full_name?.trim()
    const trimmedPassword = values.password?.trim()

    if (!trimmedEmail) { onError('Email tidak boleh kosong'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { onError('Format email tidak valid'); return }
    if (!trimmedPassword || trimmedPassword.length < 6) { onError('Password minimal 6 karakter'); return }
    if (!trimmedName) { onError('Nama lengkap tidak boleh kosong'); return }

    onSave({ email: trimmedEmail, password: trimmedPassword, full_name: trimmedName, role: values.role })
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ role: 'viewer' }}
      onFinish={handleFinish}
      autoComplete="off"
    >
      <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Email valid wajib diisi' }]}>
        <Input type="email" disabled={isSaving} placeholder="user@contoh.com" autoComplete="off" />
      </Form.Item>
      <Form.Item label="Password Sementara" name="password" rules={[{ required: true, min: 6, message: 'Password minimal 6 karakter' }]}>
        <Flex gap={8}>
          <Input
            value={password}
            onChange={e => { setPassword(e.target.value); form.setFieldValue('password', e.target.value) }}
            disabled={isSaving}
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
            style={{ fontFamily: 'monospace', flex: 1 }}
          />
          <Button type="button" variant="secondary" onClick={generatePassword} disabled={isSaving}>
            Generate
          </Button>
        </Flex>
      </Form.Item>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -16, marginBottom: 12 }}>
        Berikan password ini kepada user. Mereka dapat mengubahnya setelah login.
      </Text>
      <Form.Item label="Nama Lengkap" name="full_name" rules={[{ required: true, message: 'Nama wajib diisi' }]}>
        <Input disabled={isSaving} />
      </Form.Item>
      <Form.Item label="Role" name="role">
        <Select
          disabled={isSaving}
          options={[
            { value: 'viewer', label: 'Viewer — hanya bisa melihat data' },
            { value: 'staff', label: 'Staff — bisa input & edit transaksi' },
            { value: 'admin', label: 'Admin — akses penuh termasuk manajemen user' },
          ]}
        />
      </Form.Item>
      <Alert
        type="info"
        style={{ marginBottom: 16 }}
        message={
          <Space direction="vertical" size={2} style={{ fontSize: 12 }}>
            <div><strong>Viewer:</strong> read-only. Bisa lihat semua data & laporan.</div>
            <div><strong>Staff:</strong> bisa input transaksi (PO, invoice, payment, dll).</div>
            <div><strong>Admin:</strong> akses penuh + manajemen user + audit log.</div>
          </Space>
        }
      />
      <Space>
        <Button type="submit" variant="primary" loading={isSaving}>Buat User</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>Batal</Button>
      </Space>
    </Form>
  )
}

function UserRow({ user, onEdit, onDeactivate, onReactivate, isProcessing }) {
  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '8px 16px', fontSize: 13, color: '#111827' }}>{user.full_name || '—'}</td>
      <td style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', color: '#6b7280' }}>{user.id.slice(0, 8)}…</td>
      <td style={{ padding: '8px 16px' }}>
        <Tag color={ROLE_TAG_COLOR[user.role] || 'default'} style={{ fontSize: 11 }}>
          {ROLE_LABELS[user.role]}
        </Tag>
      </td>
      <td style={{ padding: '8px 16px', fontSize: 12, color: '#4b5563' }}>{formatDate(user.created_at)}</td>
      <td style={{ padding: '8px 16px' }}>
        {user.is_active ? (
          <Tag color="success" style={{ fontSize: 11 }}>Aktif</Tag>
        ) : (
          <Tag color="error" style={{ fontSize: 11 }}>Nonaktif</Tag>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <Space size={8}>
          <Tooltip title="Edit">
            <button
              onClick={() => onEdit(user)}
              style={{ color: '#2563eb', background: 'none', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.4 : 1 }}
              disabled={isProcessing}
            >
              <Edit2 size={16} />
            </button>
          </Tooltip>
          {user.is_active ? (
            <Tooltip title="Nonaktifkan">
              <button
                onClick={() => onDeactivate(user.id)}
                style={{ color: '#dc2626', background: 'none', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.4 : 1 }}
                disabled={isProcessing}
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip title="Aktifkan kembali">
              <button
                onClick={() => onReactivate(user.id)}
                style={{ color: '#16a34a', background: 'none', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.4 : 1 }}
                disabled={isProcessing}
              >
                <RotateCcw size={16} />
              </button>
            </Tooltip>
          )}
        </Space>
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
  const [creatingUser, setCreatingUser] = useState(false)
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

  const handleEdit = (user) => setEditingUser(user)

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

  const handleCreate = async ({ email, password, full_name, role }) => {
    setIsSaving(true)
    try {
      await createUser({ email, password, full_name, role })
      toast.success(`User ${email} berhasil dibuat`)
      await loadUsers()
      setCreatingUser(false)
    } catch (err) {
      toast.error('Gagal membuat user: ' + err.message)
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
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Title level={2} style={{ margin: 0 }}>Manajemen Users</Title>
        {!creatingUser && !editingUser && (
          <Button variant="primary" onClick={() => setCreatingUser(true)}>
            <Plus size={16} style={{ display: 'inline', marginRight: 4 }} />
            Tambah User
          </Button>
        )}
      </Flex>

      {loading && <LoadingSpinner message="Memuat users..." />}
      {error && <Alert type="error" message={error} showIcon />}

      {creatingUser && (
        <Card title="Tambah User Baru" style={{ background: '#f9fafb' }}>
          <CreateUserForm
            onSave={handleCreate}
            onCancel={() => setCreatingUser(false)}
            isSaving={isSaving}
            onError={(msg) => toast.error(msg)}
          />
        </Card>
      )}

      {editingUser && (
        <Card title="Edit User" style={{ background: '#f9fafb' }}>
          <UserForm
            user={editingUser}
            onSave={handleSave}
            onCancel={() => setEditingUser(null)}
            isSaving={isSaving}
            onError={(msg) => toast.error(msg)}
          />
        </Card>
      )}

      {users && !loading && (
        <Card bodyStyle={{ padding: 0 }}>
          <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 500, color: '#374151' }}>
            {users.length} user
          </div>
          {users.length === 0 ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 16px' }}>
              Tidak ada user.
            </Text>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <tr>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Nama</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>User ID</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Role</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Bergabung</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Status</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Aksi</th>
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
            </div>
          )}
        </Card>
      )}
    </Space>
  )
}
