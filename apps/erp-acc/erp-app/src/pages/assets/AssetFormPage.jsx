import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as assetService from '../../services/assetService'
import * as assetCategoryService from '../../services/assetCategoryService'
import * as depreciationService from '../../services/depreciationService'
import AssetPaymentFields from '../../components/assets/AssetPaymentFields'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { Lock, AlertCircle } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Alert, Typography } from 'antd'

const INITIAL_PAYMENT = {
  method: 'cash_bank',
  cash_bank_account_id: null,
  cash_bank_amount: 0,
  supplier_id: null,
  hutang_account_id: null,
  hutang_amount: 0,
  uang_muka_account_id: null,
  uang_muka_amount: 0,
}

const INITIAL_FORM = {
  name: '',
  category_id: '',
  acquisition_date: '',
  acquisition_cost: '',
  salvage_value: '0',
  useful_life_months: '',
  location: '',
  description: '',
  payment: { ...INITIAL_PAYMENT },
}

function startOfNextMonth(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
}

export default function AssetFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [hasPosted, setHasPosted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Computed depreciation_start_date
  const depreciationStartDate = startOfNextMonth(form.acquisition_date)

  // useEffect 1: Load categories
  useEffect(() => {
    assetCategoryService.listCategories().then(setCategories).catch(err => {
      console.error('Failed to load categories:', err)
    })
  }, [])

  // useEffect 2: Load asset data in edit mode
  useEffect(() => {
    if (!isEdit) return

    assetService.getAsset(id).then(asset => {
      setForm(prev => ({ ...prev, ...asset, payment: prev.payment }))
    }).catch(err => {
      setError(`Gagal memuat data aset: ${err.message}`)
    })

    depreciationService.getScheduleForAsset(id).then(schedule => {
      setHasPosted(schedule.some(r => r.status === 'posted'))
    }).catch(err => {
      console.error('Failed to load schedule:', err)
    })
  }, [id, isEdit])

  // Sync payment totalAmount when method is non-mixed
  const syncPaymentAmounts = (payment, totalAmount) => {
    const total = Number(totalAmount) || 0
    if (payment.method === 'cash_bank') {
      return { ...payment, cash_bank_amount: total, hutang_amount: 0, uang_muka_amount: 0 }
    }
    if (payment.method === 'hutang') {
      return { ...payment, hutang_amount: total, cash_bank_amount: 0, uang_muka_amount: 0 }
    }
    if (payment.method === 'uang_muka') {
      return { ...payment, uang_muka_amount: total, cash_bank_amount: 0, hutang_amount: 0 }
    }
    return payment
  }

  const handleFieldChange = (field, value) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value }
      // Auto-sync payment amounts when acquisition_cost changes in create mode
      if (!isEdit && field === 'acquisition_cost') {
        updated.payment = syncPaymentAmounts(prev.payment, value)
      }
      return updated
    })
  }

  const handleCategoryChange = (categoryId) => {
    const category = categories.find(c => c.id === categoryId)
    setForm(prev => ({
      ...prev,
      category_id: categoryId,
      useful_life_months: category?.default_useful_life_months
        ? String(category.default_useful_life_months)
        : prev.useful_life_months,
    }))
  }

  const handlePaymentChange = (payment) => {
    const synced = syncPaymentAmounts(payment, form.acquisition_cost)
    setForm(prev => ({ ...prev, payment: synced }))
  }

  // Preview depreciation calculations
  const depreciable = Number(form.acquisition_cost) - Number(form.salvage_value)
  const lifeMonths = Number(form.useful_life_months)
  const monthly = lifeMonths > 0 && depreciable > 0 ? depreciable / lifeMonths : 0
  const yearly = monthly * 12

  let endDate = ''
  if (depreciationStartDate && lifeMonths > 0) {
    const d = new Date(depreciationStartDate)
    d.setMonth(d.getMonth() + lifeMonths)
    endDate = formatDate(d.toISOString().slice(0, 10))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (isEdit) {
        const patch = {
          name: form.name,
          location: form.location,
          description: form.description,
          ...(hasPosted ? {} : {
            acquisition_cost: Number(form.acquisition_cost),
            salvage_value: Number(form.salvage_value),
            useful_life_months: Number(form.useful_life_months),
            acquisition_date: form.acquisition_date,
            category_id: form.category_id,
          }),
        }
        await assetService.updateAsset(id, patch)
        navigate(`/assets/${id}`)
      } else {
        const newId = await assetService.createAsset({
          ...form,
          acquisition_cost: Number(form.acquisition_cost),
          salvage_value: Number(form.salvage_value),
          useful_life_months: Number(form.useful_life_months),
        })
        navigate(`/assets/${newId}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const financialFieldProps = (field) =>
    hasPosted
      ? {
          disabled: true,
          title: 'Terkunci – sudah ada jurnal penyusutan terposting',
          style: { width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' },
        }
      : {
          style: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none' },
        }

  return (
    <div style={{ maxWidth: 672, margin: '0 auto' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Header */}
        <Flex justify="space-between" align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isEdit ? 'Edit Aset Tetap' : 'Tambah Aset Tetap'}
          </Typography.Title>
          <Button variant="ghost" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}>
            Batal
          </Button>
        </Flex>

        {/* Error */}
        {error && (
          <Alert type="error" showIcon message={error} />
        )}

        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Section 1: Informasi Aset */}
            <Card title="Informasi Aset">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* Name */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Nama Aset <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    placeholder="Contoh: Truk Hino 500"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Kategori Aset {!isEdit && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <select
                    required={!isEdit}
                    value={form.category_id || ''}
                    onChange={e => handleCategoryChange(e.target.value)}
                    disabled={isEdit && hasPosted}
                    title={isEdit && hasPosted ? 'Terkunci – sudah ada jurnal penyusutan terposting' : undefined}
                    style={
                      isEdit && hasPosted
                        ? { width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }
                        : { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none' }
                    }
                  >
                    <option value="">Pilih kategori...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.code} — {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Lokasi <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>(opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.location || ''}
                    onChange={e => handleFieldChange('location', e.target.value)}
                    placeholder="Contoh: Gudang Utama"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Keterangan <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>(opsional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.description || ''}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    placeholder="Catatan tambahan tentang aset ini..."
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
              </Space>
            </Card>

            {/* Section 2: Keuangan */}
            <Card
              title={
                <Flex justify="space-between" align="center">
                  <span>Keuangan</span>
                  {hasPosted && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#a16207', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '4px 8px' }}>
                      <Lock size={12} />
                      Terkunci – ada jurnal terposting
                    </span>
                  )}
                </Flex>
              }
              style={hasPosted ? { borderColor: '#fcd34d' } : undefined}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {hasPosted && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Field keuangan tidak dapat diubah karena sudah ada jurnal penyusutan yang terposting."
                  />
                )}

                {/* Acquisition Date */}
                <DateInput
                  label={`Tanggal Perolehan${!hasPosted ? ' *' : ''}`}
                  value={form.acquisition_date || ''}
                  onChange={e => handleFieldChange('acquisition_date', e.target.value)}
                  disabled={hasPosted}
                />

                {/* Acquisition Cost */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Harga Perolehan (Rp) {!hasPosted && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required={!hasPosted}
                    value={form.acquisition_cost || ''}
                    onChange={e => handleFieldChange('acquisition_cost', e.target.value)}
                    placeholder="0"
                    {...financialFieldProps('acquisition_cost')}
                  />
                </div>

                {/* Salvage Value */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Nilai Sisa (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.salvage_value || '0'}
                    onChange={e => handleFieldChange('salvage_value', e.target.value)}
                    placeholder="0"
                    {...financialFieldProps('salvage_value')}
                  />
                </div>

                {/* Useful Life */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Masa Manfaat (bulan) {!hasPosted && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required={!hasPosted}
                    value={form.useful_life_months || ''}
                    onChange={e => handleFieldChange('useful_life_months', e.target.value)}
                    placeholder="Contoh: 60"
                    {...financialFieldProps('useful_life_months')}
                  />
                </div>

                {/* Depreciation Start Date (read-only) */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                    Mulai Penyusutan
                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 'normal', color: '#9ca3af' }}>(otomatis: awal bulan setelah perolehan)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={depreciationStartDate || '—'}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, backgroundColor: '#f9fafb', color: '#4b5563' }}
                  />
                </div>
              </Space>
            </Card>

            {/* Section 3: Pembayaran (create mode only) */}
            {!isEdit && (
              <Card title="Pembayaran Akuisisi">
                <AssetPaymentFields
                  value={form.payment}
                  onChange={handlePaymentChange}
                  totalAmount={Number(form.acquisition_cost) || 0}
                />
              </Card>
            )}

            {/* Section 4: Preview Penyusutan */}
            {depreciable > 0 && lifeMonths > 0 && (
              <Card
                title={<Typography.Text style={{ color: '#1e3a8a', fontWeight: 600 }}>Preview Penyusutan (Garis Lurus)</Typography.Text>}
                style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row gutter={12}>
                    <Col span={12}>
                      <div style={{ backgroundColor: 'white', borderRadius: 4, border: '1px solid #dbeafe', padding: 12 }}>
                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Per bulan</p>
                        <p style={{ fontWeight: 600, color: '#111827' }}>{formatCurrency(monthly)}</p>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ backgroundColor: 'white', borderRadius: 4, border: '1px solid #dbeafe', padding: 12 }}>
                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Per tahun</p>
                        <p style={{ fontWeight: 600, color: '#111827' }}>{formatCurrency(yearly)}</p>
                      </div>
                    </Col>
                    <Col span={12} style={{ marginTop: 12 }}>
                      <div style={{ backgroundColor: 'white', borderRadius: 4, border: '1px solid #dbeafe', padding: 12 }}>
                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total bulan</p>
                        <p style={{ fontWeight: 600, color: '#111827' }}>{lifeMonths} bulan</p>
                      </div>
                    </Col>
                    <Col span={12} style={{ marginTop: 12 }}>
                      <div style={{ backgroundColor: 'white', borderRadius: 4, border: '1px solid #dbeafe', padding: 12 }}>
                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Berakhir</p>
                        <p style={{ fontWeight: 600, color: '#111827' }}>{endDate || '—'}</p>
                      </div>
                    </Col>
                  </Row>
                  <Typography.Text style={{ color: '#1d4ed8', fontSize: 12 }}>
                    Nilai yang dapat disusutkan: {formatCurrency(depreciable)} (harga perolehan − nilai sisa)
                  </Typography.Text>
                </Space>
              </Card>
            )}

            {/* Submit */}
            <Flex justify="flex-end" gap="small">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Buat Aset'}
              </Button>
            </Flex>
          </Space>
        </form>
      </Space>
    </div>
  )
}
