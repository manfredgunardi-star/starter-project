import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Flex, Select, Space, Switch, Tag, Typography } from 'antd'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Modal from '../../components/ui/Modal'
import { getCOA } from '../../services/masterDataService'
import {
  createTaxCode,
  deleteTaxCode,
  getTaxCodes,
  updateTaxCode,
} from '../../services/taxCodeService'

const emptyForm = {
  code: '',
  name: '',
  rate: 0,
  is_inclusive: false,
  output_account_id: null,
  input_account_id: null,
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatAccount(account, accountById, fallbackId) {
  const target = account || accountById[fallbackId]
  return target ? `${target.code} - ${target.name}` : '-'
}

function accountOptions(accounts, type) {
  return accounts
    .filter(account => !account.type || account.type === type)
    .map(account => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    }))
}

export default function TaxCodesPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [taxCodes, setTaxCodes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const accountById = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account
      return acc
    }, {})
  }, [accounts])

  const outputAccountOptions = useMemo(() => accountOptions(accounts, 'liability'), [accounts])
  const inputAccountOptions = useMemo(() => accountOptions(accounts, 'asset'), [accounts])

  const loadTaxCodes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [taxCodeData, accountData] = await Promise.all([
        getTaxCodes(),
        getCOA(),
      ])
      setTaxCodes(taxCodeData || [])
      setAccounts(accountData || [])
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat kode pajak: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    loadTaxCodes()
  }, [loadTaxCodes])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (taxCode) => {
    setEditingId(taxCode.id)
    setFormData({
      code: taxCode.code || '',
      name: taxCode.name || '',
      rate: taxCode.rate ?? 0,
      is_inclusive: Boolean(taxCode.is_inclusive),
      output_account_id: taxCode.output_account_id || null,
      input_account_id: taxCode.input_account_id || null,
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (taxCode) => {
    setDeletingId(taxCode.id)
    setIsDeleteOpen(true)
  }

  const validateForm = () => {
    if (!formData.code.trim()) return 'Kode pajak wajib diisi'
    if (!formData.name.trim()) return 'Nama pajak wajib diisi'
    if (toNumber(formData.rate) < 0 || toNumber(formData.rate) > 100) {
      return 'Tarif (%) harus di antara 0 sampai 100'
    }
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canWrite) {
      toast.error('Anda tidak memiliki akses untuk mengubah kode pajak')
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
        rate: toNumber(formData.rate),
        is_inclusive: formData.is_inclusive,
        output_account_id: formData.output_account_id || null,
        input_account_id: formData.input_account_id || null,
      }

      if (editingId) {
        await updateTaxCode(editingId, payload)
        toast.success('Kode pajak berhasil diperbarui')
      } else {
        await createTaxCode(payload)
        toast.success('Kode pajak berhasil ditambahkan')
      }

      await loadTaxCodes()
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
      toast.error('Anda tidak memiliki akses untuk menghapus kode pajak')
      return
    }

    setIsSubmitting(true)
    try {
      await deleteTaxCode(deletingId)
      toast.success('Kode pajak berhasil dihapus')
      await loadTaxCodes()
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
      key: 'rate',
      label: 'Tarif (%)',
      render: (value) => `${toNumber(value)}%`,
    },
    {
      key: 'is_inclusive',
      label: 'Inclusive',
      render: (value) => value ? <Tag color="success">Ya</Tag> : <Tag>Tidak</Tag>,
    },
    {
      key: 'output_account_id',
      label: 'Akun PPN Keluaran',
      render: (_, row) => formatAccount(row.output_account, accountById, row.output_account_id),
    },
    {
      key: 'input_account_id',
      label: 'Akun PPN Masukan',
      render: (_, row) => formatAccount(row.input_account, accountById, row.input_account_id),
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, taxCode) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => handleEdit(taxCode)} title="Edit">
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDeleteClick(taxCode)} title="Hapus">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat kode pajak..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert
          type="error"
          message={`Gagal memuat kode pajak: ${error}`}
          action={<Button size="small" onClick={loadTaxCodes}>Coba Lagi</Button>}
          showIcon
        />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Kode Pajak</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} />
            Tambah Kode Pajak
          </Button>
        )}
      </Flex>

      <DataTable
        columns={columns}
        data={taxCodes}
        emptyMessage="Belum ada kode pajak"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Kode Pajak' : 'Tambah Kode Pajak'}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input
              label="Kode"
              placeholder="Contoh: PPN11"
              value={formData.code}
              onChange={(event) => setFormData(prev => ({ ...prev, code: event.target.value }))}
              autoFocus
            />
            <Input
              label="Nama"
              placeholder="Contoh: PPN 11%"
              value={formData.name}
              onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
            <Input
              label="Tarif (%)"
              type="number"
              min={0}
              max={100}
              value={formData.rate}
              onChange={(event) => setFormData(prev => ({ ...prev, rate: event.target.value }))}
            />
            <Flex align="center" justify="space-between">
              <Typography.Text>Harga sudah include PPN?</Typography.Text>
              <Switch
                checked={formData.is_inclusive}
                onChange={(checked) => setFormData(prev => ({ ...prev, is_inclusive: checked }))}
              />
            </Flex>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Akun PPN Keluaran</label>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Pilih akun liability"
                value={formData.output_account_id}
                options={outputAccountOptions}
                onChange={(value) => setFormData(prev => ({ ...prev, output_account_id: value || null }))}
              />
            </Space>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Akun PPN Masukan</label>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Pilih akun asset"
                value={formData.input_account_id}
                options={inputAccountOptions}
                onChange={(value) => setFormData(prev => ({ ...prev, input_account_id: value || null }))}
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
        title="Hapus Kode Pajak"
        message="Apakah Anda yakin ingin menghapus kode pajak ini? Data tidak dapat dipulihkan."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
