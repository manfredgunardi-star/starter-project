import { describe, it, expect } from 'vitest';
import { isSJEligibleForInvoice } from './invoiceEligibility.js';

const sjTerkirim = { id: '1', nomorSJ: '08801', status: 'terkirim', isActive: true, statusInvoice: null, invoiceId: null };

describe('isSJEligibleForInvoice — invoice baru', () => {
  it('menerima SJ terkirim yang belum terinvoice', () => {
    expect(isSJEligibleForInvoice(sjTerkirim)).toBe(true);
  });

  it('menerima SJ terkunci yang belum terinvoice', () => {
    expect(isSJEligibleForInvoice({ ...sjTerkirim, status: 'terkunci' })).toBe(true);
  });

  it('menolak SJ yang belum terkirim', () => {
    expect(isSJEligibleForInvoice({ ...sjTerkirim, status: 'pending' })).toBe(false);
    expect(isSJEligibleForInvoice({ ...sjTerkirim, status: 'menunggu_review' })).toBe(false);
  });

  it('menolak SJ yang isActive false', () => {
    expect(isSJEligibleForInvoice({ ...sjTerkirim, isActive: false })).toBe(false);
  });

  it('menerima SJ yang isActive tidak diisi sama sekali', () => {
    const { isActive, ...tanpaIsActive } = sjTerkirim;
    expect(isSJEligibleForInvoice(tanpaIsActive)).toBe(true);
  });

  it('memperlakukan statusInvoice null, string kosong, dan "belum" sebagai belum terinvoice', () => {
    expect(isSJEligibleForInvoice({ ...sjTerkirim, statusInvoice: null })).toBe(true);
    expect(isSJEligibleForInvoice({ ...sjTerkirim, statusInvoice: undefined })).toBe(true);
    expect(isSJEligibleForInvoice({ ...sjTerkirim, statusInvoice: '' })).toBe(true);
    expect(isSJEligibleForInvoice({ ...sjTerkirim, statusInvoice: 'belum' })).toBe(true);
  });

  it('menolak SJ yang sudah terinvoice', () => {
    expect(isSJEligibleForInvoice({ ...sjTerkirim, statusInvoice: 'terinvoice', invoiceId: 'INV-1' })).toBe(false);
  });

  it('menolak SJ terinvoice yang tidak punya field invoiceId sama sekali', () => {
    // Mengunci default isEdit=false. Kalau defaultnya tertukar jadi true,
    // undefined === undefined membuat SJ ini lolos dan muncul di panel import
    // padahal sudah terinvoice.
    const sj = { id: '9', nomorSJ: '09999', status: 'terkirim', isActive: true, statusInvoice: 'terinvoice' };
    expect(isSJEligibleForInvoice(sj)).toBe(false);
  });
});

describe('isSJEligibleForInvoice — mode edit invoice', () => {
  const opsiEdit = { isEdit: true, editingInvoiceId: 'INV-1' };

  it('membandingkan invoiceId secara ketat, bukan longgar', () => {
    // invoiceId null vs editingInvoiceId undefined: === memberi false, == memberi true.
    const sj = { ...sjTerkirim, statusInvoice: 'terinvoice', invoiceId: null };
    expect(isSJEligibleForInvoice(sj, { isEdit: true, editingInvoiceId: undefined })).toBe(false);
  });

  it('menerima SJ yang sudah terinvoice ke invoice yang sedang diedit', () => {
    const sj = { ...sjTerkirim, statusInvoice: 'terinvoice', invoiceId: 'INV-1' };
    expect(isSJEligibleForInvoice(sj, opsiEdit)).toBe(true);
  });

  it('menolak SJ yang terinvoice ke invoice LAIN', () => {
    const sj = { ...sjTerkirim, statusInvoice: 'terinvoice', invoiceId: 'INV-2' };
    expect(isSJEligibleForInvoice(sj, opsiEdit)).toBe(false);
  });

  it('tetap menerima SJ yang belum terinvoice', () => {
    expect(isSJEligibleForInvoice(sjTerkirim, opsiEdit)).toBe(true);
  });

  it('tetap menolak SJ milik invoice ini kalau statusnya tidak layak', () => {
    const sj = { ...sjTerkirim, status: 'pending', statusInvoice: 'terinvoice', invoiceId: 'INV-1' };
    expect(isSJEligibleForInvoice(sj, opsiEdit)).toBe(false);
  });
});
