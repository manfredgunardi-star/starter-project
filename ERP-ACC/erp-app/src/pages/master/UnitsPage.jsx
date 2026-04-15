import { useState } from 'react'
import { Space, Flex, Typography, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useUnits } from '../../hooks/useMasterData'
import * as svc from '../../services/masterDataService'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function UnitsPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const { units, loading, refetch } = useUnits()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState({ name: '' })
  const [formError, setFormError] = useState(null)

  const handleAdd = () => {
    setEditingId(null)
    setFormData({ name: '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (unit) => {
    setEditingId(unit.id)
    setFormData({ name: unit.name })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (unit) => {
    setDeletingId(unit.id)
    setIsDeleteOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setFormError('Nama satuan wajib diisi')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingId) {
        await svc.updateUnit(editingId, { name: formData.name })
        toast.success('Satuan berhasil diperbarui')
      } else {
        await svc.createUnit({ name: formData.name })
        toast.success('Satuan berhasil ditambahkan')
      }
      await refetch()
      setIsModalOpen(false)
      setFormData({ name: '' })
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
      await svc.deleteUnit(deletingId)
      toast.success('Satuan berhasil dihapus')
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
    {
      key: 'id',
      label: 'Aksi',
      render: (_, unit) => (
        <Space>
          {canWrite && (
            <>
              <button
                onClick={() => handleEdit(unit)}
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => handleDeleteClick(unit)}
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

  if (loading) return <LoadingSpinner message="Memuat data satuan..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Satuan</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Satuan
          </Button>
        )}
      </Flex>

      <DataTable columns={columns} data={units} emptyMessage="Belum ada data satuan" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Satuan' : 'Tambah Satuan'}
        size="sm"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && (
              <Alert type="error" message={formError} showIcon />
            )}
            <Input
              label="Nama Satuan"
              placeholder="Contoh: pcs, kg, liter"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              autoFocus
            />
            <Flex justify="flex-end" gap={12}>
              <Button
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
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
        title="Hapus Satuan"
        message="Apakah Anda yakin ingin menghapus satuan ini? Data tidak dapat dipulihkan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
