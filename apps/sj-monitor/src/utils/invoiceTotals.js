/**
 * Single source of truth for invoice totals (qty, harga, uang muka).
 *
 * Memusatkan perhitungan total invoice yang sebelumnya tersebar di App.jsx
 * (addInvoice/editInvoice) agar satu formula dipakai konsisten.
 *
 * @param {Array<Object>} [selectedSJs] - Daftar Surat Jalan terpilih. null/undefined ditoleransi (dianggap []).
 * @param {Object<string, number|string>} [ruteHarga] - Map rute -> harga per unit. null/undefined ditoleransi (dianggap {}).
 * @param {Array<Object>} [uangMukaList] - Daftar uang muka. null/undefined ditoleransi (dianggap []).
 * @returns {{ totalQty: number, totalHarga: number, totalUM: number, totalHargaAfterUM: number }}
 *
 * Finance guardrail: aritmetika harus tetap identik dengan formula invoice
 * aslinya (App.jsx addInvoice). Jangan ubah perhitungan uang tanpa persetujuan.
 */
export function computeInvoiceTotals(selectedSJs, ruteHarga, uangMukaList) {
  const sjs = selectedSJs || [];
  const harga = ruteHarga || {};
  const uangMuka = uangMukaList || [];

  const totalQty = sjs.reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0);

  const ruteQtys = {};
  sjs.forEach((sj) => {
    if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
    ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
  });
  const totalHarga = Object.entries(harga).reduce(
    (sum, [rute, hargaRute]) => sum + (ruteQtys[rute] || 0) * Number(hargaRute || 0),
    0
  );

  const totalUM = sjs.reduce((sum, sj) => {
    const umForSJ = uangMuka.filter((um) => um.sjId === sj.id);
    return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
  }, 0);

  return { totalQty, totalHarga, totalUM, totalHargaAfterUM: totalHarga - totalUM };
}
