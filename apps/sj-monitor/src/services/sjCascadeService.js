import { recomputeDenormalizedSJ, diffSJFields } from '../utils/sjCascadeHelpers.js';
import { computeInvoiceTotals } from '../utils/invoiceTotals.js';

const buildUJId = (sjId) => `TX-UJ-${String(sjId)}`;
const ujKeterangan = (sj) => `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ''})`;

/**
 * Hitung rencana cascade (preview) untuk satu edit SJ. PURE — tidak menulis ke Firestore.
 * @returns {{sjId,sjBefore,sjAfter,fieldChanges,impacts,warnings}}
 */
export function computeCascadePlan(oldSJ, changes, ctx) {
  const { masters, transaksiList = [], invoiceList = [], uangMukaList = [] } = ctx || {};

  const merged = { ...oldSJ, ...changes };
  const sjAfter = recomputeDenormalizedSJ(merged, masters);
  const fieldChanges = diffSJFields(oldSJ, sjAfter);

  const impacts = [];
  const warnings = [];

  // --- Transaksi Uang Jalan ---
  const ujId = buildUJId(oldSJ.id);
  const existingUJ = transaksiList.find((t) => t.id === ujId);
  const statusAfter = String(sjAfter.status || '').toLowerCase();
  const nominalAfter = Number(sjAfter.uangJalan || 0);
  const ujInactive = statusAfter === 'gagal' || sjAfter.isActive === false || !(nominalAfter > 0);

  if (existingUJ && ujInactive) {
    impacts.push({
      collection: 'transaksi', docId: ujId, label: 'Transaksi Uang Jalan',
      op: 'softDelete', severity: 'finance',
      changes: [{ field: 'isActive', before: existingUJ.isActive !== false, after: false }],
    });
  } else if (!ujInactive) {
    const changesUJ = [];
    const nominalBefore = Number(existingUJ?.nominal || 0);
    if (nominalBefore !== nominalAfter) changesUJ.push({ field: 'nominal', before: nominalBefore, after: nominalAfter });
    const ketAfter = ujKeterangan(sjAfter);
    if ((existingUJ?.keterangan || '') !== ketAfter) changesUJ.push({ field: 'keterangan', before: existingUJ?.keterangan || '', after: ketAfter });
    if ((existingUJ?.tanggal || '') !== sjAfter.tanggalSJ) changesUJ.push({ field: 'tanggal', before: existingUJ?.tanggal || '', after: sjAfter.tanggalSJ });
    if (existingUJ && existingUJ.isActive === false) {
      changesUJ.push({ field: 'isActive', before: false, after: true });
    }
    if (changesUJ.length) {
      impacts.push({
        collection: 'transaksi', docId: ujId, label: 'Transaksi Uang Jalan',
        op: existingUJ ? 'update' : 'create', severity: 'finance', changes: changesUJ,
      });
    }
  }

  // --- Invoice (snapshot + total) ---
  invoiceList.forEach((inv) => {
    const ids = inv.suratJalanIds || [];
    if (!ids.includes(oldSJ.id)) return;
    const newSJList = (inv.suratJalanList || []).map((s) => (s.id === oldSJ.id ? sjAfter : s));
    const before = computeInvoiceTotals(inv.suratJalanList || [], inv.ruteHarga || {}, uangMukaList);
    const after = computeInvoiceTotals(newSJList, inv.ruteHarga || {}, uangMukaList);
    const changes = [];
    ['totalQty', 'totalHarga', 'totalUM', 'totalHargaAfterUM'].forEach((k) => {
      if (Number(before[k]) !== Number(after[k])) changes.push({ field: k, before: before[k], after: after[k] });
    });
    impacts.push({
      collection: 'invoice', docId: inv.id, label: `Invoice ${inv.noInvoice || inv.id}`,
      op: 'update', severity: 'finance', changes, newSJList, newTotals: after,
    });
    warnings.push(`SJ ini sudah masuk Invoice ${inv.noInvoice || inv.id}. Mengedit akan mengubah snapshot & total tagihan.`);
  });

  // --- Payslip (computed, no write) ---
  if (fieldChanges.some((c) => ['ruteId', 'supirId', 'qtyBongkar', 'status', 'uangJalan'].includes(c.field))) {
    warnings.push('Perhitungan gaji supir (payslip) untuk periode ini akan ikut berubah.');
  }

  return { sjId: oldSJ.id, sjBefore: oldSJ, sjAfter, fieldChanges, impacts, warnings };
}
