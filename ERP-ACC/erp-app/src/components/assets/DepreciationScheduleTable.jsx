import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../../utils/currency'
import { Typography, Tag } from 'antd'

const STATUS_TAG_COLOR = {
  pending:   'default',
  posted:    'success',
  cancelled: 'error',
}

const STATUS_LABEL = {
  pending:   'Pending',
  posted:    'Posted',
  cancelled: 'Batal',
}

/**
 * DepreciationScheduleTable
 * Props:
 *   schedule — array returned by getScheduleForAsset (depreciation_schedules with joined journal)
 */
export default function DepreciationScheduleTable({ schedule = [] }) {
  const navigate = useNavigate()

  if (schedule.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
        Tidak ada jadwal penyusutan.
      </Typography.Text>
    )
  }

  function handleRowClick(row) {
    if (row.status === 'posted' && row.journal?.id) {
      navigate(`/accounting/journals/${row.journal.id}`)
    }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: '100%', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280', width: '48px' }}>#</th>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Periode</th>
            <th style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>Beban</th>
            <th style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>Akumulasi</th>
            <th style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>Nilai Buku Akhir</th>
            <th style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 500, color: '#6b7280' }}>Status</th>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Jurnal</th>
          </tr>
        </thead>
        <tbody style={{ borderCollapse: 'collapse' }}>
          {schedule.map((row) => {
            const clickable = row.status === 'posted' && row.journal?.id
            return (
              <tr
                key={row.id}
                onClick={() => handleRowClick(row)}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  cursor: clickable ? 'pointer' : 'default',
                  backgroundColor: clickable ? 'var(--hover-bg)' : 'var(--default-bg)'
                }}
                onMouseEnter={(e) => {
                  if (clickable) e.currentTarget.style.backgroundColor = '#eff6ff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <td style={{ padding: '12px 12px', color: '#6b7280' }}>{row.sequence_no}</td>
                <td style={{ padding: '12px 12px', color: '#374151', fontFamily: 'monospace' }}>{row.period}</td>
                <td style={{ padding: '12px 12px', textAlign: 'right', color: '#374151' }}>
                  {formatCurrency(row.amount)}
                </td>
                <td style={{ padding: '12px 12px', textAlign: 'right', color: '#374151' }}>
                  {formatCurrency(row.accumulated_amount)}
                </td>
                <td style={{ padding: '12px 12px', textAlign: 'right', color: '#374151' }}>
                  {formatCurrency(row.book_value_end)}
                </td>
                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                  <Tag color={STATUS_TAG_COLOR[row.status] ?? 'default'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Tag>
                </td>
                <td style={{ padding: '12px 12px' }}>
                  {row.journal ? (
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: clickable ? '#2563eb' : '#6b7280', textDecoration: clickable ? 'underline' : 'none' }}>
                      {row.journal.journal_number}
                    </span>
                  ) : (
                    <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
