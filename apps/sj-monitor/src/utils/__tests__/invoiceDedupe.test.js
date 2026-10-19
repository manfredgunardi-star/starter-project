import { describe, it, expect } from 'vitest';
import { selectVisibleInvoices } from '../invoiceDedupe.js';

// Data nyata dari produksi (project surat-jalan-monitor, koleksi `invoice`).
// Dua invoice berbeda yang kebetulan bernomor sama karena nomor placeholder
// diketik tangan. Yang pertama memuat SJ nomor 14214 dan tidak pernah tampil
// di UI karena dedup lama memakai noInvoice sebagai kunci.
const invoiceSJ14214 = {
  id: 'INV-1792142390985',
  noInvoice: 'TMP- SI1157/2026',
  tglInvoice: '2026-10-16',
  updatedAt: '2026-10-16T09:19:50.986Z',
  isActive: true,
  suratJalanIds: ['SJ-1792031281495'],
  totalHarga: 9301800,
};

const invoiceNomorKembar = {
  id: 'INV-1792142678249',
  noInvoice: 'TMP- SI1157/2026',
  tglInvoice: '2026-10-16',
  updatedAt: '2026-10-16T09:24:38.250Z',
  isActive: true,
  suratJalanIds: ['SJ-A', 'SJ-B', 'SJ-C'],
  totalHarga: 23842000,
};

describe('selectVisibleInvoices', () => {
  it('mempertahankan dua invoice berbeda yang bernomor sama', () => {
    const hasil = selectVisibleInvoices([invoiceSJ14214, invoiceNomorKembar], []);

    expect(hasil).toHaveLength(2);
    expect(hasil.map((inv) => inv.id).sort()).toEqual([
      'INV-1792142390985',
      'INV-1792142678249',
    ]);
    // Invoice Rp 9.301.800 yang memuat SJ 14214 harus ikut tampil.
    expect(hasil.find((inv) => inv.suratJalanIds.includes('SJ-1792031281495'))).toBeTruthy();
  });

  it('menyatukan duplikasi primary-vs-legacy menjadi satu, versi terbaru menang', () => {
    // persistInvoiceWithFallback menulis doc id yang sama ke koleksi mana pun
    // yang berhasil, jadi pasangan primary/legacy selalu ber-id identik.
    const legacy = { ...invoiceSJ14214, updatedAt: '2026-10-16T08:00:00.000Z', totalHarga: 1 };
    const hasil = selectVisibleInvoices([invoiceSJ14214], [legacy]);

    expect(hasil).toHaveLength(1);
    expect(hasil[0].id).toBe('INV-1792142390985');
    expect(hasil[0].totalHarga).toBe(9301800);
  });

  it('membuang invoice yang dibatalkan atau tidak aktif', () => {
    const dibatalkan = { ...invoiceNomorKembar, id: 'INV-X', deletedAt: '2026-10-17T00:00:00.000Z' };
    const nonAktif = { ...invoiceNomorKembar, id: 'INV-Y', isActive: false };

    const hasil = selectVisibleInvoices([invoiceSJ14214, dibatalkan, nonAktif], []);

    expect(hasil.map((inv) => inv.id)).toEqual(['INV-1792142390985']);
  });
});
