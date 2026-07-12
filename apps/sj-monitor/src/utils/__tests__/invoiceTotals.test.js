import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from '../invoiceTotals.js';

const sjs = [
  { id: 'SJ-1', rute: 'A-B', qtyBongkar: 10 },
  { id: 'SJ-2', rute: 'A-B', qtyBongkar: 5 },
  { id: 'SJ-3', rute: 'A-C', qtyBongkar: 4 },
];
const ruteHarga = { 'A-B': 1000, 'A-C': 2000 };
const uangMuka = [{ sjId: 'SJ-1', jumlah: 3000 }, { sjId: 'SJ-3', jumlah: 1000 }];

describe('computeInvoiceTotals', () => {
  it('menghitung totalQty, totalHarga, totalUM, totalHargaAfterUM', () => {
    const r = computeInvoiceTotals(sjs, ruteHarga, uangMuka);
    expect(r.totalQty).toBe(19);
    expect(r.totalHarga).toBe(15 * 1000 + 4 * 2000);
    expect(r.totalUM).toBe(4000);
    expect(r.totalHargaAfterUM).toBe(23000 - 4000);
  });

  it('aman saat input kosong/null', () => {
    const r = computeInvoiceTotals([], {}, []);
    expect(r).toEqual({ totalQty: 0, totalHarga: 0, totalUM: 0, totalHargaAfterUM: 0 });
  });

  it('aman saat argumen null/undefined', () => {
    const r = computeInvoiceTotals(null, null, null);
    expect(r).toEqual({ totalQty: 0, totalHarga: 0, totalUM: 0, totalHargaAfterUM: 0 });
  });

  it('rute yang tidak ada di ruteHarga berkontribusi 0 ke totalHarga', () => {
    const sjsWithUnknownRute = [
      { id: 'SJ-1', rute: 'A-B', qtyBongkar: 10 },
      { id: 'SJ-X', rute: 'X-Y', qtyBongkar: 99 }, // rute tidak ada di ruteHarga
    ];
    const r = computeInvoiceTotals(sjsWithUnknownRute, { 'A-B': 1000 }, []);
    // hanya A-B yang dihitung; X-Y tidak ada di ruteHarga -> 0
    expect(r.totalHarga).toBe(10 * 1000);
    expect(r.totalQty).toBe(109);
  });

  it('mengoersi qtyBongkar dan harga berupa string numerik via Number()', () => {
    const sjsString = [{ id: 'SJ-1', rute: 'A-B', qtyBongkar: '10' }];
    const ruteHargaString = { 'A-B': '1000' };
    const r = computeInvoiceTotals(sjsString, ruteHargaString, []);
    expect(r.totalQty).toBe(10);
    expect(r.totalHarga).toBe(10000);
  });
});
