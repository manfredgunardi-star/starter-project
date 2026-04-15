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
          className: 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed',
        }
      : {
          className: 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500',
        }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Aset Tetap' : 'Tambah Aset Tetap'}
        </h1>
        <Button variant="ghost" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}>
          Batal
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Informasi Aset */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Informasi Aset</h2>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Aset <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => handleFieldChange('name', e.target.value)}
              placeholder="Contoh: Truk Hino 500"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kategori Aset {!isEdit && <span className="text-red-500">*</span>}
            </label>
            <select
              required={!isEdit}
              value={form.category_id || ''}
              onChange={e => handleCategoryChange(e.target.value)}
              disabled={isEdit && hasPosted}
              title={isEdit && hasPosted ? 'Terkunci – sudah ada jurnal penyusutan terposting' : undefined}
              className={
                isEdit && hasPosted
                  ? 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lokasi <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={form.location || ''}
              onChange={e => handleFieldChange('location', e.target.value)}
              placeholder="Contoh: Gudang Utama"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Keterangan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              rows={3}
              value={form.description || ''}
              onChange={e => handleFieldChange('description', e.target.value)}
              placeholder="Catatan tambahan tentang aset ini..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>
        </div>

        {/* Section 2: Keuangan */}
        <div className={`bg-white border rounded-lg p-5 space-y-4 ${hasPosted ? 'border-amber-200' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Keuangan</h2>
            {hasPosted && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <Lock size={12} />
                Terkunci – ada jurnal terposting
              </div>
            )}
          </div>

          {hasPosted && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
              Field keuangan tidak dapat diubah karena sudah ada jurnal penyusutan yang terposting.
            </p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Harga Perolehan (Rp) {!hasPosted && <span className="text-red-500">*</span>}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Masa Manfaat (bulan) {!hasPosted && <span className="text-red-500">*</span>}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mulai Penyusutan
              <span className="ml-1 text-xs font-normal text-gray-400">(otomatis: awal bulan setelah perolehan)</span>
            </label>
            <input
              type="text"
              readOnly
              value={depreciationStartDate || '—'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600"
            />
          </div>
        </div>

        {/* Section 3: Pembayaran (create mode only) */}
        {!isEdit && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Pembayaran Akuisisi</h2>
            <AssetPaymentFields
              value={form.payment}
              onChange={handlePaymentChange}
              totalAmount={Number(form.acquisition_cost) || 0}
            />
          </div>
        )}

        {/* Section 4: Preview Penyusutan */}
        {depreciable > 0 && lifeMonths > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-3">
            <h2 className="text-base font-semibold text-blue-900">Preview Penyusutan (Garis Lurus)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded border border-blue-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Per bulan</p>
                <p className="font-semibold text-gray-900">{formatCurrency(monthly)}</p>
              </div>
              <div className="bg-white rounded border border-blue-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Per tahun</p>
                <p className="font-semibold text-gray-900">{formatCurrency(yearly)}</p>
              </div>
              <div className="bg-white rounded border border-blue-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Total bulan</p>
                <p className="font-semibold text-gray-900">{lifeMonths} bulan</p>
              </div>
              <div className="bg-white rounded border border-blue-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Berakhir</p>
                <p className="font-semibold text-gray-900">{endDate || '—'}</p>
              </div>
            </div>
            <p className="text-xs text-blue-700">
              Nilai yang dapat disusutkan: {formatCurrency(depreciable)} (harga perolehan − nilai sisa)
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 justify-end">
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
        </div>
      </form>
    </div>
  )
}
