import { useState } from 'react'
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
import { Plus, Edit2, Trash2 } from 'lucide-react'

const emptyForm = {
  name: '',
  address: '',
  phone: '',
  email: '',
  npwp: '',
}

export default function SuppliersPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const { suppliers, loading, refetch } = useSuppliers()

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
        <div className="flex gap-2">
          {canWrite && (
            <>
              <button
                onClick={() => openEdit(supplier)}
                className="text-blue-600 hover:text-blue-800"
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => { setDeletingId(supplier.id); setIsDeleteOpen(true) }}
                className="text-red-600 hover:text-red-800"
                title="Hapus"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      )
    }
  ]

  if (loading) return <LoadingSpinner message="Memuat data supplier..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Supplier</h1>
        {canWrite && (
          <Button variant="primary" onClick={openAdd}>
            <Plus size={20} />
            Tambah Supplier
          </Button>
        )}
      </div>

      <DataTable columns={columns} data={suppliers} emptyMessage="Belum ada data supplier" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Supplier' : 'Tambah Supplier'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-sm">
              {formError}
            </div>
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
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit" loading={isSubmitting}>
              {editingId ? 'Simpan' : 'Tambah'}
            </Button>
          </div>
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
    </div>
  )
}
