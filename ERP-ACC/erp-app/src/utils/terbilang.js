// Mengkonversi angka ke kalimat Rupiah Indonesia.
// Mendukung 0 sampai 999.999.999.999 (ratusan milyar).

const SATUAN = [
  '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
  'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas',
  'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas',
]
const PULUHAN = [
  '', '', 'Dua Puluh', 'Tiga Puluh', 'Empat Puluh', 'Lima Puluh',
  'Enam Puluh', 'Tujuh Puluh', 'Delapan Puluh', 'Sembilan Puluh',
]

function ratusan(n) {
  if (n === 0) return ''
  if (n < 20) return SATUAN[n]
  if (n < 100) {
    const sisa = n % 10
    return PULUHAN[Math.floor(n / 10)] + (sisa ? ' ' + SATUAN[sisa] : '')
  }
  const ratus = Math.floor(n / 100)
  const sisa = n % 100
  const prefix = ratus === 1 ? 'Seratus' : SATUAN[ratus] + ' Ratus'
  return prefix + (sisa ? ' ' + ratusan(sisa) : '')
}

export function terbilang(angka) {
  const n = Math.floor(angka || 0)
  if (n <= 0) return 'Nol Rupiah'

  const milyar = Math.floor(n / 1_000_000_000)
  const juta   = Math.floor((n % 1_000_000_000) / 1_000_000)
  const ribu   = Math.floor((n % 1_000_000) / 1_000)
  const sisa   = n % 1_000

  const parts = []
  if (milyar) parts.push(ratusan(milyar) + ' Milyar')
  if (juta)   parts.push(ratusan(juta) + ' Juta')
  if (ribu)   parts.push(ribu === 1 ? 'Seribu' : ratusan(ribu) + ' Ribu')
  if (sisa)   parts.push(ratusan(sisa))

  return parts.join(' ') + ' Rupiah'
}
