/**
 * Pemetaan "SJ mana yang distempel terinvoice, SJ mana yang dilepas" untuk
 * satu operasi simpan invoice.
 *
 * Dulu `editInvoice` menggabungkan SJ lama dan SJ baru menjadi satu daftar
 * `sjIdsToPersist`, lalu setiap id di daftar itu ditulisi
 * `statusInvoice: 'terinvoice'` ke Firestore. Akibatnya SJ yang justru baru
 * DILEPAS centangnya tetap ditulisi `terinvoice`, padahal id-nya sudah tidak
 * ada di `suratJalanIds` invoice mana pun. SJ itu jadi yatim: `onSnapshot`
 * menimpa state lokal yang sudah benar, `isSJEligibleForInvoice` menolaknya
 * selamanya, dan tidak ada layar yang bisa melepasnya lagi.
 *
 * Karena itu pemisahannya dipusatkan di sini — satu fungsi murni yang bisa
 * diuji, bukan perhitungan yang terkubur di dalam komponen.
 *
 * @param {string[]} [oldSJIds] isi `suratJalanIds` invoice SEBELUM disimpan.
 * @param {string[]} [newSJIds] SJ yang tercentang saat disimpan.
 * @returns {{ sjIdsToAttach: string[], sjIdsToDetach: string[] }}
 */
export function splitInvoiceSJIds(oldSJIds = [], newSJIds = []) {
  const olds = Array.isArray(oldSJIds) ? oldSJIds : [];
  const news = Array.isArray(newSJIds) ? newSJIds : [];
  const attach = new Set(news.filter(Boolean));
  const detach = new Set(olds.filter((id) => id && !attach.has(id)));
  return {
    sjIdsToAttach: Array.from(attach),
    sjIdsToDetach: Array.from(detach),
  };
}
