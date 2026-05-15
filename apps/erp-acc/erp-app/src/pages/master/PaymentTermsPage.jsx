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
import {
  createPaymentTerm,
  deletePaymentTerm,
  getPaymentTerms,
  updatePaymentTerm,
} from '../../services/paymentTermService'

const emptyForm = {
  code: '',
  name: '',
  net_days: 0,
  discount_percent: 0,
  discount_days: 0,
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export default function PaymentTermsPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const loadTerms = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getPaymentTerms()
      setTerms(data || [])
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat syarat pembayaran: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    loadTerms()
  }, [loadTerms])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (term) => {
    setEditingId(term.id)
    setFormData({
      code: term.code || '',
      name: term.name || '',
      net_days: term.net_days ?? 0,
      discount_percent: term.discount_percent ?? 0,
      discount_days: term.discount_days ?? 0,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (term) => {
    setDeletingId(term.id)
    setIsDeleteOpen(true)
  }

  const validateForm = () => {
    if (!formData.code.trim()) return 'Kode syarat pembayaran wajib diisi'
    if (!formData.name.trim()) return 'Nama syarat pembayaran wajib diisi'
    if (toNumber(formData.net_days) < 0) return 'Net Days tidak boleh kurang dari 0'
    if (toNumber(formData.discount_percent) < 0 || toNumber(formData.discount_percent) > 100) {
      return 'Diskon (%) harus di antara 0 sampai 100'
    }
    if (toNumber(formData.discount_days) < 0) return 'Diskon Hari tidak boleh kurang dari 0'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah syarat pembayaran')
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
        net_days: toNumber(formData.net_days),
        discount_percent: toNumber(formData.discount_percent),
        discount_days: toNumber(formData.discount_days),
      }

      if (editingId) {
        await updatePaymentTerm(editingId, payload)
        toast.success('Syarat pembayaran berhasil diperbarui')
      } else {
        await createPaymentTerm(payload)
        toast.success('Syarat pembayaran berhasil ditambahkan')
      }

      await loadTerms()
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
      toast.error('Anda tidak memiliki akses untuk menghapus syarat pembayaran')
      return
    }

    setIsSubmitting(true)
    try {
      await deletePaymentTerm(deletingId)
      toast.success('Syarat pembayaran berhasil dihapus')
      await loadTerms()
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
    { key: 'net_days', label: 'Net Days' },
    {
      key: 'discount_percent',
      label: 'Diskon (%)',
      render: (value) => `${toNumber(value)}%`,
    },
    { key: 'discount_days', label: 'Diskon Hari' },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, term) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => handleEdit(term)} title="Edit">
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDeleteClick(term)} title="Hapus">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat syarat pembayaran..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat syarat pembayaran: ${error}`}
          action={<Button size="small" onClick={loadTerms}>Coba Lagi</Button>}
          showIcon
        />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Syarat Pembayaran</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Syarat
          </Button>
        )}
      </Flex>

      <DataTable
        columns={columns}
        data={terms}
        emptyMessage="Belum ada syarat pembayaran"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Syarat Pembayaran' : 'Tambah Syarat Pembayaran'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input
              label="Kode"
              placeholder="Contoh: NET30"
              value={formData.code}
              onChange={(event) => setFormData(prev => ({ ...prev, code: event.target.value }))}
              autoFocus
            />
            <Input
              label="Nama"
              placeholder="Contoh: Net 30 Hari"
              value={formData.name}
              onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
            <Input
              label="Net Days"
              type="number"
              min={0}
              value={formData.net_days}
              onChange={(event) => setFormData(prev => ({ ...prev, net_days: event.target.value }))}
            />
            <Input
              label="Diskon (%)"
              type="number"
              min={0}
              max={100}
              value={formData.discount_percent}
              onChange={(event) => setFormData(prev => ({ ...prev, discount_percent: event.target.value }))}
            />
            <Input
              label="Diskon Hari"
              type="number"
              min={0}
              value={formData.discount_days}
              onChange={(event) => setFormData(prev => ({ ...prev, discount_days: event.target.value }))}
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
        title="Hapus Syarat Pembayaran"
        message="Apakah Anda yakin ingin menghapus syarat pembayaran ini? Data tidak dapat dipulihkan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
