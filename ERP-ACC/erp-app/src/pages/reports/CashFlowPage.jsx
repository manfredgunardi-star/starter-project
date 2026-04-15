import { useState } from 'react'
import { getCashFlowData } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function CashFlowPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getCashFlowData(startDate, endDate)
      setData(result || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const incoming = data ? data.filter(p => p.type === 'incoming') : []
  const outgoing = data ? data.filter(p => p.type === 'outgoing') : []
  const totalIn = incoming.reduce((s, p) => s + Number(p.amount), 0)
  const totalOut = outgoing.reduce((s, p) => s + Number(p.amount), 0)
  const netCash = totalIn - totalOut

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Arus Kas (Cash Flow)</h1>

      <div className="flex gap-4 items-end">
        <DateInput
          label="Dari Tanggal"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <DateInput
          label="Hingga Tanggal"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <Button variant="primary" onClick={handleLoad} loading={loading}>
          <Search size={16} /> Tampilkan
        </Button>
      </div>

      {loading && <LoadingSpinner message="Memuat arus kas..." />}
      {error && <div className="text-red-600">{error}</div>}

      {data && !loading && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-700">Total Kas Masuk</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(totalIn)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-sm text-red-700">Total Kas Keluar</p>
              <p className="text-2xl font-bold text-red-900">{formatCurrency(totalOut)}</p>
            </div>
            <div className={`border rounded-lg p-4 text-center ${
              netCash >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <p className={`text-sm ${netCash >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {netCash >= 0 ? 'Arus Kas Bersih (+)' : 'Arus Kas Bersih (-)'}
              </p>
              <p className={`text-2xl font-bold ${netCash >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                {formatCurrency(Math.abs(netCash))}
              </p>
            </div>
          </div>

          {/* Kas Masuk */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-green-100 px-4 py-2 font-semibold text-sm text-green-800 border-b border-green-200">
              Kas Masuk (dari Customer) — {incoming.length} transaksi
            </div>
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Tanggal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Customer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Akun</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Ref. Invoice</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {incoming.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-4 text-sm text-gray-400 text-center">Tidak ada transaksi</td></tr>
                ) : (
                  incoming.map((p, i) => (
                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{formatDate(p.date)}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{p.customer?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{p.account?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-500">{p.invoice?.invoice_number || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-green-700">{formatCurrency(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {incoming.length > 0 && (
                <tfoot className="bg-green-50 border-t border-green-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-right">Total Masuk</td>
                    <td className="px-4 py-2 text-sm font-bold text-right text-green-700">{formatCurrency(totalIn)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Kas Keluar */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-red-100 px-4 py-2 font-semibold text-sm text-red-800 border-b border-red-200">
              Kas Keluar (ke Supplier) — {outgoing.length} transaksi
            </div>
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Tanggal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Supplier</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Akun</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Ref. Invoice</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {outgoing.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-4 text-sm text-gray-400 text-center">Tidak ada transaksi</td></tr>
                ) : (
                  outgoing.map((p, i) => (
                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{formatDate(p.date)}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{p.supplier?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{p.account?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-500">{p.invoice?.invoice_number || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-red-700">{formatCurrency(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {outgoing.length > 0 && (
                <tfoot className="bg-red-50 border-t border-red-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-right">Total Keluar</td>
                    <td className="px-4 py-2 text-sm font-bold text-right text-red-700">{formatCurrency(totalOut)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
