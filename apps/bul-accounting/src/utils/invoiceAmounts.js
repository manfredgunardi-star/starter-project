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
 * Juga mengembalikan null bila gross − uj tidak lagi cocok dengan amount yang
 * tersimpan (toleransi Rp 1 untuk pembulatan). Ini terjadi bila invoice diedit
 * manual lewat form Penjualan setelah amountGross/totalUJ ditulis — form itu
 * hanya menulis amount, sehingga rincian lama jadi tidak lagi menjelaskan
 * angka yang ditampilkan. Menampilkan rincian basi lebih menyesatkan daripada
 * tidak menampilkan rincian sama sekali.
 *
 * @param   {Object} invoice - Dokumen invoices
 * @returns {{ gross: number, uj: number } | null}
 */
export function describeInvoiceGross(invoice) {
  const uj = Number(invoice?.totalUJ) || 0
  if (uj <= 0) return null

  const gross = Number(invoice?.amountGross)
  if (!Number.isFinite(gross)) return null

  const amount = Number(invoice?.amount) || 0
  if (Math.abs((gross - uj) - amount) > 1) return null

  return { gross, uj }
}

/**
 * Piutang bersih final untuk invoice yang di-approve, memakai baris jurnal
 * 1121 yang benar-benar disetujui akuntan (boleh sudah diedit dari
 * suggestedJournal bawaan bridge) bila tersedia, lalu jatuh ke
 * resolvePiutangNet(item) bila baris itu tidak ada atau tidak valid.
 *
 * Tanpa ini, akuntan yang mengedit baris 1121 sebelum approve akan membuat
 * subledger invoices.amount berselisih dari Dr 1121 yang benar-benar
 * terposting — persis kelas bug yang diperbaiki modul ini.
 *
 * @param {Object}   item          - Dokumen integration_queue bertipe 'invoice'
 * @param {Object[]} journalLines  - Baris jurnal yang disetujui akuntan
 * @returns {number}
 */
export function resolveApprovedAmount(item, journalLines) {
  const line1121 = (journalLines || []).find(l => l?.accountCode === '1121')
  const debit = Number(line1121?.debit)
  if (Number.isFinite(debit)) return debit

  return resolvePiutangNet(item)
}
