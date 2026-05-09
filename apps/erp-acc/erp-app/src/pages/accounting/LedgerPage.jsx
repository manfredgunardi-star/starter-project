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
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Akun (COA)</label>
            <select
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 14 }}
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

          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tanggal</th>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>No. Jurnal</th>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Keterangan</th>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Debit</th>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Kredit</th>
                  <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 32, paddingBottom: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                      Tidak ada transaksi pada periode ini
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, color: '#374151' }}>{formatDate(entry.journal_date)}</td>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontFamily: 'monospace', color: '#2563eb' }}>{entry.journal_number}</td>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, color: '#111827' }}>{entry.description}</td>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right', color: '#111827' }}>
                        {entry.debit > 0 ? formatCurrency(entry.debit) : ''}
                      </td>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right', color: '#111827' }}>
                        {entry.credit > 0 ? formatCurrency(entry.credit) : ''}
                      </td>
                      <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right', fontWeight: 500 }}>
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
                <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
                  <tr>
                    <td colSpan={3} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontWeight: 600, textAlign: 'right' }}>Total</td>
                    <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
                      <Typography.Text strong>{formatCurrency(totalDebit)}</Typography.Text>
                    </td>
                    <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
                      <Typography.Text strong>{formatCurrency(totalCredit)}</Typography.Text>
                    </td>
                    <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
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
