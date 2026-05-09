import { useCallback } from 'react'
import { formatCurrency } from '../../utils/currency'
import { Plus, Trash2 } from 'lucide-react'
import { Card, Space, Typography, Flex, Divider } from 'antd'

const { Text } = Typography

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

  const cellStyle = { padding: '8px 16px', fontSize: 13 }
  const inputStyle = { width: '100%', fontSize: 13, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ ...cellStyle, textAlign: 'left', width: 160, fontWeight: 500, color: '#374151' }}>Produk</th>
              <th style={{ ...cellStyle, textAlign: 'left', width: 112, fontWeight: 500, color: '#374151' }}>Satuan</th>
              <th style={{ ...cellStyle, textAlign: 'right', width: 96, fontWeight: 500, color: '#374151' }}>Qty</th>
              <th style={{ ...cellStyle, textAlign: 'right', width: 128, fontWeight: 500, color: '#374151' }}>Harga</th>
              {showTax && <th style={{ ...cellStyle, textAlign: 'right', width: 112, fontWeight: 500, color: '#374151' }}>Pajak</th>}
              <th style={{ ...cellStyle, textAlign: 'right', width: 128, fontWeight: 500, color: '#374151' }}>Total</th>
              {!readOnly && <th style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={showTax ? (readOnly ? 6 : 7) : (readOnly ? 5 : 6)}
                  style={{ ...cellStyle, textAlign: 'center', color: '#9ca3af', padding: '24px 16px' }}
                >
                  {readOnly ? 'Tidak ada item' : 'Klik "+ Tambah Baris" untuk menambahkan produk'}
                </td>
              </tr>
            )}
            {items.map((row, idx) => {
              const prod = getProduct(row.product_id)
              const unitOpts = getUnitOptions(prod)

              return (
                <tr key={row._key || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {/* Product */}
                  <td style={cellStyle}>
                    {readOnly ? (
                      <span style={{ fontSize: 13 }}>{prod?.name || row.product_id}</span>
                    ) : (
                      <select
                        style={inputStyle}
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
                  <td style={cellStyle}>
                    {readOnly ? (
                      <span style={{ fontSize: 13 }}>{unitOpts.find(u => u.id === row.unit_id)?.name || '—'}</span>
                    ) : (
                      <select
                        style={inputStyle}
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
                  <td style={cellStyle}>
                    {readOnly ? (
                      <span style={{ fontSize: 13, display: 'block', textAlign: 'right' }}>{row.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ ...inputStyle, textAlign: 'right' }}
                        value={row.quantity}
                        onChange={e => updateRow(idx, { quantity: e.target.value })}
                      />
                    )}
                  </td>

                  {/* Unit Price */}
                  <td style={cellStyle}>
                    {readOnly ? (
                      <span style={{ fontSize: 13, display: 'block', textAlign: 'right' }}>{formatCurrency(row.unit_price)}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ ...inputStyle, textAlign: 'right' }}
                        value={row.unit_price}
                        onChange={e => updateRow(idx, { unit_price: e.target.value })}
                      />
                    )}
                  </td>

                  {/* Tax */}
                  {showTax && (
                    <td style={{ ...cellStyle, textAlign: 'right', color: '#4b5563' }}>
                      {prod?.is_taxable ? (
                        <span>{prod.tax_rate}% = {formatCurrency(row.tax_amount)}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Total */}
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                    {formatCurrency(row.total)}
                  </td>

                  {/* Delete button */}
                  {!readOnly && (
                    <td style={{ padding: '8px' }}>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Plus size={18} />
          Tambah Baris
        </button>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <Flex justify="flex-end">
          <div style={{ fontSize: 13, minWidth: 240 }}>
            <Flex justify="space-between" style={{ color: '#374151', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </Flex>
            {showTax && totalTax > 0 && (
              <Flex justify="space-between" style={{ color: '#374151', marginBottom: 4 }}>
                <span>Pajak</span>
                <span>{formatCurrency(totalTax)}</span>
              </Flex>
            )}
            <Divider style={{ margin: '6px 0' }} />
            <Flex justify="space-between" style={{ fontWeight: 700, color: '#111827' }}>
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </Flex>
          </div>
        </Flex>
      )}
    </Space>
  )
}

LineItemsTable.emptyRow = emptyRow
