import { describe, it, expect, vi, beforeEach } from 'vitest';

const batchMock = { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
vi.mock('firebase/firestore', () => ({
  writeBatch: () => batchMock,
  doc: (_db, col, id) => ({ __ref: true, col, id }),
  collection: (_db, col) => ({ __col: true, col }),
}));
vi.mock('../../config/firebase-config.js', () => ({ db: {}, ensureAuthed: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../firestoreService.js', () => ({ sanitizeForFirestore: (x) => x }));

import { computeCascadePlan, executeCascadePlan } from '../sjCascadeService.js';

const masters = {
  truckList: [{ id: 'T1', nomorPolisi: 'B 1' }],
  supirList: [{ id: 'S1', namaSupir: 'Budi', pt: 'PT A' }],
  ruteList:  [{ id: 'R1', rute: 'A-B', uangJalan: 100 }, { id: 'R2', rute: 'A-C', uangJalan: 250 }],
  materialList: [{ id: 'M1', material: 'Pasir', satuan: 'm3' }],
};
const sj = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-01', truckId: 'T1', nomorPolisi: 'B 1',
  supirId: 'S1', namaSupir: 'Budi', pt: 'PT A', ruteId: 'R1', rute: 'A-B', uangJalan: 100,
  materialId: 'M1', material: 'Pasir', satuan: 'm3', qtyIsi: 10, qtyBongkar: 9, status: 'terkirim', isActive: true,
};
const baseCtx = {
  masters,
  transaksiList: [{ id: 'TX-UJ-SJ-1', suratJalanId: 'SJ-1', nominal: 100, keterangan: 'Uang Jalan - 001 (A-B)', tanggal: '2026-06-01', isActive: true }],
  invoiceList: [], uangMukaList: [], biayaList: [],
};

describe('computeCascadePlan', () => {
  it('mengubah rute → recompute SJ + impact transaksi uang jalan, tanpa menulis', () => {
    const plan = computeCascadePlan(sj, { ruteId: 'R2' }, baseCtx);
    expect(plan.sjAfter.rute).toBe('A-C');
    expect(plan.sjAfter.uangJalan).toBe(250);
    const tx = plan.impacts.find((i) => i.collection === 'transaksi');
    expect(tx.op).toBe('update');
    expect(tx.changes.find((c) => c.field === 'nominal')).toMatchObject({ before: 100, after: 250 });
    expect(tx.changes.find((c) => c.field === 'keterangan').after).toBe('Uang Jalan - 001 (A-C)');
  });

  it('status → gagal: transaksi uang jalan di-soft-delete', () => {
    const plan = computeCascadePlan(sj, { status: 'gagal' }, baseCtx);
    const tx = plan.impacts.find((i) => i.collection === 'transaksi');
    expect(tx.op).toBe('softDelete');
  });

  it('tanpa perubahan relevan ke uang jalan → tidak ada impact transaksi', () => {
    const plan = computeCascadePlan(sj, { qtyIsi: 11 }, baseCtx);
    expect(plan.impacts.find((i) => i.collection === 'transaksi')).toBeUndefined();
  });

  it('SJ terinvoice → warning + impact invoice finance dengan total baru', () => {
    const ctx2 = {
      ...baseCtx,
      invoiceList: [{
        id: 'INV-9', noInvoice: 'INV-9', statusInvoice: 'terinvoice', suratJalanIds: ['SJ-1'],
        ruteHarga: { 'A-B': 1000, 'A-C': 1000 }, suratJalanList: [sj],
      }],
    };
    const plan = computeCascadePlan(sj, { qtyBongkar: 12 }, ctx2);
    expect(plan.warnings.join(' ')).toMatch(/INV-9/);
    const inv = plan.impacts.find((i) => i.collection === 'invoice');
    expect(inv.severity).toBe('finance');
    expect(inv.newTotals.totalQty).toBe(12);
    expect(Array.isArray(inv.newSJList)).toBe(true);
  });

  it('mengubah qtyBongkar memicu warning payslip', () => {
    const plan = computeCascadePlan(sj, { qtyBongkar: 12 }, baseCtx);
    expect(plan.warnings.join(' ')).toMatch(/gaji|payslip/i);
  });

  it('revive: SJ gagal→terkirim dengan UJ transaksi soft-deleted → impact update menyalakan isActive', () => {
    const gagalSJ = { ...sj, status: 'gagal', isActive: false };
    const ctxDeleted = {
      ...baseCtx,
      transaksiList: [{ id: 'TX-UJ-SJ-1', suratJalanId: 'SJ-1', nominal: 100, keterangan: 'Uang Jalan - 001 (A-B)', tanggal: '2026-06-01', isActive: false }],
    };
    const plan = computeCascadePlan(gagalSJ, { status: 'terkirim', isActive: true }, ctxDeleted);
    const tx = plan.impacts.find((i) => i.collection === 'transaksi');
    expect(tx.op).toBe('update');
    expect(tx.changes.find((c) => c.field === 'isActive')).toMatchObject({ before: false, after: true });
  });
});

describe('executeCascadePlan', () => {
  beforeEach(() => { batchMock.set.mockClear(); batchMock.update.mockClear(); batchMock.commit.mockClear(); });

  it('menulis SJ + impact update + history dalam satu batch lalu commit', async () => {
    const plan = {
      sjId: 'SJ-1', sjBefore: { id: 'SJ-1', nomorSJ: '001' }, sjAfter: { id: 'SJ-1', nomorSJ: '001', rute: 'A-C' },
      fieldChanges: [{ field: 'rute', before: 'A-B', after: 'A-C' }],
      impacts: [{ collection: 'transaksi', docId: 'TX-UJ-SJ-1', op: 'update', changes: [{ field: 'nominal', before: 100, after: 250 }] }],
      warnings: [],
    };
    await executeCascadePlan(plan, { currentUser: { name: 'Boss' } });
    expect(batchMock.set).toHaveBeenCalled();    // SJ + history_log
    expect(batchMock.update).toHaveBeenCalled();  // transaksi update
    expect(batchMock.commit).toHaveBeenCalledTimes(1);
  });

  it('softDelete impact memakai batch.update dengan isActive:false', async () => {
    const plan = {
      sjId: 'SJ-1', sjBefore: { id: 'SJ-1' }, sjAfter: { id: 'SJ-1', nomorSJ: '001' }, fieldChanges: [],
      impacts: [{ collection: 'transaksi', docId: 'TX-UJ-SJ-1', op: 'softDelete', changes: [] }],
      warnings: [],
    };
    await executeCascadePlan(plan, { currentUser: { name: 'Boss' } });
    const updateArg = batchMock.update.mock.calls[0][1];
    expect(updateArg.isActive).toBe(false);
    expect(batchMock.commit).toHaveBeenCalledTimes(1);
  });

  it('invoice impact menulis snapshot + totals via batch.set merge', async () => {
    const plan = {
      sjId: 'SJ-1', sjBefore: { id: 'SJ-1' }, sjAfter: { id: 'SJ-1', nomorSJ: '001' }, fieldChanges: [],
      impacts: [{ collection: 'invoice', docId: 'INV-9', op: 'update', changes: [],
        newSJList: [{ id: 'SJ-1' }], newTotals: { totalQty: 12, totalHarga: 1000, totalUM: 0, totalHargaAfterUM: 1000 } }],
      warnings: [],
    };
    await executeCascadePlan(plan, { currentUser: { name: 'Boss' } });
    const setCalls = batchMock.set.mock.calls.map((c) => c[1]);
    const invWrite = setCalls.find((d) => d && d.totalQty === 12);
    expect(invWrite).toBeTruthy();
    expect(invWrite.suratJalanList).toEqual([{ id: 'SJ-1' }]);
  });
});
