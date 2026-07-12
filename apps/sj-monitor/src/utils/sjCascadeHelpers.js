// Field yang boleh diedit superadmin (identity + master-linked + operasional).
export const EDITABLE_SJ_FIELDS = [
  'nomorSJ', 'tanggalSJ',
  'truckId', 'supirId', 'ruteId', 'materialId',
  'qtyIsi', 'qtyBongkar', 'status', 'tglTerkirim', 'quantityLoss', 'abolishPenalty',
];

/**
 * Recompute field denormalisasi SJ dari master data — cermin addSuratJalan (App.jsx).
 * Jika master untuk suatu ID tidak ditemukan, pertahankan nilai lama di sj (fallback).
 * @param {object} sj - SJ dengan *Id terbaru
 * @param {{truckList,supirList,ruteList,materialList}} masters
 * @returns {object} salinan sj dengan field turunan dihitung ulang
 */
export function recomputeDenormalizedSJ(sj, masters) {
  const { truckList = [], supirList = [], ruteList = [], materialList = [] } = masters || {};
  const truck = truckList.find((t) => t.id === sj.truckId);
  const supir = supirList.find((s) => s.id === sj.supirId);
  const rute = ruteList.find((r) => r.id === sj.ruteId);
  const material = materialList.find((m) => m.id === sj.materialId);
  return {
    ...sj,
    nomorPolisi: truck?.nomorPolisi ?? sj.nomorPolisi ?? '',
    namaSupir: supir?.namaSupir ?? sj.namaSupir ?? '',
    pt: supir?.pt ?? sj.pt ?? '',
    rute: rute?.rute ?? sj.rute ?? '',
    uangJalan: rute ? Number(rute.uangJalan || 0) : Number(sj.uangJalan || 0),
    material: material?.material ?? sj.material ?? '',
    satuan: material?.satuan ?? sj.satuan ?? '',
  };
}

/**
 * Diff dangkal antar dua SJ. Mengabaikan updatedAt/updatedBy.
 * @returns {Array<{field:string, before:*, after:*}>}
 */
export function diffSJFields(oldSJ, newSJ) {
  const keys = new Set([...Object.keys(oldSJ || {}), ...Object.keys(newSJ || {})]);
  const out = [];
  keys.forEach((k) => {
    if (k === 'updatedAt' || k === 'updatedBy') return;
    const a = oldSJ?.[k];
    const b = newSJ?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, before: a, after: b });
  });
  return out;
}
