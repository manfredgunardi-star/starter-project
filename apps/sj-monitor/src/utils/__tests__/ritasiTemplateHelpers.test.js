import { describe, it, expect } from 'vitest';
import { validateRitasiTemplate, partitionRitasiRowsByRuteExistence } from '../ritasiTemplateHelpers.js';

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
