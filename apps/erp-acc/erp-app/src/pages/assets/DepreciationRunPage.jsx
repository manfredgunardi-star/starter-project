import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, SkipForward } from 'lucide-react'
import { previewPeriod, postPeriod } from '../../services/depreciationService'
import DepreciationPreviewTable from '../../components/assets/DepreciationPreviewTable'
import { useAuth } from '../../contexts/AuthContext'
import DateInput from '../../components/ui/DateInput'
import { Space, Row, Col, Card, Flex, Typography, Alert, Steps } from 'antd'

// Default posting_date = last day of previous month
function defaultPostingDate() {
  const d = new Date()
  d.setDate(0)
  return d.toISOString().slice(0, 10)
}

// Default period = previous month (YYYY-MM)
function defaultPeriod() {
  const d = new Date()
  d.setDate(0)
  return d.toISOString().slice(0, 7)
}

export default function DepreciationRunPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [step, setStep] = useState('select') // 'select' | 'preview' | 'result'
  const [form, setForm] = useState({
    period_from: defaultPeriod(),
    period_to: defaultPeriod(),
    posting_date: defaultPostingDate(),
    description_template: 'Penyusutan {asset} — {period}',
  })
  const [preview, setPreview] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handlePreview() {
    if (!form.period_from || !form.period_to) {
      setError('Period from dan period to wajib diisi.')
      return
    }
    if (form.period_from > form.period_to) {
      setError('Period from tidak boleh setelah period to.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await previewPeriod({ period_from: form.period_from, period_to: form.period_to })
      setPreview(data)
      setStep('preview')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePost() {
    if (!form.posting_date) {
      setError('Tanggal posting wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await postPeriod({
        period_from: form.period_from,
        period_to: form.period_to,
        posting_date: form.posting_date,
        description_template: form.description_template,
      })
      setResult(res)
      setStep('result')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const grandTotal = preview.reduce((sum, g) => sum + g.total, 0)

  const stepItems = [
    { title: 'Pilih Periode' },
    { title: 'Preview' },
    { title: 'Hasil' },
  ]
  const stepIndex = ['select', 'preview', 'result'].indexOf(step)

  return (
    <Space direction="vertical" style={{ width: '100%', padding: 24 }}>
      <button
        onClick={() => step === 'select' ? navigate('/assets') : setStep(step === 'preview' ? 'select' : 'preview')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => e.target.style.color = '#374151'}
        onMouseLeave={(e) => e.target.style.color = '#6b7280'}
      >
        <ArrowLeft size={18} /> {step === 'select' ? 'Kembali ke Daftar Aset' : 'Kembali'}
      </button>

      <Typography.Title level={4} style={{ margin: 0 }}>Post Penyusutan</Typography.Title>

      {/* Step indicator */}
      <Steps current={stepIndex} size="small" items={stepItems} />

      {error && (
        <Alert type="error" message={error} showIcon />
      )}

      {/* Step: Select */}
      {step === 'select' && (
        <Card title={<Typography.Text strong>Periode Penyusutan</Typography.Text>}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Dari Periode <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="month"
                name="period_from"
                value={form.period_from}
                onChange={handleChange}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              />
            </Col>
            <Col span={12}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Sampai Periode <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="month"
                name="period_to"
                value={form.period_to}
                onChange={handleChange}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              />
            </Col>
            <Col span={12}>
              <DateInput
                label="Tanggal Posting *"
                value={form.posting_date}
                onChange={e => handleChange({ target: { name: 'posting_date', value: e.target.value } })}
              />
            </Col>
            <Col span={12}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Template Keterangan Jurnal
              </label>
              <input
                type="text"
                name="description_template"
                value={form.description_template}
                onChange={handleChange}
                placeholder="Penyusutan {asset} — {period}"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              />
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Gunakan {'{asset}'} dan {'{period}'} sebagai placeholder.</p>
            </Col>
          </Row>
          <Flex justify="flex-end" style={{ marginTop: 16 }}>
            {isAdmin && (
              <button
                onClick={handlePreview}
                disabled={loading}
                style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
                onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#1d4ed8')}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
              >
                {loading ? 'Memuat...' : 'Preview Penyusutan →'}
              </button>
            )}
            {!isAdmin && (
              <Typography.Text type="secondary">Hanya admin yang dapat menjalankan penyusutan.</Typography.Text>
            )}
          </Flex>
        </Card>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card
            title={
              <Space direction="vertical" size={0}>
                <Typography.Text strong>
                  Preview: {form.period_from === form.period_to ? form.period_from : `${form.period_from} s.d. ${form.period_to}`}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {preview.length} aset · Tanggal posting: {form.posting_date}
                </Typography.Text>
              </Space>
            }
          >
            <DepreciationPreviewTable preview={preview} />
          </Card>

          {preview.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={
                <>
                  Total yang akan di-posting: <strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(grandTotal)}</strong>
                </>
              }
            />
          )}

          <Flex justify="space-between">
            <button
              onClick={() => setStep('select')}
              style={{ padding: '8px 16px', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, backgroundColor: 'white', cursor: 'pointer' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
            >
              ← Kembali
            </button>
            {isAdmin && (
              <button
                onClick={handlePost}
                disabled={loading || preview.length === 0}
                style={{ padding: '8px 20px', backgroundColor: '#16a34a', color: 'white', borderRadius: 4, border: 'none', cursor: loading || preview.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || preview.length === 0 ? 0.6 : 1 }}
                onMouseEnter={(e) => (loading || preview.length === 0) || (e.target.style.backgroundColor = '#15803d')}
                onMouseLeave={(e) => (loading || preview.length === 0) || (e.target.style.backgroundColor = '#16a34a')}
              >
                {loading ? 'Memposting...' : 'Confirm & Post'}
              </button>
            )}
            {!isAdmin && (
              <Typography.Text type="secondary">Hanya admin yang dapat menjalankan penyusutan.</Typography.Text>
            )}
          </Flex>
        </Space>
      )}

      {/* Step: Result */}
      {step === 'result' && result && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card title={<Typography.Text strong>Hasil Posting</Typography.Text>}>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                  <CheckCircle style={{ color: '#16a34a', flexShrink: 0 }} size={28} />
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>{result.posted}</div>
                    <div style={{ fontSize: 14, color: '#16a34a' }}>Jurnal terposting</div>
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
                  <SkipForward style={{ color: '#6b7280', flexShrink: 0 }} size={28} />
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#374151' }}>{result.skipped}</div>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>Dilewati (sudah diposting)</div>
                  </div>
                </div>
              </Col>
            </Row>

            {result.errors?.length > 0 && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 16 }}
                message={`${result.errors.length} error`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </Card>

          <Flex justify="flex-end">
            <button
              onClick={() => navigate('/assets')}
              style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
            >
              Kembali ke Daftar Aset
            </button>
          </Flex>
        </Space>
      )}
    </Space>
  )
}
