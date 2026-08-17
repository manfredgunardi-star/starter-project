import { describe, it, expect } from 'vitest';
import { parseInvoiceCsv } from './invoiceCsvParser.js';

const RUTE_TA = 'Tanah Abang (Pasir KT-PT. PionirBeton Industri)';
const RUTE_KAMAL = 'Kamal (Pasir KT-PT. Pionirbeton Industri)';

const SJ_LIST = [
  { id: 'SJ-1', nomorSJ: '07214', rute: RUTE_TA, material: 'Pasir', satuan: 'm3', qtyBongkar: 25 },
  { id: 'SJ-2', nomorSJ: '07215', rute: RUTE_TA, material: 'Pasir', satuan: 'm3', qtyBongkar: 30 },
  { id: 'SJ-3', nomorSJ: '08120', rute: RUTE_KAMAL, material: 'Pasir', satuan: 'm3', qtyBongkar: 20 },
];

const HEADER = 'Nomor SJ;Harga Jual per Satuan';

describe('parseInvoiceCsv — validasi berkas', () => {
  it('menolak file kosong', () => {
    const hasil = parseInvoiceCsv('', SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('kosong');
  });

  it('menolak file yang hanya berisi header tanpa baris data', () => {
    const hasil = parseInvoiceCsv(HEADER, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('kosong');
  });

  it('menolak header yang tidak sesuai', () => {
    const hasil = parseInvoiceCsv('Nomor SJ;Rute;Qty\n07214;A;1', SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('Header');
  });
});
