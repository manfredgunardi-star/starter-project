import { useState } from 'react'
import { Space, Flex, Row, Col, Typography, Card } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useUnits } from '../../hooks/useMasterData'
import * as svc from '../../services/masterDataService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Edit2, Trash2, PlusCircle, X } from 'lucide-react'

const emptyForm = {
  sku: '',
  name: '',
  category: '',
  base_unit_id: '',
  buy_price: '',
  sell_price: '',
  is_taxable: false,
  tax_rate: 11,
}

export default function ProductsPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const { products, loading, refetch } = useProducts()
  const { units } = useUnits()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  // conversions: [{ from_unit_id, conversion_factor }]
  const [conversions, setConversions] = useState([])

  const openAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setConversions([])
    setFormErrors({})
    setIsModalOpen(true)
  }

  const openEdit = (product) => {
    setEditingId(product.id)
    setFormData({
      sku: product.sku || '',
      name: product.name,
      category: product.category || '',
      base_unit_id: product.base_unit_id,
      buy_price: product.buy_price,
      sell_price: product.sell_price,
      is_taxable: product.is_taxable,
      tax_rate: product.tax_rate,
    })
    setConversions(
      (product.conversions || []).map(c => ({
        from_unit_id: c.from_unit_id,
        conversion_factor: c.conversion_factor,
      }))
    )
    setFormErrors({})
    setIsModalOpen(true)
  }

  const field = (key, value) => {
    setFormData(prev => {
      const next = { ...prev, [key]: value }
      // When base unit changes, clear conversions using new base unit as from_unit
      if (key === 'base_unit_id') {
        setConversions(prev =>
          prev.filter(c => c.from_unit_id !== value)
        )
      }
      return next
    })
    if (formErrors[key]) setFormErrors(e => ({ ...e, [key]: null }))
  }

  const validate = () => {
    const errors = {}
    if (!formData.name.trim()) errors.name = 'Nama wajib diisi'
    if (!formData.base_unit_id) errors.base_unit_id = 'Satuan dasar wajib dipilih'
    if (formData.buy_price === '' || isNaN(Number(formData.buy_price))) errors.buy_price = 'Harga beli harus angka'
    if (formData.sell_price === '' || isNaN(Number(formData.sell_price))) errors.sell_price = 'Harga jual harus angka'

    // Validate conversions
    for (let i = 0; i < conversions.length; i++) {
      const c = conversions[i]
      if (!c.from_unit_id) { errors[`conv_unit_${i}`] = 'Satuan wajib dipilih'; break }
      if (!c.conversion_factor || Number(c.conversion_factor) <= 0) {
        errors[`conv_factor_${i}`] = 'Faktor harus > 0'; break
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload = {
        ...formData,
        buy_price: Number(formData.buy_price),
        sell_price: Number(formData.sell_price),
        tax_rate: Number(formData.tax_rate),
      }
      if (editingId) {
        await svc.updateProduct(editingId, payload, conversions)
        toast.success('Produk berhasil diperbarui')
      } else {
        await svc.createProduct(payload, conversions)
        toast.success('Produk berhasil ditambahkan')
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
      await svc.softDeleteProduct(deletingId)
      toast.success('Produk berhasil dihapus')
      await refetch()
      setIsDeleteOpen(false)
      setDeletingId(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Conversions management
  const addConversionRow = () => {
    setConversions(prev => [...prev, { from_unit_id: '', conversion_factor: '' }])
  }

  const removeConversionRow = (i) => {
    setConversions(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateConversionRow = (i, key, value) => {
    setConversions(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
    if (formErrors[`conv_unit_${i}`] || formErrors[`conv_factor_${i}`]) {
      setFormErrors(e => ({ ...e, [`conv_unit_${i}`]: null, [`conv_factor_${i}`]: null }))
    }
  }

  // Units available for "dari" — exclude the current base unit
  const availableFromUnits = (rowIdx) => {
    const usedUnits = conversions
      .filter((_, i) => i !== rowIdx)
      .map(c => c.from_unit_id)
    return units.filter(u => u.id !== formData.base_unit_id && !usedUnits.includes(u.id))
  }

  const baseUnitName = units.find(u => u.id === formData.base_unit_id)?.name || '—'

  const unitOptions = units.map(u => ({ value: u.id, label: u.name }))

  const columns = [
    { key: 'sku', label: 'SKU', render: (v) => v || '-' },
    { key: 'name', label: 'Nama' },
    { key: 'category', label: 'Kategori', render: (v) => v || '-' },
    {
      key: 'base_unit',
      label: 'Satuan',
      render: (_, row) => row.base_unit?.name || '-'
    },
    { key: 'buy_price', label: 'Harga Beli', render: (v) => formatCurrency(v) },
    { key: 'sell_price', label: 'Harga Jual', render: (v) => formatCurrency(v) },
    {
      key: 'is_taxable',
      label: 'PPN',
      render: (v, row) => v ? `${row.tax_rate}%` : '-'
    },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, product) => (
        <Space>
          {canWrite && (
            <>
              <button onClick={() => openEdit(product)} className="text-blue-600 hover:text-blue-800" title="Edit">
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => { setDeletingId(product.id); setIsDeleteOpen(true) }}
                className="text-red-600 hover:text-red-800"
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

  if (loading) return <LoadingSpinner message="Memuat data produk..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Produk</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={openAdd}>
            <Plus size={20} />
            Tambah Produk
          </Button>
        )}
      </Flex>

      <DataTable columns={columns} data={products} emptyMessage="Belum ada data produk" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Produk' : 'Tambah Produk'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Row gutter={16}>
              <Col span={12}>
                <Input
                  label="SKU"
                  placeholder="Contoh: PRD-001"
                  value={formData.sku}
                  onChange={e => field('sku', e.target.value)}
                />
              </Col>
              <Col span={12}>
                <Input
                  label="Nama Produk *"
                  placeholder="Nama produk"
                  value={formData.name}
                  onChange={e => field('name', e.target.value)}
                  error={formErrors.name}
                />
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Input
                  label="Kategori"
                  placeholder="Contoh: Bahan Baku"
                  value={formData.category}
                  onChange={e => field('category', e.target.value)}
                />
              </Col>
              <Col span={12}>
                <Select
                  label="Satuan Dasar *"
                  options={unitOptions}
                  value={formData.base_unit_id}
                  onChange={e => field('base_unit_id', e.target.value)}
                  error={formErrors.base_unit_id}
                  placeholder="Pilih satuan..."
                />
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Input
                  label="Harga Beli *"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.buy_price}
                  onChange={e => field('buy_price', e.target.value)}
                  error={formErrors.buy_price}
                />
              </Col>
              <Col span={12}>
                <Input
                  label="Harga Jual *"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.sell_price}
                  onChange={e => field('sell_price', e.target.value)}
                  error={formErrors.sell_price}
                />
              </Col>
            </Row>

            <Space align="center" size={16}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_taxable}
                  onChange={e => field('is_taxable', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Kena PPN</span>
              </label>
              {formData.is_taxable && (
                <div style={{ width: 128 }}>
                  <Input
                    label="Tarif PPN (%)"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.tax_rate}
                    onChange={e => field('tax_rate', e.target.value)}
                  />
                </div>
              )}
            </Space>

            {/* Konversi Satuan */}
            <Card size="small" title={
              <Flex justify="space-between" align="center">
                <Typography.Text strong>Konversi Satuan</Typography.Text>
                <button
                  type="button"
                  onClick={addConversionRow}
                  disabled={!formData.base_unit_id}
                  className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 flex items-center gap-1 text-sm"
                >
                  <PlusCircle size={18} />
                  Tambah Baris
                </button>
              </Flex>
            }>
              {conversions.length === 0 ? (
                <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '8px 0' }}>
                  {formData.base_unit_id
                    ? 'Belum ada konversi. Klik "Tambah Baris" untuk menambahkan.'
                    : 'Pilih satuan dasar terlebih dahulu.'}
                </Typography.Text>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                    <div className="text-xs font-medium text-gray-600">Dari Satuan</div>
                    <div className="text-xs font-medium text-gray-600 text-center px-2">=</div>
                    <div className="text-xs font-medium text-gray-600">Faktor × {baseUnitName}</div>
                    <div></div>
                  </div>

                  {conversions.map((conv, i) => {
                    const fromOptions = availableFromUnits(i).map(u => ({ value: u.id, label: u.name }))
                    return (
                      <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-start">
                        <Select
                          options={fromOptions}
                          value={conv.from_unit_id}
                          onChange={e => updateConversionRow(i, 'from_unit_id', e.target.value)}
                          placeholder="Pilih satuan..."
                          error={formErrors[`conv_unit_${i}`]}
                        />
                        <div className="flex items-center justify-center h-10 mt-0 text-gray-500 px-1">=</div>
                        <Input
                          type="number"
                          min="0.0001"
                          step="any"
                          placeholder="Faktor"
                          value={conv.conversion_factor}
                          onChange={e => updateConversionRow(i, 'conversion_factor', e.target.value)}
                          error={formErrors[`conv_factor_${i}`]}
                        />
                        <button
                          type="button"
                          onClick={() => removeConversionRow(i)}
                          className="text-red-500 hover:text-red-700 mt-1"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    )
                  })}
                </Space>
              )}
            </Card>

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
        title="Hapus Produk"
        message="Apakah Anda yakin ingin menghapus produk ini? Stok yang sudah ada tidak terpengaruh."
        confirmText="Hapus"
        variant="danger"
      />
    </Space>
  )
}
