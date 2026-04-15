import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useCashBankAccounts, useCOAForCashBank } from '../../hooks/useMasterData'
import * as svc from '../../services/masterDataService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { Space, Flex, Typography } from 'antd'

const emptyForm = {
  name: '',
  type: 'cash',
  coa_id: '',
}

const typeOptions = [
  { value: 'cash', label: 'Kas' },
  { value: 'bank', label: 'Bank' },
]

export default function AccountsPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const { accounts, loading, refetch } = useCashBankAccounts()
  const { coaOptions, loading: coaLoading } = useCOAForCashBank()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})

  const openAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormErrors({})
    setIsModalOpen(true)
  }

  const openEdit = (account) => {
    setEditingId(account.id)
    setFormData({
      name: account.name,
      type: account.type,
      coa_id: account.coa_id,
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const validate = () => {
    const errors = {}
    if (!formData.name.trim()) errors.name = 'Nama akun wajib diisi'
    if (!formData.coa_id) errors.coa_id = 'Akun COA wajib dipilih'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        coa_id: formData.coa_id,
      }
      if (editingId) {
        await svc.updateCashBankAccount(editingId, payload)
        toast.success('Akun berhasil diperbarui')
      } else {
        await svc.createCashBankAccount(payload)
        toast.success('Akun berhasil ditambahkan')
      }
      await refetch()
      setIsModalOpen(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsSubmitting(true)
    try {
      await svc.softDeleteCashBankAccount(deletingId)
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

  const coaOptionsList = (coaOptions || []).map(c => ({
    value: c.id,
    label: `${c.code} — ${c.name}`,
  }))

  const columns = [
    { key: 'name', label: 'Nama Akun' },
    {
      key: 'type',
      label: 'Tipe',
      render: (v) => v === 'cash' ? 'Kas' : 'Bank',
    },
    {
      key: 'coa',
      label: 'Akun COA',
      render: (_, account) => account.coa ? `${account.coa.code} — ${account.coa.name}` : '-',
    },
    {
      key: 'balance',
      label: 'Saldo',
      render: (v) => formatCurrency(v),
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, account) => (
        <Space size="small">
          {canWrite && (
            <>
              <button
                onClick={() => openEdit(account)}
                style={{ color: '#2563eb' }}
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => { setDeletingId(account.id); setIsDeleteOpen(true) }}
                style={{ color: '#dc2626' }}
                title="Hapus"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading || coaLoading) return <LoadingSpinner message="Memuat data akun..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Typography.Title level={2} style={{ margin: 0 }}>Akun Kas / Bank</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={openAdd}>
            <Plus size={20} />
            Tambah Akun
          </Button>
        )}
      </Flex>

      <DataTable columns={columns} data={accounts} emptyMessage="Belum ada data akun kas/bank" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Akun' : 'Tambah Akun'}
        size="md"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Nama Akun *"
            placeholder="Contoh: Kas Kantor, BCA 123456789"
            value={formData.name}
            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
            error={formErrors.name}
            autoFocus
          />

          <Select
            label="Tipe"
            options={typeOptions}
            value={formData.type}
            onChange={(e) => setFormData(p => ({ ...p, type: e.target.value }))}
          />

          <Select
            label="Akun COA *"
            options={coaOptionsList}
            value={formData.coa_id}
            onChange={(e) => setFormData(p => ({ ...p, coa_id: e.target.value }))}
            error={formErrors.coa_id}
            placeholder="Pilih akun kas/bank..."
          />

          <Flex justify="flex-end" gap={12} style={{ paddingTop: 8 }}>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit" loading={isSubmitting}>
              {editingId ? 'Simpan' : 'Tambah'}
            </Button>
          </Flex>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Akun"
        message="Apakah Anda yakin ingin menghapus akun ini? Data transaksi tetap tersimpan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
