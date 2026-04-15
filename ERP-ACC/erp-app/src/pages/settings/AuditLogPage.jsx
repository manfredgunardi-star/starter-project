import { useState } from 'react'
import { getAuditLogs } from '../../services/auditService'
import { formatDateTime } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'

const TABLE_OPTIONS = [
  { value: '', label: 'Semua Tabel' },
  { value: 'sales_orders', label: 'Sales Orders' },
  { value: 'goods_deliveries', label: 'Goods Deliveries' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'purchase_orders', label: 'Purchase Orders' },
  { value: 'goods_receipts', label: 'Goods Receipts' },
  { value: 'journals', label: 'Journals' },
]

const ACTION_BADGE = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-yellow-100 text-yellow-700',
  delete: 'bg-red-100 text-red-700',
}

function today() { return new Date().toISOString().slice(0, 10) }
function sevenDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function JsonDiff({ oldData, newData, action }) {
  const [open, setOpen] = useState(false)

  if (action === 'create') {
    return (
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Lihat data
      </button>
    )
  }

  return (
    <button
      onClick={() => setOpen(o => !o)}
      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {action === 'update' ? 'Lihat perubahan' : 'Lihat data lama'}
      {open && (
        <span className="ml-2 text-gray-500">(klik lagi untuk tutup)</span>
      )}
    </button>
  )

  // intentionally unreachable — JSX below renders when open
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false)

  const diffKeys = log.action === 'update' && log.old_data && log.new_data
    ? Object.keys(log.new_data).filter(k => {
        return JSON.stringify(log.old_data[k]) !== JSON.stringify(log.new_data[k])
      })
    : []

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
          {formatDateTime(log.created_at)}
        </td>
        <td className="px-4 py-2 text-xs font-mono text-gray-700">
          {log.table_name}
        </td>
        <td className="px-4 py-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_BADGE[log.action] || 'bg-gray-100 text-gray-700'}`}>
            {log.action}
          </span>
        </td>
        <td className="px-4 py-2 text-xs font-mono text-gray-500">
          {log.record_id?.slice(0, 8)}…
        </td>
        <td className="px-4 py-2 text-xs text-gray-600">
          {log.user?.email || '—'}
        </td>
        <td className="px-4 py-2 text-xs text-gray-400">
          {log.action === 'update' && diffKeys.length > 0
            ? `${diffKeys.length} field berubah`
            : log.action === 'create' ? 'Baru' : log.action === 'delete' ? 'Dihapus' : '—'}
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={6} className="px-6 py-3">
            {log.action === 'update' && diffKeys.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-600 mb-2">Perubahan field:</p>
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left pr-4 py-1 font-medium">Field</th>
                      <th className="text-left pr-4 py-1 font-medium">Lama</th>
                      <th className="text-left py-1 font-medium">Baru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffKeys.map(k => (
                      <tr key={k} className="border-t border-gray-200">
                        <td className="pr-4 py-1 font-mono text-gray-700">{k}</td>
                        <td className="pr-4 py-1 text-red-600 line-through">
                          {JSON.stringify(log.old_data[k])}
                        </td>
                        <td className="py-1 text-green-700">
                          {JSON.stringify(log.new_data[k])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.action === 'delete' ? log.old_data : log.new_data, null, 2)}
              </pre>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function AuditLogPage() {
  const [tableName, setTableName] = useState('')
  const [startDate, setStartDate] = useState(sevenDaysAgo())
  const [endDate, setEndDate] = useState(today())
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getAuditLogs({ tableName: tableName || undefined, startDate, endDate })
      setLogs(result || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tabel</label>
          <select
            value={tableName}
            onChange={e => setTableName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {TABLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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

      {loading && <LoadingSpinner message="Memuat audit log..." />}
      {error && <div className="text-red-600 text-sm">{error}</div>}

      {logs && !loading && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-200">
            {logs.length} entri ditemukan
            {logs.length === 200 && (
              <span className="ml-2 text-xs text-orange-600">(dibatasi 200 — perkecil rentang tanggal untuk hasil lebih spesifik)</span>
            )}
          </div>
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Tidak ada aktivitas dalam periode ini.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Waktu</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Tabel</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Aksi</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Record ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">User</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
