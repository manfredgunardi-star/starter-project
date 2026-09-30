import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSjSelesai } from './fixtures.mjs';

let owner, keu, m, pengurus;

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

const kas = (uid, baris, { tanggal = '2026-03-10', akun = '1112', ket = 'Bayar komisi' } = {}) =>
  sebagai(uid, 'select public.catat_kas($1, $2, $3, $4, $5) as id', ['keluar', tanggal, akun, ket, JSON.stringify(baris)])
    .then((r) => r[0].id);

const saldoKomisi = async (id) => {
  const rows = await sql('select saldo from public.v_hutang_komisi_pengurus where pengurus_id = $1', [id]);
  return rows[0]?.saldo ?? null;
};

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
  // Satu pengurus aktif -> buat_sj mengisi pengurus_id otomatis.
  const p = await satu(owner, 'select public.simpan_pengurus(p_id => null, p_nama => $1) as id', ['Pengurus Uji']);
  pengurus = p.id;
  // Rute SJ diberi tipe rute + aturan komisi supaya SJ selesai memposting hutang komisi.
  const t = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
  const [r] = await sql('select nama, asal, tujuan from public.rute where id = $1', [m.rute]);
  await sebagai(owner,
    'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4, p_aktif => true, p_tipe_rute_id => $5)',
    [m.rute, r.nama, r.asal, r.tujuan, t.id]);
  await sebagai(owner,
    'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4)',
    [unik('KOMISI-'), t.id, '2026-01-01', '25000']);
  await buatSjSelesai(owner, m, { tanggal: '2026-02-05', tanggalSelesai: '2026-02-05' });
});
afterAll(tutup);

describe('pembayaran hutang komisi pengurus lewat kas', () => {
  it('SJ selesai menimbulkan hutang komisi atas nama pengurus', async () => {
    expect(await saldoKomisi(pengurus)).toBe('25000.00');
  });

  it('menolak baris 2125 tanpa pengurus_id', async () => {
    await expect(kas(keu, [{ akun_kode: '2125', jumlah: '25000' }]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('pembayaran dengan pengurus_id menghabiskan saldo pengurus itu', async () => {
    await kas(keu, [{ akun_kode: '2125', jumlah: '25000', pengurus_id: pengurus }]);
    expect(await saldoKomisi(pengurus)).toBe(null);
  });

  it('dimensi pengurus tersimpan di baris kas dan di jurnal', async () => {
    const id = await kas(keu, [{ akun_kode: '2125', jumlah: '10000', pengurus_id: pengurus }], { ket: 'Bayar komisi 2' });
    const [b] = await sql('select pengurus_id from public.transaksi_kas_baris where transaksi_id = $1', [id]);
    expect(b.pengurus_id).toBe(pengurus);
    const [t] = await sql('select jurnal_id from public.transaksi_kas where id = $1', [id]);
    const baris = await sql(
      'select akun_kode, pengurus_id from public.jurnal_baris where jurnal_id = $1 and akun_kode = $2', [t.jurnal_id, '2125']);
    expect(baris).toEqual([{ akun_kode: '2125', pengurus_id: pengurus }]);
  });
});
