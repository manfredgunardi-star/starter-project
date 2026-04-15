import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { listCategories } from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'

export default function AssetsListReportPage() {
  const [cutOffDate, setCutOffDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('all')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listCategories().then(setCategories)
  }, [])

  async function handleLoad() {
    if (!cutOffDate) {
      setError('Tanggal cutoff wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      // Get assets
      let query = supabase
        .from('assets')
        .select('id, code, name, acquisition_date, acquisition_cost, status, category_id, category:asset_categories(name)')
        .eq('is_active', true)

      if (categoryId) query = query.eq('category_id', categoryId)
      if (status !== 'all') query = query.eq('status', status)

      const { data: assets, error: aErr } = await query.order('code')
      if (aErr) throw aErr

      // Get accumulated depreciation for each asset up to cutoff date
      const result = await Promise.all(
        assets.map(async (asset) => {
          const { data: schedules, error: sErr } = await supabase
            .from('depreciation_schedules')
            .select('amount')
            .eq('asset_id', asset.id)
            .eq('status', 'posted')
            .lte('period', cutOffDate.slice(0, 7))
          if (sErr) throw sErr

          const accumulated = schedules.reduce((sum, s) => sum + Number(s.amount), 0)
          const bookValue = asset.acquisition_cost - accumulated

          return {
            code: asset.code,
            name: asset.name,
            category: asset.category?.name || '—',
            acquisitionDate: asset.acquisition_date,
            acquisitionCost: asset.acquisition_cost,
            accumulated,
            bookValue,
            status: asset.status,
          }
        })
      )
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
    doc.text('Daftar Aset Tetap', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per: ${formatDate(cutOffDate)}`, 14, 22)

    const tableData = rows.map(r => [
      r.code,
      r.name,
      r.category,
      formatDate(r.acquisitionDate),
      formatCurrency(r.acquisitionCost),
      formatCurrency(r.accumulated),
      formatCurrency(r.bookValue),
    ])

    doc.autoTable({
      head: [['Kode', 'Nama', 'Kategori', 'Tgl Perolehan', 'Harga', 'Akumulasi', 'Nilai Buku']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })

    doc.save(`assets-list-${cutOffDate}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(
      rows.map(r => ({
        Kode: r.code,
        Nama: r.name,
        Kategori: r.category,
        'Tgl Perolehan': r.acquisitionDate,
        'Harga Perolehan': r.acquisitionCost,
        'Akumulasi Penyusutan': r.accumulated,
        'Nilai Buku': r.bookValue,
      }))
    )
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assets')
    XLSX.writeFile(wb, `assets-list-${cutOffDate}.xlsx`)
  }

  const total = {
    acquisitionCost: rows.reduce((s, r) => s + r.acquisitionCost, 0),
    accumulated: rows.reduce((s, r) => s + r.accumulated, 0),
    bookValue: rows.reduce((s, r) => s + r.bookValue, 0),
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Daftar Aset Tetap</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <DateInput
          label="Cutoff Date"
          value={cutOffDate}
          onChange={e => setCutOffDate(e.target.value)}
        />
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="disposed">Dilepas</option>
            <option value="fully_depreciated">Penyusutan Selesai</option>
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
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium"
            >
              <FileText size={16} /> Export PDF
            </button>
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium"
            >
              <Download size={16} /> Export Excel
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Kode</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Nama</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Kategori</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Tgl Perolehan</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Harga Perolehan</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Akumulasi</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Nilai Buku</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-gray-700">{r.code}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{r.category}</td>
                    <td className="px-4 py-2 font-mono text-gray-600">{formatDate(r.acquisitionDate)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.acquisitionCost)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.accumulated)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
                <tr>
                  <td colSpan="4" className="px-4 py-2">Total ({rows.length} aset)</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(total.acquisitionCost)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(total.accumulated)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(total.bookValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && !loading && !error && (
        <div className="text-center text-gray-400 py-8">Klik "Tampilkan" untuk melihat laporan.</div>
      )}

      {loading && (
        <div className="text-center text-gray-500 py-8">Memuat...</div>
      )}
    </div>
  )
}
