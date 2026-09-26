import { describe, it, expect } from 'vitest';
import { dariCsv, keCsv } from './csv.js';

describe('keCsv', () => {
  it('pemisah titik koma, angka desimal koma, kutip untuk teks berisi ;', () => {
    const teks = keCsv(
      [{ title: 'Akun', dataIndex: 'nama' }, { title: 'Jumlah', dataIndex: 'jumlah', angka: true }],
      [{ nama: 'Beban; lain', jumlah: '1417500.00' }, { nama: 'Kas "kecil"', jumlah: '-5.50' }],
    );
    expect(teks).toBe('﻿Akun;Jumlah\r\n"Beban; lain";1417500,00\r\n"Kas ""kecil""";-5,50\r\n');
  });
});

describe('dariCsv', () => {
  it('membaca BOM, CRLF, dan pemisah titik koma', () => {
    const teks = '\ufeffnama;telepon\r\nBudi;0812\r\nAni;0813\r\n';
    expect(dariCsv(teks)).toEqual([
      { nama: 'Budi', telepon: '0812' },
      { nama: 'Ani', telepon: '0813' },
    ]);
  });

  it('menghormati field berkutip yang berisi titik koma dan baris baru', () => {
    const teks = 'nama;alamat\r\nBudi;"Jl. Merdeka; No. 7\r\nBogor"\r\n';
    expect(dariCsv(teks)).toEqual([{ nama: 'Budi', alamat: 'Jl. Merdeka; No. 7\nBogor' }]);
  });

  it('membaca kutip ganda berlipat sebagai satu kutip', () => {
    expect(dariCsv('nama\r\n"Budi ""Gede"""\r\n')).toEqual([{ nama: 'Budi "Gede"' }]);
  });

  it('membuang baris yang seluruh selnya kosong', () => {
    expect(dariCsv('nama;telepon\r\nBudi;0812\r\n;\r\n\r\n')).toEqual([{ nama: 'Budi', telepon: '0812' }]);
  });

  it('menerima baris terakhir tanpa akhir baris, dan sel kosong di tengah', () => {
    expect(dariCsv('a;b;c\r\n1;;3')).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('mengembalikan daftar kosong untuk berkas kosong atau hanya judul', () => {
    expect(dariCsv('')).toEqual([]);
    expect(dariCsv('\ufeffnama;telepon\r\n')).toEqual([]);
  });

  it('membaca kembali apa yang ditulis keCsv', () => {
    const kolom = [{ title: 'nama', dataIndex: 'nama' }, { title: 'alamat', dataIndex: 'alamat' }];
    const asli = [{ nama: 'Budi', alamat: 'Jl. A; No. 1' }];
    expect(dariCsv(keCsv(kolom, asli))).toEqual(asli);
  });
});
