import { useState, useMemo } from 'react'
import { Space, Flex, Row, Col, Typography, Tag } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useCOA } from '../../hooks/useMasterData'
import * as svc from '../../services/masterDataService'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Edit2, Trash2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'asset', label: 'Aset' },
  { value: 'liability', label: 'Kewajiban' },
  { value: 'equity', label: 'Modal' },
  { value: 'revenue', label: 'Pendapatan' },
  { value: 'expense', label: 'Beban' },
]

const TYPE_LABELS = {
  asset: 'Aset',
  liability: 'Kewajiban',
  equity: 'Modal',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

const NORMAL_BALANCE_LABELS = {
  debit: 'Debit',
  credit: 'Kredit',
}

const emptyForm = {
  code: '',
  name: '',
  type: '',
  parent_id: '',
}

// Build a flat list with computed depth via DFS traversal
function buildTreeList(accounts) {
  const byId = {}
  const roots = []

  for (const acc of accounts) {
    byId[acc.id] = { ...acc, children: [] }
  }
  for (const acc of accounts) {
    if (acc.parent_id && byId[acc.parent_id]) {
      byId[acc.parent_id].children.push(byId[acc.id])
    } else {
      roots.push(byId[acc.id])
    }
  }

  // Sort children by code at every level
  const sortByCode = (nodes) =>
    nodes.slice().sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  const result = []
  const traverse = (nodes, depth) => {
    for (const node of sortByCode(nodes)) {
      result.push({ ...node, depth })
      if (node.children.length > 0) {
        traverse(node.children, depth + 1)
      }
    }
  }
  traverse(roots, 0)
  return result
}

export default function COAPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const { coa, loading, refetch } = useCOA()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})

  // Derived data
  const treeList = useMemo(() => buildTreeList(coa), [coa])

  const normalBalance = useMemo(
    () => formData.type ? svc.coaNormalBalance(formData.type) : '',
    [formData.type]
  )

  // Parent options: exclude the account being edited and its descendants
  const parentOptions = useMemo(() => {
    if (!editingId) return coa.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }))

    // Find all descendants of editingId to exclude from parent options
    const descendants = new Set()
    const findDesc = (id) => {
      for (const a of coa) {
        if (a.parent_id === id) {
          descendants.add(a.id)
          findDesc(a.id)
        }
      }
    }
    findDesc(editingId)
    descendants.add(editingId)

    return coa
      .filter(a => !descendants.has(a.id))
      .map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }))
  }, [coa, editingId])

  const openAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormErrors({})
    setIsModalOpen(true)
  }

  const openEdit = (account) => {
    setEditingId(account.id)
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_id: account.parent_id || '',
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const field = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (formErrors[key]) setFormErrors(e => ({ ...e, [key]: null }))
  }

  const validate = () => {
    const errors = {}
    if (!formData.code.trim()) errors.code = 'Kode akun wajib diisi'
    if (!formData.name.trim()) errors.name = 'Nama akun wajib diisi'
    if (!formData.type) errors.type = 'Tipe akun wajib dipilih'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        type: formData.type,
        parent_id: formData.parent_id || null,
      }
      if (editingId) {
        await svc.updateCOA(editingId, payload)
        toast.success('Akun berhasil diperbarui')
      } else {
        await svc.createCOA(payload)
        toast.success('Akun berhasil ditambahkan')
      }
      await refetch()
      setIsModalOpen(false)
    } catch (err) {
      // Show duplicate code error clearly
      if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
        setFormErrors(e => ({ ...e, code: 'Kode akun sudah ada' }))
      }
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsSubmitting(true)
    try {
      await svc.softDeleteCOA(deletingId)
      toast.success('Akun berhasil dihapus')
      await refetch()
      setIsDeleteOpen(false)
      setDeletingId(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Memuat Chart of Accounts..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Chart of Accounts</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={openAdd}>
            <Plus size={20} />
            Tambah Akun
          </Button>
        )}
      </Flex>

      {/* COA Tree Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Kode</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Nama Akun</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tipe</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Saldo Normal</th>
              {canWrite && (
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Aksi</th>
              )}
            </tr>
          </thead>
          <tbody>
            {treeList.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 5 : 4} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada data COA
                </td>
              </tr>
            ) : (
              treeList.map((account) => (
                <tr
                  key={account.id}
                  style={{ borderBottom: '1px solid #e5e7eb' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
                    {account.code}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>
                    {/* Indent based on depth */}
                    <span
                      style={{ paddingLeft: `${account.depth * 20}px`, fontWeight: account.depth === 0 ? 600 : undefined }}
                    >
                      {account.depth > 0 && (
                        <span style={{ color: '#9ca3af', marginRight: 4 }}>└</span>
                      )}
                      {account.name}
                    </span>
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>
                    {TYPE_LABELS[account.type] || account.type}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>
                    <Tag color={account.normal_balance === 'debit' ? 'blue' : 'purple'}>
                      {NORMAL_BALANCE_LABELS[account.normal_balance]}
                    </Tag>
                  </td>
                  {canWrite && (
                    <td style={{ padding: '12px 24px', fontSize: 14 }}>
                      <Space>
                        <button
                          onClick={() => openEdit(account)}
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => { setDeletingId(account.id); setIsDeleteOpen(true) }}
                          title="Hapus"
                        >
                          <Trash2 size={18} />
                        </button>
                      </Space>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Akun' : 'Tambah Akun'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Row gutter={16}>
              <Col span={12}>
                <Input
                  label="Kode Akun *"
                  placeholder="Contoh: 1-10000"
                  value={formData.code}
                  onChange={(e) => field('code', e.target.value)}
                  error={formErrors.code}
                  autoFocus
                />
              </Col>
              <Col span={12}>
                <Input
                  label="Nama Akun *"
                  placeholder="Nama akun"
                  value={formData.name}
                  onChange={(e) => field('name', e.target.value)}
                  error={formErrors.name}
                />
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Select
                  label="Tipe Akun *"
                  options={TYPE_OPTIONS}
                  value={formData.type}
                  onChange={(e) => field('type', e.target.value)}
                  error={formErrors.type}
                  placeholder="Pilih tipe..."
                />
              </Col>
              <Col span={12}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>
                    Saldo Normal
                  </label>
                  <div style={{ width: '100%', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#f9fafb', color: normalBalance ? undefined : '#9ca3af' }}>
                    {normalBalance
                      ? NORMAL_BALANCE_LABELS[normalBalance]
                      : '(otomatis dari tipe)'}
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Otomatis berdasarkan tipe akun</p>
                </div>
              </Col>
            </Row>

            <Select
              label="Akun Induk (opsional)"
              options={parentOptions}
              value={formData.parent_id}
              onChange={(e) => field('parent_id', e.target.value)}
              placeholder="— Tidak ada (akun induk) —"
            />

            <Flex justify="flex-end" gap={12} style={{ paddingTop: 8 }}>
              <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                Batal
              </Button>
              <Button variant="primary" type="submit" loading={isSubmitting}>
                {editingId ? 'Simpan' : 'Tambah'}
              </Button>
            </Flex>
          </Space>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Akun"
        message="Akun yang sudah digunakan dalam jurnal tidak dapat dihapus. Lanjutkan?"
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
