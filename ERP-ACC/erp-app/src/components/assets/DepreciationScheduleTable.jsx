import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../../utils/currency'

const STATUS_BADGE = {
  pending:   'bg-gray-100 text-gray-600',
  posted:    'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
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
      <p className="text-sm text-gray-400 py-4 text-center">
        Tidak ada jadwal penyusutan.
      </p>
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
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
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
