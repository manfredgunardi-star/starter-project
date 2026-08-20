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

/**
 * Baris alokasi yang dipilih user di modal.
 * { invoiceId, invoiceNo, truckId, amount, totalPaid, selected, jumlahBayar, pph }
 */

const angka = (v) => Number(v) || 0

/**
 * Memvalidasi seluruh baris tercentang.
 * errors dipetakan per invoiceId agar modal bisa menandai baris yang bermasalah.
 * formError dipakai untuk kesalahan tingkat form, bukan tingkat baris.
 */
export function validateAllocations(rows) {
  const errors = {}
  const selected = (rows || []).filter(r => r.selected)

  if (selected.length === 0) {
    return { valid: false, errors, formError: 'Pilih minimal satu invoice' }
  }

  for (const r of selected) {
    const bayar = angka(r.jumlahBayar)
    const pph = angka(r.pph)

    if (bayar <= 0) {
      errors[r.invoiceId] = 'Jumlah bayar harus lebih dari 0'
      continue
    }
    if (bayar > sisaTagihan(r) + TOLERANSI_RUPIAH) {
      errors[r.invoiceId] = 'Jumlah bayar melebihi sisa tagihan'
      continue
    }
    if (pph < 0 || pph > bayar) {
      errors[r.invoiceId] = 'PPh tidak valid'
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, formError: '' }
}

/**
 * Ringkasan tiga angka yang ditampilkan di bawah tabel modal.
 * totalNet adalah nominal yang benar-benar masuk ke rekening —
 * angka inilah yang harus cocok dengan mutasi bank.
 */
export function summarizeAllocations(rows) {
  const selected = (rows || []).filter(r => r.selected)
  const totalGross = selected.reduce((s, r) => s + angka(r.jumlahBayar), 0)
  const totalPph = selected.reduce((s, r) => s + angka(r.pph), 0)
  return { count: selected.length, totalGross, totalPph, totalNet: totalGross - totalPph }
}

// Akun tetap yang dipakai pembayaran piutang.
// Nilainya menyalin PembayaranModal lama (PenjualanPage.jsx:173-182).
export const AKUN_PIUTANG = '1121'            // Piutang Pelanggan - Proyek
export const AKUN_PPH_DIBAYAR_MUKA = '1172'   // PPh 23 Dibayar Muka

const labelInvoice = (r) => r.invoiceNo || String(r.invoiceId || '').slice(0, 8)

/**
 * Membentuk baris jurnal untuk satu penerimaan pembayaran multi-invoice.
 *
 * Bentuknya:
 *   Dr  <akun kas/bank>   totalNet      (satu baris, cocok dengan mutasi bank)
 *   Dr  1172              totalPph      (hanya jika totalPph > 0)
 *       Cr 1121           per invoice   (agar buku besar piutang tetap detail)
 *
 * truckId diletakkan per baris kredit, bukan di header jurnal, karena satu
 * pembayaran bisa mencakup invoice dari beberapa armada.
 */
export function buildPaymentJournalLines({ rows, account, keterangan }) {
  const selected = (rows || []).filter(r => r.selected)
  if (selected.length === 0) {
    throw new Error('buildPaymentJournalLines: tidak ada invoice yang dipilih')
  }
  const { totalPph, totalNet } = summarizeAllocations(rows)

  const lines = [
    { accountCode: account, debit: totalNet, credit: 0, keterangan, truckId: null },
  ]

  if (totalPph > 0) {
    lines.push({
      accountCode: AKUN_PPH_DIBAYAR_MUKA,
      debit: totalPph,
      credit: 0,
      keterangan: `PPh 23 - ${keterangan}`,
      truckId: null,
    })
  }

  for (const r of selected) {
    lines.push({
      accountCode: AKUN_PIUTANG,
      debit: 0,
      credit: angka(r.jumlahBayar),
      keterangan: `${keterangan} — ${labelInvoice(r)}`,
      truckId: r.truckId || null,
    })
  }

  return lines
}

/**
 * Membentuk entri payments[] per invoice.
 * Bentuk entri sengaja identik dengan yang ditulis addInvoicePayment(),
 * hanya ditambah paymentGroupId, agar riwayat pembayaran di PenjualanPage
 * merender entri baru tanpa perubahan kode.
 */
export function buildPaymentEntries({
  rows, account, keterangan, date, journalId, paymentGroupId, createdAt,
}) {
  const selected = (rows || []).filter(r => r.selected)
  if (selected.length === 0) {
    throw new Error('buildPaymentEntries: tidak ada invoice yang dipilih')
  }
  return selected.map(r => {
    const jumlahBayar = angka(r.jumlahBayar)
    const pph = angka(r.pph)
    return {
      invoiceId: r.invoiceId,
      entry: {
        journalId,
        paymentGroupId,
        date,
        jumlahBayar,
        pph,
        netDiterima: jumlahBayar - pph,
        account,
        keterangan,
        createdAt,
      },
    }
  })
}
