import React from 'react'
import { RefreshCw, FileSpreadsheet, FileDown } from 'lucide-react'

/**
 * Reusable report toolbar.
 * Props:
 *  periodMode: 'range' | 'asOf'
 *  startDate, endDate, onStartDate, onEndDate
 *  onGenerate, loading, canExport, onExportExcel, onExportPdf
 *  extraControls?: ReactNode  generateLabel?: string
 */
export default function ReportToolbar({
  periodMode = 'range', startDate, endDate, onStartDate, onEndDate,
  onGenerate, loading = false, canExport = false, onExportExcel, onExportPdf,
  extraControls = null, generateLabel = 'Generate',
}) {
  return (
    <div className="card flex flex-wrap items-center gap-3" role="region" aria-label="Kontrol laporan">
      {periodMode === 'range' && (
        <div className="flex items-center gap-2">
          <label htmlFor="rpt-start" className="label mb-0 text-xs">Mulai:</label>
          <input id="rpt-start" type="date" value={startDate} onChange={e => onStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor="rpt-end" className="label mb-0 text-xs">{periodMode === 'asOf' ? 'Per Tanggal:' : 'S/D:'}</label>
        <input id="rpt-end" type="date" value={endDate} onChange={e => onEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
      </div>
      {extraControls}
      <button onClick={onGenerate} disabled={loading} aria-busy={loading}
        className="btn-primary flex items-center gap-2">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {generateLabel}
      </button>
      {canExport && (
        <>
          <button onClick={onExportExcel} aria-label="Unduh Excel" className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Excel
          </button>
          <button onClick={onExportPdf} aria-label="Unduh PDF" className="btn-secondary flex items-center gap-2">
            <FileDown className="w-4 h-4" aria-hidden="true" /> PDF
          </button>
        </>
      )}
    </div>
  )
}
