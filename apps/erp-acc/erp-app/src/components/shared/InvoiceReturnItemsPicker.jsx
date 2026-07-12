import { formatCurrency } from '../../utils/currency'

// Renders one row per returnable invoice line. `returnableItems` comes from
// getReturnableSalesInvoiceItems/getReturnablePurchaseInvoiceItems (each row
// has invoice_item_id, product_name, unit_name, unit_price, returnable).
// `items` is the current return's line array (same shape saveSalesReturn expects).
export default function InvoiceReturnItemsPicker({
  returnableItems = [],
  items,
  onItemsChange,
  showTax = true,
  isTaxable = () => false,
  taxRate = () => 11,
  readOnly = false,
}) {
  const rowFor = (invoiceItemId) => items.find(i => i.invoice_item_id === invoiceItemId)

  function setQty(row, qty) {
    const capped = Math.min(Math.max(Number(qty) || 0, 0), Number(row.returnable))
    const existing = rowFor(row.invoice_item_id)

    if (capped <= 0) {
      onItemsChange(items.filter(i => i.invoice_item_id !== row.invoice_item_id))
      return
    }

    const subtotal = capped * Number(row.unit_price)
    const taxable = isTaxable(row.product_id)
    const tax_amount = taxable ? subtotal * (taxRate(row.product_id) / 100) : 0
    const nextRow = {
      invoice_item_id: row.invoice_item_id,
      product_id: row.product_id,
      unit_id: row.unit_id,
      quantity: capped,
      quantity_base: capped,
      unit_price: Number(row.unit_price),
      tax_amount,
      total: subtotal + tax_amount,
    }

    if (existing) {
      onItemsChange(items.map(i => i.invoice_item_id === row.invoice_item_id ? nextRow : i))
    } else {
      onItemsChange([...items, nextRow])
    }
  }

  const cellStyle = { padding: '8px 16px', fontSize: 13 }
  const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0)
  const totalTax = items.reduce((s, i) => s + Number(i.tax_amount), 0)

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
          <tr>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Produk</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Satuan</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Sisa Bisa Diretur</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Qty Retur</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Harga</th>
            {showTax && <th style={{ ...cellStyle, textAlign: 'right' }}>Pajak</th>}
            <th style={{ ...cellStyle, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {returnableItems.length === 0 && (
            <tr>
              <td colSpan={showTax ? 7 : 6} style={{ ...cellStyle, textAlign: 'center', color: '#9ca3af', padding: '24px 16px' }}>
                Tidak ada baris yang bisa diretur dari invoice ini.
              </td>
            </tr>
          )}
          {returnableItems.map(row => {
            const current = rowFor(row.invoice_item_id)
            return (
              <tr key={row.invoice_item_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={cellStyle}>{row.product_name}</td>
                <td style={cellStyle}>{row.unit_name}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{row.returnable}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  {readOnly ? (
                    <span>{current?.quantity || 0}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max={row.returnable}
                      step="any"
                      style={{ width: 90, textAlign: 'right', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }}
                      value={current?.quantity ?? ''}
                      disabled={Number(row.returnable) <= 0}
                      onChange={e => setQty(row, e.target.value)}
                    />
                  )}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.unit_price)}</td>
                {showTax && (
                  <td style={{ ...cellStyle, textAlign: 'right', color: '#4b5563' }}>
                    {formatCurrency(current?.tax_amount || 0)}
                  </td>
                )}
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 500 }}>
                  {formatCurrency(current?.total || 0)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {items.length > 0 && (
        <div style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13 }}>
          <div>Subtotal: {formatCurrency(subtotal)}</div>
          {showTax && totalTax > 0 && <div>Pajak: {formatCurrency(totalTax)}</div>}
          <div style={{ fontWeight: 700 }}>Total: {formatCurrency(subtotal + totalTax)}</div>
        </div>
      )}
    </div>
  )
}
