// src/services/tarifRuteBulkService.js
import { db, ensureAuthed } from '../config/firebase-config';
import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import { sanitizeForFirestore } from '../firestoreService.js';

const MAX_OPS_PER_BATCH = 450; // safety < 500 hard limit
const IN_CHUNK = 30;           // Firestore `in` operator limit

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Preview the impact of a bulk tarif change.
 * Returns counts + IDs for confirmation UI. No writes.
 *
 * @param {{ updates: Array<{ruteId: string, tarifBaru: number}>, effectiveDate: string }} param0
 * @returns {{ sjCount: number, transaksiCount: number, affectedSJIds: string[], affectedSJs: object[] }}
 */
export async function previewBulkTarifImpact({ updates, effectiveDate }) {
  const ruteIds = updates.map((u) => String(u.ruteId));
  if (ruteIds.length === 0) return { sjCount: 0, transaksiCount: 0, affectedSJIds: [], affectedSJs: [] };

  const affectedSJIds = [];
  const affectedSJs = [];
  for (const batchIds of chunk(ruteIds, IN_CHUNK)) {
    // Query by ruteId only (no composite index needed), filter date client-side
    const q = query(collection(db, 'surat_jalan'), where('ruteId', 'in', batchIds));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const sj = { id: d.id, ...d.data() };
      if (sj.isActive === false) return;
      const sjDate = String(sj.tanggalSJ || '').slice(0, 10);
      if (sjDate && sjDate >= effectiveDate) {
        affectedSJIds.push(sj.id);
        affectedSJs.push(sj);
      }
    });
  }

  // Count matching transaksi
  let transaksiCount = 0;
  for (const batchIds of chunk(affectedSJIds, IN_CHUNK)) {
    if (batchIds.length === 0) break;
    const q = query(
      collection(db, 'transaksi'),
      where('suratJalanId', 'in', batchIds)
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const t = d.data();
      if (t?.isActive === false) return;
      if (t?.source !== 'auto_sj') return;
      if (String(t?.tipe || '').toLowerCase() !== 'pengeluaran') return;
      transaksiCount++;
    });
  }

  return { sjCount: affectedSJs.length, transaksiCount, affectedSJIds, affectedSJs };
}

/**
 * Commit all tarif changes atomically (per batch of 450 ops).
 * Alur:
 * 1. Insert tarif_rute records (append-only history)
 * 2. Update rute master (current value + effective date)
 * 3. Backfill SJ: update sj.uangJalan for matching SJs
 * 4. Backfill transaksi: update nominal for matching kas keluar transactions
 * 5. Write history_log entries for each SJ and transaksi changed
 *
 * @param {{ updates: Array<{ruteId, namaRute, tarifLama, tarifBaru}>, effectiveDate: string, username: string }} param0
 * @returns {{ success: boolean, message: string, summary: object|null }}
 */
export async function commitBulkTarifUpdate({ updates, effectiveDate, username }) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, message: 'Tidak ada perubahan untuk di-apply', summary: null };
  }

  await ensureAuthed();

  const batchId = `BULK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const user = username || 'system';
  const updatesByRuteId = new Map(updates.map((u) => [String(u.ruteId), u]));

  // --- Phase 1: compute impact ---
  const { affectedSJs, affectedSJIds } = await previewBulkTarifImpact({ updates, effectiveDate });

  // --- Phase 2: collect all ops ---
  const ops = [];

  // 2a: tarif_rute inserts (append-only)
  updates.forEach((u) => {
    const docId = `TARIF-${String(u.ruteId)}-${effectiveDate.replace(/-/g, '')}`;
    ops.push({
      type: 'set',
      ref: doc(db, 'tarif_rute', docId),
      data: sanitizeForFirestore({
        id: docId,
        ruteId: String(u.ruteId),
        uangJalan: Number(u.tarifBaru),
        effectiveDate,
        createdAt: nowIso,
        createdBy: user,
        isActive: true,
        source: 'bulk-import',
        batchId,
      }),
    });
  });

  // 2b: rute master updates (current value + effective date)
  updates.forEach((u) => {
    ops.push({
      type: 'update',
      ref: doc(db, 'rute', String(u.ruteId)),
      data: {
        uangJalan: Number(u.tarifBaru),
        uangJalanEffectiveDate: effectiveDate,
        updatedAt: nowIso,
        updatedBy: user,
      },
    });
  });

  // 2c: SJ backfill + history_log per SJ
  affectedSJs.forEach((sj) => {
    const u = updatesByRuteId.get(String(sj.ruteId));
    if (!u) return;
    const newVal = Number(u.tarifBaru);
    ops.push({
      type: 'update',
      ref: doc(db, 'surat_jalan', sj.id),
      data: {
        uangJalan: newVal,
        updatedAt: nowIso,
        updatedBy: user,
      },
    });
    const logId = `LOG-TARIF-SJ-${sj.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    ops.push({
      type: 'set',
      ref: doc(db, 'history_log', logId),
      data: sanitizeForFirestore({
        id: logId,
        action: 'tarif_backfill_sj',
        suratJalanId: sj.id,
        suratJalanNo: sj.nomorSJ || '',
        details: {
          ruteId: String(sj.ruteId),
          from: Number(sj.uangJalan || 0),
          to: newVal,
          effectiveDate,
          batchId,
        },
        timestamp: nowIso,
        user,
        userRole: 'superadmin',
        isActive: true,
      }),
    });
  });

  // 2d: transaksi backfill + history_log per transaksi
  const txToUpdate = [];
  for (const batchIds of chunk(affectedSJIds, IN_CHUNK)) {
    if (batchIds.length === 0) break;
    const q = query(collection(db, 'transaksi'), where('suratJalanId', 'in', batchIds));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const t = { id: d.id, ...d.data() };
      if (t.isActive === false) return;
      if (t.source !== 'auto_sj') return;
      if (String(t.tipe || '').toLowerCase() !== 'pengeluaran') return;
      txToUpdate.push(t);
    });
  }
  txToUpdate.forEach((t) => {
    const sj = affectedSJs.find((x) => String(x.id) === String(t.suratJalanId));
    if (!sj) return;
    const u = updatesByRuteId.get(String(sj.ruteId));
    if (!u) return;
    const newVal = Number(u.tarifBaru);
    if (Number(t.nominal || 0) === newVal) return;
    ops.push({
      type: 'update',
      ref: doc(db, 'transaksi', t.id),
      data: {
        nominal: newVal,
        updatedAt: nowIso,
        updatedBy: user,
      },
    });
    const logId = `LOG-TARIF-TX-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    ops.push({
      type: 'set',
      ref: doc(db, 'history_log', logId),
      data: sanitizeForFirestore({
        id: logId,
        action: 'tarif_backfill_transaksi',
        suratJalanId: String(t.suratJalanId || ''),
        suratJalanNo: sj.nomorSJ || '',
        details: {
          transaksiId: t.id,
          from: Number(t.nominal || 0),
          to: newVal,
          effectiveDate,
          batchId,
        },
        timestamp: nowIso,
        user,
        userRole: 'superadmin',
        isActive: true,
      }),
    });
  });

  // --- Phase 3: flush ops in batches of MAX_OPS_PER_BATCH ---
  let committed = 0;
  try {
    for (const opBatch of chunk(ops, MAX_OPS_PER_BATCH)) {
      const batch = writeBatch(db);
      for (const op of opBatch) {
        if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
        else batch.update(op.ref, op.data);
      }
      await batch.commit();
      committed += opBatch.length;
    }
  } catch (err) {
    return {
      success: false,
      message: `Gagal pada operasi batch (${committed}/${ops.length} ops selesai): ${err.message}`,
      summary: { opsCommitted: committed, totalOps: ops.length, batchId },
    };
  }

  return {
    success: true,
    message: `Berhasil: ${updates.length} tarif baru, ${affectedSJs.length} SJ di-backfill, ${txToUpdate.length} transaksi di-update.`,
    summary: {
      tarifInserted: updates.length,
      sjUpdated: affectedSJs.length,
      transaksiUpdated: txToUpdate.length,
      batchId,
      opsCommitted: committed,
    },
  };
}
