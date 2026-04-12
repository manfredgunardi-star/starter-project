import { formatCurrency } from '../../utils/currency'

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
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">Preview Disposal</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Catch-up penyusutan */}
        <div className="flex justify-between items-start py-2 border-b border-gray-100">
          <div>
            <div className="text-sm font-medium text-gray-700">Catch-up Penyusutan</div>
            {catchUpPeriods.length > 0 ? (
              <div className="text-xs text-gray-500 mt-1">
                {catchUpPeriods.length} bulan akan diposting sebelum disposal
                <span className="ml-1 text-gray-400">
                  ({catchUpPeriods.map(p => p.period).join(', ')})
                </span>
              </div>
            ) : (
              <div className="text-xs text-gray-400 mt-1">Tidak ada catch-up diperlukan</div>
            )}
          </div>
          <div className="text-right">
            <div className="font-medium text-gray-900">{formatCurrency(catchUpTotal)}</div>
          </div>
        </div>

        {/* Akumulasi penyusutan */}
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <div className="text-sm font-medium text-gray-700">Total Akumulasi Penyusutan</div>
          <div className="font-medium text-gray-900">{formatCurrency(accumulated)}</div>
        </div>

        {/* Nilai buku saat disposal */}
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <div className="text-sm font-medium text-gray-700">Nilai Buku saat Disposal</div>
          <div className="font-bold text-gray-900 text-lg">{formatCurrency(bookValue)}</div>
        </div>

        {/* Harga jual (only for sale) */}
        {disposalType === 'sale' && (
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div className="text-sm font-medium text-gray-700">Harga Jual</div>
            <div className="font-medium text-gray-900">{formatCurrency(salePrice)}</div>
          </div>
        )}

        {/* Gain / Loss */}
        <div className="flex justify-between items-center py-2">
          <div className="text-sm font-medium text-gray-700">
            {isGain ? 'Keuntungan Pelepasan Aset' : 'Kerugian Pelepasan Aset'}
          </div>
          <div>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
              isGain ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {isGain ? '+' : ''}{formatCurrency(gainLoss)}
            </span>
          </div>
        </div>

        {/* Journal entries summary */}
        <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 space-y-1">
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
      </div>
    </div>
  )
}
