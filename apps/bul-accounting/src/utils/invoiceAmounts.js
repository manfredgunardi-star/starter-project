/**
 * invoiceAmounts.js
 * Sumber tunggal aturan bruto → bersih untuk invoice yang berasal dari bul-monitor.
 *
 * Uang jalan adalah uang muka pelanggan: jurnal bridge mengakui pendapatan bruto
 * (Cr 4100) tetapi piutang bersih (Dr 1121 = totalNilai − totalUJ). Subledger
 * `invoices` harus memakai angka bersih yang sama agar cocok dengan buku besar.
 *
 * Modul ini murni — tanpa I/O dan tanpa import firebase — supaya bisa dipakai
 * ulang oleh runner backfill di luar aplikasi.
 */

/**
 * Piutang bersih untuk satu item antrian invoice.
 *
 * Dokumen antrian lama (dikirim sebelum bridge menyertakan piutangNet) jatuh ke
 * selisih manual, lalu ke nilai bruto bila totalUJ pun tidak tersedia.
 *
 * @param   {Object} item - Dokumen integration_queue bertipe 'invoice'
 * @returns {number}      - Piutang bersih; boleh negatif bila UJ melebihi nilai invoice
 */
export function resolvePiutangNet(item) {
  const net = item?.piutangNet
  if (typeof net === 'number' && Number.isFinite(net)) return net

  const gross = Number(item?.totalNilai) || 0
  const uj = Number(item?.totalUJ) || 0
  return gross - uj
}

/**
 * Rincian bruto/uang jalan untuk ditampilkan di samping nilai bersih.
 *
 * Mengembalikan null untuk invoice manual (tanpa uang jalan) dan untuk invoice
 * bridge yang belum di-backfill (amountGross belum ada) — dalam dua kasus itu
 * tidak ada rincian yang benar untuk ditampilkan.
 *
 * @param   {Object} invoice - Dokumen invoices
 * @returns {{ gross: number, uj: number } | null}
 */
export function describeInvoiceGross(invoice) {
  const uj = Number(invoice?.totalUJ) || 0
  if (uj <= 0) return null

  const gross = Number(invoice?.amountGross)
  if (!Number.isFinite(gross)) return null

  return { gross, uj }
}
