import { formatCurrency } from '../../utils/currency'
import { Card, Descriptions, Tag, Typography } from 'antd'

/**
 * DisposalPreviewCard
 * Props:
 *   preview — output dari previewDisposal():
 *             { asset, catchUpPeriods, catchUpTotal, accumulated, bookValue, gainLoss }
 *   disposalType — 'sale' | 'writeoff'
 *   salePrice — number (only relevant for sale)
 */
export default function DisposalPreviewCard({ preview, disposalType, salePrice = 0 }) {
  if (!preview) return null

  const { catchUpPeriods, catchUpTotal, accumulated, bookValue, gainLoss } = preview
  const isGain = gainLoss >= 0

  return (
    <Card title={<Typography.Text strong>Preview Disposal</Typography.Text>}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item
          label="Catch-up Penyusutan"
        >
          <div>
            <div>{formatCurrency(catchUpTotal)}</div>
            {catchUpPeriods.length > 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {catchUpPeriods.length} bulan akan diposting sebelum disposal
                ({catchUpPeriods.map(p => p.period).join(', ')})
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Tidak ada catch-up diperlukan</Typography.Text>
            )}
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="Total Akumulasi Penyusutan">
          {formatCurrency(accumulated)}
        </Descriptions.Item>
        <Descriptions.Item label="Nilai Buku saat Disposal">
          <Typography.Text strong style={{ fontSize: 16 }}>{formatCurrency(bookValue)}</Typography.Text>
        </Descriptions.Item>
        {disposalType === 'sale' && (
          <Descriptions.Item label="Harga Jual">
            {formatCurrency(salePrice)}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={isGain ? 'Keuntungan Pelepasan Aset' : 'Kerugian Pelepasan Aset'}>
          <Tag color={isGain ? 'success' : 'error'} style={{ fontWeight: 'bold', fontSize: 13 }}>
            {isGain ? '+' : ''}{formatCurrency(gainLoss)}
          </Tag>
        </Descriptions.Item>
      </Descriptions>

      {/* Journal entries summary */}
      <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 space-y-1 mt-3">
        <div className="font-medium text-gray-600 mb-2">Jurnal yang akan dibuat:</div>
        <div>Dr. Akumulasi Penyusutan ... {formatCurrency(accumulated)}</div>
        {disposalType === 'sale' && (
          <div>Dr. Kas/Bank ... {formatCurrency(salePrice)}</div>
        )}
        <div>Cr. Aset Tetap ... {formatCurrency(preview.asset?.acquisition_cost || 0)}</div>
        {isGain
          ? <div>Cr. Keuntungan Penjualan Aset ... {formatCurrency(Math.abs(gainLoss))}</div>
          : <div>Dr. Kerugian Pelepasan Aset ... {formatCurrency(Math.abs(gainLoss))}</div>
        }
      </div>
    </Card>
  )
}
