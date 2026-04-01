// src/firestoreService.js
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { ensureAuthed } from "./config/firebase-config";

/**
 * Bersihkan object supaya aman disimpan ke Firestore:
 * - hapus key yang undefined
 * - konversi Date ke ISO string
 * - rekursif untuk nested object/array
 */
export const sanitizeForFirestore = (obj) => {
  if (obj === undefined) return undefined;
  if (obj === null) return null;

  // Date -> ISO
  if (obj instanceof Date) return obj.toISOString();

  // Array
  if (Array.isArray(obj)) {
    return obj
      .map((v) => sanitizeForFirestore(v))
      .filter((v) => v !== undefined);
  }

  // Object
  if (typeof obj === "object") {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => {
      const cleaned = sanitizeForFirestore(v);
      if (cleaned !== undefined) out[k] = cleaned;
    });
    return out;
  }

  // Primitive
  return obj;
};

/**
 * Upsert (create/update) dokumen berdasarkan field `id`.
 * - Collection: contoh "supir", "rute", "material", "trucks"
 * - data wajib punya `id`
 */
export const upsertItemToFirestore = async (db, collectionName, data) => {
  if (!db) throw new Error("db belum diinit");
  if (!collectionName) throw new Error("collectionName wajib diisi");
  if (!data || !data.id) throw new Error("data.id wajib diisi");

  // Pastikan operasi write membawa auth context (mengurangi kasus request dianggap anon)
  await ensureAuthed();

  const cleaned = sanitizeForFirestore(data);
  const ref = doc(db, collectionName, String(data.id));
  await setDoc(ref, cleaned, { merge: true });
};

/**
 * Soft delete (audit trail).
 * Kita tidak delete fisik, hanya set:
 * - isActive: false
 * - deletedAt: ISO string
 * - deletedBy: username
 */
export const softDeleteItemInFirestore = async (db, collectionName, id, deletedBy = "") => {
  if (!db) throw new Error("db belum diinit");
  if (!collectionName) throw new Error("collectionName wajib diisi");
  if (!id) throw new Error("id wajib diisi");

  await ensureAuthed();

  const ref = doc(db, collectionName, String(id));
  await updateDoc(ref, {
    isActive: false,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy || "unknown",
  });
};
