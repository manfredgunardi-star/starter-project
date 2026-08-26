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

describe('filterInvoicesBySearch', () => {
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
