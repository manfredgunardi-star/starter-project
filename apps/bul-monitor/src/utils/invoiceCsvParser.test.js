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

describe('parseInvoiceCsv — pencocokan baris', () => {
  it('mencocokkan nomor SJ ke objek Surat Jalan yang benar', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.matched[0].sj.id).toBe('SJ-1');
    expect(hasil.matched[0].harga).toBe(50000);
    expect(hasil.rejected).toHaveLength(0);
  });

  it('mengabaikan spasi berlebih dan beda huruf besar/kecil pada nomor SJ', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n  07214  ;  50000  `, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.matched[0].sj.id).toBe('SJ-1');
  });

  it('membuang BOM UTF-8 dari Excel di awal berkas', () => {
    const hasil = parseInvoiceCsv(`\uFEFF${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
  });

  it('menerima pemisah koma', () => {
    const hasil = parseInvoiceCsv('Nomor SJ,Harga Jual per Satuan\n07214,50000', SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
  });

  it('menolak baris yang nomor SJ-nya tidak ada di daftar yang bisa di-invoice', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n99999;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].baris).toBe(3);
    expect(hasil.rejected[0].nomorSJ).toBe('99999');
    expect(hasil.rejected[0].alasan).toContain('tidak ditemukan');
  });

  it('menolak baris duplikat di dalam file yang sama', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07214;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('duplikat');
  });

  it('menolak nomor SJ yang ambigu (lebih dari satu SJ bernomor sama)', () => {
    const kembar = [
      ...SJ_LIST,
      { id: 'SJ-4', nomorSJ: '07214', rute: RUTE_KAMAL, material: 'Pasir', satuan: 'm3', qtyBongkar: 5 },
    ];
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, kembar);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected[0].alasan).toContain('ambigu');
  });

  it('menolak harga yang bukan angka polos', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;Rp 50.000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected[0].alasan).toContain('angka');
  });

  it('menolak harga nol atau negatif', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;0\n07215;-5`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(2);
    expect(hasil.rejected[0].alasan).toContain('lebih besar dari 0');
  });

  it('menolak baris yang kolomnya kurang', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214`, SJ_LIST);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('2 kolom');
  });

  it('menolak harga bergaya ribuan Indonesia yang akan terbaca 1000x lebih kecil', () => {
    // Excel berlokal Indonesia mengekspor lima puluh ribu sebagai "50.000".
    // parseFloat("50.000") = 50, jadi ini WAJIB ditolak, bukan diterima diam-diam.
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50.000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('angka');
  });

  it('menolak baris yang kolomnya lebih dari 2', () => {
    // Dengan pemisah koma, "07214,50,000" terpecah jadi 3 kolom; kalau kolom
    // ketiga dibuang diam-diam maka harga terbaca 50, bukan 50000.
    const hasil = parseInvoiceCsv('Nomor SJ,Harga Jual per Satuan\n07214,50,000', SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('2 kolom');
  });

  it('menomori baris sesuai posisi asli di berkas meski ada baris kosong', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n\n07214;50000\n\n99999;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].baris).toBe(5);
  });

  it('gagal keseluruhan bila tidak ada satu pun baris yang cocok', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n99999;50000`, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('Tidak ada baris');
    expect(hasil.rejected).toHaveLength(1);
  });
});

describe('parseInvoiceCsv — pengelompokan dan nilai', () => {
  it('menghasilkan satu grup: hargaSatuan terisi, totalNilai benar', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(1);
    expect(hasil.selectedSJIds).toEqual(['SJ-1', 'SJ-2']);
    expect(hasil.hargaSatuan).toBe('50000');
    expect(hasil.hargaPerGroup).toEqual({ [`Pasir|${RUTE_TA}`]: '50000' });
    // 25 * 50000 + 30 * 50000
    expect(hasil.totalNilai).toBeCloseTo(2750000, 2);
    expect(hasil.groups[0].totalQty).toBeCloseTo(55, 2);
    expect(hasil.groups[0].jumlahSJ).toBe(2);
    expect(hasil.groups[0].satuan).toBe('m3');
  });

  it('menghasilkan banyak grup: hargaSatuan null, hargaPerGroup berisi tiap grup', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n08120;60000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(2);
    expect(hasil.hargaSatuan).toBeNull();
    expect(hasil.hargaPerGroup).toEqual({
      [`Pasir|${RUTE_TA}`]: '50000',
      [`Pasir|${RUTE_KAMAL}`]: '60000',
    });
    // 25 * 50000 + 20 * 60000
    expect(hasil.totalNilai).toBeCloseTo(2450000, 2);
  });

  it('memakai kunci grup dengan format material|rute', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.groups[0].groupKey).toBe(`Pasir|${RUTE_TA}`);
    expect(hasil.groups[0].material).toBe('Pasir');
    expect(hasil.groups[0].rute).toBe(RUTE_TA);
  });

  it('mempertahankan presisi harga desimal (kasus adjusted rate dari kwitansi)', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50123.45\n07215;50123.45`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.hargaSatuan).toBe('50123.45');
    // 25 * 50123.45 + 30 * 50123.45 = 1253086.25 + 1503703.5
    expect(hasil.totalNilai).toBeCloseTo(2756789.75, 2);
  });

  it('menolak seluruh file bila harga tidak konsisten dalam satu grup', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;51000`, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('tidak konsisten');
    expect(hasil.error).toContain(RUTE_TA);
    expect(hasil.error).toContain('07215');
    expect(hasil.selectedSJIds).toHaveLength(0);
  });

  it('mengizinkan harga berbeda selama grupnya juga berbeda', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;50000\n08120;60000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(2);
  });

  it('tetap mengembalikan daftar penolakan bersama hasil yang sukses', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n99999;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.selectedSJIds).toEqual(['SJ-1']);
    expect(hasil.rejected).toHaveLength(1);
  });
});
