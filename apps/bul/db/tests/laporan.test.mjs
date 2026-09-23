import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster, buatSjSelesai, terbitkan } from './fixtures.mjs';

let owner, ops, keu, viewer, m, inv;
const rp = (v) => Number(v);

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  viewer = await buatPengguna('viewer');
  m = await siapkanMaster(owner);
  await sebagai(owner, "select public.posting_saldo_awal('2025-12-31', $1)", [JSON.stringify([
    { akun_kode: '1112', debit: '10000000' }, { akun_kode: '3110', kredit: '10000000' },
  ])]);
  // Dua SJ truk yang sama: upah 150.000 × 2, UJ 400.000 × 2, harga 63.000
  const sj1 = await buatSjSelesai(ops, m, { qty: '10', tanggal: '2026-02-02' });
  const sj2 = await buatSjSelesai(ops, m, { qty: '12.5', tanggal: '2026-02-03' });
  inv = await terbitkan(keu, m, [sj1, sj2], { tanggal: '2026-02-10' }); // subtotal 1.417.500, UJ 800.000, total 617.500
  await sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)', ['keluar', '2026-02-15', '1112', 'Solar',
    JSON.stringify([{ akun_kode: '5110', jumlah: '200000', truk_id: m.truk }])]);
});
afterAll(tutup);

describe('sebelum pelunasan', () => {
  it('umur piutang dan hutang upah supir', async () => {
    const umur = await sebagai(viewer, "select nomor, sisa, umur_hari, kelompok from public.laporan_umur_piutang('2026-03-20')");
    expect(umur).toEqual([{ nomor: 'SJP/001/02/2026', sisa: '617500.00', umur_hari: 38, kelompok: '31-60' }]);
    const hutang = await sebagai(viewer, 'select supir_id, saldo from public.v_hutang_upah_supir');
    expect(hutang).toEqual([{ supir_id: m.supir, saldo: '300000.00' }]);
  });
});

describe('setelah pelunasan dan bayar upah', () => {
  beforeAll(async () => {
    await sebagai(keu, "select public.catat_pembayaran('2026-02-20', $1, '1112', '610412', '7088', $2)", [
      m.pelanggan, JSON.stringify([{ invoice_id: inv, jumlah: '617500' }]),
    ]);
    await sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)', ['keluar', '2026-02-25', '1112', 'Upah minggu 4',
      JSON.stringify([{ akun_kode: '2121', jumlah: '300000', supir_id: m.supir }])]);
  });

  it('laba rugi Februari', async () => {
    const rows = await sebagai(viewer, "select kode, jumlah from public.laporan_laba_rugi('2026-02-01', '2026-02-28') order by kode");
    expect(rows).toEqual([
      { kode: '4100', jumlah: '1417500.00' },
      { kode: '5110', jumlah: '200000.00' },
      { kode: '5130', jumlah: '300000.00' },
      { kode: '5150', jumlah: '800000.00' },
      { kode: '6251', jumlah: '7088.00' },
    ]);
  });

  it('neraca seimbang dan kas sesuai', async () => {
    const rows = await sebagai(viewer, "select bagian, kode, nama, saldo from public.laporan_neraca('2026-02-28')");
    const total = (b) => rows.filter((r) => r.bagian === b).reduce((s, r) => s + rp(r.saldo), 0);
    expect(rows.find((r) => r.kode === '1112').saldo).toBe('10110412.00');
    expect(rows.find((r) => r.kode === '1121')).toBeUndefined();
    expect(rp(rows.find((r) => r.nama === 'Laba (rugi) tahun berjalan').saldo)).toBe(110412);
    expect(total('aset')).toBe(total('kewajiban') + total('ekuitas'));
  });

  it('laba per truk', async () => {
    const rows = await sebagai(viewer, "select dimensi_id, dimensi_nama, pendapatan, beban, laba from public.laporan_laba_dimensi('2026-02-01', '2026-02-28', 'truk')");
    const truk = rows.find((r) => r.dimensi_id === m.truk);
    expect(truk).toMatchObject({ pendapatan: '1417500.00', beban: '1300000.00', laba: '117500.00' });
    const tanpa = rows.find((r) => r.dimensi_id === null);
    expect(tanpa).toMatchObject({ dimensi_nama: '(tanpa truk)', beban: '7088.00' });
    await expect(sebagai(viewer, "select * from public.laporan_laba_dimensi('2026-02-01', '2026-02-28', 'warna')")).rejects.toMatchObject({ code: 'P0001' });
  });

  it('saldo akun periode', async () => {
    const rows = await sebagai(viewer, "select kode, saldo_awal, debit, kredit, saldo_akhir from public.laporan_saldo_akun('2026-02-01', '2026-02-28') where kode in ('1112', '2121')");
    expect(rows).toEqual([
      { kode: '1112', saldo_awal: '10000000.00', debit: '610412.00', kredit: '500000.00', saldo_akhir: '10110412.00' },
      { kode: '2121', saldo_awal: '0.00', debit: '300000.00', kredit: '300000.00', saldo_akhir: '0.00' },
    ]);
  });

  it('hutang upah lunas dan umur piutang kosong', async () => {
    expect(await sebagai(viewer, 'select * from public.v_hutang_upah_supir')).toEqual([]);
    expect(await sebagai(viewer, "select * from public.laporan_umur_piutang('2026-03-20')")).toEqual([]);
  });

  it('omzet tahunan vs batas PP 55', async () => {
    const [o] = await sebagai(viewer, 'select * from public.laporan_omzet(2026)');
    expect(o).toEqual({ tahun: 2026, omzet: '1417500.00', batas_omzet: '4800000000.00', persen: '0.03', pp55_aktif: true });
  });
});
