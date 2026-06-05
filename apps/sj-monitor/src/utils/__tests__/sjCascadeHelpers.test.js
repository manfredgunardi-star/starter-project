import { describe, it, expect } from 'vitest';
import { diffSJFields, recomputeDenormalizedSJ, EDITABLE_SJ_FIELDS } from '../sjCascadeHelpers.js';

const masters = {
  truckList: [{ id: 'T1', nomorPolisi: 'B 1' }, { id: 'T2', nomorPolisi: 'B 2' }],
  supirList: [{ id: 'S1', namaSupir: 'Budi', pt: 'PT A' }, { id: 'S2', namaSupir: 'Andi', pt: 'PT B' }],
  ruteList:  [{ id: 'R1', rute: 'A-B', uangJalan: 100 }, { id: 'R2', rute: 'A-C', uangJalan: 200 }],
  materialList: [{ id: 'M1', material: 'Pasir', satuan: 'm3' }, { id: 'M2', material: 'Batu', satuan: 'ton' }],
};
const baseSJ = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-01',
  truckId: 'T1', nomorPolisi: 'B 1', supirId: 'S1', namaSupir: 'Budi', pt: 'PT A',
  ruteId: 'R1', rute: 'A-B', uangJalan: 100, materialId: 'M1', material: 'Pasir', satuan: 'm3',
  qtyIsi: 10, qtyBongkar: 9, status: 'terkirim',
};

describe('recomputeDenormalizedSJ', () => {
  it('menghitung ulang field turunan dari master saat ID berubah', () => {
    const out = recomputeDenormalizedSJ({ ...baseSJ, ruteId: 'R2', supirId: 'S2' }, masters);
    expect(out.rute).toBe('A-C');
    expect(out.uangJalan).toBe(200);
    expect(out.namaSupir).toBe('Andi');
    expect(out.pt).toBe('PT B');
    expect(out.qtyBongkar).toBe(9);
  });

  it('mempertahankan nilai lama jika master tidak ditemukan', () => {
    const out = recomputeDenormalizedSJ({ ...baseSJ, ruteId: 'RX' }, masters);
    expect(out.uangJalan).toBe(100); // fallback ke nilai SJ lama
  });
});

describe('diffSJFields', () => {
  it('hanya melaporkan field yang benar-benar berubah, mengabaikan updatedAt/By', () => {
    const after = recomputeDenormalizedSJ({ ...baseSJ, ruteId: 'R2', updatedAt: 'x' }, masters);
    const d = diffSJFields(baseSJ, after);
    const fields = d.map(x => x.field).sort();
    expect(fields).toEqual(['rute', 'ruteId', 'uangJalan'].sort());
    expect(d.find(x => x.field === 'uangJalan')).toMatchObject({ before: 100, after: 200 });
  });

  it('EDITABLE_SJ_FIELDS memuat field identity & master & operasional', () => {
    ['nomorSJ','tanggalSJ','ruteId','supirId','truckId','materialId','qtyIsi','qtyBongkar','status']
      .forEach(f => expect(EDITABLE_SJ_FIELDS).toContain(f));
  });
});
