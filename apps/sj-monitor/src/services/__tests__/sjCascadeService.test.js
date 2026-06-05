import { describe, it, expect } from 'vitest';
import { computeCascadePlan } from '../sjCascadeService.js';

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
});
