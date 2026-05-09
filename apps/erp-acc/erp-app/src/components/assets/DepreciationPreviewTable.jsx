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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: '100%', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Kode Aset</th>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Nama Aset</th>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Kategori</th>
            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280' }}>Periode</th>
            <th style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 500, color: '#6b7280' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody style={{ borderCollapse: 'collapse' }}>
          {preview.map((group, gi) => (
            group.rows.map((row, ri) => (
              <tr key={`${gi}-${ri}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {ri === 0 && (
                  <>
                    <td style={{ padding: '12px 12px', fontFamily: 'monospace', color: '#374151' }} rowSpan={group.rows.length}>
                      {group.asset.code}
                    </td>
                    <td style={{ padding: '12px 12px', color: '#111827', fontWeight: 500 }} rowSpan={group.rows.length}>
                      {group.asset.name}
                    </td>
                    <td style={{ padding: '12px 12px', color: '#6b7280', fontSize: '0.75rem' }} rowSpan={group.rows.length}>
                      {group.asset.category?.name}
                    </td>
                  </>
                )}
                <td style={{ padding: '12px 12px', fontFamily: 'monospace', color: '#374151' }}>{row.period}</td>
                <td style={{ padding: '12px 12px', textAlign: 'right', color: '#374151' }}>{formatCurrency(row.amount)}</td>
              </tr>
            ))
          ))}

          {/* Subtotals per asset */}
          {preview.map((group, gi) => (
            <tr key={`sub-${gi}`} style={{ backgroundColor: '#eff6ff' }}>
              <td style={{ padding: '12px 12px', color: '#1e40af', fontSize: '0.75rem' }} colSpan={3}>
                Subtotal — {group.asset.code}
              </td>
              <td style={{ padding: '12px 12px', fontSize: '0.75rem', color: '#2563eb' }}>{group.rows.length} periode</td>
              <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                {formatCurrency(group.total)}
              </td>
            </tr>
          ))}

          {/* Grand total */}
          <tr style={{ backgroundColor: '#f3f4f6', borderTop: '2px solid #d1d5db' }}>
            <td style={{ padding: '12px 12px', fontWeight: 700, color: '#111827' }} colSpan={4}>
              Grand Total ({preview.length} aset)
            </td>
            <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>
              {formatCurrency(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
