import React, { useState } from 'react'
import { Download, RefreshCw, AlertCircle } from 'lucide-react'
import { loadReportDataset } from '../utils/reportDataset'
import { buildAllReports } from '../utils/reportModel'
import { exportAllToExcel, exportAllToPdf } from '../utils/reportRenderers'

export default function DownloadAllPanel({ defaultStart, defaultEnd }) {
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')

  const run = async (format) => {
    if (endDate < startDate) { setStatus('error'); setError('Tanggal akhir sebelum tanggal mulai.'); return }
    setStatus('loading'); setError('')
    try {
      const ds = await loadReportDataset({ startDate, endDate })
      const models = await buildAllReports(ds)
      const label = `${startDate}_${endDate}`
      if (format === 'excel') await exportAllToExcel(models, label)
      else await exportAllToPdf(models, label)
      setStatus('idle')
    } catch (e) {
      setStatus('error'); setError(e?.message || 'Gagal membuat laporan.')
    }
  }

  const busy = status === 'loading'
  return (
    <div className="card flex flex-wrap items-center gap-3 bg-brand-50/40 border border-brand-100">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-brand-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-700">Download Semua Laporan</span>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="all-start" className="label mb-0 text-xs">Mulai:</label>
        <input id="all-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        <label htmlFor="all-end" className="label mb-0 text-xs">S/D:</label>
        <input id="all-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
      </div>
      <button onClick={() => run('excel')} disabled={busy} aria-busy={busy} className="btn-primary flex items-center gap-2">
        {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : null} Excel (6 sheet)
      </button>
      <button onClick={() => run('pdf')} disabled={busy} aria-busy={busy} className="btn-secondary flex items-center gap-2">
        PDF gabungan
      </button>
      <span className="sr-only" role="status" aria-live="polite">{busy ? 'Menyiapkan 6 laporan' : ''}</span>
      {status === 'error' && (
        <span className="flex items-center gap-1 text-sm text-red-600" role="alert">
          <AlertCircle className="w-4 h-4" aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  )
}
