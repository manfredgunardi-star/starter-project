import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useSuppliers } from '../../hooks/useMasterData'
import * as svc from '../../services/masterDataService'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Edit2, Trash2, Upload } from 'lucide-react'

const emptyForm = {
  name: '',
  address: '',
  phone: '',
  email: '',
  npwp: '',
}

export default function SuppliersPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const toast = useToast()
  const { suppliers, loading, error, refetch } = useSuppliers()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const openAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const openEdit = (supplier) => {
    setEditingId(supplier.id)
    setFormData({
      name: supplier.name,
      address: supplier.address || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      npwp: supplier.npwp || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setFormError('Nama supplier wajib diisi')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingId) {
        await svc.updateSupplier(editingId, formData)
        toast.success('Supplier berhasil diperbarui')
      } else {
        await svc.createSupplier(formData)
        toast.success('Supplier berhasil ditambahkan')
      }
      await refetch()
      setIsModalOpen(false)
      setFormData(emptyForm)
    } catch (err) {
      setFormError(err.message)
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsSubmitting(true)
    try {
      await svc.softDeleteSupplier(deletingId)
      toast.success('Supplier berhasil dihapus')
      await refetch()
      setIsDeleteOpen(false)
      setDeletingId(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Nama' },
    { key: 'address', label: 'Alamat', render: (v) => v || '-' },
    { key: 'phone', label: 'Telepon', render: (v) => v || '-' },
    { key: 'email', label: 'Email', render: (v) => v || '-' },
    { key: 'npwp', label: 'NPWP', render: (v) => v || '-' },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, supplier) => (
        <Space>
          {canWrite && (
            <>
              <button
                onClick={() => openEdit(supplier)}
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => { setDeletingId(supplier.id); setIsDeleteOpen(true) }}
                title="Hapus"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      )
    }
  ]

  if (loading) return <LoadingSpinner message="Memuat data supplier..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat data supplier: ${error}`}
          action={<Button size="small" onClick={refetch}>Coba Lagi</Button>}
          showIcon
        />
      )}
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Supplier</Typography.Title>
        <Space>
          {canWrite && (
            <Button onClick={() => navigate('/master/suppliers/import')}>
              <Upload size={16} /> Import Excel
            </Button>
          )}
          {canWrite && (
            <Button variant="primary" onClick={openAdd}>
              <Plus size={20} />
              Tambah Supplier
            </Button>
          )}
        </Space>
      </Flex>

      <DataTable columns={columns} data={suppliers} emptyMessage="Belum ada data supplier" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Supplier' : 'Tambah Supplier'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && (
              <Alert type="error" message={formError} showIcon />
            )}
            <Input
              label="Nama Supplier *"
              placeholder="Nama supplier"
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              autoFocus
            />
            <Input
              label="Alamat"
              placeholder="Alamat lengkap"
              value={formData.address}
              onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
            />
            <Input
              label="Telepon"
              placeholder="Nomor telepon"
              value={formData.phone}
              onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
            />
            <Input
              label="NPWP"
              placeholder="Nomor NPWP"
              value={formData.npwp}
              onChange={(e) => setFormData(p => ({ ...p, npwp: e.target.value }))}
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
        title="Hapus Supplier"
        message="Apakah Anda yakin ingin menghapus supplier ini? Data transaksi tetap tersimpan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
