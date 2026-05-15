import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Flex, Space, Tag, Typography } from 'antd'
import { CheckCircle2, Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Modal from '../../components/ui/Modal'
import {
  createWarehouse,
  deleteWarehouse,
  getWarehouses,
  setDefaultWarehouse,
  updateWarehouse,
} from '../../services/warehouseService'

const emptyForm = {
  code: '',
  name: '',
  address: '',
}

export default function WarehousesPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [defaultingId, setDefaultingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const loadWarehouses = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getWarehouses()
      setWarehouses(data || [])
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat gudang: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    loadWarehouses()
  }, [loadWarehouses])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (warehouse) => {
    setEditingId(warehouse.id)
    setFormData({
      code: warehouse.code || '',
      name: warehouse.name || '',
      address: warehouse.address || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (warehouse) => {
    setDeletingId(warehouse.id)
    setIsDeleteOpen(true)
  }

  const validateForm = () => {
    if (!formData.code.trim()) return 'Kode gudang wajib diisi'
    if (!formData.name.trim()) return 'Nama gudang wajib diisi'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah gudang')
      return
    }

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        address: formData.address.trim(),
      }

      if (editingId) {
        await updateWarehouse(editingId, payload)
        toast.success('Gudang berhasil diperbarui')
      } else {
        await createWarehouse(payload)
        toast.success('Gudang berhasil ditambahkan')
      }

      await loadWarehouses()
      setIsModalOpen(false)
      setFormData(emptyForm)
    } catch (err) {
      setFormError(err.message)
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetDefault = async (warehouse) => {
    if (warehouse.is_default) return

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah gudang default')
      return
    }

    setDefaultingId(warehouse.id)
    try {
      await setDefaultWarehouse(warehouse.id)
      toast.success('Gudang default berhasil diubah')
      await loadWarehouses()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDefaultingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk menghapus gudang')
      return
    }

    setIsSubmitting(true)
    try {
      await deleteWarehouse(deletingId)
      toast.success('Gudang berhasil dihapus')
      await loadWarehouses()
      setDeletingId(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = [
    { key: 'code', label: 'Kode' },
    { key: 'name', label: 'Nama' },
    {
      key: 'address',
      label: 'Alamat',
      render: (value) => value || '-',
    },
    {
      key: 'is_default',
      label: 'Default',
      render: (value) => value ? <Tag color="success">Default</Tag> : <Tag>-</Tag>,
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, warehouse) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => handleEdit(warehouse)} title="Edit">
                <Edit2 size={18} />
              </button>
              {!warehouse.is_default && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={defaultingId === warehouse.id}
                  disabled={Boolean(defaultingId)}
                  onClick={() => handleSetDefault(warehouse)}
                >
                  <CheckCircle2 size={16} />
                  Set Default
                </Button>
              )}
              <button onClick={() => handleDeleteClick(warehouse)} title="Hapus">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat gudang..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat gudang: ${error}`}
          action={<Button size="small" onClick={loadWarehouses}>Coba Lagi</Button>}
          showIcon
        />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Gudang</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Gudang
          </Button>
        )}
      </Flex>

      <DataTable
        columns={columns}
        data={warehouses}
        emptyMessage="Belum ada gudang"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Gudang' : 'Tambah Gudang'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input
              label="Kode"
              placeholder="Contoh: WH-UTAMA"
              value={formData.code}
              onChange={(event) => setFormData(prev => ({ ...prev, code: event.target.value }))}
              autoFocus
            />
            <Input
              label="Nama"
              placeholder="Contoh: Gudang Utama"
              value={formData.name}
              onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
            <Input
              label="Alamat"
              type="textarea"
              rows={3}
              placeholder="Alamat gudang"
              value={formData.address}
              onChange={(event) => setFormData(prev => ({ ...prev, address: event.target.value }))}
            />
            <Flex justify="flex-end" gap={12}>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
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

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Gudang"
        message="Apakah Anda yakin ingin menghapus gudang ini? Gudang default akan ditolak oleh sistem."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
