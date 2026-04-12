import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { listCategories } from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'

export default function DepreciationPeriodReportPage() {
  const [periodFrom, setPeriodFrom] = useState(new Date().getFullYear() + '-01')
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 7))
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listCategories().then(setCategories)
  }, [])

  async function handleLoad() {
    if (!periodFrom || !periodTo) {
      setError('Period from dan to wajib diisi.')
      return
    }
    if (periodFrom > periodTo) {
      setError('Period from tidak boleh setelah period to.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let query = supabase
        .from('depreciation_schedules')
        .select('period, amount, asset_id, asset:assets(category_id, category:asset_categories(code, name))')
        .eq('status', 'posted')
        .gte('period', periodFrom)
        .lte('period', periodTo)

      const { data, error: dErr } = await query.order('period')
      if (dErr) throw dErr

      // Group by period and category
      const grouped = {}
      data.forEach(d => {
        if (categoryId && d.asset.category_id !== categoryId) return
        const key = `${d.period}|${d.asset.category?.code || 'Unknown'}`
        if (!grouped[key]) {
          grouped[key] = {
            period: d.period,
            categoryCode: d.asset.category?.code || '—',
            categoryName: d.asset.category?.name || '—',
            count: 0,
            total: 0,
          }
        }
        grouped[key].count += 1
        grouped[key].total += Number(d.amount)
      })

      setRows(Object.values(grouped).sort((a, b) => {
        if (a.period !== b.period) return a.period.localeCompare(b.period)
        return a.categoryCode.localeCompare(b.categoryCode)
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Penyusutan per Periode', 14, 15)
    doc.setFontSize(10)
    doc.text(`${periodFrom} s.d. ${periodTo}`, 14, 22)

    const tableData = rows.map(r => [r.period, r.categoryCode, r.categoryName, r.count.toString(), formatCurrency(r.total)])
    doc.autoTable({
      head: [['Periode', 'Kat', 'Kategori', 'Jumlah', 'Total']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' } },
    })
    doc.save(`depreciation-period-${periodFrom}-${periodTo}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Periode: r.period,
      Kategori: r.categoryName,
      'Jumlah Aset': r.count,
      'Total Penyusutan': r.total,
    })))
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Depreciation')
    XLSX.writeFile(wb, `depreciation-period-${periodFrom}-${periodTo}.xlsx`)
  }

  const totalAmount = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Penyusutan per Periode</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dari Periode</label>
          <input
            type="month"
            value={periodFrom}
            onChange={e => setPeriodFrom(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Periode</label>
          <input
            type="month"
            value={periodTo}
            onChange={e => setPeriodTo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Semua</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
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
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Periode</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Kategori</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600">Jumlah Aset</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Total Penyusutan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{r.period}</td>
                    <td className="px-4 py-2">{r.categoryName}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{r.count}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
                <tr>
                  <td colSpan="3" className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(totalAmount)}</td>
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
