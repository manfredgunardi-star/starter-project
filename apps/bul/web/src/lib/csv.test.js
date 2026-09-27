import { describe, it, expect, vi } from 'vitest';
import { dariCsv, dariCsvBernomor, keCsv, unduhCsv } from './csv.js';

describe('keCsv', () => {
  it('pemisah titik koma, angka desimal koma, kutip untuk teks berisi ;', () => {
    const teks = keCsv(
      [{ title: 'Akun', dataIndex: 'nama' }, { title: 'Jumlah', dataIndex: 'jumlah', angka: true }],
      [{ nama: 'Beban; lain', jumlah: '1417500.00' }, { nama: 'Kas "kecil"', jumlah: '-5.50' }],
    );
    expect(teks).toBe('﻿Akun;Jumlah\r\n"Beban; lain";1417500,00\r\n"Kas ""kecil""";-5,50\r\n');
  });
});

describe('unduhCsv', () => {
  it('tidak mencabut object URL pada tick yang sama dengan click() — 11 unduhan beruntun tak boleh kehilangan satu pun', () => {
    // Sebelum perbaikan ini, revoke terjadi persis sesudah click(), sebelum browser sempat
    // membaca blob-nya; kelihatan sesekali kalau banyak unduhan ditembak beruntun tanpa jeda.
    vi.useFakeTimers();
    const url = 'blob:mock-url';
    const asli = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => url);
    URL.revokeObjectURL = vi.fn();
    try {
      unduhCsv('a.csv', 'isi');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    } finally {
      URL.createObjectURL = asli.createObjectURL;
      URL.revokeObjectURL = asli.revokeObjectURL;
      vi.useRealTimers();
    }
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

  it('dariCsvBernomor menyebut baris sumber, bukan urutan sesudah baris kosong dibuang', () => {
    // Inilah cacatnya: SJ-002 ada di baris 4 berkas, tetapi sesudah judul dan baris kosong
    // dibuang ia menjadi elemen ke-2. Pesan galat yang memakai urutan itu mengirim user ke
    // baris yang isinya justru tidak bermasalah.
    const r = dariCsvBernomor('\ufeffnomor;qty\r\nSJ-001;10\r\n\r\nSJ-002;xx\r\n');
    expect(r.map((x) => x.no)).toEqual([2, 4]);
    expect(r[1].nilai).toEqual({ nomor: 'SJ-002', qty: 'xx' });
  });

  it('dariCsv tetap mengembalikan bentuk lama, tanpa nomor', () => {
    const teks = '\ufeffnomor;qty\r\nSJ-001;10\r\n';
    expect(dariCsv(teks)).toEqual([{ nomor: 'SJ-001', qty: '10' }]);
  });
});
