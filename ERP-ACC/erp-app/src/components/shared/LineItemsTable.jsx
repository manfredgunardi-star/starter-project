import { useCallback } from 'react'
import { formatCurrency } from '../../utils/currency'
import { Plus, Trash2 } from 'lucide-react'

function emptyRow() {
  return {
    _key: Math.random().toString(36).slice(2),
    product_id: '',
    unit_id: '',
    quantity: '',
    quantity_base: 0,
    unit_price: '',
    tax_amount: 0,
    total: 0,
  }
}

// Build unit options for a product: base unit + conversions
function getUnitOptions(product) {
  if (!product) return []
  const opts = [{ id: product.base_unit_id, name: product.base_unit?.name || '—', factor: 1 }]
  for (const c of product.conversions || []) {
    opts.push({ id: c.from_unit_id, name: c.from_unit?.name || '—', factor: c.conversion_factor })
  }
  return opts
}

function recalcRow(row, product, unitFactor) {
  const qty = Number(row.quantity) || 0
  const qtyBase = qty * (unitFactor ?? 1)
  const price = Number(row.unit_price) || 0
  const subtotal = qty * price
  const taxAmt = product?.is_taxable ? subtotal * ((product.tax_rate || 11) / 100) : 0
  return {
    ...row,
    quantity_base: qtyBase,
    tax_amount: taxAmt,
    total: subtotal + taxAmt,
  }
}

export default function LineItemsTable({
  items,
  onItemsChange,
  products = [],
  priceField = 'sell_price', // 'sell_price' for sales, 'buy_price' for purchase
  readOnly = false,
  showTax = true,
}) {
  const getProduct = useCallback(
    (id) => products.find(p => p.id === id),
    [products]
  )

  const updateRow = (idx, changes) => {
    const updated = items.map((row, i) => {
      if (i !== idx) return row
      const merged = { ...row, ...changes }

      // On product change
      if (changes.product_id !== undefined && changes.product_id !== row.product_id) {
        const prod = getProduct(changes.product_id)
        merged.unit_id = prod?.base_unit_id || ''
        merged.unit_price = prod ? (prod[priceField] ?? 0) : ''
        const factor = 1
        return recalcRow({ ...merged, quantity_base: Number(merged.quantity) * factor }, prod, factor)
      }

      // On unit change
      if (changes.unit_id !== undefined && changes.unit_id !== row.unit_id) {
        const prod = getProduct(merged.product_id)
        const unitOpts = getUnitOptions(prod)
        const unitOpt = unitOpts.find(u => u.id === changes.unit_id)
        return recalcRow(merged, prod, unitOpt?.factor ?? 1)
      }

      // On quantity / price change
      if (changes.quantity !== undefined || changes.unit_price !== undefined) {
        const prod = getProduct(merged.product_id)
        const unitOpts = getUnitOptions(prod)
        const unitOpt = unitOpts.find(u => u.id === merged.unit_id)
        return recalcRow(merged, prod, unitOpt?.factor ?? 1)
      }

      return merged
    })
    onItemsChange(updated)
  }

  const addRow = () => onItemsChange([...items, emptyRow()])
  const removeRow = (idx) => onItemsChange(items.filter((_, i) => i !== idx))

  const subtotal = items.reduce((s, r) => s + (Number(r.unit_price) || 0) * (Number(r.quantity) || 0), 0)
  const totalTax = items.reduce((s, r) => s + (r.tax_amount || 0), 0)
  const grandTotal = subtotal + totalTax

  const productOptions = products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse min-w-[700px]">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-40">Produk</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-28">Satuan</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 w-24">Qty</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 w-32">Harga</th>
              {showTax && <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 w-28">Pajak</th>}
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 w-32">Total</th>
              {!readOnly && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={showTax ? (readOnly ? 6 : 7) : (readOnly ? 5 : 6)} className="px-4 py-6 text-center text-sm text-gray-500">
                  {readOnly ? 'Tidak ada item' : 'Klik "+ Tambah Baris" untuk menambahkan produk'}
                </td>
              </tr>
            )}
            {items.map((row, idx) => {
              const prod = getProduct(row.product_id)
              const unitOpts = getUnitOptions(prod)

              return (
                <tr key={row._key || idx} className="border-b border-gray-200">
                  {/* Product */}
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-sm">{prod?.name || row.product_id}</span>
                    ) : (
                      <select
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        value={row.product_id}
                        onChange={e => updateRow(idx, { product_id: e.target.value })}
                      >
                        <option value="">Pilih...</option>
                        {productOptions.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-sm">{unitOpts.find(u => u.id === row.unit_id)?.name || '—'}</span>
                    ) : (
                      <select
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        value={row.unit_id}
                        onChange={e => updateRow(idx, { unit_id: e.target.value })}
                        disabled={!row.product_id}
                      >
                        <option value="">—</option>
                        {unitOpts.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-sm text-right block">{row.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                        value={row.quantity}
                        onChange={e => updateRow(idx, { quantity: e.target.value })}
                      />
                    )}
                  </td>

                  {/* Unit Price */}
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-sm text-right block">{formatCurrency(row.unit_price)}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                        value={row.unit_price}
                        onChange={e => updateRow(idx, { unit_price: e.target.value })}
                      />
                    )}
                  </td>

                  {/* Tax */}
                  {showTax && (
                    <td className="px-4 py-2 text-right text-sm text-gray-600">
                      {prod?.is_taxable ? (
                        <span>{prod.tax_rate}% = {formatCurrency(row.tax_amount)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}

                  {/* Total */}
                  <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(row.total)}
                  </td>

                  {/* Delete button */}
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      {!readOnly && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
        >
          <Plus size={18} />
          Tambah Baris
        </button>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <div className="flex justify-end">
          <div className="text-sm space-y-1 min-w-[240px]">
            <div className="flex justify-between text-gray-700">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {showTax && totalTax > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Pajak</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-300 pt-1">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

LineItemsTable.emptyRow = emptyRow
