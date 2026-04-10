export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount || 0)
}

export function formatNumber(num, decimals = 0) {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

export function parseCurrency(str) {
  if (typeof str === 'number') return str
  return parseFloat(String(str).replace(/[^0-9.-]/g, '')) || 0
}
