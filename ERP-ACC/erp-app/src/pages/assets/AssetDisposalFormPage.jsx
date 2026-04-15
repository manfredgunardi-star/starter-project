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
import { Space, Row, Col, Card, Flex, Typography, Alert, Descriptions } from 'antd'

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
      <Flex justify="center" align="center" style={{ height: '100vh' }}>
        <Typography.Text type="secondary">Memuat data aset...</Typography.Text>
      </Flex>
    )
  }

  if (!asset) {
    return (
      <div style={{ padding: 24 }}>
        <button onClick={() => navigate('/assets')} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.color = '#374151'} onMouseLeave={(e) => e.target.style.color = '#6b7280'}>
          <ArrowLeft size={18} /> Kembali
        </button>
        <Typography.Text type="danger">Aset tidak ditemukan</Typography.Text>
      </div>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%', maxWidth: 672, padding: 24 }}>
      <button onClick={() => navigate(`/assets/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.color = '#374151'} onMouseLeave={(e) => e.target.style.color = '#6b7280'}>
        <ArrowLeft size={18} /> Kembali ke Detail Aset
      </button>

      <Typography.Title level={4} style={{ margin: 0 }}>Lepas Aset</Typography.Title>

      {/* Asset Info Header */}
      <Card size="small" style={{ background: '#fafafa' }}>
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="Kode Aset">{asset.code}</Descriptions.Item>
          <Descriptions.Item label="Nama">{asset.name}</Descriptions.Item>
          <Descriptions.Item label="Harga Perolehan">{formatCurrency(asset.acquisition_cost)}</Descriptions.Item>
          <Descriptions.Item label="Tanggal Perolehan">{formatDate(asset.acquisition_date)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {error && (
        <Alert type="error" message={error} showIcon />
      )}

      {/* Form */}
      <Card title={<Typography.Text strong>Informasi Pelepasan</Typography.Text>}>

        {/* Tanggal disposal */}
        <DateInput
          label="Tanggal Disposal *"
          value={form.disposal_date}
          onChange={e => handleChange({ target: { name: 'disposal_date', value: e.target.value } })}
        />

        {/* Tipe disposal */}
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
            Tipe Pelepasan <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="disposal_type"
                value="sale"
                checked={form.disposal_type === 'sale'}
                onChange={handleChange}
                style={{ accentColor: '#2563eb' }}
              />
              <span style={{ fontSize: 14, color: '#374151' }}>Penjualan</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="disposal_type"
                value="writeoff"
                checked={form.disposal_type === 'writeoff'}
                onChange={handleChange}
                style={{ accentColor: '#2563eb' }}
              />
              <span style={{ fontSize: 14, color: '#374151' }}>Penghapusan (Write-off)</span>
            </label>
          </div>
        </div>

        {/* Sale-specific fields */}
        {form.disposal_type === 'sale' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Harga Jual <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                name="sale_price"
                value={form.sale_price}
                onChange={handleChange}
                min="0"
                placeholder="0"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Akun Kas/Bank Penerimaan <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="payment_account_id"
                value={form.payment_account_id}
                onChange={handleChange}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
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
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            Keterangan
          </label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={2}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* Preview button */}
        <button
          onClick={handlePreview}
          disabled={loadingPreview}
          style={{ width: '100%', padding: '8px 0', border: '1px solid #2563eb', color: '#2563eb', borderRadius: 4, fontWeight: 500, fontSize: 14, backgroundColor: 'white', cursor: loadingPreview ? 'not-allowed' : 'pointer', opacity: loadingPreview ? 0.6 : 1 }}
          onMouseEnter={(e) => !loadingPreview && (e.target.style.backgroundColor = '#eff6ff')}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
        >
          {loadingPreview ? 'Menghitung...' : 'Preview Disposal'}
        </button>
      </Card>

      {/* Preview card */}
      {preview && (
        <DisposalPreviewCard
          preview={preview}
          disposalType={form.disposal_type}
          salePrice={Number(form.sale_price) || 0}
        />
      )}

      {/* Confirm button */}
      <Flex justify="flex-end">
        <button
          onClick={handleConfirm}
          disabled={!preview || saving}
          style={{
            padding: '8px 24px',
            borderRadius: 4,
            fontWeight: 500,
            border: 'none',
            cursor: !preview || saving ? 'not-allowed' : 'pointer',
            backgroundColor: !preview || saving ? '#f3f4f6' : '#dc2626',
            color: !preview || saving ? '#9ca3af' : 'white',
          }}
          onMouseEnter={(e) => (!preview || saving) || (e.target.style.backgroundColor = '#b91c1c')}
          onMouseLeave={(e) => (!preview || saving) || (e.target.style.backgroundColor = '#dc2626')}
        >
          {saving ? 'Memproses...' : 'Konfirmasi Pelepasan Aset'}
        </button>
      </Flex>
    </Space>
  )
}
