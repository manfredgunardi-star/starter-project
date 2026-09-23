import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { formatRupiah, formatQty, formatTanggal, formatRute, keTanggalDb } from './format.js';

describe('format', () => {
  it('formatRupiah', () => {
    expect(formatRupiah('1417500.00')).toBe('Rp 1.417.500');
    expect(formatRupiah('7088.5')).toBe('Rp 7.088,50');
    expect(formatRupiah('-200000')).toBe('-Rp 200.000');
    expect(formatRupiah(null)).toBe('Rp 0');
  });
  it('formatQty', () => {
    expect(formatQty('12.500')).toBe('12,5');
    expect(formatQty('10.000')).toBe('10');
    expect(formatQty('1234.125')).toBe('1.234,125');
  });
  it('tanggal', () => {
    expect(formatTanggal('2026-02-03')).toBe('03/02/2026');
    expect(formatTanggal(null)).toBe('');
    expect(keTanggalDb(dayjs('2026-02-03'))).toBe('2026-02-03');
    expect(keTanggalDb(null)).toBeNull();
  });
  it('formatRute', () => {
    expect(formatRute({ nama: 'Pasir JB', asal: 'Pasir JB', tujuan: 'Bogor' })).toBe('Pasir JB, Pasir JB - Bogor');
    expect(formatRute({ nama: 'Rute X', asal: '', tujuan: '' })).toBe('Rute X');
    expect(formatRute({ nama: 'Rute Y', asal: 'A', tujuan: '' })).toBe('Rute Y, A');
    expect(formatRute(null)).toBe('');
    expect(formatRute(undefined)).toBe('');
  });
});
