import { describe, it, expect } from 'vitest';
import { keCsv } from './csv.js';

describe('keCsv', () => {
  it('pemisah titik koma, angka desimal koma, kutip untuk teks berisi ;', () => {
    const teks = keCsv(
      [{ title: 'Akun', dataIndex: 'nama' }, { title: 'Jumlah', dataIndex: 'jumlah', angka: true }],
      [{ nama: 'Beban; lain', jumlah: '1417500.00' }, { nama: 'Kas "kecil"', jumlah: '-5.50' }],
    );
    expect(teks).toBe('﻿Akun;Jumlah\r\n"Beban; lain";1417500,00\r\n"Kas ""kecil""";-5,50\r\n');
  });
});
