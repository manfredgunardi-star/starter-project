import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Flex, Space, Typography } from 'antd'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Modal from '../../components/ui/Modal'
import { listCostCenters, saveCostCenter, softDeleteCostCenter } from '../../services/costCenterService'

const emptyForm = {
  code: '',
  name: '',
  description: '',
}

export default function CostCentersPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [costCenters, setCostCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const loadCostCenters = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listCostCenters()
      setCostCenters(data || [])
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat cost center: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    loadCostCenters()
  }, [loadCostCenters])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (costCenter) => {
    setEditingId(costCenter.id)
    setFormData({
      code: costCenter.code || '',
      name: costCenter.name || '',
      description: costCenter.description || '',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (costCenter) => {
    setDeletingId(costCenter.id)
    setIsDeleteOpen(true)
  }

  const validateForm = () => {
    if (!formData.code.trim()) return 'Kode cost center wajib diisi'
    if (!formData.name.trim()) return 'Nama cost center wajib diisi'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah cost center')
      return
    }

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setIsSubmitting(true)
    try {
      await saveCostCenter({
        id: editingId,
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      })

      toast.success(editingId ? 'Cost center berhasil diperbarui' : 'Cost center berhasil ditambahkan')
      await loadCostCenters()
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
    if (!deletingId) return

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk menghapus cost center')
      return
    }

    setIsSubmitting(true)
    try {
      await softDeleteCostCenter(deletingId)
      toast.success('Cost center berhasil dihapus')
      await loadCostCenters()
      setDeletingId(null)
      setIsDeleteOpen(false)
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
      key: 'description',
      label: 'Deskripsi',
      render: (value) => value || '-',
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, costCenter) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => handleEdit(costCenter)} title="Edit">
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDeleteClick(costCenter)} title="Hapus">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat cost center..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat cost center: ${error}`}
          action={<Button size="small" onClick={loadCostCenters}>Coba Lagi</Button>}
          showIcon
        />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Cost Center / Departemen</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Cost Center
          </Button>
        )}
      </Flex>

      <DataTable
        columns={columns}
        data={costCenters}
        emptyMessage="Belum ada cost center"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Cost Center' : 'Tambah Cost Center'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input
              label="Kode *"
              placeholder="Contoh: MKT"
              value={formData.code}
              onChange={(event) => setFormData(prev => ({ ...prev, code: event.target.value }))}
              autoFocus
            />
            <Input
              label="Nama *"
              placeholder="Contoh: Marketing"
              value={formData.name}
              onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
            <Input
              label="Deskripsi"
              type="textarea"
              rows={3}
              placeholder="Opsional"
              value={formData.description}
              onChange={(event) => setFormData(prev => ({ ...prev, description: event.target.value }))}
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
        title="Hapus Cost Center"
        message="Hapus cost center ini? Cost center yang sudah dipakai di jurnal terposting tidak bisa dihapus."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
