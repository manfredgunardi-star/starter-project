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
  // 1. Hapus semua selain digit, koma, dan minus
  // 2. Ubah semua koma ke titik, lalu normalisasi: hanya titik terakhir = desimal
  const stripped = s.replace(/[^0-9,-]/g, '')
  const parts = stripped.split(',')
  const normalized = parts.length > 1
    ? parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
    : stripped
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}
