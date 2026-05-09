// src/services/masterdataService.js
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./config/firebase-config";

/**
 * Subscribe master data dari Firestore.
 * Default: hanya tampilkan data aktif (isActive !== false).
 * - Kita filter di client (bukan where isActive==true) supaya dokumen lama yang belum punya field isActive tetap terbaca.
 */
export const subscribeMasterCollection = (collectionName, setState) => {
  if (!collectionName) throw new Error("collectionName wajib diisi");
  if (typeof setState !== "function") throw new Error("setState harus function");

  const colRef = collection(db, collectionName);

  const unsubscribe = onSnapshot(
    colRef,
    (snap) => {
      const rows = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (data.isActive === false) return; // soft-deleted
        rows.push({ ...data, _docId: d.id });
      });

      // sort konsisten (kalau ada field nama / rute / material)
      rows.sort((a, b) => {
        const ak = (a.namaSupir || a.rute || a.material || a.plat || a.truck || a.id || "").toString().toLowerCase();
        const bk = (b.namaSupir || b.rute || b.material || b.plat || b.truck || b.id || "").toString().toLowerCase();
        return ak.localeCompare(bk);
      });

      setState(rows);
    },
    (err) => {
      console.error(`[subscribeMasterCollection] ${collectionName} error:`, err);
      setState([]); // fail-safe
    }
  );

  return unsubscribe;
};
