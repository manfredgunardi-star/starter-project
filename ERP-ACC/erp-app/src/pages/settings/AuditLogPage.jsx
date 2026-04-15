import { useState } from 'react'
import { getAuditLogs } from '../../services/auditService'
import { formatDateTime } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import { Space, Typography, Tag, Alert, Card, Select, Table } from 'antd'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'

const { Title, Text } = Typography

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

const ACTION_TAG_COLOR = {
  create: 'success',
  update: 'warning',
  delete: 'error',
}

function today() { return new Date().toISOString().slice(0, 10) }
function sevenDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
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
        style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <td style={{ padding: '8px 16px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
          {formatDateTime(log.created_at)}
        </td>
        <td style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', color: '#374151' }}>
          {log.table_name}
        </td>
        <td style={{ padding: '8px 16px' }}>
          <Tag color={ACTION_TAG_COLOR[log.action] || 'default'} style={{ fontSize: 11 }}>
            {log.action}
          </Tag>
        </td>
        <td style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', color: '#6b7280' }}>
          {log.record_id?.slice(0, 8)}…
        </td>
        <td style={{ padding: '8px 16px', fontSize: 12, color: '#4b5563' }}>
          {log.user?.email || '—'}
        </td>
        <td style={{ padding: '8px 16px', fontSize: 12, color: '#9ca3af' }}>
          {log.action === 'update' && diffKeys.length > 0
            ? `${diffKeys.length} field berubah`
            : log.action === 'create' ? 'Baru' : log.action === 'delete' ? 'Dihapus' : '—'}
        </td>
      </tr>

      {open && (
        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
          <td colSpan={6} style={{ padding: '12px 24px' }}>
            {log.action === 'update' && diffKeys.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text strong style={{ fontSize: 12 }}>Perubahan field:</Text>
                <table style={{ fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr style={{ color: '#6b7280' }}>
                      <th style={{ textAlign: 'left', paddingRight: 16, paddingBottom: 4, fontWeight: 500 }}>Field</th>
                      <th style={{ textAlign: 'left', paddingRight: 16, paddingBottom: 4, fontWeight: 500 }}>Lama</th>
                      <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 500 }}>Baru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffKeys.map(k => (
                      <tr key={k} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ paddingRight: 16, paddingTop: 4, fontFamily: 'monospace', color: '#374151' }}>{k}</td>
                        <td style={{ paddingRight: 16, paddingTop: 4, color: '#dc2626', textDecoration: 'line-through' }}>
                          {JSON.stringify(log.old_data[k])}
                        </td>
                        <td style={{ paddingTop: 4, color: '#16a34a' }}>
                          {JSON.stringify(log.new_data[k])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Space>
            ) : (
              <pre style={{ fontSize: 12, color: '#374151', overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
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
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Title level={2} style={{ margin: 0 }}>Audit Log</Title>

      <Space wrap align="end" size={12}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Tabel</div>
          <Select
            value={tableName}
            onChange={val => setTableName(val)}
            style={{ width: 180 }}
            options={TABLE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
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
      </Space>

      {error && <Alert type="error" message={error} showIcon />}

      {logs && !loading && (
        <Card bodyStyle={{ padding: 0 }}>
          <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 500, color: '#374151' }}>
            {logs.length} entri ditemukan
            {logs.length === 200 && (
              <Text type="warning" style={{ marginLeft: 8, fontSize: 12 }}>
                (dibatasi 200 — perkecil rentang tanggal untuk hasil lebih spesifik)
              </Text>
            )}
          </div>
          {logs.length === 0 ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 16px' }}>
              Tidak ada aktivitas dalam periode ini.
            </Text>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <tr>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Waktu</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Tabel</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Aksi</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Record ID</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>User</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#4b5563' }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </Space>
  )
}
