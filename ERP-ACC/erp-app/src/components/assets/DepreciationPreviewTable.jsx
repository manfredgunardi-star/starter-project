import { formatCurrency } from '../../utils/currency'
import { Typography } from 'antd'

/**
 * DepreciationPreviewTable
 * Props:
 *   preview — array returned by previewPeriod():
 *             [ { asset: { code, name, category }, rows: [{ period, amount }], total } ]
 */
export default function DepreciationPreviewTable({ preview = [] }) {
  if (preview.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '16px 0' }}>
        Tidak ada data penyusutan untuk periode ini.
      </Typography.Text>
    )
  }

  const grandTotal = preview.reduce((sum, g) => sum + g.total, 0)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 text-left font-medium text-gray-500">Kode Aset</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Nama Aset</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Kategori</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Periode</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">Jumlah</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {preview.map((group, gi) => (
            group.rows.map((row, ri) => (
              <tr key={`${gi}-${ri}`} className="hover:bg-gray-50">
                {ri === 0 && (
                  <>
                    <td className="px-3 py-2 font-mono text-gray-700" rowSpan={group.rows.length}>
                      {group.asset.code}
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-medium" rowSpan={group.rows.length}>
                      {group.asset.name}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs" rowSpan={group.rows.length}>
                      {group.asset.category?.name}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 font-mono text-gray-700">{row.period}</td>
                <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(row.amount)}</td>
              </tr>
            ))
          ))}

          {/* Subtotals per asset */}
          {preview.map((group, gi) => (
            <tr key={`sub-${gi}`} className="bg-blue-50">
              <td className="px-3 py-2 text-blue-700 text-xs" colSpan={3}>
                Subtotal — {group.asset.code}
              </td>
              <td className="px-3 py-2 text-xs text-blue-600">{group.rows.length} periode</td>
              <td className="px-3 py-2 text-right font-semibold text-blue-700">
                {formatCurrency(group.total)}
              </td>
            </tr>
          ))}

          {/* Grand total */}
          <tr className="bg-gray-100 border-t-2 border-gray-300">
            <td className="px-3 py-2 font-bold text-gray-900" colSpan={4}>
              Grand Total ({preview.length} aset)
            </td>
            <td className="px-3 py-2 text-right font-bold text-gray-900">
              {formatCurrency(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
