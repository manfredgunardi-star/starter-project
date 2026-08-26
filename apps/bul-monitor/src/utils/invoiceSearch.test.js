import { describe, it, expect } from 'vitest';
import { matchesInvoiceSearch, filterInvoicesBySearch } from './invoiceSearch.js';

const invoiceA = {
  id: 'inv-a',
  noInvoice: 'SJT/006/06/2026',
  suratJalanList: [
    { id: 'sj-1', nomorSJ: '02193', nomorPolisi: 'B 9549 CYU', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
    { id: 'sj-2', nomorSJ: '02266', nomorPolisi: 'B 9550 CYU', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
  ],
};

const invoiceB = {
  id: 'inv-b',
  noInvoice: 'SJT/007/07/2026',
  suratJalanList: [
    { id: 'sj-3', nomorSJ: '012705', nomorPolisi: 'B 1111 AAA', rute: 'BALARAJA (PASIR KT - PT. BRIK)', material: 'Pasir' },
  ],
};

const invoiceKosong = { id: 'inv-c', noInvoice: 'SJT/008/08/2026' };

// Invoice legacy: punya suratJalanIds tapi TIDAK punya snapshot suratJalanList.
// Kartu invoice tetap me-render SJ-nya (resolveSJInvoice IDs-first), jadi
// pencarian pun harus menemukannya.
const invoiceLegacy = {
  id: 'inv-legacy',
  noInvoice: 'SJT/009/09/2026',
  suratJalanIds: ['sj-live-1'],
};

// Invoice yang snapshot-nya BASI: rute di snapshot beda dari dokumen SJ live.
const invoiceSnapshotBasi = {
  id: 'inv-basi',
  noInvoice: 'SJT/010/10/2026',
  suratJalanIds: ['sj-live-2'],
  suratJalanList: [
    { id: 'sj-live-2', nomorSJ: '03001', nomorPolisi: 'B 2222 BBB', rute: 'Rute Lama Sebelum Dikoreksi', material: 'Pasir' },
  ],
};

// Dokumen Surat Jalan yang sedang aktif, diindeks seperti yang dilakukan komponen.
const sjById = new Map([
  ['sj-live-1', { id: 'sj-live-1', nomorSJ: '09001', nomorPolisi: 'B 1111 AAA', rute: 'Depok (Pasir KT-PT. BRIK)', material: 'Pasir' }],
  ['sj-live-2', { id: 'sj-live-2', nomorSJ: '03001', nomorPolisi: 'B 2222 BBB', rute: 'Rute Baru Hasil Koreksi', material: 'Pasir' }],
]);

const list = [invoiceA, invoiceB, invoiceKosong];

describe('matchesInvoiceSearch', () => {
  it('kata kunci kosong selalu cocok', () => {
    expect(matchesInvoiceSearch(invoiceA, '')).toBe(true);
    expect(matchesInvoiceSearch(invoiceA, '  ')).toBe(true);
  });

  it('cocok pada nomor invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, '006/06')).toBe(true);
  });

  it('cocok pada nomor SJ di dalam invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, '02193')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, '02193')).toBe(false);
  });

  it('cocok pada rute, material, dan nomor polisi SJ di dalam invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, 'platinum')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, 'pasir')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, 'b 1111')).toBe(true);
  });

  it('case-insensitive', () => {
    expect(matchesInvoiceSearch(invoiceA, 'TANAH/CLAY')).toBe(true);
  });

  it('aman saat suratJalanList tidak ada', () => {
    expect(matchesInvoiceSearch(invoiceKosong, '02193')).toBe(false);
    expect(matchesInvoiceSearch(invoiceKosong, '008/08')).toBe(true);
  });
});

describe('matchesInvoiceSearch — resolusi IDs-first (selaras resolveSJInvoice)', () => {
  it('menemukan invoice legacy yang punya suratJalanIds tanpa snapshot', () => {
    // Tanpa resolusi IDs-first, invoice ini tampil benar di kartu tapi tak tercari —
    // user bisa salah menyimpulkan SJ-nya belum diinvoice.
    expect(matchesInvoiceSearch(invoiceLegacy, '09001', sjById)).toBe(true);
    expect(matchesInvoiceSearch(invoiceLegacy, 'depok', sjById)).toBe(true);
  });

  it('memakai dokumen SJ live, bukan snapshot yang basi', () => {
    expect(matchesInvoiceSearch(invoiceSnapshotBasi, 'Rute Baru Hasil Koreksi', sjById)).toBe(true);
  });

  it('tetap mengenali snapshot sebagai cadangan saat SJ live tidak ada', () => {
    expect(matchesInvoiceSearch(invoiceSnapshotBasi, 'Rute Lama Sebelum Dikoreksi', new Map())).toBe(true);
  });

  it('tetap bekerja untuk data lama yang hanya punya snapshot tanpa suratJalanIds', () => {
    expect(matchesInvoiceSearch(invoiceA, '02193', sjById)).toBe(true);
  });

  it('aman saat indeks SJ tidak diberikan sama sekali', () => {
    expect(matchesInvoiceSearch(invoiceA, '02193')).toBe(true);
    expect(matchesInvoiceSearch(invoiceLegacy, '09001')).toBe(false);
  });
});

describe('filterInvoicesBySearch', () => {
  it('meneruskan indeks SJ ke matcher', () => {
    expect(filterInvoicesBySearch([invoiceLegacy], '09001', sjById).map((i) => i.id)).toEqual(['inv-legacy']);
    expect(filterInvoicesBySearch([invoiceLegacy], '09001')).toEqual([]);
  });

  it('mengembalikan semua invoice saat kata kunci kosong', () => {
    expect(filterInvoicesBySearch(list, '')).toHaveLength(3);
  });

  it('menemukan invoice yang memuat satu nomor SJ tertentu', () => {
    expect(filterInvoicesBySearch(list, '012705').map((i) => i.id)).toEqual(['inv-b']);
  });

  it('mengembalikan array kosong bila tidak ada yang cocok', () => {
    expect(filterInvoicesBySearch(list, 'zzz')).toEqual([]);
  });

  it('aman saat list null/undefined', () => {
    expect(filterInvoicesBySearch(null, 'apa saja')).toEqual([]);
    expect(filterInvoicesBySearch(undefined, '')).toEqual([]);
  });
});
