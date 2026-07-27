/**
 * Smoke test alur invoice ↔ Surat Jalan terhadap Firestore tiruan (in-memory).
 *
 * Menjalankan tiga skenario yang biasanya diuji manual di staging:
 *   1. Buat invoice          → SJ terkunci
 *   2. Edit invoice, cabut 1 → SJ itu bebas lagi, sisanya tetap terkunci
 *   3. Hapus invoice         → semua SJ bebas
 *
 * Penentu lulus memakai isSJBelumInvoice() PRODUKSI — fungsi yang sama yang
 * dipakai InvoicePage dan modal "Buat Invoice Baru" untuk memfilter. Jadi yang
 * diuji adalah "apakah SJ muncul kembali di daftar", bukan sekadar nilai field.
 *
 * Catatan cakupan: penyusunan updatedSJList di bawah mencerminkan App.jsx
 * (addInvoice ~:595, editInvoice ~:640). Test ini memverifikasi kontrak service
 * dan hasil akhir dokumen; ia tidak me-render App.jsx, sehingga tidak
 * menggantikan smoke test manual di staging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Firestore tiruan ───────────────────────────────────────────────────────
let store = new Map();

vi.mock('firebase/firestore', () => ({
  setDoc: async (ref, data, opts) => {
    const prev = opts?.merge ? (store.get(ref.id) || {}) : {};
    store.set(ref.id, { ...prev, ...data });
  },
}));

vi.mock('../../firestoreService.js', () => ({
  sanitizeForFirestore: (x) => x,
  resolveSuratJalanDocRef: async (_db, sjId) =>
    store.has(String(sjId)) ? { id: String(sjId) } : null,
}));

import { buildSJInvoicePatchMap, releaseSJsFromInvoice } from '../invoiceSJService.js';
import { isSJBelumInvoice } from '../../utils/sjHelpers.js';

const meta = { nowIso: '2026-07-27T10:00:00.000Z', who: 'Memen' };
const INVOICE = { id: 'INV-1', noInvoice: 'TMP-SI152/2026' };

/** Tulis patch per-SJ ke store — mencerminkan loop di persistInvoiceWithFallback. */
async function persistSJ(updatedSJList, sjIds) {
  const { setDoc } = await import('firebase/firestore');
  const { resolveSuratJalanDocRef } = await import('../../firestoreService.js');
  const patchById = buildSJInvoicePatchMap(updatedSJList, sjIds, meta);
  for (const sjId of sjIds) {
    const patch = patchById.get(String(sjId));
    const ref = await resolveSuratJalanDocRef({}, sjId);
    if (patch && ref) await setDoc(ref, patch, { merge: true });
  }
}

const sjInStore = (id) => store.get(id);
const munculDiDaftarBelumInvoice = (id) => isSJBelumInvoice(sjInStore(id));

beforeEach(() => {
  store = new Map([
    ['SJ-1', { id: 'SJ-1', nomorSJ: '22E-04041', status: 'terkirim', statusInvoice: 'belum', invoiceId: null, invoiceNo: null }],
    ['SJ-2', { id: 'SJ-2', nomorSJ: '22E-04235', status: 'terkirim', statusInvoice: 'belum', invoiceId: null, invoiceNo: null }],
    ['SJ-3', { id: 'SJ-3', nomorSJ: '22E-04237', status: 'terkirim', statusInvoice: 'belum', invoiceId: null, invoiceNo: null }],
  ]);
});

describe('smoke: alur invoice ↔ Surat Jalan', () => {
  it('1. buat invoice → ketiga SJ hilang dari daftar Belum Terinvoice', async () => {
    const ids = ['SJ-1', 'SJ-2', 'SJ-3'];
    // mirror App.jsx addInvoice
    const updated = [...store.values()].map((sj) => ids.includes(sj.id)
      ? { ...sj, statusInvoice: 'terinvoice', invoiceId: INVOICE.id, invoiceNo: INVOICE.noInvoice }
      : sj);
    await persistSJ(updated, ids);

    expect(ids.every((id) => !munculDiDaftarBelumInvoice(id))).toBe(true);
    expect(sjInStore('SJ-1')).toMatchObject({ statusInvoice: 'terinvoice', invoiceNo: 'TMP-SI152/2026' });
  });

  it('2. edit invoice, cabut SJ-1 → SJ-1 bisa dipilih lagi, SJ-2/SJ-3 tetap terkunci', async () => {
    const ids = ['SJ-1', 'SJ-2', 'SJ-3'];
    const afterCreate = [...store.values()].map((sj) => ({ ...sj, statusInvoice: 'terinvoice', invoiceId: INVOICE.id, invoiceNo: INVOICE.noInvoice }));
    await persistSJ(afterCreate, ids);

    // mirror App.jsx editInvoice: SJ-1 dicabut, touchedIds = lama ∪ baru
    const newIds = ['SJ-2', 'SJ-3'];
    const touchedIds = ['SJ-1', 'SJ-2', 'SJ-3'];
    const updated = afterCreate.map((sj) => newIds.includes(sj.id)
      ? sj
      : { ...sj, statusInvoice: 'belum', invoiceId: null, invoiceNo: null });
    await persistSJ(updated, touchedIds);

    // Inti bug lama: SJ-1 ikut ditulis 'terinvoice' lagi dan hilang dari daftar.
    expect(munculDiDaftarBelumInvoice('SJ-1')).toBe(true);
    expect(sjInStore('SJ-1')).toMatchObject({ statusInvoice: 'belum', invoiceId: null, invoiceNo: null });
    expect(munculDiDaftarBelumInvoice('SJ-2')).toBe(false);
    expect(munculDiDaftarBelumInvoice('SJ-3')).toBe(false);
  });

  it('3. hapus invoice → ketiga SJ kembali bisa dipilih', async () => {
    const ids = ['SJ-1', 'SJ-2', 'SJ-3'];
    const afterCreate = [...store.values()].map((sj) => ({ ...sj, statusInvoice: 'terinvoice', invoiceId: INVOICE.id, invoiceNo: INVOICE.noInvoice }));
    await persistSJ(afterCreate, ids);

    const { released, failed } = await releaseSJsFromInvoice({}, ids, meta);

    expect(failed).toEqual([]);
    expect(released).toEqual(ids);
    expect(ids.every((id) => munculDiDaftarBelumInvoice(id))).toBe(true);
  });

  it('4. hapus invoice saat satu SJ tidak bisa ditulis → dilaporkan gagal, invoice tidak jadi dihapus', async () => {
    const ids = ['SJ-1', 'SJ-2', 'SJ-404'];  // SJ-404 tidak ada di store
    const { failed } = await releaseSJsFromInvoice({}, ids, meta);

    expect(failed.map((f) => f.sjId)).toEqual(['SJ-404']);
    // App.jsx membatalkan penghapusan invoice saat failed.length > 0, sehingga
    // pembatalan bisa diulang alih-alih meninggalkan SJ yatim.
    expect(failed.length > 0).toBe(true);
  });
});
