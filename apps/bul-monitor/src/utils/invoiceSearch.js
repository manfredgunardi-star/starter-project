import { normalizeTerm } from './searchFilter.js';

/**
 * Pencarian invoice bersifat "dalam": kata kunci dicocokkan ke nomor invoice
 * DAN ke setiap Surat Jalan yang termuat di dalamnya. Ini menjawab pertanyaan
 * operasional "invoice mana yang memuat SJ 02193?".
 *
 * PENTING — resolusi SJ harus IDS-FIRST, sama seperti `resolveSJInvoice()` di
 * `invoiceTotals.js` yang dipakai untuk ME-RENDER kartu invoice. Kalau matcher
 * ini hanya membaca snapshot `invoice.suratJalanList`, dua hal rusak:
 *
 *   1. Invoice lama yang punya `suratJalanIds` tapi belum punya snapshot akan
 *      tampil benar di kartu namun TIDAK TERCARI. User mengetik nomor SJ,
 *      tidak menemukan apa-apa, lalu menyimpulkan SJ itu belum diinvoice —
 *      kesimpulan yang salah dan berbahaya untuk rekonsiliasi.
 *   2. Kalau rute/material sebuah SJ dikoreksi setelah invoice dibuat, kartu
 *      menampilkan nilai live sementara pencarian mencocokkan nilai beku.
 *
 * Snapshot tetap dipakai sebagai CADANGAN ketika dokumen SJ live tidak ada,
 * dan sebagai satu-satunya sumber untuk data sangat lama yang tidak punya
 * `suratJalanIds` sama sekali.
 */
export const INVOICE_SJ_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'rute', 'material'];

/**
 * Kumpulkan dokumen Surat Jalan sebuah invoice untuk keperluan pencocokan.
 * Mencerminkan urutan prioritas `resolveSJInvoice()`: live dulu, snapshot
 * sebagai cadangan. Berbeda dari fungsi itu, di sini indeks Map dipakai agar
 * pencocokan tetap murah saat dipanggil pada setiap ketukan tombol.
 *
 * @param {object} invoice Dokumen invoice.
 * @param {Map<string, object>} [sjById] Indeks Surat Jalan live berdasarkan id.
 * @returns {object[]}
 */
function resolveSJUntukPencarian(invoice, sjById) {
  const snapshot = Array.isArray(invoice?.suratJalanList) ? invoice.suratJalanList : [];
  const ids = Array.isArray(invoice?.suratJalanIds) ? invoice.suratJalanIds : [];

  // Data sangat lama: tidak ada daftar id, hanya snapshot.
  if (ids.length === 0) return snapshot;

  const snapshotById = new Map(snapshot.map((sj) => [sj?.id, sj]));
  const hasil = [];
  for (const id of ids) {
    const sj = sjById?.get(id) ?? snapshotById.get(id);
    if (sj) hasil.push(sj);
  }
  return hasil;
}

/**
 * @param {object} invoice Dokumen invoice.
 * @param {string} term Kata kunci mentah (belum dinormalisasi).
 * @param {Map<string, object>} [sjById] Indeks Surat Jalan live berdasarkan id.
 * @returns {boolean}
 */
export function matchesInvoiceSearch(invoice, term, sjById) {
  const needle = normalizeTerm(term);
  if (!needle) return true;

  if (String(invoice?.noInvoice ?? '').toLowerCase().includes(needle)) return true;

  return resolveSJUntukPencarian(invoice, sjById).some((sj) =>
    INVOICE_SJ_SEARCH_FIELDS.some((field) =>
      String(sj?.[field] ?? '').toLowerCase().includes(needle)
    )
  );
}

/**
 * @param {object[]} invoiceList Daftar invoice.
 * @param {string} term Kata kunci mentah.
 * @param {Map<string, object>} [sjById] Indeks Surat Jalan live berdasarkan id.
 * @returns {object[]}
 */
export function filterInvoicesBySearch(invoiceList, term, sjById) {
  const items = Array.isArray(invoiceList) ? invoiceList : [];
  const needle = normalizeTerm(term);
  if (!needle) return items;
  return items.filter((invoice) => matchesInvoiceSearch(invoice, needle, sjById));
}
