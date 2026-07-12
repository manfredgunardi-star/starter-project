import { describe, it, expect } from 'vitest';
import { validateRuteIds } from '../tarifRuteTemplateHelpers.js';

const ruteList = [
  { id: 'R1', rute: 'Jakarta - Bandung' },
  { id: 'R2', rute: 'Surabaya - Malang' },
];

describe('validateRuteIds', () => {
  it('mengembalikan array kosong jika semua ruteId terdaftar', () => {
    const updates = [{ ruteId: 'R1', namaRute: 'Jakarta - Bandung', tarifLama: 100, tarifBaru: 150 }];
    expect(validateRuteIds(updates, ruteList)).toEqual([]);
  });

  it('mengembalikan baris terstruktur untuk ruteId yang tidak terdaftar', () => {
    const updates = [{ ruteId: 'R-X', namaRute: 'Rute Hilang', tarifLama: 0, tarifBaru: 100 }];
    const rejected = validateRuteIds(updates, ruteList);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ ruteId: 'R-X', namaRute: 'Rute Hilang' });
    expect(rejected[0].alasan).toMatch(/tidak ditemukan/);
  });
});
