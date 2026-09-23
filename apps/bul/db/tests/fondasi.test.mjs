import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { pastikanLokal } from '../koneksi.mjs';
import { sql, buatAuthUser, buatPengguna, sebagai, sebagaiAnon, tutup } from './helpers.mjs';

beforeAll(async () => {
  await resetDb();
});
afterAll(tutup);

describe('pagar koneksi', () => {
  it('menolak host non-lokal', () => {
    expect(() => pastikanLokal('postgresql://u:p@db.contoh.supabase.co:5432/postgres')).toThrow(/non-lokal/);
  });
});

describe('profil dan peran', () => {
  it('pengguna Auth baru otomatis mendapat profil viewer nonaktif', async () => {
    const id = await buatAuthUser();
    const [p] = await sql('select peran, aktif from public.profil where id = $1', [id]);
    expect(p).toEqual({ peran: 'viewer', aktif: false });
  });

  it('peran_saya mengembalikan null untuk nonaktif dan peran untuk aktif', async () => {
    const nonaktif = await buatPengguna('keuangan', false);
    const owner = await buatPengguna('owner');
    expect((await sebagai(nonaktif, 'select public.peran_saya() as p'))[0].p).toBeNull();
    expect((await sebagai(owner, 'select public.peran_saya() as p'))[0].p).toBe('owner');
  });

  it('owner mengaktifkan pengguna lain dan tercatat di audit', async () => {
    const owner = await buatPengguna('owner');
    const baru = await buatAuthUser();
    await sebagai(owner, 'select public.atur_profil(p_id => $1, p_peran => $2, p_aktif => $3, p_nama => $4)', [
      baru, 'keuangan', true, 'Staf Keuangan',
    ]);
    const [p] = await sql('select peran, aktif, nama from public.profil where id = $1', [baru]);
    expect(p).toEqual({ peran: 'keuangan', aktif: true, nama: 'Staf Keuangan' });
    const audit = await sql("select aksi, pengguna_id from public.audit_log where entitas = 'profil' and entitas_id = $1", [baru]);
    expect(audit).toEqual([{ aksi: 'atur_profil', pengguna_id: owner }]);
  });

  it('non-owner ditolak 42501', async () => {
    const keu = await buatPengguna('keuangan');
    const lain = await buatAuthUser();
    await expect(
      sebagai(keu, 'select public.atur_profil(p_id => $1, p_peran => $2, p_aktif => $3, p_nama => null)', [lain, 'owner', true]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('owner tidak boleh menurunkan atau menonaktifkan dirinya sendiri', async () => {
    const owner = await buatPengguna('owner');
    await expect(
      sebagai(owner, 'select public.atur_profil(p_id => $1, p_peran => $2, p_aktif => $3, p_nama => null)', [owner, 'viewer', true]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      sebagai(owner, 'select public.atur_profil(p_id => $1, p_peran => $2, p_aktif => $3, p_nama => null)', [owner, 'owner', false]),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('peran tidak dikenal ditolak 23514', async () => {
    const owner = await buatPengguna('owner');
    const lain = await buatAuthUser();
    await expect(
      sebagai(owner, 'select public.atur_profil(p_id => $1, p_peran => $2, p_aktif => $3, p_nama => null)', [lain, 'dewa', true]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('anon tidak bisa memanggil RPC', async () => {
    await expect(
      sebagaiAnon('select public.atur_profil(p_id => null, p_peran => $1, p_aktif => true, p_nama => null)', ['owner']),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('hak akses tabel', () => {
  it('authenticated tidak bisa menulis profil langsung', async () => {
    const owner = await buatPengguna('owner');
    await expect(sebagai(owner, "update public.profil set peran = 'owner'")).rejects.toMatchObject({ code: '42501' });
  });

  it('anon tidak bisa membaca profil', async () => {
    await expect(sebagaiAnon('select * from public.profil')).rejects.toMatchObject({ code: '42501' });
  });

  it('pengguna nonaktif tidak melihat baris apa pun', async () => {
    const nonaktif = await buatPengguna('owner', false);
    expect(await sebagai(nonaktif, 'select id from public.profil')).toEqual([]);
  });
});

describe('penomoran', () => {
  it('nomor_berikut berurutan per kunci', async () => {
    const [a] = await sql("select internal.nomor_berikut('uji-a') as n");
    const [b] = await sql("select internal.nomor_berikut('uji-a') as n");
    const [c] = await sql("select internal.nomor_berikut('uji-b') as n");
    expect([a.n, b.n, c.n]).toEqual([1, 2, 1]);
  });
});
