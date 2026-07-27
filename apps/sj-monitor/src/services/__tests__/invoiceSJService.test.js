import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  setDoc: (...args) => setDocMock(...args),
}));

const resolveMock = vi.fn();
vi.mock('../../firestoreService.js', () => ({
  sanitizeForFirestore: (x) => x,
  resolveSuratJalanDocRef: (...args) => resolveMock(...args),
}));

import {
  buildSJInvoicePatch,
  buildSJInvoicePatchMap,
  releaseSJsFromInvoice,
} from '../invoiceSJService.js';

const meta = { nowIso: '2026-07-27T00:00:00.000Z', who: 'Memen' };

// Whitelist di firestore.rules → sjInvoiceFieldsOnly() (apps/sj-monitor/firestore.rules:34)
const ALLOWED_FIELDS = ['statusInvoice', 'invoiceId', 'invoiceNo', 'invoiceTanggal', 'updatedAt', 'updatedBy'];

beforeEach(() => {
  setDocMock.mockClear();
  resolveMock.mockReset();
});

describe('buildSJInvoicePatch', () => {
  it('SJ yang dicabut dari invoice → statusInvoice belum + link dikosongkan', () => {
    const sj = { id: 'SJ-1', statusInvoice: 'belum', invoiceId: null, invoiceNo: null };
    expect(buildSJInvoicePatch(sj, meta)).toEqual({
      statusInvoice: 'belum',
      invoiceId: null,
      invoiceNo: null,
      updatedAt: meta.nowIso,
      updatedBy: meta.who,
    });
  });

  it('SJ yang tetap terinvoice → link invoice dipertahankan', () => {
    const sj = { id: 'SJ-2', statusInvoice: 'terinvoice', invoiceId: 'INV-9', invoiceNo: 'TMP-SI152/2026' };
    expect(buildSJInvoicePatch(sj, meta)).toMatchObject({
      statusInvoice: 'terinvoice',
      invoiceId: 'INV-9',
      invoiceNo: 'TMP-SI152/2026',
    });
  });

  it('tanpa SJ (release murni) → default belum/null/null, bukan terinvoice', () => {
    expect(buildSJInvoicePatch(undefined, meta)).toMatchObject({
      statusInvoice: 'belum',
      invoiceId: null,
      invoiceNo: null,
    });
  });

  it('selalu memakai timestamp/aktor baru, bukan nilai lama dari dokumen SJ', () => {
    const sj = { id: 'SJ-3', statusInvoice: 'belum', updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'orang-lama' };
    expect(buildSJInvoicePatch(sj, meta)).toMatchObject({
      updatedAt: meta.nowIso,
      updatedBy: meta.who,
    });
  });

  it('patch hanya berisi field yang diizinkan firestore.rules untuk admin_invoice', () => {
    const sj = { id: 'SJ-4', nomorSJ: '001', status: 'terkirim', qtyBongkar: 9, statusInvoice: 'terinvoice' };
    const keys = Object.keys(buildSJInvoicePatch(sj, meta));
    expect(keys.every((k) => ALLOWED_FIELDS.includes(k))).toBe(true);
  });
});

describe('buildSJInvoicePatchMap — skenario editInvoice', () => {
  // SJ-1 dicabut dari invoice, SJ-2 tetap, SJ-3 baru ditambahkan.
  const updatedSJList = [
    { id: 'SJ-1', statusInvoice: 'belum', invoiceId: null, invoiceNo: null },
    { id: 'SJ-2', statusInvoice: 'terinvoice', invoiceId: 'INV-9', invoiceNo: 'TMP-SI152/2026' },
    { id: 'SJ-3', statusInvoice: 'terinvoice', invoiceId: 'INV-9', invoiceNo: 'TMP-SI152/2026' },
  ];
  const touchedIds = ['SJ-1', 'SJ-2', 'SJ-3'];

  it('SJ yang dicabut TIDAK ikut ditandai terinvoice lagi', () => {
    const map = buildSJInvoicePatchMap(updatedSJList, touchedIds, meta);
    expect(map.get('SJ-1')).toMatchObject({ statusInvoice: 'belum', invoiceId: null, invoiceNo: null });
  });

  it('SJ yang masih anggota invoice tetap terinvoice', () => {
    const map = buildSJInvoicePatchMap(updatedSJList, touchedIds, meta);
    expect(map.get('SJ-2')).toMatchObject({ statusInvoice: 'terinvoice', invoiceId: 'INV-9' });
    expect(map.get('SJ-3')).toMatchObject({ statusInvoice: 'terinvoice', invoiceId: 'INV-9' });
  });

  it('hanya menghasilkan patch untuk id yang diminta', () => {
    const map = buildSJInvoicePatchMap(updatedSJList, ['SJ-1'], meta);
    expect([...map.keys()]).toEqual(['SJ-1']);
  });

  it('id yang tidak ada di updatedSJList tidak menghasilkan patch tebakan', () => {
    const map = buildSJInvoicePatchMap(updatedSJList, ['SJ-1', 'SJ-404'], meta);
    expect(map.has('SJ-404')).toBe(false);
  });

  it('id dicocokkan sebagai string (Firestore doc id selalu string)', () => {
    const map = buildSJInvoicePatchMap([{ id: 7, statusInvoice: 'belum' }], ['7'], meta);
    expect(map.get('7')).toMatchObject({ statusInvoice: 'belum' });
  });
});

describe('releaseSJsFromInvoice', () => {
  it('melepas semua SJ dari invoice dan melaporkan nol kegagalan', async () => {
    resolveMock.mockImplementation(async (_db, id) => ({ __ref: true, id }));
    const res = await releaseSJsFromInvoice({}, ['SJ-1', 'SJ-2'], meta);

    expect(res.failed).toEqual([]);
    expect(res.released).toEqual(['SJ-1', 'SJ-2']);
    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(setDocMock.mock.calls[0][1]).toMatchObject({
      statusInvoice: 'belum',
      invoiceId: null,
      invoiceNo: null,
    });
  });

  it('SJ yang dokumennya tidak ditemukan dilaporkan gagal, bukan dilewati diam-diam', async () => {
    resolveMock.mockImplementation(async (_db, id) => (id === 'SJ-2' ? null : { __ref: true, id }));
    const res = await releaseSJsFromInvoice({}, ['SJ-1', 'SJ-2', 'SJ-3'], meta);

    expect(res.failed.map((f) => f.sjId)).toEqual(['SJ-2']);
    expect(res.released).toEqual(['SJ-1', 'SJ-3']);
  });

  it('satu SJ gagal ditulis tidak membatalkan SJ berikutnya', async () => {
    resolveMock.mockImplementation(async (_db, id) => ({ __ref: true, id }));
    setDocMock.mockImplementationOnce(() => Promise.reject(new Error('permission-denied')));

    const res = await releaseSJsFromInvoice({}, ['SJ-1', 'SJ-2', 'SJ-3'], meta);

    expect(res.failed.map((f) => f.sjId)).toEqual(['SJ-1']);
    expect(res.released).toEqual(['SJ-2', 'SJ-3']);
    expect(setDocMock).toHaveBeenCalledTimes(3);
  });

  it('resolve yang melempar error dihitung gagal, tidak menghentikan proses', async () => {
    resolveMock.mockImplementation(async (_db, id) => {
      if (id === 'SJ-1') throw new Error('offline');
      return { __ref: true, id };
    });
    const res = await releaseSJsFromInvoice({}, ['SJ-1', 'SJ-2'], meta);

    expect(res.failed.map((f) => f.sjId)).toEqual(['SJ-1']);
    expect(res.released).toEqual(['SJ-2']);
  });

  it('daftar kosong → tidak menulis apa pun', async () => {
    const res = await releaseSJsFromInvoice({}, [], meta);
    expect(res).toEqual({ released: [], failed: [] });
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
