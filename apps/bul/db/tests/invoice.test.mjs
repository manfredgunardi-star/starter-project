import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSj, buatSjSelesai, terbitkan } from './fixtures.mjs';

let owner, ops, keu;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
});
afterAll(tutup);

describe('terbitkan invoice', () => {
  it('menghitung bruto, potongan UJ, total akhir dan memposting jurnal per SJ', async () => {
    const m = await siapkanMaster(owner);
    const sj1 = await buatSjSelesai(ops, m, { qty: '10', tanggal: '2026-02-02' });
    const sj2 = await buatSjSelesai(ops, m, { qty: '12.5', tanggal: '2026-02-03', uangJalan: '450000' });
    const id = await terbitkan(keu, m, [sj1, sj2]);
    const [inv] = await sql('select * from public.invoice where id = $1', [id]);
    expect(inv).toMatchObject({
      nomor: 'SJP/001/02/2026', subtotal: '1417500.00', total_uang_jalan: '850000.00',
      total_akhir: '567500.00', status: 'terbit', saldo_awal: false,
    });
    const baris = await sql(
      'select akun_kode, debit, kredit, rute_id, truk_id, supir_id, pelanggan_id from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [inv.jurnal_id]);
    const dim = { rute_id: m.rute, truk_id: m.truk, supir_id: m.supir, pelanggan_id: m.pelanggan };
    expect(baris).toEqual([
      { akun_kode: '1121', debit: '567500.00', kredit: '0.00', rute_id: null, truk_id: null, supir_id: null, pelanggan_id: m.pelanggan },
      { akun_kode: '5150', debit: '400000.00', kredit: '0.00', ...dim },
      { akun_kode: '4100', debit: '0.00', kredit: '630000.00', ...dim },
      { akun_kode: '5150', debit: '450000.00', kredit: '0.00', ...dim },
      { akun_kode: '4100', debit: '0.00', kredit: '787500.00', ...dim },
    ]);
    const sjs = await sql('select invoice_id from public.surat_jalan where id = any($1)', [[sj1, sj2]]);
    expect(sjs.every((s) => s.invoice_id === id)).toBe(true);
    const ib = await sql('select jumlah from public.invoice_baris where invoice_id = $1 order by jumlah', [id]);
    expect(ib.map((r) => r.jumlah)).toEqual(['630000.00', '787500.00']);
  });

  it('tarif dipilih menurut tanggal SJ', async () => {
    const m = await siapkanMaster(owner);
    await sebagai(keu, 'select public.simpan_tarif($1, $2, $3, $4, $5)', [m.pelanggan, m.rute, m.material, '2026-03-01', '70000']);
    const lama = await buatSjSelesai(ops, m, { qty: '1', tanggal: '2026-02-28' });
    const baru = await buatSjSelesai(ops, m, { qty: '1', tanggal: '2026-03-01' });
    const rows = await sebagai(keu, 'select nomor, harga_satuan, masalah from public.pratinjau_invoice($1, $2, $3) order by tanggal', [m.lini, m.pelanggan, [lama, baru]]);
    expect(rows.map((r) => r.harga_satuan)).toEqual(['63000.00', '70000.00']);
    expect(rows.every((r) => r.masalah === null)).toBe(true);
  });

  it('pratinjau melaporkan masalah dan penerbitan menolak', async () => {
    const m = await siapkanMaster(owner);
    const belumSelesai = await buatSj(ops, m);
    const tanpaTarif = await buatSjSelesai(ops, m, { tanggal: '2026-01-01' });
    await sql('delete from public.tarif where pelanggan_id = $1', [m.pelanggan]);
    const rows = await sebagai(keu, 'select masalah from public.pratinjau_invoice($1, $2, $3)', [m.lini, m.pelanggan, [belumSelesai, tanpaTarif]]);
    // 'SJ … berstatus berangkat' < 'Tarif belum ada …' secara leksikal
    expect(rows.map((r) => r.masalah).sort()).toEqual([
      expect.stringContaining('berstatus berangkat'),
      expect.stringContaining('Tarif belum ada'),
    ]);
    await expect(terbitkan(keu, m, [belumSelesai, tanpaTarif])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ yang sama tidak bisa masuk dua invoice', async () => {
    const m = await siapkanMaster(owner);
    const sj = await buatSjSelesai(ops, m);
    await terbitkan(keu, m, [sj]);
    await expect(terbitkan(keu, m, [sj])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ pelanggan lain ditolak', async () => {
    const a = await siapkanMaster(owner);
    const b = await siapkanMaster(owner);
    const sjB = await buatSjSelesai(ops, b);
    await expect(terbitkan(keu, a, [sjB])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('nomor manual dipakai apa adanya; nomor aktif ganda ditolak', async () => {
    const m = await siapkanMaster(owner);
    const nomor = `SJP/${unik('')}/04/2026`;
    await terbitkan(keu, m, [await buatSjSelesai(ops, m)], { nomor });
    await expect(terbitkan(keu, m, [await buatSjSelesai(ops, m)], { nomor })).rejects.toMatchObject({ code: '23505' });
  });

  it('menolak bila uang jalan melebihi subtotal', async () => {
    const m = await siapkanMaster(owner);
    const sj = await buatSjSelesai(ops, m, { qty: '1', uangJalan: '100000' });
    await expect(terbitkan(keu, m, [sj])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('menolak tanggal invoice sebelum tanggal SJ terakhir', async () => {
    const m = await siapkanMaster(owner);
    const sj = await buatSjSelesai(ops, m, { tanggal: '2026-02-20' });
    await expect(terbitkan(keu, m, [sj], { tanggal: '2026-02-19' })).rejects.toMatchObject({ code: 'P0001' });
  });

  it('operasional tidak boleh menerbitkan invoice', async () => {
    const m = await siapkanMaster(owner);
    const sj = await buatSjSelesai(ops, m);
    await expect(terbitkan(ops, m, [sj])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('batalkan invoice', () => {
  it('membalik jurnal, melepas SJ, dan nomor boleh dipakai ulang', async () => {
    const m = await siapkanMaster(owner);
    const sj = await buatSjSelesai(ops, m);
    const nomor = `SJP/${unik('')}/02/2026`;
    const id = await terbitkan(keu, m, [sj], { nomor });
    await expect(sebagai(ops, "select public.batalkan_sj($1, 'x', '2026-02-11')", [sj])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(keu, "select public.batalkan_invoice($1, 'dobel simpan', '2026-02-11')", [id]);
    const [inv] = await sql('select status, jurnal_id, jurnal_batal_id from public.invoice where id = $1', [id]);
    expect(inv.status).toBe('batal');
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [inv.jurnal_id]);
    expect(j.dibalik_oleh_id).toBe(inv.jurnal_batal_id);
    const [s] = await sql('select invoice_id from public.surat_jalan where id = $1', [sj]);
    expect(s.invoice_id).toBeNull();
    const [{ n }] = await sql('select count(*)::int as n from public.invoice_baris where invoice_id = $1 and aktif', [id]);
    expect(n).toBe(0);
    await expect(terbitkan(keu, m, [sj], { nomor, tanggal: '2026-02-12' })).resolves.toBeTruthy();
  });

  it('alasan wajib; batal dua kali ditolak', async () => {
    const m = await siapkanMaster(owner);
    const id = await terbitkan(keu, m, [await buatSjSelesai(ops, m)]);
    await expect(sebagai(keu, "select public.batalkan_invoice($1, ' ', '2026-02-11')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-11')", [id]);
    await expect(sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-11')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});
