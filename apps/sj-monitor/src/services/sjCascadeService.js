import { writeBatch, doc, collection } from 'firebase/firestore';
import { recomputeDenormalizedSJ, diffSJFields } from '../utils/sjCascadeHelpers.js';
import { computeInvoiceTotals } from '../utils/invoiceTotals.js';
import { db, ensureAuthed } from '../config/firebase-config.js';
import { sanitizeForFirestore } from '../firestoreService.js';

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
      // Dokumen UJ kanonik — cermin auto-uang-jalan di App.jsx (addSuratJalan).
      // Ditulis penuh via set+merge agar:
      //  - jalur "create" menghasilkan dokumen lengkap (tipe/suratJalanId/source/isActive),
      //    bukan hanya field yang berubah; dan
      //  - revive UJ yang sudah ter-soft-delete tetap reaktif walau dokumennya
      //    terfilter dari transaksiList (subscription membuang isActive:false).
      const txData = {
        id: ujId,
        tipe: 'pengeluaran',
        nominal: nominalAfter,
        keterangan: ketAfter,
        tanggal: sjAfter.tanggalSJ,
        suratJalanId: oldSJ.id,
        pt: sjAfter.pt || '',
        source: 'auto_sj',
        isActive: true,
        deletedAt: null,
        deletedBy: null,
      };
      impacts.push({
        collection: 'transaksi', docId: ujId, label: 'Transaksi Uang Jalan',
        op: existingUJ ? 'update' : 'create', severity: 'finance', changes: changesUJ, txData,
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

/**
 * Terapkan CascadePlan secara atomic (satu writeBatch) + tulis audit log.
 * @param {object} plan hasil computeCascadePlan
 * @param {{currentUser?:{name?:string}}} opts
 */
export async function executeCascadePlan(plan, { currentUser } = {}) {
  await ensureAuthed();
  const who = currentUser?.name || 'superadmin';
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);

  // 1) SJ utama
  batch.set(
    doc(db, 'surat_jalan', plan.sjId),
    sanitizeForFirestore({ ...plan.sjAfter, updatedAt: nowIso, updatedBy: who }),
    { merge: true }
  );

  // 2) Impact per collection
  (plan.impacts || []).forEach((imp) => {
    const ref = doc(db, imp.collection, imp.docId);
    if (imp.op === 'softDelete') {
      batch.update(ref, sanitizeForFirestore({
        isActive: false, deletedAt: nowIso, deletedBy: who, updatedAt: nowIso, updatedBy: who,
      }));
    } else if (imp.collection === 'invoice') {
      batch.set(ref, sanitizeForFirestore({
        suratJalanList: imp.newSJList, ...imp.newTotals, updatedAt: nowIso, updatedBy: who,
      }), { merge: true });
    } else if (imp.collection === 'transaksi' && imp.txData) {
      // Tulis dokumen UJ kanonik secara penuh (create + revive) — set+merge.
      batch.set(ref, sanitizeForFirestore({
        ...imp.txData, updatedAt: nowIso, updatedBy: who,
      }), { merge: true });
    } else {
      const patch = { updatedAt: nowIso, updatedBy: who };
      (imp.changes || []).forEach((c) => { patch[c.field] = c.after; });
      if (imp.op === 'create') batch.set(ref, sanitizeForFirestore(patch), { merge: true });
      else batch.update(ref, sanitizeForFirestore(patch));
    }
  });

  // 3) Audit trail
  const logId = `LOG-EDITSJ-${plan.sjId}-${Date.now()}`;
  batch.set(doc(collection(db, 'history_log'), logId), sanitizeForFirestore({
    id: logId,
    action: 'edit_sj_cascade',
    suratJalanId: plan.sjId,
    suratJalanNo: plan.sjAfter?.nomorSJ || '',
    details: {
      fieldChanges: plan.fieldChanges,
      impacts: (plan.impacts || []).map((i) => ({ collection: i.collection, docId: i.docId, op: i.op, changes: i.changes })),
    },
    createdAt: nowIso,
    createdBy: who,
  }));

  await batch.commit();
}
