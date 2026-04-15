import { useState, useEffect } from 'react'
import { useCOA } from '../../hooks/useMasterData'
import { getLedger } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import { Space, Card, Alert, Typography } from 'antd'

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
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Typography.Title level={2} style={{ margin: 0 }}>Buku Besar (Ledger)</Typography.Title>

      {/* Filter */}
      <Card>
        <Space wrap align="end">
          <div style={{ minWidth: 200, flex: 1 }}>
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
        </Space>
      </Card>

      {loading && <LoadingSpinner message="Memuat buku besar..." />}
      {error && <Alert type="error" message={error} showIcon />}

      {searched && !loading && (
        <>
          {selectedCoa && (
            <Typography.Text>
              <Typography.Text strong>{selectedCoa.code} — {selectedCoa.name}</Typography.Text>
              {' '}| Normal Balance: <span style={{ textTransform: 'capitalize' }}>{selectedCoa.normal_balance}</span>
            </Typography.Text>
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
                      <td className="px-4 py-2 text-sm text-right font-medium">
                        <Typography.Text type={entry.running_balance < 0 ? 'danger' : undefined}>
                          {formatCurrency(Math.abs(entry.running_balance))}
                          {entry.running_balance < 0 ? ' (K)' : ''}
                        </Typography.Text>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-right">Total</td>
                    <td className="px-4 py-2 text-sm text-right">
                      <Typography.Text strong>{formatCurrency(totalDebit)}</Typography.Text>
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      <Typography.Text strong>{formatCurrency(totalCredit)}</Typography.Text>
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      <Typography.Text strong>
                        {formatCurrency(Math.abs(entries[entries.length - 1]?.running_balance || 0))}
                      </Typography.Text>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </Space>
  )
}
