// Formula diekstrak verbatim dari App.jsx addInvoice. JANGAN ubah aritmetika.
export function computeInvoiceTotals(selectedSJs = [], ruteHarga = {}, uangMukaList = []) {
  const sjs = selectedSJs || [];
  const totalQty = sjs.reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0);

  const ruteQtys = {};
  sjs.forEach((sj) => {
    if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
    ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
  });
  const totalHarga = Object.entries(ruteHarga || {}).reduce(
    (sum, [rute, harga]) => sum + (ruteQtys[rute] || 0) * Number(harga || 0),
    0
  );

  const totalUM = sjs.reduce((sum, sj) => {
    const umForSJ = (uangMukaList || []).filter((um) => um.sjId === sj.id);
    return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
  }, 0);

  return { totalQty, totalHarga, totalUM, totalHargaAfterUM: totalHarga - totalUM };
}
