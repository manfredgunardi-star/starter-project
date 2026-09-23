import { describe, it, expect } from 'vitest';
import { pesanError } from './errors.js';

describe('pesanError', () => {
  it('memetakan kode', () => {
    expect(pesanError({ code: '42501', message: 'Peran viewer tidak boleh' })).toBe('Anda tidak punya akses untuk aksi ini.');
    expect(pesanError({ code: 'P0001', message: 'SJ X sudah batal' })).toBe('SJ X sudah batal');
    expect(pesanError({ code: 'P0002', message: 'x' })).toBe('Data tidak ditemukan. Muat ulang halaman.');
    expect(pesanError({ code: '23505', message: 'duplicate key' })).toBe('Data dengan nomor/kode yang sama sudah ada.');
    expect(pesanError({ code: '23514', message: 'Jurnal tidak seimbang' })).toBe('Data ditolak pemeriksaan: Jurnal tidak seimbang');
    expect(pesanError({ code: '23503', message: 'fk' })).toBe('Data masih dipakai atau rujukannya tidak ada.');
  });
  it('fallback', () => {
    expect(pesanError(new Error('Failed to fetch'))).toBe('Tidak bisa terhubung ke server. Periksa koneksi internet.');
    expect(pesanError({ message: 'lain' })).toBe('lain');
    expect(pesanError(null)).toBe('Terjadi kesalahan.');
  });
});
