import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function semuaFile(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? semuaFile(p) : /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('gerbang tulis', () => {
  it('tidak ada tulis tabel langsung, parseFloat, atau Number() pada uang di luar uang.js', () => {
    const pelanggaran = [];
    for (const f of semuaFile(join(process.cwd(), 'src'))) {
      const isi = readFileSync(f, 'utf8');
      if (/\.(insert|update|upsert|delete)\s*\(/.test(isi)) pelanggaran.push(`${f}: tulis tabel langsung`);
      if (!f.endsWith('uang.js') && /parseFloat\s*\(/.test(isi)) pelanggaran.push(`${f}: parseFloat`);
    }
    expect(pelanggaran).toEqual([]);
  });
});
