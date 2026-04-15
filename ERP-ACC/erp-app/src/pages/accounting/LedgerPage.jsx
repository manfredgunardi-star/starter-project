import { useState, useEffect } from 'react'
import { useCOA } from '../../hooks/useMasterData'
import { getLedger } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function LedgerPage() {
  const { coa } = useCOA()
  const [coaId, setCoaId] = useState('')
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  const selectedCoa = coa.find(c => c.id === coaId)

  const handleSearch = async () => {
    if (!coaId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getLedger(coaId, startDate, endDate)
      setEntries(data || [])
      setSearched(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalDebit = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0)
  const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Buku Besar (Ledger)</h1>

      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Akun (COA)</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={coaId}
              onChange={e => setCoaId(e.target.value)}
            >
              <option value="">Pilih akun...</option>
              {coa.map(c => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <DateInput
            label="Dari"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <DateInput
            label="Hingga"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
          <Button variant="primary" onClick={handleSearch} loading={loading}>
            <Search size={16} /> Tampilkan
          </Button>
        </div>
      </div>

      {loading && <LoadingSpinner message="Memuat buku besar..." />}
      {error && <div className="text-red-600">{error}</div>}

      {searched && !loading && (
        <>
          {selectedCoa && (
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{selectedCoa.code} — {selectedCoa.name}</span>
              {' '}| Normal Balance: <span className="capitalize">{selectedCoa.normal_balance}</span>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Keterangan</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Debit</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Kredit</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      Tidak ada transaksi pada periode ini
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, idx) => (
                    <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{formatDate(entry.journal_date)}</td>
                      <td className="px-4 py-2 text-sm font-mono text-blue-600">{entry.journal_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.description}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : ''}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : ''}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-medium ${
                        entry.running_balance >= 0 ? 'text-gray-900' : 'text-red-600'
                      }`}>
                        {formatCurrency(Math.abs(entry.running_balance))}
                        {entry.running_balance < 0 ? ' (K)' : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-right">Total</td>
                    <td className="px-4 py-2 text-sm font-bold text-right">{formatCurrency(totalDebit)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right">{formatCurrency(totalCredit)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right">
                      {formatCurrency(Math.abs(entries[entries.length - 1]?.running_balance || 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
