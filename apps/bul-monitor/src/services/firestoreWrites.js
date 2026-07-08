// src/services/firestoreWrites.js
// Firestore write-path helpers for BUL-monitor, extracted from App.jsx (refactor U12b).
// PURE STRUCTURAL MOVE — function bodies are byte-identical to the previous inline versions.
// FINANCIAL/DATA-SAFETY SENSITIVE: these helpers perform soft-delete / deactivate / upsert
// writes to the PRODUCTION Firestore. Do not change logic without human/accountant review.
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, limit, writeBatch } from "firebase/firestore";
import { db, ensureAuthed } from "../config/firebase-config";
import { buildUangJalanTransaksiId, sanitizeForFirestore } from "../utils/formatters.js";

// Namespace koleksi untuk BUL-monitor (pisah total dari app lain)
// NOTE: Keep this near the top so ALL helpers (including login/bootstrap writes) are consistent.
export const C = (name) => {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.startsWith("bul_") ? n : `bul_${n}`;
};


// Soft delete generik (set isActive=false + deletedAt/deletedBy)
// NOTE: beberapa pemanggilan lama mengirim parameter pertama 'db'. Kita dukung dua bentuk:
// 1) softDeleteItemInFirestore(db, 'collection', id, who)
// 2) softDeleteItemInFirestore('collection', id, who)
export const softDeleteItemInFirestore = async (
  dbOrCollectionName,
  collectionOrDocId,
  docIdOrWho,
  maybeWho = "System"
) => {
  const hasDbArg = typeof dbOrCollectionName === "object" && dbOrCollectionName;
  const _db = hasDbArg ? dbOrCollectionName : db;
  const collectionName = hasDbArg ? collectionOrDocId : dbOrCollectionName;
  const docId = hasDbArg ? docIdOrWho : collectionOrDocId;
  const deletedBy = hasDbArg ? maybeWho : (docIdOrWho ?? "System");

  if (!collectionName || !docId) return;
  await ensureAuthed();
  const ref = doc(_db, C(collectionName), docId);
  await updateDoc(ref, {
    isActive: false,
    deletedAt: new Date().toISOString(),
    deletedBy,
  });
};

// Resolve Surat Jalan document reference by SJ ID.
// Some legacy data used auto-generated Firestore doc IDs while storing the business key in field 'id'.
// This helper makes invoice create/cancel robust for both patterns.
export const resolveSuratJalanDocRef = async (sjId) => {
  const businessId = String(sjId || '').trim();
  if (!businessId) return null;

  // 1) Try docId == businessId
  try {
    const directRef = doc(db, C('surat_jalan'), businessId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return directRef;
  } catch (e) {
    // ignore and fall through
  }

  // 2) Fallback: query by field id
  try {
    const q = query(collection(db, C('surat_jalan')), where('id', '==', businessId), limit(1));
    const qs = await getDocs(q);
    if (!qs.empty) return qs.docs[0].ref;
  } catch (e) {
    console.error('resolveSuratJalanDocRef failed', businessId, e);
  }
  return null;
};

// Khusus untuk koleksi transaksi: rules Firestore membatasi field yang boleh berubah
// untuk role Admin SJ. Saat pembatalan Surat Jalan, kita cukup menonaktifkan transaksi
// + update metadata tanpa menambah field deletedAt/deletedBy.
export const softDeactivateTransaksiInFirestore = async (
  dbOrDocId,
  docIdOrWho,
  maybeWho = "System"
) => {
  const hasDbArg = typeof dbOrDocId === "object" && dbOrDocId;
  const _db = hasDbArg ? dbOrDocId : db;
  const docId = hasDbArg ? docIdOrWho : dbOrDocId;
  const updatedBy = hasDbArg ? maybeWho : (docIdOrWho ?? "System");

  if (!docId) return;
  await ensureAuthed();
  const ref = doc(_db, C("transaksi"), docId);
  await updateDoc(ref, {
    isActive: false,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
};

// Best-effort: nonaktifkan transaksi uang jalan yang terikat ke Surat Jalan.
// Ada kasus legacy (transaksi lama tidak menyimpan suratJalanId / id tidak deterministik),
// jadi kita coba beberapa strategi.
export const deactivateUangJalanTransaksiForSJ = async (sj, userName = "System") => {
  // Deactivate (soft delete) transaksi Uang Jalan yang terkait SJ.
  // Jangan bergantung pada state transaksiList (bisa stale / tidak tersedia di scope).
  // Gunakan ID deterministik: TX-UJ-{SJ_ID} = buildUangJalanTransaksiId(sj.id)
  try {
    if (!sj?.id) return null;

    const txId = buildUangJalanTransaksiId(sj.id);
    const txRef = doc(db, C("transaksi"), txId);
    const txSnap = await getDoc(txRef);

    if (!txSnap.exists()) {
      // Tidak ada transaksi yang perlu dideactivate (mis. SJ pending tanpa uang jalan)
      return null;
    }

    const txData = txSnap.data() || {};

    // Jika sudah nonaktif, tidak perlu update lagi
    if (txData.isActive === false) return { id: txId, ...txData };

    // Penting: untuk kompatibilitas rules (role admin_sj), JANGAN menambah field baru.
    // Cukup set isActive=false + metadata update.
    const nowIso = new Date().toISOString();
    await updateDoc(txRef, {
      isActive: false,
      updatedAt: nowIso,
      updatedBy: userName,
    });

    return { id: txId, ...txData, isActive: false, updatedAt: nowIso, updatedBy: userName };
  } catch (error) {
    console.error("Soft delete transaksi uang jalan gagal:", error);
    return null;
  }
};



// Upsert a document by id into a collection (single source of truth for Firestore writes)
export const upsertItemToFirestore = async (dbRef, collectionName, item) => {
  if (!dbRef) throw new Error("Firestore db is not initialized");
  if (!collectionName) throw new Error("collectionName is required");
  const id = item?.id ? String(item.id).trim() : "";
  if (!id) throw new Error(`Cannot upsert to ${collectionName}: missing item.id`);

  const payload = sanitizeForFirestore(item);
  await setDoc(doc(dbRef, C(collectionName), id), payload, { merge: true });
  return id;
};

// Firestore writeBatch caps at 500 ops/commit. This chunks any list of items into
// batches of at most `chunkSize` ops so bulk actions (import, bulk kirim, bulk batalkan)
// never silently fail past 500 rows/items.
export const chunkedBatchWrite = async (dbRef, items, applyFn, chunkSize = 450, onChunkCommitted) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(dbRef);
    chunk.forEach((item) => applyFn(batch, item));
    await batch.commit();
    if (onChunkCommitted) await onChunkCommitted(chunk);
  }
};
