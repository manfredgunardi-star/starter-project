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
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 text-left font-medium text-gray-500 w-12">#</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Periode</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">Beban</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">Akumulasi</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">Nilai Buku Akhir</th>
            <th className="px-3 py-2 text-center font-medium text-gray-500">Status</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Jurnal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {schedule.map((row) => {
            const clickable = row.status === 'posted' && row.journal?.id
            return (
              <tr
                key={row.id}
                onClick={() => handleRowClick(row)}
                className={
                  clickable
                    ? 'hover:bg-blue-50 cursor-pointer transition-colors'
                    : 'hover:bg-gray-50'
                }
              >
                <td className="px-3 py-2 text-gray-500">{row.sequence_no}</td>
                <td className="px-3 py-2 text-gray-700 font-mono">{row.period}</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatCurrency(row.accumulated_amount)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatCurrency(row.book_value_end)}
                </td>
                <td className="px-3 py-2 text-center">
                  <Tag color={STATUS_TAG_COLOR[row.status] ?? 'default'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Tag>
                </td>
                <td className="px-3 py-2">
                  {row.journal ? (
                    <span className={`text-xs font-mono ${clickable ? 'text-blue-600 underline' : 'text-gray-500'}`}>
                      {row.journal.journal_number}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
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
