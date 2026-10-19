import { mergeById } from './sjHelpers.js';

/**
 * Pilih invoice yang tampil di UI dari koleksi utama `invoice` + legacy `invoices`.
 *
 * Identitas sebuah invoice adalah ID DOKUMEN, bukan `noInvoice`. Nomor invoice
 * di produksi banyak yang placeholder ketik tangan dengan spasi tidak konsisten
 * ("TMP- SI1157/2026", "TMP SI1162/2026"), jadi dua invoice yang benar-benar
 * berbeda bisa bernomor sama. Dedup berbasis `noInvoice` pernah ada di sini dan
 * membuat satu invoice Rp 9,3 juta (memuat SJ 14214) hilang total dari UI.
 *
 * Duplikasi primary-vs-legacy — satu-satunya alasan dedup itu masuk akal —
 * sudah ditangani sepenuhnya oleh mergeById: kedua write path di App.jsx
 * (persistInvoiceWithFallback dan soft-delete invoice) menulis dengan doc id
 * yang sama, `String(invoiceDoc.id)`, ke koleksi mana pun yang berhasil. Jadi
 * pasangan primary/legacy selalu punya id identik dan tetap menyatu di sini.
 *
 * JANGAN menambahkan kembali dedup berbasis `noInvoice`: itu menelan invoice sah.
 */
export const selectVisibleInvoices = (primary = [], legacy = []) =>
  mergeById(primary, legacy).filter((x) => !x?.deletedAt && x?.isActive !== false);
