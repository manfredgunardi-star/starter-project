import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getAsset } from '../../services/assetService'
import { previewDisposal, executeDisposal } from '../../services/assetDisposalService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import DisposalPreviewCard from '../../components/assets/DisposalPreviewCard'
import DateInput from '../../components/ui/DateInput'

export default function AssetDisposalFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [asset, setAsset] = useState(null)
  const [form, setForm] = useState({
    disposal_date: '',
    disposal_type: 'sale',
    sale_price: '',
    payment_account_id: '',
    notes: '',
  })
  const [preview, setPreview] = useState(null)
  const [cashBankAccounts, setCashBankAccounts] = useState([])
  const [loadingAsset, setLoadingAsset] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getAsset(id).then(setAsset).finally(() => setLoadingAsset(false))
    supabase
      .from('coa')
      .select('id, code, name')
      .or('code.like.1-11%,code.like.1-12%')
      .order('code')
      .then(({ data }) => setCashBankAccounts(data || []))
  }, [id])

  // Reset preview when form changes
  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setPreview(null)
  }

  async function handlePreview() {
    if (!form.disposal_date) {
      setError('Tanggal disposal wajib diisi.')
      return
    }
    if (form.disposal_type === 'sale' && !form.sale_price) {
      setError('Harga jual wajib diisi untuk tipe penjualan.')
      return
    }
    setError('')
    setLoadingPreview(true)
    try {
      const p = await previewDisposal({
        asset_id: id,
        disposal_date: form.disposal_date,
        disposal_type: form.disposal_type,
        sale_price: form.disposal_type === 'sale' ? Number(form.sale_price) : 0,
      })
      setPreview(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleConfirm() {
    if (!preview) return
    if (form.disposal_type === 'sale' && !form.payment_account_id) {
      setError('Akun kas/bank pembayaran wajib dipilih.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await executeDisposal({
        asset_id: id,
        disposal_date: form.disposal_date,
        disposal_type: form.disposal_type,
        sale_price: form.disposal_type === 'sale' ? Number(form.sale_price) : null,
        payment_account_id: form.disposal_type === 'sale' ? form.payment_account_id : null,
        notes: form.notes || null,
      })
      navigate(`/assets/${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingAsset) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Memuat data aset...</div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/assets')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={18} /> Kembali
        </button>
        <div className="text-red-600">Aset tidak ditemukan</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <button onClick={() => navigate(`/assets/${id}`)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
        <ArrowLeft size={18} /> Kembali ke Detail Aset
      </button>

      <h1 className="text-2xl font-bold text-gray-900">Lepas Aset</h1>

      {/* Asset Info Header */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Kode Aset</div>
            <div className="font-medium text-gray-900">{asset.code}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Nama</div>
            <div className="font-medium text-gray-900">{asset.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Harga Perolehan</div>
            <div className="font-medium">{formatCurrency(asset.acquisition_cost)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Tanggal Perolehan</div>
            <div className="font-medium">{formatDate(asset.acquisition_date)}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-800">Informasi Pelepasan</h2>

        {/* Tanggal disposal */}
        <DateInput
          label="Tanggal Disposal *"
          value={form.disposal_date}
          onChange={e => handleChange({ target: { name: 'disposal_date', value: e.target.value } })}
        />

        {/* Tipe disposal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipe Pelepasan <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="disposal_type"
                value="sale"
                checked={form.disposal_type === 'sale'}
                onChange={handleChange}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Penjualan</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="disposal_type"
                value="writeoff"
                checked={form.disposal_type === 'writeoff'}
                onChange={handleChange}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Penghapusan (Write-off)</span>
            </label>
          </div>
        </div>

        {/* Sale-specific fields */}
        {form.disposal_type === 'sale' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Harga Jual <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="sale_price"
                value={form.sale_price}
                onChange={handleChange}
                min="0"
                placeholder="0"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Akun Kas/Bank Penerimaan <span className="text-red-500">*</span>
              </label>
              <select
                name="payment_account_id"
                value={form.payment_account_id}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">-- Pilih akun --</option>
                {cashBankAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Keterangan
          </label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Preview button */}
        <button
          onClick={handlePreview}
          disabled={loadingPreview}
          className="w-full py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition-colors font-medium text-sm disabled:opacity-60"
        >
          {loadingPreview ? 'Menghitung...' : 'Preview Disposal'}
        </button>
      </div>

      {/* Preview card */}
      {preview && (
        <DisposalPreviewCard
          preview={preview}
          disposalType={form.disposal_type}
          salePrice={Number(form.sale_price) || 0}
        />
      )}

      {/* Confirm button */}
      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={!preview || saving}
          className={`px-6 py-2 rounded font-medium transition-colors ${
            !preview || saving
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {saving ? 'Memproses...' : 'Konfirmasi Pelepasan Aset'}
        </button>
      </div>
    </div>
  )
}
