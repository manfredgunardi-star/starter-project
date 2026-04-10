import { useState, useMemo } from 'react'
import { useStock } from '../../hooks/useInventory'
import { formatCurrency, formatNumber } from '../../utils/currency'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Search, RefreshCw } from 'lucide-react'

const LOW_STOCK_THRESHOLD = 10

export default function StockPage() {
  const { stock, loading, error, refetch } = useStock()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return stock
    return stock.filter(s => {
      const name = s.product?.name?.toLowerCase() || ''
      const sku = s.product?.sku?.toLowerCase() || ''
      return name.includes(q) || sku.includes(q)
    })
  }, [stock, search])

  const totalValue = useMemo(
    () => filtered.reduce((sum, s) => sum + s.quantity_on_hand * s.avg_cost, 0),
    [filtered]
  )

  if (loading) return <LoadingSpinner message="Memuat data stok..." />

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Stok</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Stok On Hand</h1>
        <button
          onClick={refetch}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari produk atau SKU..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Stock table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Produk</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">SKU</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Satuan</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Stok</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Harga Rata-rata</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Nilai Stok</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                  {search ? 'Produk tidak ditemukan' : 'Belum ada data stok'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isLow = item.quantity_on_hand < LOW_STOCK_THRESHOLD && item.quantity_on_hand > 0
                const isZero = item.quantity_on_hand <= 0
                const nilai = item.quantity_on_hand * item.avg_cost

                return (
                  <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {item.product?.name || '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 font-mono">
                      {item.product?.sku || '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {item.product?.base_unit?.name || '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-right">
                      <span className={
                        isZero ? 'text-red-600 font-semibold' :
                        isLow ? 'text-orange-600 font-semibold' :
                        'text-gray-900'
                      }>
                        {formatNumber(item.quantity_on_hand, 2)}
                        {isZero && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            Habis
                          </span>
                        )}
                        {isLow && !isZero && (
                          <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                            Menipis
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-700">
                      {formatCurrency(item.avg_cost)}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-900 font-medium">
                      {formatCurrency(nilai)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Footer: total */}
          {filtered.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">
                  Total Nilai Stok
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">
                  {formatCurrency(totalValue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Produk</p>
          <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-700">Stok Menipis</p>
          <p className="text-2xl font-bold text-orange-700">
            {filtered.filter(s => s.quantity_on_hand > 0 && s.quantity_on_hand < LOW_STOCK_THRESHOLD).length}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Stok Habis</p>
          <p className="text-2xl font-bold text-red-700">
            {filtered.filter(s => s.quantity_on_hand <= 0).length}
          </p>
        </div>
      </div>
    </div>
  )
}
