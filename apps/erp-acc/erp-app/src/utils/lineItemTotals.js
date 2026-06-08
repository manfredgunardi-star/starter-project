// Single source of truth for line-level PPN + total across sales/purchase forms.
// PPN dihitung dari master produk (is_taxable / tax_rate, default 11%),
// bukan dari nilai mentah row — agar konsisten dengan perhitungan server.
export function rowTotals(row, product) {
  const qty = Number(row.quantity) || 0
  const price = Number(row.unit_price) || 0
  const subtotal = qty * price
  const tax_amount = product?.is_taxable ? subtotal * ((product.tax_rate || 11) / 100) : 0
  return { tax_amount, total: subtotal + tax_amount }
}
