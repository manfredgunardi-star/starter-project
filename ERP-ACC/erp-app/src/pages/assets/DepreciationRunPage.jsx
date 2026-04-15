import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, SkipForward } from 'lucide-react'
import { previewPeriod, postPeriod } from '../../services/depreciationService'
import DepreciationPreviewTable from '../../components/assets/DepreciationPreviewTable'
import { useAuth } from '../../contexts/AuthContext'
import DateInput from '../../components/ui/DateInput'

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

  return (
    <div className="space-y-6 p-6">
      <button
        onClick={() => step === 'select' ? navigate('/assets') : setStep(step === 'preview' ? 'select' : 'preview')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={18} /> {step === 'select' ? 'Kembali ke Daftar Aset' : 'Kembali'}
      </button>

      <h1 className="text-2xl font-bold text-gray-900">Post Penyusutan</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['select', 'preview', 'result'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === s ? 'bg-blue-600 text-white' :
              ['select', 'preview', 'result'].indexOf(step) > i ? 'bg-green-500 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={step === s ? 'text-blue-600 font-medium' : 'text-gray-400'}>
              {s === 'select' ? 'Pilih Periode' : s === 'preview' ? 'Preview' : 'Hasil'}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* Step: Select */}
      {step === 'select' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-800">Periode Penyusutan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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
            </div>
            <div>
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
            </div>
            <div>
              <DateInput
                label="Tanggal Posting *"
                value={form.posting_date}
                onChange={e => handleChange({ target: { name: 'posting_date', value: e.target.value } })}
              />
            </div>
            <div>
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
            </div>
          </div>
          <div className="flex justify-end">
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
              <p className="text-sm text-gray-500">Hanya admin yang dapat menjalankan penyusutan.</p>
            )}
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-1">
              Preview: {form.period_from === form.period_to ? form.period_from : `${form.period_from} s.d. ${form.period_to}`}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {preview.length} aset · Tanggal posting: {form.posting_date}
            </p>
            <DepreciationPreviewTable preview={preview} />
          </div>

          {preview.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-700">
              Total yang akan di-posting: <span className="font-bold">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(grandTotal)}
              </span>
            </div>
          )}

          <div className="flex justify-between">
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
              <p className="text-sm text-gray-500">Hanya admin yang dapat menjalankan penyusutan.</p>
            )}
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Hasil Posting</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="text-green-600 shrink-0" size={28} />
                <div>
                  <div className="text-2xl font-bold text-green-700">{result.posted}</div>
                  <div className="text-sm text-green-600">Jurnal terposting</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <SkipForward className="text-gray-500 shrink-0" size={28} />
                <div>
                  <div className="text-2xl font-bold text-gray-700">{result.skipped}</div>
                  <div className="text-sm text-gray-500">Dilewati (sudah diposting)</div>
                </div>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="text-red-600" size={18} />
                  <span className="text-sm font-medium text-red-700">{result.errors.length} error</span>
                </div>
                <ul className="text-xs text-red-600 space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => navigate('/assets')}
              className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Kembali ke Daftar Aset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
