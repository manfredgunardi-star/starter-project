# Bonus Supir & Pengurus — Rencana Implementasi (Database)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan perhitungan bonus supir & pengurus yang dihitung sekali per bulan dan diposting sebagai satu jurnal, serta menutup cacat dimensi pengurus di modul kas yang membuat hutang komisi tidak pernah bisa dilunasi dengan benar.

**Architecture:** Semua logika tulis hidup di RPC Postgres atomik; browser tidak punya hak tulis tabel. Perhitungan bonus terpusat di satu fungsi `internal.hitung_bonus_baris(periode)` yang dipakai bersama oleh pratinjau dan posting, sehingga tidak ada dua rumus yang bisa berbeda. Idempotensi dibaca langsung dari tabel `jurnal` (`sumber_tipe = 'bonus'` yang belum dibalik), bukan dari tabel status tersendiri.

**Tech Stack:** PostgreSQL 17 (Supabase lokal di `127.0.0.1:54322`), migrasi SQL polos di `apps/bul/supabase/migrations/`, uji Vitest 5 + `pg` di `apps/bul/db/tests/`.

**Spec:** [`docs/superpowers/specs/2026-09-24-perhitungan-bonus-design.md`](../specs/2026-09-24-perhitungan-bonus-design.md)

## Global Constraints

- Semua perintah dijalankan dari `apps/bul` kecuali disebut lain. DB lokal: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Uang `numeric(18,2)`, qty `numeric(12,3)`. Tidak ada float di mana pun. Nilai uang dikirim dari test sebagai **string**.
- Setiap RPC tulis di schema `public` wajib `security definer`, `set search_path = ''`, dan memanggil `internal.wajib_peran(...)`. Gerbang katalog di `db/tests/keamanan.test.mjs` memeriksa ini untuk semua fungsi.
- Setiap file migrasi diakhiri `select internal.terapkan_hak_akses();`. Memanggilnya lebih dari sekali dalam satu file tidak berbahaya (idempoten) — saat sebuah task menambahkan blok SQL ke file yang sudah ada, blok baru itu diakhiri pemanggilannya sendiri.
- `db/tests/keamanan.test.mjs` memuat **daftar tertutup** nama fungsi (`RPC_TULIS`, `FUNGSI_BACA`) dan view. Setiap task yang menambah fungsi/view publik **wajib memperbarui daftar itu di commit yang sama**, kalau tidak seluruh suite langsung merah.
- Jurnal tidak bisa diubah/dihapus; koreksi selalu lewat jurnal pembalik.
- Dilarang menjalankan `npx supabase start` / `stop`. `npx supabase status` boleh. `npm run db:reset` aman dan idempoten.
- Tidak ada `git push`, tidak ada deploy, tidak ada migrasi ke Supabase produksi.
- Kalau terjadi bentrok toolchain atau ada instruksi plan yang bertabrakan dengan keadaan kode sebenarnya: **BERHENTI dan LAPOR**, jangan improvisasi.

## Verifikasi awal (sebelum Task 1)

- [ ] **Catat baseline sendiri.** Jalankan `npm run test:db` dari `apps/bul` dan **catat jumlah tes dan jumlah berkas yang lulus**. Angka inilah baseline; setiap task nanti menambah di atasnya. Jangan memakai angka yang mungkin muncul di dokumen lain — hitung sendiri.
- [ ] Jalankan `git status --short --untracked-files=all` dan pastikan kosong. Kalau ada berkas `supabase/snippets/Untitled query *.sql`, itu artefak Supabase Studio yang sudah di-gitignore; kalau muncul sebagai untracked, LAPOR sebelum lanjut.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `apps/bul/supabase/migrations/20260924000100_kas_dimensi_pengurus.sql` | **Baru.** Kolom `pengurus_id` di `transaksi_kas_baris`, dan `catat_kas` meneruskannya ke jurnal + dua guard dimensi. Hanya perbaikan cacat, tidak ada fitur bonus. |
| `apps/bul/supabase/migrations/20260924000200_bonus.sql` | **Baru, ditulis bertahap di Task 2–4.** Skema `aturan_bonus`, kolom `material.standar_bongkar`, akun 5135/2126, RPC bonus, trigger penjaga, view `v_hutang_bonus`. |
| `apps/bul/db/tests/kas-pengurus.test.mjs` | **Baru.** Regresi cacat komisi: pembayaran 2125 wajib `pengurus_id` dan benar-benar mengurangi saldo pengurus. |
| `apps/bul/db/tests/bonus.test.mjs` | **Baru, ditulis bertahap di Task 2–4.** Seluruh uji bonus. |
| `apps/bul/db/tests/keamanan.test.mjs` | **Diubah di Task 2, 3, 4.** Daftar katalog fungsi dan view. |

---

### Task 1: Dimensi pengurus di modul kas

**Files:**
- Create: `apps/bul/supabase/migrations/20260924000100_kas_dimensi_pengurus.sql`
- Test: `apps/bul/db/tests/kas-pengurus.test.mjs`

**Interfaces:**
- Consumes: `public.catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb)` yang sudah ada; `public.pengurus`, `public.v_hutang_komisi_pengurus`, `public.aturan_komisi` dari migrasi komisi.
- Produces: kolom `public.transaksi_kas_baris.pengurus_id`; `catat_kas` menerima kunci `pengurus_id` pada setiap elemen `p_baris` dan meneruskannya sebagai dimensi jurnal. Dua guard baru: akun hutang komisi pengurus wajib `pengurus_id`, akun hutang bonus wajib `supir_id` atau `pengurus_id` (guard kedua tidur sampai Task 2 menambahkan pengaturan posting `hutang_bonus`).

- [ ] **Step 1: Tulis berkas migrasi**

Buat `apps/bul/supabase/migrations/20260924000100_kas_dimensi_pengurus.sql` berisi persis:

```sql
-- Perbaikan: dimensi pengurus tidak pernah masuk modul kas ketika komisi pengurus dibuat.
-- Akibatnya pelunasan 2125 Hutang Komisi Pengurus menghasilkan baris jurnal tanpa pengurus_id,
-- sehingga v_hutang_komisi_pengurus menaruhnya di baris NULL dan saldo pengurus tidak pernah berkurang.

alter table public.transaksi_kas_baris add column pengurus_id uuid references public.pengurus (id);

create or replace function public.catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_kas public.akun;
  v_akun public.akun;
  v_b jsonb;
  v_jml numeric;
  v_total numeric := 0;
  v_jurnal_baris jsonb := '[]'::jsonb;
  v_piutang text;
  v_hutang_upah text;
  v_hutang_komisi text;
  v_hutang_bonus text;
  v_jurnal uuid;
  v_awalan text;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_jenis is null or p_jenis not in ('keluar', 'masuk') then
    raise exception 'Jenis harus keluar atau masuk; gunakan transfer_kas untuk transfer' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan wajib diisi' using errcode = 'P0001';
  end if;
  v_kas := internal.wajib_akun_kas(p_akun_kas_kode);
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    raise exception 'Minimal satu baris' using errcode = 'P0001';
  end if;
  v_piutang := internal.akun_posting('piutang_usaha');
  v_hutang_upah := internal.akun_posting('hutang_upah_sopir');
  -- Pencarian lunak: kunci posting yang belum ada tidak boleh mematikan catat_kas.
  -- 'hutang_bonus' baru muncul pada migrasi bonus; sampai saat itu guard-nya tidak aktif
  -- karena perbandingan dengan NULL selalu menghasilkan NULL (bukan true).
  select pp.akun_kode into v_hutang_komisi from public.pengaturan_posting pp where pp.kunci = 'hutang_komisi_pengurus';
  select pp.akun_kode into v_hutang_bonus from public.pengaturan_posting pp where pp.kunci = 'hutang_bonus';

  for v_b in select value from jsonb_array_elements(p_baris) loop
    select * into v_akun from public.akun where kode = v_b ->> 'akun_kode';
    if not found then
      raise exception 'Akun % tidak ada', v_b ->> 'akun_kode' using errcode = 'P0001';
    end if;
    if v_akun.kas_bank then
      raise exception 'Gunakan transfer_kas untuk memindahkan dana antar kas/bank' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_piutang then
      raise exception 'Penerimaan piutang dicatat lewat Pembayaran' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_upah and nullif(v_b ->> 'supir_id', '') is null then
      raise exception 'Pembayaran upah wajib memilih supir' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_komisi and nullif(v_b ->> 'pengurus_id', '') is null then
      raise exception 'Pembayaran komisi pengurus wajib memilih pengurus' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_bonus
       and nullif(v_b ->> 'supir_id', '') is null and nullif(v_b ->> 'pengurus_id', '') is null then
      raise exception 'Pembayaran bonus wajib memilih supir atau pengurus' using errcode = 'P0001';
    end if;
    v_jml := nullif(v_b ->> 'jumlah', '')::numeric;
    if v_jml is null or v_jml <= 0 then
      raise exception 'Jumlah setiap baris harus lebih dari 0' using errcode = 'P0001';
    end if;
    v_total := v_total + v_jml;
    v_jurnal_baris := v_jurnal_baris || jsonb_build_array(
      jsonb_build_object(
        'akun_kode', v_akun.kode,
        case when p_jenis = 'keluar' then 'debit' else 'kredit' end, v_jml,
        'keterangan', coalesce(nullif(trim(v_b ->> 'keterangan'), ''), trim(p_keterangan)),
        'lini_kode', v_b ->> 'lini_kode', 'truk_id', v_b ->> 'truk_id', 'supir_id', v_b ->> 'supir_id',
        'pengurus_id', v_b ->> 'pengurus_id'));
  end loop;

  v_jurnal_baris := v_jurnal_baris || jsonb_build_array(jsonb_build_object(
    'akun_kode', v_kas.kode,
    case when p_jenis = 'keluar' then 'kredit' else 'debit' end, v_total,
    'keterangan', trim(p_keterangan)));

  v_awalan := case when p_jenis = 'keluar' then 'KK' else 'KM' end;
  v_nomor := v_awalan || '-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('kas-' || v_awalan || '-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_jurnal := internal.posting_jurnal(p_tanggal, v_nomor || ' ' || trim(p_keterangan), 'kas', v_id, v_jurnal_baris);

  insert into public.transaksi_kas (id, nomor, jenis, tanggal, akun_kas_kode, total, keterangan, jurnal_id, dibuat_oleh)
  values (v_id, v_nomor, p_jenis, p_tanggal, v_kas.kode, v_total, trim(p_keterangan), v_jurnal, v_uid);

  insert into public.transaksi_kas_baris (transaksi_id, urutan, akun_kode, jumlah, keterangan, lini_kode, truk_id, supir_id, pengurus_id)
  select v_id, e.ord, e.val ->> 'akun_kode', (e.val ->> 'jumlah')::numeric,
         coalesce(nullif(trim(e.val ->> 'keterangan'), ''), trim(p_keterangan)),
         nullif(e.val ->> 'lini_kode', ''), nullif(e.val ->> 'truk_id', '')::uuid,
         nullif(e.val ->> 'supir_id', '')::uuid, nullif(e.val ->> 'pengurus_id', '')::uuid
    from jsonb_array_elements(p_baris) with ordinality as e(val, ord);

  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'jenis', p_jenis, 'total', v_total));
  return v_id;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 2: Tulis uji regresi yang gagal**

Buat `apps/bul/db/tests/kas-pengurus.test.mjs` berisi persis:

```javascript
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
```

- [ ] **Step 3: Jalankan uji untuk memastikan gagal**

Dari `apps/bul`:

```bash
npx vitest run --config db/vitest.config.mjs db/tests/kas-pengurus.test.mjs
```

Harapan: **GAGAL**. Berkas migrasi memang sudah ditulis di Step 1, tetapi `resetDb()` baru menerapkannya saat tes jalan — jadi jalankan dulu dan baca hasilnya. Kalau semua langsung lulus, berarti `resetDb()` sudah menerapkan migrasi baru dan langkah ini hanya konfirmasi; catat itu apa adanya dan lanjut. Kalau gagal dengan `column "pengurus_id" does not exist`, berarti migrasi tidak terbaca — LAPOR.

- [ ] **Step 4: Jalankan seluruh suite DB**

```bash
npm run test:db
```

Harapan: seluruh berkas lulus, dengan **4 tes lebih banyak** dari baseline yang Anda catat di Verifikasi awal, dan **1 berkas lebih banyak**.

Kalau seluruh berkas gagal serempak dengan `Error: Vitest failed to find the runner` dan 0 tes jalan: itu kegagalan transien yang sudah pernah terjadi. **Jalankan ulang perintah yang sama sekali lagi sebelum mendiagnosis apa pun.**

- [ ] **Step 5: Commit**

```bash
git add apps/bul/supabase/migrations/20260924000100_kas_dimensi_pengurus.sql apps/bul/db/tests/kas-pengurus.test.mjs
git commit -m "fix(bul): dimensi pengurus di modul kas agar hutang komisi bisa dilunasi"
```

---

### Task 2: Skema bonus dan master data

**Files:**
- Create: `apps/bul/supabase/migrations/20260924000200_bonus.sql`
- Create: `apps/bul/db/tests/bonus.test.mjs`
- Modify: `apps/bul/db/tests/keamanan.test.mjs`

**Interfaces:**
- Consumes: `internal.wajib_peran`, `internal.catat_audit`, `public.material`, `public.pengaturan_posting`, `public.akun`.
- Produces:
  - tabel `public.aturan_bonus (id uuid, nama text, jenis text, ambang int, nominal numeric, berlaku_mulai date, aktif boolean)`;
  - kolom `public.material.standar_bongkar numeric(12,3)`;
  - `public.simpan_aturan_bonus(p_id uuid, p_nama text, p_jenis text, p_ambang int, p_nominal numeric, p_berlaku_mulai date, p_aktif boolean default true) returns uuid`;
  - `public.simpan_material(p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true, p_standar_bongkar numeric default null) returns uuid` — **tanda tangan berubah**, fungsi lama di-drop;
  - `public.bonus_berlaku(p_jenis text, p_tanggal date) returns table (ambang int, nominal numeric)` — **set-returning**: nol baris berarti tidak ada aturan yang berlaku;
  - akun `5135`, `2126`; kunci posting `beban_bonus`, `hutang_bonus`.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `apps/bul/db/tests/bonus.test.mjs` berisi persis:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, ops, m;

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

const simpanAturan = (uid, { nama = unik('BONUS-'), jenis, ambang = null, nominal, mulai = '2026-01-01', aktif = true, id = null } = {}) =>
  satu(uid,
    `select public.simpan_aturan_bonus(p_id => $1, p_nama => $2, p_jenis => $3, p_ambang => $4,
       p_nominal => $5, p_berlaku_mulai => $6, p_aktif => $7) as id`,
    [id, nama, jenis, ambang, nominal, mulai, aktif]).then((r) => r.id);

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  ops = await buatPengguna('operasional');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

describe('master: aturan_bonus', () => {
  it('menyimpan aturan rit harian', async () => {
    const id = await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000' });
    const [row] = await sql('select jenis, ambang, nominal, aktif from public.aturan_bonus where id = $1', [id]);
    expect(row).toEqual({ jenis: 'rit_harian_supir', ambang: 3, nominal: '30000.00', aktif: true });
  });

  it('tonase wajib tanpa ambang', async () => {
    await expect(simpanAturan(keu, { jenis: 'tonase_supir', ambang: 2, nominal: '10000' }))
      .rejects.toMatchObject({ code: 'P0001' });
    const id = await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '10000' });
    const [row] = await sql('select ambang from public.aturan_bonus where id = $1', [id]);
    expect(row).toEqual({ ambang: null });
  });

  it('jenis selain tonase wajib punya ambang minimal 1', async () => {
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: null, nominal: '500000' }))
      .rejects.toMatchObject({ code: 'P0001' });
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: 0, nominal: '500000' }))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('jenis tidak dikenal ditolak', async () => {
    await expect(simpanAturan(keu, { jenis: 'rit_mingguan_supir', ambang: 3, nominal: '1000' }))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('hanya satu aturan aktif per jenis dan tanggal berlaku', async () => {
    await simpanAturan(keu, { jenis: 'rit_bulanan_pengurus', ambang: 50, nominal: '400000', mulai: '2026-04-01' });
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_pengurus', ambang: 60, nominal: '500000', mulai: '2026-04-01' }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('operasional tidak boleh menyimpan aturan bonus', async () => {
    await expect(simpanAturan(ops, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000' }))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('update id yang tidak ada ditolak P0002', async () => {
    await expect(simpanAturan(keu, {
      id: '00000000-0000-0000-0000-000000000123', jenis: 'rit_harian_supir', ambang: 3, nominal: '30000',
    })).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('bonus_berlaku', () => {
  it('mengambil aturan terbaru yang berlaku dan kosong kalau belum ada', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-05-01' });
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '45000', mulai: '2026-07-01' });
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2026-06-15')"))
      .toEqual([{ ambang: 3, nominal: '30000.00' }]);
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2026-08-15')"))
      .toEqual([{ ambang: 3, nominal: '45000.00' }]);
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2026-04-15')")).toEqual([]);
    expect(await sql("select * from public.bonus_berlaku('tonase_supir', '2026-08-15')")).toEqual([]);
  });
});

describe('material: standar bongkar', () => {
  it('standar bongkar tersimpan dan boleh kosong', async () => {
    const a = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const [rowA] = await sql('select standar_bongkar from public.material where id = $1', [a.id]);
    expect(rowA).toEqual({ standar_bongkar: '20.000' });
    const b = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id',
      [m.lini, unik('MAT-'), 'ton']);
    const [rowB] = await sql('select standar_bongkar from public.material where id = $1', [b.id]);
    expect(rowB).toEqual({ standar_bongkar: null });
  });

  it('standar bongkar nol ditolak', async () => {
    await expect(sebagai(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4)',
      [m.lini, unik('MAT-'), 'ton', '0'])).rejects.toMatchObject({ code: '23514' });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npx vitest run --config db/vitest.config.mjs db/tests/bonus.test.mjs
```

Harapan: **GAGAL**, dengan pesan seperti `function public.simpan_aturan_bonus(...) does not exist`.

- [ ] **Step 3: Tulis berkas migrasi**

Buat `apps/bul/supabase/migrations/20260924000200_bonus.sql` berisi persis:

```sql
-- Bonus supir & pengurus: aturan, standar bongkar material, akun, dan pencarian aturan berlaku.

alter table public.material add column standar_bongkar numeric(12,3) check (standar_bongkar > 0);

create table public.aturan_bonus (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  jenis text not null check (jenis in ('rit_harian_supir', 'rit_bulanan_supir', 'tonase_supir', 'rit_bulanan_pengurus')),
  ambang int check (ambang >= 1),
  nominal numeric(18,2) not null check (nominal >= 0),
  berlaku_mulai date not null,
  aktif boolean not null default true,
  -- Bonus tonase memakai material.standar_bongkar sebagai pembanding, bukan ambang jumlah rit.
  check ((jenis = 'tonase_supir') = (ambang is null))
);
create unique index aturan_bonus_unik on public.aturan_bonus (jenis, berlaku_mulai) where aktif;

-- Jalur baca utama hitung_bonus; index yang ada hanya menutup tanggal berangkat.
create index surat_jalan_selesai_idx on public.surat_jalan (tanggal_selesai, supir_id) where status = 'selesai';

insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
  ('5135', 'Bonus Sopir & Pengurus', '5100', 'detail', 'debit', false),
  ('2126', 'Hutang Bonus', '2120', 'detail', 'kredit', false);

alter table public.pengaturan_posting drop constraint pengaturan_posting_kunci_check;
alter table public.pengaturan_posting add constraint pengaturan_posting_kunci_check check (kunci in (
  'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final',
  'beban_komisi_pengurus', 'hutang_komisi_pengurus', 'beban_bonus', 'hutang_bonus'));
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('beban_bonus', '5135', 'Bonus supir & pengurus diakui saat bonus periode diposting'),
  ('hutang_bonus', '2126', 'Hutang bonus sampai dibayar');

alter table public.jurnal drop constraint jurnal_sumber_tipe_check;
alter table public.jurnal add constraint jurnal_sumber_tipe_check check (sumber_tipe in (
  'saldo_awal', 'sj_selesai', 'invoice', 'pembayaran', 'kas', 'manual', 'pembalik', 'bonus'));

-- ---------- RPC master ----------

create function public.simpan_aturan_bonus(
  p_id uuid, p_nama text, p_jenis text, p_ambang int, p_nominal numeric, p_berlaku_mulai date,
  p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  if p_jenis = 'tonase_supir' and p_ambang is not null then
    raise exception 'Bonus tonase memakai standar bongkar material; ambang harus dikosongkan' using errcode = 'P0001';
  end if;
  if p_jenis is distinct from 'tonase_supir' and coalesce(p_ambang, 0) < 1 then
    raise exception 'Ambang jumlah rit minimal 1' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.aturan_bonus (nama, jenis, ambang, nominal, berlaku_mulai, aktif)
    values (trim(p_nama), p_jenis, p_ambang, p_nominal, p_berlaku_mulai, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_bonus
       set nama = trim(p_nama), jenis = p_jenis, ambang = p_ambang, nominal = p_nominal,
           berlaku_mulai = p_berlaku_mulai, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan bonus tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_bonus', v_id::text,
    jsonb_build_object('jenis', p_jenis, 'ambang', p_ambang, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- create or replace tidak bisa menambah parameter (akan membuat overload baru), jadi fungsi lama di-drop dulu.
drop function public.simpan_material(uuid, text, text, text, boolean);

create function public.simpan_material(
  p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true,
  p_standar_bongkar numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if not exists (select 1 from public.lini l where l.kode = p_lini_kode and l.aktif) then
    raise exception 'Lini % tidak ada atau tidak aktif', p_lini_kode using errcode = 'P0001';
  end if;
  if coalesce(trim(p_satuan), '') = '' then
    raise exception 'Satuan material wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.material (lini_kode, nama, satuan, aktif, standar_bongkar)
    values (p_lini_kode, trim(p_nama), trim(p_satuan), coalesce(p_aktif, true), p_standar_bongkar)
    returning id into v_id;
  else
    update public.material
       set lini_kode = p_lini_kode, nama = trim(p_nama), satuan = trim(p_satuan), aktif = coalesce(p_aktif, true),
           standar_bongkar = p_standar_bongkar
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Material tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'material', v_id::text,
    jsonb_build_object('nama', p_nama, 'satuan', p_satuan, 'standar_bongkar', p_standar_bongkar));
  return v_id;
end;
$$;

-- Set-returning: nol baris berarti tidak ada aturan yang berlaku, sehingga pemanggil
-- lewat cross join lateral otomatis melewatkan jenis itu tanpa error.
create function public.bonus_berlaku(p_jenis text, p_tanggal date)
returns table (ambang int, nominal numeric)
language sql stable set search_path = '' as $$
  select a.ambang, a.nominal
    from public.aturan_bonus a
   where a.aktif and a.jenis = p_jenis and a.berlaku_mulai <= p_tanggal
   order by a.berlaku_mulai desc
   limit 1
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Perbarui gerbang katalog keamanan**

Di `apps/bul/db/tests/keamanan.test.mjs`, ubah dua daftar. Tambahkan `'simpan_aturan_bonus'` ke `RPC_TULIS` dan `'bonus_berlaku'` ke `FUNGSI_BACA`, menjaga urutan alfabetis yang sudah ada. Hasilnya persis:

```javascript
const RPC_TULIS = [
  'atur_kunci_periode', 'atur_pengaturan_posting', 'atur_profil', 'batalkan_invoice', 'batalkan_jurnal_manual',
  'batalkan_kas', 'batalkan_pembayaran', 'batalkan_saldo_awal', 'batalkan_sj', 'buat_jurnal_manual',
  'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'posting_saldo_awal', 'pratinjau_invoice',
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
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

```bash
npm run test:db
```

Harapan: seluruh berkas lulus, dengan **10 tes lebih banyak** dari akhir Task 1, dan **1 berkas lebih banyak**.

Kalau `keamanan.test.mjs` gagal pada uji `fungsi di schema public persis sesuai daftar`, bandingkan daftar di pesan kegagalan dengan daftar di Step 4 — jangan menambal dengan menghapus uji.

- [ ] **Step 6: Commit**

```bash
git add apps/bul/supabase/migrations/20260924000200_bonus.sql apps/bul/db/tests/bonus.test.mjs apps/bul/db/tests/keamanan.test.mjs
git commit -m "feat(bul): skema aturan bonus, standar bongkar material, dan akun bonus"
```

---

### Task 3: Mesin perhitungan bonus

**Files:**
- Modify: `apps/bul/supabase/migrations/20260924000200_bonus.sql` (tambahkan di akhir berkas)
- Modify: `apps/bul/db/tests/bonus.test.mjs` (tambahkan di akhir berkas)
- Modify: `apps/bul/db/tests/keamanan.test.mjs`

**Interfaces:**
- Consumes: `public.bonus_berlaku(p_jenis text, p_tanggal date) returns table (ambang int, nominal numeric)` dari Task 2; `public.surat_jalan`, `public.material`, `public.supir`, `public.pengurus`.
- Produces:
  - `internal.hitung_bonus_baris(p_periode date) returns table (jenis text, penerima_jenis text, penerima_id uuid, penerima_nama text, dasar numeric, jumlah numeric)` — `penerima_jenis` bernilai `'supir'` atau `'pengurus'`;
  - `public.pratinjau_bonus(p_periode date)` dengan kolom balikan yang sama persis.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `apps/bul/db/tests/bonus.test.mjs`:

```javascript
describe('perhitungan bonus', () => {
  // Setiap skenario memakai bulan sendiri supaya tidak saling mencemari.
  const pratinjau = (uid, periode) => sebagai(uid, 'select * from public.pratinjau_bonus($1) order by jenis', [periode]);

  async function supirBaru() {
    const r = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
    return r.id;
  }

  async function sjSelesai(mm, { supir, tanggal, qtyBongkar = '10', material = null }) {
    const nomor = unik('SJ');
    const r = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [mm.lini, nomor, tanggal, mm.pelanggan, mm.rute, material ?? mm.material, mm.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [r.id, qtyBongkar, tanggal, null]);
    return r.id;
  }

  it('rit harian: di bawah ambang nol, tepat ambang dapat, di atas ambang tetap satu kali', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-09-01' });
    const kurang = await supirBaru();
    const pas = await supirBaru();
    const lebih = await supirBaru();
    for (let i = 0; i < 2; i += 1) await sjSelesai(m, { supir: kurang, tanggal: '2026-09-02' });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: pas, tanggal: '2026-09-02' });
    for (let i = 0; i < 5; i += 1) await sjSelesai(m, { supir: lebih, tanggal: '2026-09-02' });
    const rows = await pratinjau(keu, '2026-09-01');
    const harian = rows.filter((r) => r.jenis === 'rit_harian_supir');
    expect(harian.find((r) => r.penerima_id === kurang)).toBeUndefined();
    expect(harian.find((r) => r.penerima_id === pas)).toMatchObject({ dasar: '1', jumlah: '30000.00' });
    expect(harian.find((r) => r.penerima_id === lebih)).toMatchObject({ dasar: '1', jumlah: '30000.00' });
  });

  it('rit harian dihitung per hari, bukan per bulan', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '20000', mulai: '2026-10-01' });
    const s = await supirBaru();
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-05' });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-06' });
    for (let i = 0; i < 2; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-07' });
    const rows = await pratinjau(keu, '2026-10-15');
    expect(rows.find((r) => r.jenis === 'rit_harian_supir' && r.penerima_id === s))
      .toMatchObject({ dasar: '2', jumlah: '40000.00' });
  });

  it('tonase: tanpa standar dilewati, sama dengan standar nol, melebihi standar flat per SJ', async () => {
    await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '15000', mulai: '2026-11-01' });
    const tanpa = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id',
      [m.lini, unik('MAT-'), 'ton']);
    const dengan = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const a = await supirBaru();
    const b = await supirBaru();
    const c = await supirBaru();
    await sjSelesai(m, { supir: a, tanggal: '2026-11-03', qtyBongkar: '25', material: tanpa.id });
    await sjSelesai(m, { supir: b, tanggal: '2026-11-03', qtyBongkar: '20', material: dengan.id });
    await sjSelesai(m, { supir: c, tanggal: '2026-11-03', qtyBongkar: '23', material: dengan.id });
    await sjSelesai(m, { supir: c, tanggal: '2026-11-04', qtyBongkar: '30', material: dengan.id });
    const rows = await pratinjau(keu, '2026-11-01');
    const tonase = rows.filter((r) => r.jenis === 'tonase_supir');
    expect(tonase.find((r) => r.penerima_id === a)).toBeUndefined();
    expect(tonase.find((r) => r.penerima_id === b)).toBeUndefined();
    expect(tonase.find((r) => r.penerima_id === c)).toMatchObject({ dasar: '2', jumlah: '30000.00' });
  });

  it('bonus harian, tonase, dan bulanan menumpuk penuh untuk satu supir', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-12-01' });
    await simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: 6, nominal: '500000', mulai: '2026-12-01' });
    await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '10000', mulai: '2026-12-01' });
    const mat = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const s = await supirBaru();
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-12-02', qtyBongkar: '25', material: mat.id });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-12-03', qtyBongkar: '10', material: mat.id });
    const rows = (await pratinjau(keu, '2026-12-20')).filter((r) => r.penerima_id === s);
    expect(rows.map((r) => [r.jenis, r.dasar, r.jumlah])).toEqual([
      ['rit_bulanan_supir', '6', '500000.00'],
      ['rit_harian_supir', '2', '60000.00'],
      ['tonase_supir', '3', '30000.00'],
    ]);
  });

  it('SJ batal tidak ikut terhitung', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 2, nominal: '10000', mulai: '2027-01-01' });
    const s = await supirBaru();
    await sjSelesai(m, { supir: s, tanggal: '2027-01-05' });
    const batal = await sjSelesai(m, { supir: s, tanggal: '2027-01-05' });
    await sebagai(owner, 'select public.batalkan_sj($1, $2, $3)', [batal, 'Uji batal', '2027-01-06']);
    const rows = await pratinjau(keu, '2027-01-01');
    expect(rows.find((r) => r.penerima_id === s)).toBeUndefined();
  });

  it('jenis tanpa aturan tidak menghasilkan baris dan tidak melempar error', async () => {
    const s = await supirBaru();
    await sjSelesai(m, { supir: s, tanggal: '2027-02-05' });
    expect(await pratinjau(keu, '2027-02-01')).toEqual([]);
  });

  it('viewer dan operasional tidak boleh membuka pratinjau', async () => {
    const viewer = await buatPengguna('viewer');
    await expect(pratinjau(viewer, '2026-09-01')).rejects.toMatchObject({ code: '42501' });
    await expect(pratinjau(ops, '2026-09-01')).rejects.toMatchObject({ code: '42501' });
  });
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npx vitest run --config db/vitest.config.mjs db/tests/bonus.test.mjs
```

Harapan: **GAGAL** dengan `function public.pratinjau_bonus(...) does not exist`. Uji `master: aturan_bonus` dari Task 2 harus tetap lulus.

- [ ] **Step 3: Tambahkan mesin perhitungan ke migrasi**

Tambahkan di akhir `apps/bul/supabase/migrations/20260924000200_bonus.sql`:

```sql
-- ---------- Mesin perhitungan ----------
-- Satu sumber kebenaran: pratinjau dan posting sama-sama membaca fungsi ini.
-- Himpunan dasar: SJ selesai dengan tanggal_selesai di dalam bulan periode.
-- Aturan harian dan tonase dievaluasi pada tanggal kejadiannya; aturan bulanan pada akhir bulan.

create function internal.hitung_bonus_baris(p_periode date)
returns table (jenis text, penerima_jenis text, penerima_id uuid, penerima_nama text, dasar numeric, jumlah numeric)
language sql stable security definer set search_path = '' as $$
with batas as (
  select date_trunc('month', p_periode)::date as awal,
         (date_trunc('month', p_periode) + interval '1 month - 1 day')::date as akhir
),
sj as (
  select s.supir_id, s.pengurus_id, s.material_id, s.qty_bongkar, s.tanggal_selesai
    from public.surat_jalan s
    cross join batas b
   where s.status = 'selesai' and s.tanggal_selesai between b.awal and b.akhir
),
harian as (
  select s.supir_id as sid, s.tanggal_selesai as hari, count(*) as rit
    from sj s
   group by s.supir_id, s.tanggal_selesai
),
b_harian as (
  select 'rit_harian_supir'::text as j, 'supir'::text as pj, h.sid as pid,
         count(*)::numeric as d, sum(ab.nominal)::numeric as n
    from harian h
    cross join lateral public.bonus_berlaku('rit_harian_supir', h.hari) ab
   where h.rit >= ab.ambang
   group by h.sid
),
b_tonase as (
  select 'tonase_supir'::text as j, 'supir'::text as pj, s.supir_id as pid,
         count(*)::numeric as d, sum(ab.nominal)::numeric as n
    from sj s
    join public.material mt on mt.id = s.material_id
    cross join lateral public.bonus_berlaku('tonase_supir', s.tanggal_selesai) ab
   where mt.standar_bongkar is not null and s.qty_bongkar > mt.standar_bongkar
   group by s.supir_id
),
rit_supir as (
  select s.supir_id as sid, count(*) as rit from sj s group by s.supir_id
),
b_bulan_supir as (
  select 'rit_bulanan_supir'::text as j, 'supir'::text as pj, r.sid as pid,
         r.rit::numeric as d, ab.nominal::numeric as n
    from rit_supir r
    cross join batas b
    cross join lateral public.bonus_berlaku('rit_bulanan_supir', b.akhir) ab
   where r.rit >= ab.ambang
),
rit_pengurus as (
  select s.pengurus_id as pgid, count(*) as rit
    from sj s where s.pengurus_id is not null group by s.pengurus_id
),
b_bulan_pengurus as (
  select 'rit_bulanan_pengurus'::text as j, 'pengurus'::text as pj, r.pgid as pid,
         r.rit::numeric as d, ab.nominal::numeric as n
    from rit_pengurus r
    cross join batas b
    cross join lateral public.bonus_berlaku('rit_bulanan_pengurus', b.akhir) ab
   where r.rit >= ab.ambang
),
semua as (
  select * from b_harian
  union all select * from b_tonase
  union all select * from b_bulan_supir
  union all select * from b_bulan_pengurus
)
select t.j, t.pj, t.pid, coalesce(sp.nama, pg.nama), t.d, t.n
  from semua t
  left join public.supir sp on sp.id = t.pid and t.pj = 'supir'
  left join public.pengurus pg on pg.id = t.pid and t.pj = 'pengurus'
 where t.n > 0
 order by coalesce(sp.nama, pg.nama), t.j
$$;

create function public.pratinjau_bonus(p_periode date)
returns table (jenis text, penerima_jenis text, penerima_id uuid, penerima_nama text, dasar numeric, jumlah numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_periode is null then
    raise exception 'Periode wajib diisi' using errcode = 'P0001';
  end if;
  return query select * from internal.hitung_bonus_baris(p_periode);
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Perbarui gerbang katalog keamanan**

Di `apps/bul/db/tests/keamanan.test.mjs`, sisipkan `'pratinjau_bonus'` ke `RPC_TULIS` tepat sebelum `'pratinjau_invoice'`, sehingga baris ketiga daftar itu menjadi:

```javascript
  'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'posting_saldo_awal', 'pratinjau_bonus',
  'pratinjau_invoice',
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

```bash
npm run test:db
```

Harapan: seluruh berkas lulus, **7 tes lebih banyak** dari akhir Task 2, jumlah berkas sama.

- [ ] **Step 6: Commit**

```bash
git add apps/bul/supabase/migrations/20260924000200_bonus.sql apps/bul/db/tests/bonus.test.mjs apps/bul/db/tests/keamanan.test.mjs
git commit -m "feat(bul): mesin perhitungan bonus periodik dan pratinjau"
```

---

### Task 4: Posting, pembalikan, penjagaan periode, dan laporan hutang

**Files:**
- Modify: `apps/bul/supabase/migrations/20260924000200_bonus.sql` (tambahkan di akhir berkas)
- Modify: `apps/bul/db/tests/bonus.test.mjs` (tambahkan di akhir berkas)
- Modify: `apps/bul/db/tests/keamanan.test.mjs`

**Interfaces:**
- Consumes: `internal.hitung_bonus_baris` dari Task 3; `internal.posting_jurnal`, `internal.balik_jurnal`, `internal.akun_posting`, `internal.catat_audit`.
- Produces:
  - `internal.bonus_terposting(p_tanggal date) returns uuid` — id jurnal bonus aktif untuk bulan `p_tanggal`, atau NULL;
  - `public.hitung_bonus(p_periode date) returns uuid` — mengembalikan id jurnal bonus;
  - `public.batalkan_bonus(p_periode date, p_alasan text, p_tanggal date default current_date) returns uuid` — mengembalikan id jurnal pembalik;
  - trigger `sj_jaga_bonus` pada `public.surat_jalan`;
  - view `public.v_hutang_bonus (penerima_jenis, penerima_id, penerima_nama, saldo)`.

- [ ] **Step 1: Tulis uji yang gagal**

Tambahkan di akhir `apps/bul/db/tests/bonus.test.mjs`:

```javascript
describe('posting dan pembalikan bonus', () => {
  let supir;
  const hitung = (uid, periode) => satu(uid, 'select public.hitung_bonus($1) as id', [periode]).then((r) => r.id);
  const batalkan = (uid, periode, alasan = 'Koreksi data') =>
    satu(uid, 'select public.batalkan_bonus($1, $2, $3) as id', [periode, alasan, '2027-04-10']).then((r) => r.id);

  beforeAll(async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 2, nominal: '25000', mulai: '2027-03-01' });
    const r = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
    supir = r.id;
    for (let i = 0; i < 2; i += 1) {
      const nomor = unik('SJ');
      const sjId = await satu(owner,
        `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
           p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
        [m.lini, nomor, '2027-03-04', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
      await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2027-03-04', null]);
    }
  });

  it('bulan yang belum berakhir ditolak', async () => {
    const depan = new Date();
    depan.setMonth(depan.getMonth() + 1);
    const periode = `${depan.getFullYear()}-${String(depan.getMonth() + 1).padStart(2, '0')}-01`;
    await expect(hitung(keu, periode)).rejects.toMatchObject({ code: 'P0001' });
  });

  it('periode tanpa bonus ditolak, tidak membuat jurnal kosong', async () => {
    await expect(hitung(keu, '2025-06-01')).rejects.toMatchObject({ code: 'P0001' });
    expect(await sql("select id from public.jurnal where sumber_tipe = 'bonus' and tanggal = '2025-06-30'")).toEqual([]);
  });

  it('operasional tidak boleh menghitung bonus', async () => {
    await expect(hitung(ops, '2027-03-01')).rejects.toMatchObject({ code: '42501' });
  });

  it('posting menghasilkan satu jurnal seimbang bertanggal akhir bulan', async () => {
    const jurnalId = await hitung(keu, '2027-03-15');
    const [j] = await sql('select tanggal, sumber_tipe, sumber_id from public.jurnal where id = $1', [jurnalId]);
    expect(j).toEqual({ tanggal: '2027-03-31', sumber_tipe: 'bonus', sumber_id: null });
    const baris = await sql(
      'select akun_kode, debit, kredit, supir_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [jurnalId]);
    expect(baris).toEqual([
      { akun_kode: '5135', debit: '25000.00', kredit: '0.00', supir_id: supir },
      { akun_kode: '2126', debit: '0.00', kredit: '25000.00', supir_id: supir },
    ]);
  });

  it('hutang bonus muncul di v_hutang_bonus', async () => {
    const rows = await sql('select penerima_jenis, penerima_id, saldo from public.v_hutang_bonus where penerima_id = $1', [supir]);
    expect(rows).toEqual([{ penerima_jenis: 'supir', penerima_id: supir, saldo: '25000.00' }]);
  });

  it('posting kedua untuk periode yang sama ditolak', async () => {
    await expect(hitung(keu, '2027-03-01')).rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ tidak bisa diselesaikan lagi di bulan yang bonusnya sudah diposting', async () => {
    const sjId = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2027-03-20', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await expect(sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2027-03-20', null]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ yang sudah selesai tidak bisa dibatalkan di bulan yang bonusnya sudah diposting', async () => {
    const [sjLama] = await sql(
      "select id from public.surat_jalan where supir_id = $1 and status = 'selesai' and tanggal_selesai = '2027-03-04' limit 1",
      [supir]);
    await expect(sebagai(owner, 'select public.batalkan_sj($1, $2, $3)', [sjLama.id, 'Uji', '2027-04-01']))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('batalkan_bonus membalik jurnal dan mengosongkan hutang bonus', async () => {
    const pembalik = await batalkan(keu, '2027-03-01');
    const [p] = await sql('select sumber_tipe, tanggal from public.jurnal where id = $1', [pembalik]);
    expect(p).toEqual({ sumber_tipe: 'pembalik', tanggal: '2027-04-10' });
    expect(await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir])).toEqual([]);
  });

  it('batalkan_bonus pada periode yang belum diposting ditolak P0002', async () => {
    await expect(batalkan(keu, '2027-05-01')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('batalkan_bonus tanpa alasan ditolak', async () => {
    await expect(batalkan(keu, '2027-03-01', '   ')).rejects.toMatchObject({ code: 'P0001' });
  });

  it('setelah dibatalkan, periode boleh dihitung ulang', async () => {
    const jurnalId = await hitung(keu, '2027-03-01');
    expect(jurnalId).toBeTruthy();
    const rows = await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir]);
    expect(rows).toEqual([{ saldo: '25000.00' }]);
  });

  it('hutang bonus bisa dilunasi lewat kas dengan dimensi supir', async () => {
    await sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)',
      ['keluar', '2027-04-15', '1112', 'Bayar bonus', JSON.stringify([{ akun_kode: '2126', jumlah: '25000', supir_id: supir }])]);
    expect(await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir])).toEqual([]);
  });

  it('pembayaran bonus tanpa dimensi ditolak', async () => {
    await expect(sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)',
      ['keluar', '2027-04-16', '1112', 'Bayar bonus', JSON.stringify([{ akun_kode: '2126', jumlah: '1000' }])]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  // Harus menjadi uji TERAKHIR di berkas ini: mengunci periode mempengaruhi seluruh posting sesudahnya.
  it('periode yang sudah dikunci menolak posting bonus', async () => {
    const sjId = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2027-06-02', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2027-06-02', null]);
    const sjId2 = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2027-06-02', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId2.id, '10', '2027-06-02', null]);
    // Ada bonus untuk Juni 2027, jadi penolakan di bawah benar-benar datang dari penguncian periode.
    expect((await sebagai(keu, 'select * from public.pratinjau_bonus($1)', ['2027-06-01'])).length).toBeGreaterThan(0);
    await sebagai(owner, 'select public.atur_kunci_periode($1)', ['2027-06-30']);
    await expect(hitung(keu, '2027-06-01')).rejects.toMatchObject({ code: 'P0001', message: /dikunci/ });
  });
});
```

Catatan: berkas ini sudah mengimpor `beforeAll` di baris pertama, jadi `beforeAll` bersarang di dalam `describe` bisa dipakai tanpa impor tambahan.

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npx vitest run --config db/vitest.config.mjs db/tests/bonus.test.mjs
```

Harapan: **GAGAL** dengan `function public.hitung_bonus(...) does not exist`.

- [ ] **Step 3: Tambahkan posting, pembalikan, trigger, dan view ke migrasi**

Tambahkan di akhir `apps/bul/supabase/migrations/20260924000200_bonus.sql`:

```sql
-- ---------- Posting, pembalikan, penjagaan ----------
-- Idempotensi dibaca langsung dari jurnal: satu jurnal bonus aktif (belum dibalik) per bulan.

create function internal.bonus_terposting(p_tanggal date) returns uuid
language sql stable security definer set search_path = '' as $$
  select j.id
    from public.jurnal j
   where j.sumber_tipe = 'bonus'
     and j.dibalik_oleh_id is null
     and date_trunc('month', j.tanggal) = date_trunc('month', p_tanggal)
   limit 1
$$;

create function public.hitung_bonus(p_periode date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_akhir date;
  v_baris jsonb := '[]'::jsonb;
  v_r record;
  v_dim jsonb;
  v_ket text;
  v_beban text;
  v_hutang text;
  v_total numeric := 0;
  v_jurnal uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_periode is null then
    raise exception 'Periode wajib diisi' using errcode = 'P0001';
  end if;
  v_akhir := (date_trunc('month', p_periode) + interval '1 month - 1 day')::date;
  if v_akhir >= current_date then
    raise exception 'Bulan % belum berakhir; bonus baru bisa dihitung setelah %',
      to_char(v_akhir, 'MM-YYYY'), v_akhir using errcode = 'P0001';
  end if;
  if internal.bonus_terposting(v_akhir) is not null then
    raise exception 'Bonus periode % sudah diposting; batalkan dulu untuk menghitung ulang',
      to_char(v_akhir, 'MM-YYYY') using errcode = 'P0001';
  end if;
  v_beban := internal.akun_posting('beban_bonus');
  v_hutang := internal.akun_posting('hutang_bonus');
  for v_r in select * from internal.hitung_bonus_baris(v_akhir) loop
    v_dim := case when v_r.penerima_jenis = 'supir'
                  then jsonb_build_object('supir_id', v_r.penerima_id)
                  else jsonb_build_object('pengurus_id', v_r.penerima_id) end;
    v_ket := 'Bonus ' || v_r.jenis || ' ' || to_char(v_akhir, 'MM-YYYY') || ' - '
             || coalesce(v_r.penerima_nama, '?') || ' (' || trim(to_char(v_r.dasar, 'FM999999990')) || ')';
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', v_beban, 'debit', v_r.jumlah, 'keterangan', v_ket),
      v_dim || jsonb_build_object('akun_kode', v_hutang, 'kredit', v_r.jumlah, 'keterangan', v_ket));
    v_total := v_total + v_r.jumlah;
  end loop;
  if v_total <= 0 then
    raise exception 'Tidak ada bonus untuk periode %', to_char(v_akhir, 'MM-YYYY') using errcode = 'P0001';
  end if;
  v_jurnal := internal.posting_jurnal(v_akhir, 'Bonus ' || to_char(v_akhir, 'MM-YYYY'), 'bonus', null, v_baris);
  perform internal.catat_audit('hitung', 'bonus', to_char(v_akhir, 'YYYY-MM'),
    jsonb_build_object('total', v_total, 'jurnal_id', v_jurnal));
  return v_jurnal;
end;
$$;

create function public.batalkan_bonus(p_periode date, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_akhir date;
  v_jurnal uuid;
  v_pembalik uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_periode is null then
    raise exception 'Periode wajib diisi' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  v_akhir := (date_trunc('month', p_periode) + interval '1 month - 1 day')::date;
  v_jurnal := internal.bonus_terposting(v_akhir);
  if v_jurnal is null then
    raise exception 'Bonus periode % belum diposting', to_char(v_akhir, 'MM-YYYY') using errcode = 'P0002';
  end if;
  v_pembalik := internal.balik_jurnal(v_jurnal, p_tanggal,
    'Batal bonus ' || to_char(v_akhir, 'MM-YYYY') || ': ' || trim(p_alasan));
  perform internal.catat_audit('batal', 'bonus', to_char(v_akhir, 'YYYY-MM'),
    jsonb_build_object('alasan', trim(p_alasan), 'jurnal_id', v_jurnal));
  return v_pembalik;
end;
$$;

-- Penjagaan konsistensi. Dipasang sebagai trigger, bukan sebagai suntingan pada
-- selesaikan_sj/batalkan_sj, karena tidak butuh apa pun dari badan fungsi itu.
create function internal.jaga_bonus_periode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai'
     and internal.bonus_terposting(new.tanggal_selesai) is not null then
    raise exception 'Bonus periode % sudah diposting; batalkan bonus dulu sebelum menyelesaikan SJ %',
      to_char(new.tanggal_selesai, 'MM-YYYY'), new.nomor using errcode = 'P0001';
  end if;
  if new.status = 'batal' and old.status = 'selesai'
     and internal.bonus_terposting(old.tanggal_selesai) is not null then
    raise exception 'Bonus periode % sudah diposting; batalkan bonus dulu sebelum membatalkan SJ %',
      to_char(old.tanggal_selesai, 'MM-YYYY'), old.nomor using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sj_jaga_bonus before update on public.surat_jalan
for each row execute function internal.jaga_bonus_periode();

create view public.v_hutang_bonus with (security_invoker = true) as
select case when b.supir_id is not null then 'supir' else 'pengurus' end as penerima_jenis,
       coalesce(b.supir_id, b.pengurus_id) as penerima_id,
       coalesce(s.nama, p.nama) as penerima_nama,
       sum(b.kredit - b.debit)::numeric(18,2) as saldo
  from public.jurnal_baris b
  join public.pengaturan_posting pp on pp.kunci = 'hutang_bonus' and pp.akun_kode = b.akun_kode
  left join public.supir s on s.id = b.supir_id
  left join public.pengurus p on p.id = b.pengurus_id
 group by 1, 2, 3
having sum(b.kredit - b.debit) <> 0;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Perbarui gerbang katalog keamanan**

Di `apps/bul/db/tests/keamanan.test.mjs`:

1. Tambahkan `'batalkan_bonus'` dan `'hitung_bonus'` ke `RPC_TULIS` pada posisi alfabetisnya, sehingga dua baris pertama daftar itu menjadi:

```javascript
  'atur_kunci_periode', 'atur_pengaturan_posting', 'atur_profil', 'batalkan_bonus', 'batalkan_invoice',
  'batalkan_jurnal_manual', 'batalkan_kas', 'batalkan_pembayaran', 'batalkan_saldo_awal', 'batalkan_sj',
  'buat_jurnal_manual', 'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'hitung_bonus',
  'posting_saldo_awal', 'pratinjau_bonus', 'pratinjau_invoice',
```

2. Tambahkan `'v_hutang_bonus'` ke daftar view, sehingga baris itu menjadi:

```javascript
    expect(rows.map((r) => r.relname).sort()).toEqual(['v_buku_besar', 'v_hutang_bonus', 'v_hutang_komisi_pengurus', 'v_hutang_upah_supir', 'v_invoice_saldo']);
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

```bash
npm run test:db
```

Harapan: seluruh berkas lulus, **15 tes lebih banyak** dari akhir Task 3, jumlah berkas sama.

- [ ] **Step 6: Verifikasi angka sendiri, jangan percaya tes saja**

Tes di atas disalin dari plan ini, jadi kelulusannya tidak membuktikan akuntansinya benar. Jalankan pemeriksaan independen terhadap DB lokal:

```bash
node -e "const pg=require('pg');const c=new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');c.connect().then(()=>c.query(\"select sumber_tipe, sum(debit) d, sum(kredit) k from public.jurnal j join public.jurnal_baris b on b.jurnal_id=j.id where j.sumber_tipe in ('bonus','pembalik') group by 1\")).then(r=>{console.log(r.rows);return c.end()})"
```

Harapan: untuk setiap `sumber_tipe`, total debit sama dengan total kredit. Kalau tidak sama, BERHENTI dan LAPOR.

- [ ] **Step 7: Commit**

```bash
git add apps/bul/supabase/migrations/20260924000200_bonus.sql apps/bul/db/tests/bonus.test.mjs apps/bul/db/tests/keamanan.test.mjs
git commit -m "feat(bul): posting bonus bulanan, pembalikan, penjagaan periode, dan hutang bonus"
```

---

## Gerbang akhir fase database

- [ ] `npm run test:db` dari `apps/bul` — seluruh berkas hijau.
- [ ] `git status --short --untracked-files=all` kosong. Tempelkan keluaran mentahnya ke laporan, jangan diringkas.
- [ ] Laporkan: jumlah tes akhir, jumlah berkas, daftar commit, dan setiap penyimpangan dari plan ini (termasuk perubahan format, komentar yang dihapus, atau baris yang digabung).
