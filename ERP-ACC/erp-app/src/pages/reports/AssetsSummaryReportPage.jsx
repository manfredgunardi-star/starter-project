import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'

export default function AssetsSummaryReportPage() {
  const [cutOffDate, setCutOffDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLoad() {
    if (!cutOffDate) {
      setError('Tanggal cutoff wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      // Get all assets with categories
      const { data: assets, error: aErr } = await supabase
        .from('assets')
        .select('id, acquisition_cost, category_id, category:asset_categories(id, code, name)')
        .eq('is_active', true)
      if (aErr) throw aErr

      // Group by category and get accumulated depreciation
      const byCategory = {}
      await Promise.all(
        assets.map(async (asset) => {
          const catKey = asset.category?.id || 'unknown'
          if (!byCategory[catKey]) {
            byCategory[catKey] = {
              code: asset.category?.code || '—',
              name: asset.category?.name || '—',
              count: 0,
              totalAcquisition: 0,
              totalAccumulated: 0,
            }
          }

          const { data: schedules } = await supabase
            .from('depreciation_schedules')
            .select('amount')
            .eq('asset_id', asset.id)
            .eq('status', 'posted')
            .lte('period', cutOffDate.slice(0, 7))

          const accumulated = schedules?.reduce((s, r) => s + Number(r.amount), 0) || 0
          byCategory[catKey].count += 1
          byCategory[catKey].totalAcquisition += Number(asset.acquisition_cost)
          byCategory[catKey].totalAccumulated += accumulated
        })
      )

      const result = Object.values(byCategory)
        .map(r => ({
          ...r,
          bookValue: r.totalAcquisition - r.totalAccumulated,
        }))
        .sort((a, b) => a.code.localeCompare(b.code))

      setRows(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Ringkasan Aset Tetap per Kategori', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per: ${cutOffDate}`, 14, 22)

    const tableData = rows.map(r => [
      r.code,
      r.name,
      r.count.toString(),
      formatCurrency(r.totalAcquisition),
      formatCurrency(r.totalAccumulated),
      formatCurrency(r.bookValue),
    ])

    doc.autoTable({
      head: [['Kode', 'Kategori', 'Jumlah', 'Total Harga', 'Total Akum', 'Nilai Buku']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })

    doc.save(`assets-summary-${cutOffDate}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Kategori: r.name,
      'Jumlah Aset': r.count,
      'Total Harga Perolehan': r.totalAcquisition,
      'Total Akumulasi': r.totalAccumulated,
      'Nilai Buku': r.bookValue,
    })))
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Summary')
    XLSX.writeFile(wb, `assets-summary-${cutOffDate}.xlsx`)
  }

  const totals = {
    count: rows.reduce((s, r) => s + r.count, 0),
    acquisition: rows.reduce((s, r) => s + r.totalAcquisition, 0),
    accumulated: rows.reduce((s, r) => s + r.totalAccumulated, 0),
    bookValue: rows.reduce((s, r) => s + r.bookValue, 0),
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Ringkasan Aset Tetap per Kategori</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cutoff Date</label>
          <input
            type="date"
            value={cutOffDate}
            onChange={e => setCutOffDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 text-sm font-medium"
        >
          Tampilkan
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium">
              <FileText size={16} /> Export PDF
            </button>
            <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium">
              <Download size={16} /> Export Excel
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Kategori</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600">Jumlah Aset</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Total Harga Perolehan</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Total Akumulasi</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Nilai Buku</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><span className="font-mono text-gray-600">{r.code}</span> {r.name}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{r.count}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.totalAcquisition)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.totalAccumulated)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
                <tr>
                  <td colSpan="1" className="px-4 py-2">Total ({totals.count} aset)</td>
                  <td className="px-4 py-2 text-center">{totals.count}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(totals.acquisition)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(totals.accumulated)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(totals.bookValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && !loading && !error && (
        <div className="text-center text-gray-400 py-8">Klik "Tampilkan" untuk melihat laporan.</div>
      )}

      {loading && <div className="text-center text-gray-500 py-8">Memuat...</div>}
    </div>
  )
}
