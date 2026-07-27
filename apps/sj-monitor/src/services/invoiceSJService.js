import { setDoc } from 'firebase/firestore';
import { sanitizeForFirestore, resolveSuratJalanDocRef } from '../firestoreService.js';

/**
 * Bangun patch field-invoice untuk SATU Surat Jalan.
 *
 * Field yang dihasilkan sengaja dibatasi pada whitelist `sjInvoiceFieldsOnly()`
 * di firestore.rules agar role admin_invoice tetap boleh menulis.
 *
 * Nilai statusInvoice/invoiceId/invoiceNo diambil APA ADANYA dari objek SJ yang
 * sudah dihitung pemanggil — bukan diasumsikan 'terinvoice'. Ini yang membuat SJ
 * yang dicabut dari sebuah invoice benar-benar terlepas di Firestore.
 *
 * @param {object|undefined} sj SJ hasil perhitungan pemanggil; undefined = lepas dari invoice
 * @param {{nowIso: string, who: string}} meta
 */
export function buildSJInvoicePatch(sj, { nowIso, who }) {
  return {
    statusInvoice: sj?.statusInvoice ?? 'belum',
    invoiceId: sj?.invoiceId ?? null,
    invoiceNo: sj?.invoiceNo ?? null,
    updatedAt: nowIso,
    updatedBy: who,
  };
}

/**
 * Bangun Map<sjId, patch> untuk sekumpulan SJ yang tersentuh satu operasi invoice.
 *
 * `sjIds` biasanya gabungan anggota lama + baru sebuah invoice, sehingga daftar ini
 * memuat SJ yang dicabut MAUPUN yang ditambahkan. Nilai tiap patch diambil per-SJ
 * dari `updatedSJList`, jadi keduanya tertulis dengan status yang benar.
 *
 * SJ yang tidak ada di `updatedSJList` sengaja dilewati daripada ditebak.
 */
export function buildSJInvoicePatchMap(updatedSJList, sjIds, meta) {
  const byId = new Map((updatedSJList || []).map((sj) => [String(sj?.id ?? ''), sj]));
  const out = new Map();
  for (const rawId of sjIds || []) {
    const id = String(rawId ?? '');
    if (!id || !byId.has(id)) continue;
    out.set(id, buildSJInvoicePatch(byId.get(id), meta));
  }
  return out;
}

/**
 * Lepas sekumpulan SJ dari invoice-nya (statusInvoice: 'belum', link dikosongkan).
 *
 * Setiap SJ diproses independen: satu kegagalan TIDAK membatalkan sisanya, dan SJ
 * yang dokumennya tidak ketemu dilaporkan sebagai gagal — bukan dilewati diam-diam.
 * Pemanggil wajib memeriksa `failed` sebelum menyatakan pembatalan berhasil.
 *
 * @returns {Promise<{released: string[], failed: Array<{sjId: string, reason: string}>}>}
 */
export async function releaseSJsFromInvoice(db, sjIds, { nowIso, who }) {
  const released = [];
  const failed = [];
  const patch = buildSJInvoicePatch(undefined, { nowIso, who });

  for (const rawId of sjIds || []) {
    const sjId = String(rawId ?? '');
    if (!sjId) continue;
    try {
      const ref = await resolveSuratJalanDocRef(db, sjId);
      if (!ref) {
        failed.push({ sjId, reason: 'Dokumen Surat Jalan tidak ditemukan' });
        continue;
      }
      await setDoc(ref, sanitizeForFirestore(patch), { merge: true });
      released.push(sjId);
    } catch (err) {
      failed.push({ sjId, reason: err?.code || err?.message || 'Gagal menulis' });
    }
  }

  return { released, failed };
}
