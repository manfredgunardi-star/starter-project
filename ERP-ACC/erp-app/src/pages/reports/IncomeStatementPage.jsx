import { useState } from 'react'
import { getAccountBalances } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
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

function Section({ title, accounts, totalLabel, highlight }) {
  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  return (
    <div className="space-y-1">
      <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
        {title}
      </h3>
      {accounts.map(a => (
        <div key={a.coa_id} className="flex justify-between text-sm">
          <span className="text-gray-700 pl-4">{a.code} — {a.name}</span>
          <span className="font-medium text-gray-900">{formatCurrency(a.balance)}</span>
        </div>
      ))}
      {accounts.length === 0 && (
        <div className="text-sm text-gray-400 pl-4">—</div>
      )}
      <div className={`flex justify-between text-sm font-semibold border-t border-gray-300 pt-1 mt-1 ${highlight || ''}`}>
        <span>{totalLabel}</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  )
}

export default function IncomeStatementPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const balances = await getAccountBalances(startDate, endDate)
      setData(balances || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const byType = (type) => (data || []).filter(a => a.type === type && a.balance !== 0)

  const totalRevenue = byType('revenue').reduce((s, a) => s + a.balance, 0)
  const totalExpense = byType('expense').reduce((s, a) => s + a.balance, 0)
  const netIncome = totalRevenue - totalExpense

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Laba Rugi (Income Statement)</h1>

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

      {loading && <LoadingSpinner message="Memuat laporan laba rugi..." />}
      {error && <div className="text-red-600">{error}</div>}

      {data && !loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl space-y-6">
          <Section
            title="Pendapatan"
            accounts={byType('revenue')}
            totalLabel="Total Pendapatan"
            highlight="text-green-700"
          />

          <Section
            title="Beban"
            accounts={byType('expense')}
            totalLabel="Total Beban"
            highlight="text-red-700"
          />

          {/* Net income */}
          <div className={`border-t-2 border-gray-400 pt-4 flex justify-between text-base font-bold ${
            netIncome >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            <span>{netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}</span>
            <span>{formatCurrency(Math.abs(netIncome))}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
              <p className="text-xs text-green-700">Total Pendapatan</p>
              <p className="font-bold text-green-900">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-center">
              <p className="text-xs text-red-700">Total Beban</p>
              <p className="font-bold text-red-900">{formatCurrency(totalExpense)}</p>
            </div>
            <div className={`border rounded p-3 text-center ${
              netIncome >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <p className={`text-xs ${netIncome >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
              </p>
              <p className={`font-bold ${netIncome >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                {formatCurrency(Math.abs(netIncome))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
