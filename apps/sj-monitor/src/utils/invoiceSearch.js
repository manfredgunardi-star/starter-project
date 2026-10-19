/**
 * Pencarian untuk DAFTAR INVOICE.
 *
 * Pencariannya "dalam": satu invoice cocok bila kata kunci ada di nomor
 * invoice-nya ATAU di salah satu nomor Surat Jalan di dalamnya. Tanpa ini,
 * menemukan invoice yang memuat satu SJ tertentu berarti membolak-balik
 * halaman daftar invoice dengan mata — dan nomor invoice di produksi banyak
 * yang berupa placeholder dengan spasi tidak konsisten ("TMP- SI1157/2026",
 * "TMP SI1162/2026", "TMP- SI 1106 /2026"), jadi praktis tidak bisa dikenali
 * sekilas.
 *
 * Nomor SJ sengaja diambil dari `invoice.suratJalanList` — snapshot yang
 * PERSIS dirender kartu invoice. Kalau sumbernya beda dari yang dirender,
 * pencarian bisa memunculkan kartu yang tidak memperlihatkan nomor yang dicari
 * (atau sebaliknya menyembunyikan yang memuatnya), dan ketidakcocokan seperti
 * itu tidak akan terlihat dari luar.
 */

/** @returns {boolean} true bila invoice cocok; kata kunci kosong selalu cocok. */
export function invoiceMatchesSearch(invoice, searchTerm) {
  const term = String(searchTerm ?? '').trim().toLowerCase();
  if (!term) return true;

  if (String(invoice?.noInvoice ?? '').toLowerCase().includes(term)) return true;

  const sjList = Array.isArray(invoice?.suratJalanList) ? invoice.suratJalanList : [];
  return sjList.some((sj) => String(sj?.nomorSJ ?? '').toLowerCase().includes(term));
}

/** @returns {Array} invoice yang cocok; kata kunci kosong mengembalikan daftar apa adanya. */
export function filterInvoicesBySearch(invoiceList, searchTerm) {
  const items = Array.isArray(invoiceList) ? invoiceList : [];
  if (!String(searchTerm ?? '').trim()) return items;
  return items.filter((invoice) => invoiceMatchesSearch(invoice, searchTerm));
}
