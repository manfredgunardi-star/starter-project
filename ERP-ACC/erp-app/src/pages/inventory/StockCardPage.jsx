import { useState, useMemo } from 'react'
import { useStockCard } from '../../hooks/useInventory'
import { useProducts } from '../../hooks/useMasterData'
import { formatDate, formatDateInput, today } from '../../utils/date'
import { formatNumber } from '../../utils/currency'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Calendar, Download } from 'lucide-react'

export default function StockCardPage() {
  const { products = [] } = useProducts()
  const [selectedProductId, setSelectedProductId] = useState('')
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(today())

  const { movements, loading } = useStockCard(selectedProductId, startDate, endDate)

  // Compute running balance
  const movementsWithBalance = useMemo(() => {
    let runningBalance = 0
    return movements.map(m => {
      const incoming = m.type === 'in' ? m.quantity_original : 0
      const outgoing = m.type === 'out' ? m.quantity_original : 0

      runningBalance += m.type === 'in' ? m.quantity_original : -m.quantity_original

      return {
        ...m,
        incoming,
        outgoing,
        balance: runningBalance,
      }
    })
  }, [movements])

  const selectedProduct = products.find(p => p.id === selectedProductId)
  const baseUnitName = selectedProduct?.base_unit?.name || '—'

  const productOptions = products.map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku || '—'})`,
  }))

  const typeLabel = {
    in: 'Masuk',
    out: 'Keluar',
    adjustment: 'Penyesuaian',
  }

  const typeColor = {
    in: 'text-green-600',
    out: 'text-red-600',
    adjustment: 'text-blue-600',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Kartu Stok</h1>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Pilih Produk</label>
          <Select
            options={productOptions}
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
            placeholder="Pilih produk untuk melihat kartu stok..."
          />
        </div>

        {selectedProduct && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <p className="text-blue-900">
              <span className="font-medium">SKU:</span> {selectedProduct.sku || '—'} |
              <span className="font-medium ml-3">Satuan Dasar:</span> {baseUnitName}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Tanggal Mulai"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <Input
            label="Tanggal Akhir"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            setStartDate(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
            setEndDate(today())
            setSelectedProductId('')
          }}
          size="sm"
        >
          Reset Filter
        </Button>
      </div>

      {/* Stock card table */}
      {!selectedProductId ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Calendar size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Pilih produk untuk melihat kartu stok</p>
        </div>
      ) : loading ? (
        <LoadingSpinner message="Memuat kartu stok..." />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Keterangan</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Referensi</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Masuk</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Keluar</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movementsWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                      Tidak ada pergerakan stok untuk periode ini
                    </td>
                  </tr>
                ) : (
                  movementsWithBalance.map((movement, idx) => (
                    <tr
                      key={movement.id}
                      className={`border-b border-gray-200 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } hover:bg-blue-50`}
                    >
                      <td className="px-6 py-3 text-sm text-gray-700 font-mono">
                        {formatDate(movement.date)}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span className={typeColor[movement.type]}>
                          <span className="font-medium">{typeLabel[movement.type] || '—'}</span>
                        </span>
                        {movement.notes && (
                          <p className="text-xs text-gray-500 mt-0.5">{movement.notes}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {movement.reference_type && (
                          <>
                            <div className="text-xs text-gray-500">{movement.reference_type}</div>
                            <div className="font-mono text-xs">{movement.reference_id?.slice(0, 8) || '—'}</div>
                          </>
                        )}
                        {!movement.reference_type && <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-3 text-sm text-right text-green-600 font-medium">
                        {movement.incoming > 0 ? formatNumber(movement.incoming, 4) : ''}
                      </td>
                      <td className="px-6 py-3 text-sm text-right text-red-600 font-medium">
                        {movement.outgoing > 0 ? formatNumber(movement.outgoing, 4) : ''}
                      </td>
                      <td className="px-6 py-3 text-sm text-right">
                        <span className={`font-bold px-2 py-1 rounded ${
                          movement.balance > 0
                            ? 'bg-green-100 text-green-900'
                            : movement.balance < 0
                            ? 'bg-red-100 text-red-900'
                            : 'bg-gray-100 text-gray-900'
                        }`}>
                          {formatNumber(movement.balance, 4)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Footer: Summary */}
              {movementsWithBalance.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-900">
                      Saldo Akhir ({baseUnitName})
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">
                      {formatNumber(
                        movementsWithBalance.reduce((sum, m) => sum + m.incoming, 0),
                        4
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">
                      {formatNumber(
                        movementsWithBalance.reduce((sum, m) => sum + m.outgoing, 0),
                        4
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-right">
                      <span className="font-bold px-2 py-1 rounded bg-blue-100 text-blue-900">
                        {movementsWithBalance.length > 0
                          ? formatNumber(movementsWithBalance[movementsWithBalance.length - 1].balance, 4)
                          : '0'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Summary info */}
          {movementsWithBalance.length > 0 && (
            <div className="grid grid-cols-3 gap-4 bg-white border border-gray-200 rounded-lg p-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Masuk</p>
                <p className="text-lg font-bold text-green-600">
                  {formatNumber(
                    movementsWithBalance.reduce((sum, m) => sum + m.incoming, 0),
                    2
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Keluar</p>
                <p className="text-lg font-bold text-red-600">
                  {formatNumber(
                    movementsWithBalance.reduce((sum, m) => sum + m.outgoing, 0),
                    2
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo Akhir</p>
                <p className="text-lg font-bold text-blue-600">
                  {movementsWithBalance.length > 0
                    ? formatNumber(
                        movementsWithBalance[movementsWithBalance.length - 1].balance,
                        2
                      )
                    : '0'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
