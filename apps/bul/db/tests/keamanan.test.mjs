import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, sebagaiAnon, tutup } from './helpers.mjs';

beforeAll(async () => {
  await resetDb();
});
afterAll(tutup);

const RPC_TULIS = [
  'atur_kunci_periode', 'atur_pengaturan_posting', 'atur_profil', 'batalkan_invoice', 'batalkan_jurnal_manual',
  'batalkan_kas', 'batalkan_pembayaran', 'batalkan_saldo_awal', 'batalkan_sj', 'buat_jurnal_manual',
  'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'posting_saldo_awal', 'pratinjau_bonus',
  'pratinjau_invoice',
  'selesaikan_sj', 'simpan_akun', 'simpan_aturan_bonus', 'simpan_aturan_komisi', 'simpan_aturan_upah', 'simpan_lini',
  'simpan_material', 'simpan_pelanggan', 'simpan_pengaturan_pajak', 'simpan_pengurus', 'simpan_rute', 'simpan_supir',
  'simpan_tarif', 'simpan_tipe_rute', 'simpan_truk', 'simpan_uang_jalan_rute', 'terbitkan_invoice', 'transfer_kas',
  'ubah_sj',
];
const FUNGSI_BACA = [
  'bonus_berlaku', 'cek_saldo_awal_piutang', 'kategori_akun', 'komisi_berlaku', 'laporan_laba_dimensi',
  'laporan_laba_rugi', 'laporan_neraca', 'laporan_omzet', 'laporan_saldo_akun', 'laporan_umur_piutang',
  'pajak_berlaku', 'peran_saya', 'saran_pph_invoice', 'tarif_berlaku', 'uang_jalan_berlaku', 'upah_berlaku',
];

describe('inventaris', () => {
  it('fungsi di schema public persis sesuai daftar', async () => {
    const rows = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public'`);
    expect(rows.map((r) => r.proname).sort()).toEqual([...RPC_TULIS, ...FUNGSI_BACA].sort());
  });
});

describe('tabel', () => {
  it('RLS aktif, authenticated hanya SELECT, anon tanpa akses', async () => {
    const rows = await sql(`
      select c.relname, c.relrowsecurity as rls,
        has_table_privilege('authenticated', c.oid, 'SELECT') as a_sel,
        has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
          or has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE') as a_tulis,
        has_table_privilege('anon', c.oid, 'SELECT') as anon_sel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`);
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      expect({ tabel: r.relname, rls: r.rls, a_sel: r.a_sel, a_tulis: r.a_tulis, anon_sel: r.anon_sel })
        .toEqual({ tabel: r.relname, rls: true, a_sel: true, a_tulis: false, anon_sel: false });
    }
  });

  it('view memakai security_invoker dan tertutup untuk anon', async () => {
    const rows = await sql(`
      select c.relname, coalesce(c.reloptions, '{}') as opsi, has_table_privilege('anon', c.oid, 'SELECT') as anon_sel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'`);
    expect(rows.map((r) => r.relname).sort()).toEqual(['v_buku_besar', 'v_hutang_komisi_pengurus', 'v_hutang_upah_supir', 'v_invoice_saldo']);
    for (const r of rows) {
      expect({ v: r.relname, inv: r.opsi.includes('security_invoker=true'), anon: r.anon_sel })
        .toEqual({ v: r.relname, inv: true, anon: false });
    }
  });
});

describe('fungsi', () => {
  it('tidak ada fungsi public/internal yang bisa dieksekusi PUBLIC atau anon', async () => {
    const rows = await sql(`
      select n.nspname || '.' || p.proname as f,
        p.proacl is null as acl_default,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'internal')`);
    for (const r of rows) {
      expect({ f: r.f, acl_default: r.acl_default, public_exec: r.public_exec, anon_exec: r.anon_exec })
        .toEqual({ f: r.f, acl_default: false, public_exec: false, anon_exec: false });
    }
  });

  it('semua SECURITY DEFINER menetapkan search_path', async () => {
    const rows = await sql(`
      select n.nspname || '.' || p.proname as f, coalesce(array_to_string(p.proconfig, ','), '') as cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'internal') and p.prosecdef`);
    for (const r of rows) expect({ f: r.f, ok: r.cfg.includes('search_path=') }).toEqual({ f: r.f, ok: true });
  });

  it('setiap RPC tulis adalah SECURITY DEFINER dan memanggil wajib_peran', async () => {
    const rows = await sql(`
      select p.proname, p.prosecdef, p.prosrc like '%internal.wajib_peran(%' as cek
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1)`, [RPC_TULIS]);
    expect(rows.length).toBe(RPC_TULIS.length);
    for (const r of rows) expect({ f: r.proname, d: r.prosecdef, c: r.cek }).toEqual({ f: r.proname, d: true, c: true });
  });

  it('authenticated tidak punya akses ke schema internal', async () => {
    const [r] = await sql("select has_schema_privilege('authenticated', 'internal', 'USAGE') as u");
    expect(r.u).toBe(false);
  });
});

describe('perilaku', () => {
  const CONTOH = [
    'select public.simpan_truk(p_id => null, p_nopol => $$B 1$$)',
    'select public.buat_sj(null, null, null, null, null, null, null, null, null)',
    'select public.terbitkan_invoice(null, null, null, null)',
    'select public.catat_pembayaran(null, null, null, null, null, null)',
    'select public.catat_kas(null, null, null, null, null)',
    'select public.posting_saldo_awal(null, null)',
  ];

  it('pengguna nonaktif dan viewer ditolak di semua contoh RPC tulis', async () => {
    const nonaktif = await buatPengguna('owner', false);
    const viewer = await buatPengguna('viewer');
    for (const q of CONTOH) {
      await expect(sebagai(nonaktif, q)).rejects.toMatchObject({ code: '42501' });
      await expect(sebagai(viewer, q)).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('anon ditolak memanggil RPC dan membaca tabel', async () => {
    for (const q of CONTOH) await expect(sebagaiAnon(q)).rejects.toMatchObject({ code: '42501' });
    await expect(sebagaiAnon('select * from public.jurnal')).rejects.toMatchObject({ code: '42501' });
  });

  it('pengguna nonaktif tidak melihat data keuangan', async () => {
    const nonaktif = await buatPengguna('keuangan', false);
    expect(await sebagai(nonaktif, 'select kode from public.akun limit 1')).toEqual([]);
    expect(await sebagai(nonaktif, 'select id from public.jurnal limit 1')).toEqual([]);
  });
});
