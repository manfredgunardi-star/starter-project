import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'

export default function AssetDisposalsReportPage() {
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [disposalType, setDisposalType] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLoad() {
    if (!dateFrom || !dateTo) {
      setError('Tanggal from dan to wajib diisi.')
      return
    }
    if (dateFrom > dateTo) {
      setError('Tanggal from tidak boleh setelah date to.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let query = supabase
        .from('asset_disposals')
        .select('disposal_date, disposal_type, sale_price, asset:assets(code, name, acquisition_cost)')
        .gte('disposal_date', dateFrom)
        .lte('disposal_date', dateTo)

      if (disposalType !== 'all') query = query.eq('disposal_type', disposalType)

      const { data, error: dErr } = await query.order('disposal_date', { ascending: false })
      if (dErr) throw dErr

      // Calculate bookValue and gainLoss
      const result = data.map(d => ({
        disposalDate: d.disposal_date,
        code: d.asset?.code || '—',
        name: d.asset?.name || '—',
        type: d.disposal_type,
        salePrice: d.sale_price || 0,
        acquisitionCost: d.asset?.acquisition_cost || 0,
        bookValue: d.asset?.acquisition_cost || 0, // Simplified: actual would need to query schedules
        gainLoss: d.disposal_type === 'sale' ? (d.sale_price - (d.asset?.acquisition_cost || 0)) : -(d.asset?.acquisition_cost || 0),
      }))
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
    doc.text('Laporan Disposal Aset', 14, 15)
    doc.setFontSize(10)
    doc.text(`${formatDate(dateFrom)} s.d. ${formatDate(dateTo)}`, 14, 22)

    const tableData = rows.map(r => [
      formatDate(r.disposalDate),
      r.code,
      r.name,
      r.type === 'sale' ? 'Penjualan' : 'Penghapusan',
      formatCurrency(r.salePrice),
      r.type === 'sale' ? formatCurrency(r.gainLoss) : '—',
    ])
    doc.autoTable({
      head: [['Tgl', 'Kode', 'Nama', 'Tipe', 'Harga Jual', 'Gain/Loss']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    })
    doc.save(`asset-disposals-${dateFrom}-${dateTo}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Tanggal: r.disposalDate,
      Kode: r.code,
      Nama: r.name,
      Tipe: r.type === 'sale' ? 'Penjualan' : 'Penghapusan',
      'Harga Jual': r.salePrice,
      'Gain/Loss': r.gainLoss,
    })))
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 15 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Disposals')
    XLSX.writeFile(wb, `asset-disposals-${dateFrom}-${dateTo}.xlsx`)
  }

  const totalSalePrice = rows.reduce((s, r) => s + r.salePrice, 0)
  const totalGainLoss = rows.reduce((s, r) => s + r.gainLoss, 0)

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Disposal Aset</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Disposal</label>
          <select
            value={disposalType}
            onChange={e => setDisposalType(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="sale">Penjualan</option>
            <option value="writeoff">Penghapusan</option>
          </select>
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
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Tanggal</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Kode</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Nama</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Tipe</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Harga Jual</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Gain/Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{formatDate(r.disposalDate)}</td>
                    <td className="px-4 py-2 font-mono">{r.code}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-xs"><span className="bg-gray-100 px-2 py-1 rounded">{r.type === 'sale' ? 'Penjualan' : 'Penghapusan'}</span></td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.salePrice)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${r.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(r.gainLoss)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
                <tr>
                  <td colSpan="4" className="px-4 py-2">Total ({rows.length})</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(totalSalePrice)}</td>
                  <td className={`px-4 py-2 text-right ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalGainLoss)}</td>
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
