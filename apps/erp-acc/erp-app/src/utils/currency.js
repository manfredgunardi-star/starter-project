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
  if (str == null) return 0
  const s = String(str).trim()
  if (!s) return 0
  // Format Indonesia: titik = pemisah ribuan, koma = desimal
  // Hapus semua selain digit, koma, dan minus, lalu ubah koma jadi titik
  const cleaned = s
    .replace(/[^0-9,\-]/g, '')   // hapus: Rp, titik ribuan, spasi, dll
    .replace(',', '.')           // koma desimal → titik
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}
