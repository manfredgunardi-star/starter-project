/**
 * Utilitas pencarian client-side untuk daftar yang sudah dimuat penuh di memori.
 * Tidak melakukan query Firestore — seluruh list bul-monitor sudah di-cache
 * oleh listener onSnapshot, sehingga pencarian cukup dilakukan di sisi klien.
 */

/** Normalisasi kata kunci: trim + lowercase. Mengembalikan '' untuk null/undefined. */
export function normalizeTerm(term) {
  return String(term ?? '').trim().toLowerCase();
}

/**
 * Cek apakah satu item cocok dengan kata kunci pada salah satu field (OR).
 * Field yang tidak ada / null diperlakukan sebagai string kosong.
 * Kata kunci kosong selalu dianggap cocok.
 */
export function matchesSearch(item, term, fields) {
  const needle = normalizeTerm(term);
  if (!needle) return true;
  return fields.some((field) =>
    String(item?.[field] ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Filter daftar berdasarkan kata kunci pada beberapa field.
 * Kata kunci kosong mengembalikan daftar apa adanya (bukan salinan) agar
 * referensinya stabil dan useMemo di pemanggil tidak memicu render ulang.
 */
export function filterBySearch(list, term, fields) {
  const items = Array.isArray(list) ? list : [];
  const needle = normalizeTerm(term);
  if (!needle) return items;
  return items.filter((item) => matchesSearch(item, needle, fields));
}
