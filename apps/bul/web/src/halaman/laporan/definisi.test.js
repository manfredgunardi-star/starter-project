import { describe, it, expect } from 'vitest';
import { LAPORAN } from './definisi.js';

describe('definisi laporan', () => {
  it('setiap laporan punya fungsi/view, parameter, dan kolom', () => {
    expect(Object.keys(LAPORAN)).toEqual(['neraca', 'laba-rugi', 'laba-dimensi', 'saldo-akun', 'umur-piutang', 'hutang-upah', 'omzet']);
    for (const l of Object.values(LAPORAN)) {
      expect(l.fungsi || l.view).toBeTruthy();
      expect(Array.isArray(l.kolom)).toBe(true);
      expect(typeof l.args).toBe('function');
    }
  });
  it('args laba-dimensi', () => {
    expect(LAPORAN['laba-dimensi'].args({ dari: '2026-02-01', sampai: '2026-02-28', dimensi: 'truk' }))
      .toEqual({ p_dari: '2026-02-01', p_sampai: '2026-02-28', p_dimensi: 'truk' });
  });
});
