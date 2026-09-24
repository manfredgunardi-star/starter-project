import { describe, it, expect } from 'vitest';
import { boleh, menuUntukPeran, MENU } from './menu.js';

describe('menu & hak', () => {
  it('boleh', () => {
    expect(boleh('owner', 'akuntansi.pengaturan')).toBe(true);
    expect(boleh('keuangan', 'akuntansi.pengaturan')).toBe(false);
    expect(boleh('operasional', 'sj.tulis')).toBe(true);
    expect(boleh('keuangan', 'sj.tulis')).toBe(false);
    expect(boleh('viewer', 'invoice.tulis')).toBe(false);
    expect(boleh(null, 'sj.tulis')).toBe(false);
    expect(boleh('keuangan', 'bonus.tulis')).toBe(true);
    expect(boleh('operasional', 'bonus.tulis')).toBe(false);
    expect(() => boleh('owner', 'tidak.ada')).toThrow(/tidak dikenal/);
  });
  it('menu per peran', () => {
    const kunci = (p) => menuUntukPeran(p).map((m) => m.key);
    expect(kunci('owner')).toEqual(MENU.map((m) => m.key));
    expect(kunci('viewer')).not.toContain('pengguna');
    expect(kunci('viewer')).not.toContain('pengaturan');
    expect(kunci('viewer')).toContain('laporan');
    expect(kunci('keuangan')).toContain('bonus');
    expect(kunci('operasional')).not.toContain('bonus');
    expect(kunci(null)).toEqual([]);
  });
});
