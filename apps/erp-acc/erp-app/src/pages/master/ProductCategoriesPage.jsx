import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Flex, Select, Space, Typography } from 'antd'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Modal from '../../components/ui/Modal'
import {
  createProductCategory,
  deleteProductCategory,
  getProductCategories,
  updateProductCategory,
} from '../../services/productCategoryService'

const emptyForm = {
  code: '',
  name: '',
  parent_id: null,
}

export default function ProductCategoriesPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const categoryById = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category.id] = category
      return acc
    }, {})
  }, [categories])

  const parentOptions = useMemo(() => {
    return categories
      .filter(category => category.id !== editingId)
      .map(category => ({
        value: category.id,
        label: `${category.code} - ${category.name}`,
      }))
  }, [categories, editingId])

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getProductCategories()
      setCategories(data || [])
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat kategori produk: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (category) => {
    setEditingId(category.id)
    setFormData({
      code: category.code || '',
      name: category.name || '',
      parent_id: category.parent_id || null,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (category) => {
    setDeletingId(category.id)
    setIsDeleteOpen(true)
  }

  const validateForm = () => {
    if (!formData.code.trim()) return 'Kode kategori wajib diisi'
    if (!formData.name.trim()) return 'Nama kategori wajib diisi'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah kategori produk')
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
        parent_id: formData.parent_id || null,
      }

      if (editingId) {
        await updateProductCategory(editingId, payload)
        toast.success('Kategori produk berhasil diperbarui')
      } else {
        await createProductCategory(payload)
        toast.success('Kategori produk berhasil ditambahkan')
      }

      await loadCategories()
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
      toast.error('Anda tidak memiliki akses untuk menghapus kategori produk')
      return
    }

    setIsSubmitting(true)
    try {
      await deleteProductCategory(deletingId)
      toast.success('Kategori produk berhasil dihapus')
      await loadCategories()
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
      key: 'parent_id',
      label: 'Parent',
      render: (value) => value ? (categoryById[value]?.name || '-') : '-',
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, category) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => handleEdit(category)} title="Edit">
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDeleteClick(category)} title="Hapus">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat kategori produk..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat kategori produk: ${error}`}
          action={<Button size="small" onClick={loadCategories}>Coba Lagi</Button>}
          showIcon
        />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Kategori Produk</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Kategori
          </Button>
        )}
      </Flex>

      <DataTable
        columns={columns}
        data={categories}
        emptyMessage="Belum ada kategori produk"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Kategori Produk' : 'Tambah Kategori Produk'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input
              label="Kode"
              placeholder="Contoh: RAW"
              value={formData.code}
              onChange={(event) => setFormData(prev => ({ ...prev, code: event.target.value }))}
              autoFocus
            />
            <Input
              label="Nama"
              placeholder="Contoh: Bahan Baku"
              value={formData.name}
              onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Parent</label>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Pilih parent kategori"
                value={formData.parent_id}
                options={parentOptions}
                onChange={(value) => setFormData(prev => ({ ...prev, parent_id: value || null }))}
              />
            </Space>
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
        title="Hapus Kategori Produk"
        message="Apakah Anda yakin ingin menghapus kategori produk ini? Data tidak dapat dipulihkan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
