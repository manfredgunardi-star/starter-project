import { useState } from 'react'
import { getAccountBalances } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Search } from 'lucide-react'

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

function Section({ title, accounts, className }) {
  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-800 border-b">{title}</div>
      <table className="w-full">
        <tbody>
          {accounts.map(a => (
            <tr key={a.coa_id} className="border-b border-gray-100">
              <td className="px-4 py-2 text-sm text-gray-700">{a.code}</td>
              <td className="px-4 py-2 text-sm text-gray-900">{a.name}</td>
              <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                {formatCurrency(a.balance)}
              </td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-4 text-sm text-gray-400 text-center">—</td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 bg-gray-50">
          <tr>
            <td colSpan={2} className="px-4 py-2 text-sm font-semibold">Total {title}</td>
            <td className="px-4 py-2 text-sm font-bold text-right">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function BalanceSheetPage() {
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      // From epoch to endDate to get cumulative balance
      const balances = await getAccountBalances('2000-01-01', endDate)
      setData(balances || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const byType = (type) => (data || []).filter(a => a.type === type && a.balance !== 0)

  const totalAset = byType('asset').reduce((s, a) => s + a.balance, 0)
  const totalKewajiban = byType('liability').reduce((s, a) => s + a.balance, 0)
  const totalModal = byType('equity').reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Neraca (Balance Sheet)</h1>

      <div className="flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Per Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <Button variant="primary" onClick={handleLoad} loading={loading}>
          <Search size={16} /> Tampilkan
        </Button>
      </div>

      {loading && <LoadingSpinner message="Memuat neraca..." />}
      {error && <div className="text-red-600">{error}</div>}

      {data && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: ASET */}
            <div className="space-y-4">
              <Section title="ASET" accounts={byType('asset')} className="border-blue-200" />
            </div>

            {/* Right: KEWAJIBAN + MODAL */}
            <div className="space-y-4">
              <Section title="KEWAJIBAN" accounts={byType('liability')} className="border-red-200" />
              <Section title="MODAL / EKUITAS" accounts={byType('equity')} className="border-green-200" />
            </div>
          </div>

          {/* Summary */}
          <div className="border-t-2 border-gray-300 pt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700">Total Aset</p>
                <p className="text-xl font-bold text-blue-900">{formatCurrency(totalAset)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-sm text-red-700">Total Kewajiban</p>
                <p className="text-xl font-bold text-red-900">{formatCurrency(totalKewajiban)}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-sm text-green-700">Total Modal</p>
                <p className="text-xl font-bold text-green-900">{formatCurrency(totalModal)}</p>
              </div>
            </div>

            <div className={`mt-3 p-3 rounded text-sm text-center ${
              Math.abs(totalAset - totalKewajiban - totalModal) < 0.01
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {Math.abs(totalAset - totalKewajiban - totalModal) < 0.01
                ? '✓ Neraca seimbang — Aset = Kewajiban + Modal'
                : `⚠ Selisih: ${formatCurrency(Math.abs(totalAset - totalKewajiban - totalModal))}`
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
