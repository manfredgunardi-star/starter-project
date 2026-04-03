// src/services/ritasiBulkService.js
import { db } from "../config/firebase-config";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";

/**
 * Fetch all routes from Firestore
 */
export async function fetchAllRutes() {
  const snapshot = await getDocs(collection(db, "rute"));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Bulk update Ritasi values in Firestore
 * updates = { [ruteId]: newRitasiValue }
 * Returns: { success: boolean, message: string, updated: number }
 */
export async function bulkUpdateRitasi(updates) {
  const batch = writeBatch(db);
  let updateCount = 0;

  try {
    Object.entries(updates).forEach(([ruteId, ritasiValue]) => {
      const ruteRef = doc(db, "rute", ruteId);
      batch.update(ruteRef, {
        ritasi: ritasiValue,
      });
      updateCount++;
    });

    await batch.commit();

    return {
      success: true,
      message: `Berhasil update ${updateCount} rute dengan nilai Ritasi baru`,
      updated: updateCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error saat update: ${error.message}`,
      updated: 0,
    };
  }
}
