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
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dari Periode <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                name="period_from"
                value={form.period_from}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </Col>
            <Col span={12}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sampai Periode <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                name="period_to"
                value={form.period_to}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Keterangan Jurnal
              </label>
              <input
                type="text"
                name="description_template"
                value={form.description_template}
                onChange={handleChange}
                placeholder="Penyusutan {asset} — {period}"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <p className="text-xs text-gray-400 mt-1">Gunakan {'{asset}'} dan {'{period}'} sebagai placeholder.</p>
            </Col>
          </Row>
          <Flex justify="flex-end" style={{ marginTop: 16 }}>
            {isAdmin && (
              <button
                onClick={handlePreview}
                disabled={loading}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 transition-colors"
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
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              ← Kembali
            </button>
            {isAdmin && (
              <button
                onClick={handlePost}
                disabled={loading || preview.length === 0}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60 transition-colors"
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
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="text-green-600 shrink-0" size={28} />
                  <div>
                    <div className="text-2xl font-bold text-green-700">{result.posted}</div>
                    <div className="text-sm text-green-600">Jurnal terposting</div>
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <SkipForward className="text-gray-500 shrink-0" size={28} />
                  <div>
                    <div className="text-2xl font-bold text-gray-700">{result.skipped}</div>
                    <div className="text-sm text-gray-500">Dilewati (sudah diposting)</div>
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
              className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Kembali ke Daftar Aset
            </button>
          </Flex>
        </Space>
      )}
    </Space>
  )
}
