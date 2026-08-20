// Logika alokasi pembayaran multi-invoice.
// Fungsi murni: tanpa Firestore, tanpa React, tanpa efek samping.
// Semua perhitungan uang tinggal di sini agar bisa diuji tanpa mock.

// Toleransi pembulatan rupiah. Nilainya sama dengan yang dipakai saveJournal()
// saat memeriksa balance jurnal (accounting.js:54).
export const TOLERANSI_RUPIAH = 0.5

/**
 * Sisa tagihan sebuah invoice.
 */
export function sisaTagihan(invoice) {
  return (invoice?.amount || 0) - (invoice?.totalPaid || 0)
}

/**
 * Status invoice berdasarkan nominal dan total yang sudah dibayar.
 *
 * Perilaku disalin persis dari accounting.js:548 dan accounting.js:563.
 * Catatan: perbandingan 'paid' memakai nilai yang dibulatkan, tetapi
 * pengecekan 'partial' memakai nilai mentah. Perbedaan ini disengaja dan
 * dipertahankan agar tidak ada invoice lama yang berubah status.
 */
export function computeInvoiceStatus(amount, totalPaid) {
  const paid = totalPaid || 0
  if (Math.round(paid) >= Math.round(amount || 0)) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}
