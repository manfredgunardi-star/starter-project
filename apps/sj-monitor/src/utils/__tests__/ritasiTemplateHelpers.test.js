import { describe, it, expect } from 'vitest';
import { validateRitasiTemplate, parseRitasiUpdates, partitionRitasiRowsByRuteExistence } from '../ritasiTemplateHelpers.js';

const headers = ['ID Rute', 'Nama Rute', 'Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru'];
const ruteList = [
  { id: 'R1', rute: 'Jakarta - Bandung' },
  { id: 'R2', rute: 'Surabaya - Malang' },
];

describe('validateRitasiTemplate', () => {
  it('lolos untuk data yang valid', () => {
    const data = [headers, ['R1', 'Jakarta - Bandung', 'Jakarta', 'Bandung', 500000, 3, 5]];
    expect(validateRitasiTemplate(data)).toEqual({ isValid: true, errors: [] });
  });

  it('menoleransi header dengan trailing whitespace dan BOM', () => {
    const dirtyHeaders = ['﻿ID Rute', 'Nama Rute ', ' Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru '];
    const data = [dirtyHeaders, ['R1', 'Jakarta - Bandung', 'Jakarta', 'Bandung', 500000, 3, 5]];
    expect(validateRitasiTemplate(data)).toEqual({ isValid: true, errors: [] });
  });

  it('tetap menolak header yang benar-benar salah', () => {
    const data = [['Kolom Salah'], ['R1', 'x', 'x', 'x', 0, 0, 1]];
    const result = validateRitasiTemplate(data);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(/Header kolom tidak sesuai/);
  });
});

describe('parseRitasiUpdates', () => {
  it('trim whitespace/BOM pada ID Rute dan parse angka', () => {
    const data = [headers, ['﻿ R1 ', 'Jakarta - Bandung', 'Jakarta', 'Bandung', 500000, 3, ' 7 ']];
    expect(parseRitasiUpdates(data)).toEqual({ R1: 7 });
  });

  it('nilai ritasi non-angka menjadi 0 (bukan NaN)', () => {
    const data = [headers, ['R1', 'x', 'x', 'x', 0, 0, 'abc']];
    expect(parseRitasiUpdates(data)).toEqual({ R1: 0 });
  });

  it('mengabaikan baris null/undefined tanpa crash', () => {
    const data = [headers, null, ['R2', 'x', 'x', 'x', 0, 0, 4]];
    expect(parseRitasiUpdates(data)).toEqual({ R2: 4 });
  });
});

describe('partitionRitasiRowsByRuteExistence', () => {
  it('menempatkan baris dengan ID Rute terdaftar ke validUpdates', () => {
    const data = [
      headers,
      ['R1', 'Jakarta - Bandung', 'Jakarta', 'Bandung', 500000, 3, 5],
      ['R2', 'Surabaya - Malang', 'Surabaya', 'Malang', 400000, 1, 2],
    ];
    const { validUpdates, rejectedRows } = partitionRitasiRowsByRuteExistence(data, ruteList);
    expect(validUpdates).toEqual({ R1: 5, R2: 2 });
    expect(rejectedRows).toEqual([]);
  });

  it('menolak baris dengan ID Rute yang tidak ada di Master Data tanpa memblokir baris valid lain', () => {
    const data = [
      headers,
      ['R1', 'Jakarta - Bandung', 'Jakarta', 'Bandung', 500000, 3, 5],
      ['R-DELETED', 'Rute Dihapus', 'X', 'Y', 0, 0, 9],
    ];
    const { validUpdates, rejectedRows } = partitionRitasiRowsByRuteExistence(data, ruteList);
    expect(validUpdates).toEqual({ R1: 5 });
    expect(rejectedRows).toHaveLength(1);
    expect(rejectedRows[0]).toMatchObject({ baris: 3, ruteId: 'R-DELETED', namaRute: 'Rute Dihapus' });
    expect(rejectedRows[0].alasan).toMatch(/tidak ditemukan/);
  });

  it('mengabaikan baris dengan ID Rute kosong (sudah divalidasi terpisah)', () => {
    const data = [headers, ['', '', '', '', '', '', '']];
    const { validUpdates, rejectedRows } = partitionRitasiRowsByRuteExistence(data, ruteList);
    expect(validUpdates).toEqual({});
    expect(rejectedRows).toEqual([]);
  });
});
