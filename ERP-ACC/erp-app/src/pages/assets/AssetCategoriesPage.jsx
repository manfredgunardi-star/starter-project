import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import * as svc from '../../services/assetCategoryService'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import AssetCategoryFormModal from '../../components/assets/AssetCategoryFormModal'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { Space, Flex, Typography } from 'antd'

export default function AssetCategoriesPage() {
  const { canWrite } = useAuth()
  const toast = useToast()

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editData, setEditData] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load categories on mount
  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const data = await svc.listCategories()
      setCategories(data || [])
    } catch (err) {
      toast.error(`Gagal memuat kategori aset: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditData(null)
    setModalOpen(true)
  }

  const handleEdit = (category) => {
    setEditData(category)
    setModalOpen(true)
  }

  const handleDeleteClick = (category) => {
    setDeletingId(category.id)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return

    setIsDeleting(true)
    try {
      await svc.softDeleteCategory(deletingId)
      toast.success('Kategori aset berhasil dihapus')
      await loadCategories()
      setDeleteConfirmOpen(false)
      setDeletingId(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setEditData(null)
  }

  const handleModalSaved = (category) => {
    loadCategories()
    handleModalClose()
  }

  const columns = [
    { key: 'code', label: 'Kode' },
    { key: 'name', label: 'Nama' },
    {
      key: 'default_useful_life_months',
      label: 'Umur Manfaat (bulan)',
      render: (val) => val ? `${val} bulan` : '-'
    },
    {
      key: 'asset_account',
      label: 'Akun Aset',
      render: (_, row) => row.asset_account ? `${row.asset_account.code} — ${row.asset_account.name}` : '-'
    },
    {
      key: 'accumulated_account',
      label: 'Akun Akumulasi',
      render: (_, row) => row.accumulated_account ? `${row.accumulated_account.code} — ${row.accumulated_account.name}` : '-'
    },
    {
      key: 'expense_account',
      label: 'Akun Beban',
      render: (_, row) => row.expense_account ? `${row.expense_account.code} — ${row.expense_account.name}` : '-'
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, category) => (
        <Space>
          {canWrite && (
            <>
              <button
                onClick={() => handleEdit(category)}
                className="text-blue-600 hover:text-blue-800 transition"
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => handleDeleteClick(category)}
                className="text-red-600 hover:text-red-800 transition"
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

  if (loading) return <LoadingSpinner message="Memuat kategori aset..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Kategori Aset Tetap</Typography.Title>
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
        emptyMessage="Belum ada kategori aset tetap"
      />

      {/* Add/Edit Modal */}
      <AssetCategoryFormModal
        open={modalOpen}
        onClose={handleModalClose}
        onSaved={handleModalSaved}
        editData={editData}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Kategori Aset Tetap"
        message="Apakah Anda yakin ingin menghapus kategori ini? Data tidak dapat dipulihkan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
