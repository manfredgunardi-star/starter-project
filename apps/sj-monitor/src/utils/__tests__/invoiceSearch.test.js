import { describe, it, expect } from 'vitest';
import { invoiceMatchesSearch, filterInvoicesBySearch } from '../invoiceSearch.js';

// Bentuk data nyata dari produksi: nomor invoice placeholder dengan spasi
// tidak konsisten, dan nomor SJ hanya ada di dalam `suratJalanList`.
const invSI1157 = {
  id: 'INV-1792142390985',
  noInvoice: 'TMP- SI1157/2026',
  suratJalanList: [{ id: 'SJ-1792031281495', nomorSJ: '14214' }],
};
const invSI1162 = {
  id: 'INV-1792145017358',
  noInvoice: 'TMP SI1162/2026',
  suratJalanList: [{ id: 'SJ-1791511379791', nomorSJ: '14181' }],
};

describe('invoiceMatchesSearch', () => {
  it('cocok lewat nomor Surat Jalan di dalam invoice', () => {
    expect(invoiceMatchesSearch(invSI1157, '14214')).toBe(true);
  });

  it('tidak cocok untuk nomor SJ milik invoice lain', () => {
    expect(invoiceMatchesSearch(invSI1157, '14181')).toBe(false);
  });

  it('cocok lewat potongan nomor invoice', () => {
    expect(invoiceMatchesSearch(invSI1157, 'si1157')).toBe(true);
  });

  it('kata kunci kosong atau spasi dianggap cocok', () => {
    expect(invoiceMatchesSearch(invSI1157, '')).toBe(true);
    expect(invoiceMatchesSearch(invSI1157, '   ')).toBe(true);
  });

  it('aman untuk invoice tanpa suratJalanList', () => {
    expect(invoiceMatchesSearch({ noInvoice: 'INV-9' }, '14214')).toBe(false);
    expect(invoiceMatchesSearch({ noInvoice: 'INV-9' }, 'inv-9')).toBe(true);
    expect(invoiceMatchesSearch(null, '14214')).toBe(false);
  });
});

describe('filterInvoicesBySearch', () => {
  const list = [invSI1157, invSI1162];

  it('menyaring daftar berdasarkan nomor SJ di dalamnya', () => {
    expect(filterInvoicesBySearch(list, '14214')).toEqual([invSI1157]);
    expect(filterInvoicesBySearch(list, '14181')).toEqual([invSI1162]);
  });

  it('mengembalikan daftar apa adanya saat kata kunci kosong', () => {
    expect(filterInvoicesBySearch(list, '')).toBe(list);
    expect(filterInvoicesBySearch(list, '  ')).toBe(list);
  });

  it('mengembalikan array kosong bila tidak ada yang cocok', () => {
    expect(filterInvoicesBySearch(list, '99999')).toEqual([]);
  });

  it('aman untuk input bukan array', () => {
    expect(filterInvoicesBySearch(undefined, '14214')).toEqual([]);
  });
});
