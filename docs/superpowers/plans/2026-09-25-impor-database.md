# Impor Riwayat 2026 — Rencana Database

> **Untuk pekerja agen:** Kerjakan task-by-task, berurutan. Setiap langkah memakai checkbox (`- [ ]`). Jangan melompati langkah "jalankan tes untuk memastikan GAGAL" — itu yang membuktikan tes benar-benar menguji sesuatu.

**Goal:** Tiga RPC impor atomik yang memasukkan master data, surat jalan, dan transaksi kas 2026 ke `apps/bul` tanpa mengubah satu pun fungsi keuangan yang sudah ada.

**Architecture:** Setiap RPC menerima seluruh batch sebagai `jsonb`, berjalan dalam satu transaksi Postgres, dan isinya hanya perulangan tipis di atas `public.buat_sj`, `public.selesaikan_sj`, `public.catat_kas`, dan `public.simpan_*`. Terjemahan nama menjadi UUID terjadi di dalam RPC supaya master yang baru dibuat langsung terlihat.

**Tech Stack:** PostgreSQL 15 (Supabase lokal), plpgsql, Vitest 5 + `pg` untuk tes DB.

**Spec:** `docs/superpowers/specs/2026-09-24-impor-riwayat-design.md`

## Global Constraints

- Worktree: `C:/Project/.worktrees/bul/impor`. Branch: `codex/bul/impor`, dicabangkan dari `codex/bul/bonus` @ `9e40ccf`.
- Semua perintah dijalankan dari `C:/Project/.worktrees/bul/impor/apps/bul`.
- **Setiap berkas migrasi WAJIB diakhiri baris `select internal.terapkan_hak_akses();`** — itu yang memberi `grant execute` ke `authenticated` untuk fungsi `public` dan mencabutnya untuk `internal`. Tanpa baris ini, `keamanan.test.mjs` gagal.
- Semua fungsi memakai `set search_path = ''`, sehingga **setiap** rujukan tabel/fungsi harus berkualifikasi penuh (`public.supir`, bukan `supir`).
- Ketiga RPC `public.impor_*` memakai `security definer` dan diawali `perform internal.wajib_peran('owner');`.
- Ketiga RPC `public.impor_*` memakai `set statement_timeout = '600s'` pada deklarasinya.
- Semua galat validasi memakai `using errcode = 'P0001'` agar pesannya diteruskan apa adanya ke layar.
- Nilai uang tidak pernah melewati float: dikirim dan dibandingkan sebagai string.
- **Dilarang mengubah** `public.buat_sj`, `public.selesaikan_sj`, `public.catat_kas`, `public.terbitkan_invoice`, `public.catat_pembayaran`, dan seluruh `public.simpan_*` yang sudah ada.
- Gerbang tiap task: `npm run test:db` hijau seluruhnya, bukan hanya berkas yang baru.
- Nama migrasi baru memakai awalan `20260925…` agar berurutan sesudah migrasi fase Bonus.
- **`db/tests/impor.test.mjs` berbagi satu database yang hanya di-reset sekali per BERKAS.** Data dari satu `describe` mewarisi ke `describe` berikutnya. Setiap master yang dibuat wajib memakai `unik()` dari `db/tests/helpers.mjs`, dan tidak boleh ada assertion yang mengandalkan tabel kosong.

---

### Task 1: Fondasi impor — kunci alami dan penolong bersama

**Files:**
- Create: `apps/bul/supabase/migrations/20260925000100_impor_fondasi.sql`
- Create: `apps/bul/db/tests/impor.test.mjs`

**Interfaces:**
- Consumes: `internal.wajib_peran`, `internal.terapkan_hak_akses`, `public.simpan_supir`, `public.simpan_pengurus`, `public.simpan_rute` (sudah ada).
- Produces:
  - `internal.wajib_ketemu(p_id uuid, p_jenis text, p_nilai text, p_no int) returns uuid`
  - `internal.cari_rute(p_nama text, p_asal text, p_tujuan text, p_no int) returns uuid`
  - `internal.periksa_kiriman(p_baris jsonb, p_berkas text) returns void`
  - `unique (nama)` pada `public.supir` dan `public.pengurus`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `apps/bul/db/tests/impor.test.mjs`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';

let owner;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
});
afterAll(tutup);

describe('fondasi impor', () => {
  it('nama supir dan pengurus tidak boleh kembar', async () => {
    const supir = unik('SUPIR-');
    await sebagai(owner, 'select public.simpan_supir(p_id => null, p_nama => $1)', [supir]);
    await expect(sebagai(owner, 'select public.simpan_supir(p_id => null, p_nama => $1)', [supir]))
      .rejects.toMatchObject({ code: '23505' });

    const pengurus = unik('PGR-');
    await sebagai(owner, 'select public.simpan_pengurus(p_id => null, p_nama => $1)', [pengurus]);
    await expect(sebagai(owner, 'select public.simpan_pengurus(p_id => null, p_nama => $1)', [pengurus]))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('wajib_ketemu menyebut nomor baris, jenis, dan nilainya', async () => {
    await expect(sql(`select internal.wajib_ketemu(null, 'supir', 'Sukirman', 214)`))
      .rejects.toThrow(/Baris 214: supir "Sukirman" tidak ditemukan/);
    const [r] = await sql(
      `select internal.wajib_ketemu('00000000-0000-0000-0000-000000000009'::uuid, 'supir', 'X', 1) as id`);
    expect(r.id).toBe('00000000-0000-0000-0000-000000000009');
  });

  it('periksa_kiriman menolak yang bukan daftar dan yang lebih dari 5000 baris', async () => {
    await expect(sql(`select internal.periksa_kiriman('{}'::jsonb, 'kas.csv')`))
      .rejects.toThrow(/kas\.csv harus berupa daftar baris/);
    await expect(sql(`select internal.periksa_kiriman(
      (select jsonb_agg(jsonb_build_object('n', g)) from generate_series(1, 5001) g), 'kas.csv')`))
      .rejects.toThrow(/maksimal 5000 baris/);
    // Daftar kosong sah: berkas boleh tidak diunggah sama sekali.
    await sql(`select internal.periksa_kiriman('[]'::jsonb, 'kas.csv')`);
  });

  it('cari_rute memakai kunci (nama, asal, tujuan) dan menolak yang ambigu', async () => {
    const nama = unik('RUTE-');
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [nama, 'Bogor', 'Jakarta']);
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [nama, 'Bekasi', 'Jakarta']);

    await expect(sql('select internal.cari_rute($1, null, null, 7)', [nama]))
      .rejects.toThrow(/ada lebih dari satu; isi juga rute_asal dan rute_tujuan/);

    const [r] = await sql('select internal.cari_rute($1, $2, $3, 7) as id', [nama, 'Bekasi', 'Jakarta']);
    expect(r.id).toBeTruthy();

    await expect(sql('select internal.cari_rute($1, null, null, 9)', [unik('HANTU-')]))
      .rejects.toThrow(/Baris 9: rute ".*" tidak ditemukan/);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan GAGAL**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx vitest run --config db/vitest.config.mjs db/tests/impor.test.mjs
```

Diharapkan: GAGAL. Keempat tes gagal — `internal.wajib_ketemu` belum ada (`42883 function internal.wajib_ketemu does not exist`), dan supir kembar masih diterima karena `unique` belum dipasang.

- [ ] **Step 3: Tulis migrasi**

Buat `apps/bul/supabase/migrations/20260925000100_impor_fondasi.sql`:

```sql
-- Fondasi impor riwayat 2026: kunci alami untuk supir/pengurus, dan penolong
-- bersama yang dipakai ketiga RPC impor.

alter table public.supir add constraint supir_nama_key unique (nama);
alter table public.pengurus add constraint pengurus_nama_key unique (nama);

-- Menerjemahkan nama menjadi id. Argumen pertama diisi subkueri agar pemanggilnya
-- tetap satu baris; fungsi ini hanya bertugas mengangkat galat yang menyebut baris.
create function internal.wajib_ketemu(p_id uuid, p_jenis text, p_nilai text, p_no int)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_id is null then
    raise exception 'Baris %: % "%" tidak ditemukan atau tidak aktif',
      p_no, p_jenis, coalesce(p_nilai, '') using errcode = 'P0001';
  end if;
  return p_id;
end;
$$;

-- rute dikunci oleh (nama, asal, tujuan) sejak migrasi 20260923000200, jadi nama
-- saja bisa ambigu. asal/tujuan kosong berarti "jangan disaring".
create function internal.cari_rute(p_nama text, p_asal text, p_tujuan text, p_no int)
returns uuid language plpgsql stable set search_path = '' as $$
declare
  v_id uuid;
  v_n int;
begin
  select count(*), min(r.id::text)::uuid into v_n, v_id
    from public.rute r
   where r.nama = trim(p_nama) and r.aktif
     and (coalesce(trim(p_asal), '') = '' or r.asal = trim(p_asal))
     and (coalesce(trim(p_tujuan), '') = '' or r.tujuan = trim(p_tujuan));
  if v_n = 0 then
    raise exception 'Baris %: rute "%" tidak ditemukan atau tidak aktif',
      p_no, coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  if v_n > 1 then
    raise exception 'Baris %: rute "%" ada lebih dari satu; isi juga rute_asal dan rute_tujuan',
      p_no, coalesce(p_nama, '') using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Penjaga bentuk kiriman. Batas 5000 bukan target penggunaan, hanya pencegah
-- kiriman salah bentuk menjadi transaksi raksasa.
create function internal.periksa_kiriman(p_baris jsonb, p_berkas text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception '% harus berupa daftar baris', p_berkas using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_baris) > 5000 then
    raise exception '% berisi % baris; maksimal 5000 baris per impor',
      p_berkas, jsonb_array_length(p_baris) using errcode = 'P0001';
  end if;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes untuk memastikan LULUS**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: seluruh berkas lulus, termasuk `impor.test.mjs` (4 tes) dan `keamanan.test.mjs` yang tidak boleh terganggu.

- [ ] **Step 5: Commit**

```bash
cd C:/Project/.worktrees/bul/impor && git add apps/bul/supabase/migrations/20260925000100_impor_fondasi.sql apps/bul/db/tests/impor.test.mjs && git commit -m "feat(bul): fondasi impor riwayat - kunci alami supir/pengurus dan penolong bersama"
```

---

### Task 2: `impor_master`

**Files:**
- Create: `apps/bul/supabase/migrations/20260925000200_impor_master.sql`
- Modify: `apps/bul/db/tests/impor.test.mjs` (tambah `describe` di akhir berkas)
- Modify: `apps/bul/db/tests/keamanan.test.mjs:10` (tambah `impor_master` ke `RPC_TULIS`)

**Interfaces:**
- Consumes: `internal.wajib_ketemu`, `internal.cari_rute`, `internal.periksa_kiriman` (Task 1); `public.simpan_rute`, `public.simpan_material`, `public.simpan_pelanggan`, `public.simpan_truk`, `public.simpan_supir`, `public.simpan_pengurus`, `public.simpan_uang_jalan_rute`, `public.simpan_tarif`, `public.simpan_aturan_upah` (sudah ada).
- Produces: `public.impor_master(p_data jsonb) returns jsonb` — mengembalikan objek jumlah baris per jenis, mis. `{"rute": 3, "material": 2, "pelanggan": 5, "truk": 0, "supir": 0, "pengurus": 0, "uang_jalan": 3, "tarif": 6, "aturan_upah": 1}`.

Bentuk `p_data`: objek berkunci jenis, nilainya daftar baris. Kunci yang tidak dikirim diperlakukan sebagai daftar kosong. Nama kunci: `rute`, `material`, `pelanggan`, `truk`, `supir`, `pengurus`, `uang_jalan`, `tarif`, `aturan_upah`.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di **akhir** `apps/bul/db/tests/impor.test.mjs`:

```javascript
describe('impor_master', () => {
  const imporMaster = (uid, data) =>
    sebagai(uid, 'select public.impor_master($1::jsonb) as hasil', [JSON.stringify(data)]);

  it('membuat master baru dan mengembalikan jumlah per jenis', async () => {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const [r] = await imporMaster(owner, {
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta' }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3', standar_bongkar: '20' }],
      pelanggan: [{ nama: plg, alamat: 'Jl. Uji', pemotong_pph: true }],
      uang_jalan: [{ rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta', berlaku_mulai: '2026-01-01', nominal: '400000' }],
      tarif: [{ pelanggan: plg, rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta', lini: 'SJP', material: mat, berlaku_mulai: '2026-01-01', harga_satuan: '63000' }],
    });
    expect(r.hasil).toMatchObject({ rute: 1, material: 1, pelanggan: 1, uang_jalan: 1, tarif: 1 });

    const [m] = await sql('select standar_bongkar from public.material where lini_kode = $1 and nama = $2', ['SJP', mat]);
    expect(m.standar_bongkar).toBe('20.000');
    const [t] = await sql(
      `select t.harga_satuan from public.tarif t
         join public.pelanggan p on p.id = t.pelanggan_id where p.nama = $1`, [plg]);
    expect(t.harga_satuan).toBe('63000.00');
  });

  it('impor yang sama diulang memperbarui, bukan menggandakan', async () => {
    const plg = unik('PLG-');
    await imporMaster(owner, { pelanggan: [{ nama: plg, alamat: 'Alamat lama', pemotong_pph: true }] });
    await imporMaster(owner, { pelanggan: [{ nama: plg, alamat: 'Alamat baru', pemotong_pph: false }] });
    const rows = await sql('select alamat, pemotong_pph from public.pelanggan where nama = $1', [plg]);
    expect(rows).toEqual([{ alamat: 'Alamat baru', pemotong_pph: false }]);
  });

  it('rute dikenali lewat (nama, asal, tujuan), bukan nama saja', async () => {
    const nama = unik('RUTE-');
    await imporMaster(owner, {
      rute: [
        { nama, asal: 'Bogor', tujuan: 'Jakarta' },
        { nama, asal: 'Bekasi', tujuan: 'Jakarta' },
      ],
    });
    const rows = await sql('select asal from public.rute where nama = $1 order by asal', [nama]);
    expect(rows).toEqual([{ asal: 'Bekasi' }, { asal: 'Bogor' }]);
  });

  it('nama yang tidak ditemukan ditolak dengan nomor baris, dan seluruh kiriman batal', async () => {
    // Rute dan material SENGAJA dibuat sah di kiriman yang sama supaya satu-satunya
    // yang bisa gagal adalah pelanggan. Kalau ketiganya hantu, `cari_rute` yang
    // meledak lebih dulu (ia statement tersendiri sebelum `simpan_tarif` dipanggil),
    // sehingga jalur `wajib_ketemu` untuk pelanggan tidak pernah teruji.
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    await expect(imporMaster(owner, {
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta' }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3', standar_bongkar: '20' }],
      tarif: [
        { pelanggan: unik('HANTU-'), rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta',
          lini: 'SJP', material: mat, berlaku_mulai: '2026-01-01', harga_satuan: '1000' },
      ],
    })).rejects.toThrow(/Baris 1: pelanggan "HANTU-[^"]*" tidak ditemukan/);

    // Atomisitas: rute dan material yang dibuat di panggilan yang gagal tidak boleh tersisa.
    expect(await sql('select 1 from public.rute where nama = $1', [rute])).toEqual([]);
    expect(await sql('select 1 from public.material where nama = $1', [mat])).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan GAGAL**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx vitest run --config db/vitest.config.mjs db/tests/impor.test.mjs
```

Diharapkan: GAGAL dengan `function public.impor_master(jsonb) does not exist`.

- [ ] **Step 3: Tulis migrasi**

Buat `apps/bul/supabase/migrations/20260925000200_impor_master.sql`:

```sql
-- Impor master data. Urutan pemrosesan ditetapkan di dalam fungsi, bukan oleh
-- urutan kunci yang dikirim klien, karena tarif/uang jalan/aturan upah bergantung
-- pada rute dan material yang mungkin baru dibuat di kiriman yang sama.

create function public.impor_master(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_d jsonb := coalesce(p_data, '{}'::jsonb);
  v_b jsonb;
  v_no int;
  v_id uuid;
  v_rute uuid;
  v_material uuid;
  v_n int;
  v_hasil jsonb := '{}'::jsonb;
  c_nol constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(coalesce(v_d -> 'rute', '[]'::jsonb), 'rute.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'material', '[]'::jsonb), 'material.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'pelanggan', '[]'::jsonb), 'pelanggan.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'truk', '[]'::jsonb), 'truk.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'supir', '[]'::jsonb), 'supir.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'pengurus', '[]'::jsonb), 'pengurus.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'uang_jalan', '[]'::jsonb), 'uang-jalan.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'tarif', '[]'::jsonb), 'tarif.csv');
  perform internal.periksa_kiriman(coalesce(v_d -> 'aturan_upah', '[]'::jsonb), 'aturan-upah.csv');

  -- 1. rute
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'rute', '[]'::jsonb)) with ordinality
  loop
    select r.id into v_id from public.rute r
     where r.nama = trim(v_b ->> 'nama')
       and r.asal = coalesce(trim(v_b ->> 'asal'), '')
       and r.tujuan = coalesce(trim(v_b ->> 'tujuan'), '');
    perform public.simpan_rute(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_asal => coalesce(trim(v_b ->> 'asal'), ''),
      p_tujuan => coalesce(trim(v_b ->> 'tujuan'), ''),
      p_aktif => true,
      p_tipe_rute_id => case when nullif(trim(v_b ->> 'tipe_rute'), '') is null then null else
        internal.wajib_ketemu(
          (select t.id from public.tipe_rute t where t.nama = trim(v_b ->> 'tipe_rute') and t.aktif),
          'tipe rute', v_b ->> 'tipe_rute', v_no) end);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('rute', v_n);

  -- 2. material
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'material', '[]'::jsonb)) with ordinality
  loop
    select m.id into v_id from public.material m
     where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'nama');
    perform public.simpan_material(
      p_id => v_id,
      p_lini_kode => trim(v_b ->> 'lini'),
      p_nama => trim(v_b ->> 'nama'),
      p_satuan => trim(v_b ->> 'satuan'),
      p_aktif => true,
      p_standar_bongkar => nullif(trim(v_b ->> 'standar_bongkar'), '')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('material', v_n);

  -- 3. pelanggan
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'pelanggan', '[]'::jsonb)) with ordinality
  loop
    select p.id into v_id from public.pelanggan p where p.nama = trim(v_b ->> 'nama');
    perform public.simpan_pelanggan(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_alamat => coalesce(v_b ->> 'alamat', ''),
      p_npwp => coalesce(v_b ->> 'npwp', ''),
      p_catatan => coalesce(v_b ->> 'catatan', ''),
      p_pemotong_pph => coalesce((v_b ->> 'pemotong_pph')::boolean, true),
      p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('pelanggan', v_n);

  -- 4. truk
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'truk', '[]'::jsonb)) with ordinality
  loop
    select t.id into v_id from public.truk t where t.nopol = trim(v_b ->> 'nopol');
    perform public.simpan_truk(
      p_id => v_id, p_nopol => trim(v_b ->> 'nopol'),
      p_jenis => coalesce(v_b ->> 'jenis', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('truk', v_n);

  -- 5. supir
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'supir', '[]'::jsonb)) with ordinality
  loop
    select s.id into v_id from public.supir s where s.nama = trim(v_b ->> 'nama');
    perform public.simpan_supir(
      p_id => v_id, p_nama => trim(v_b ->> 'nama'),
      p_telepon => coalesce(v_b ->> 'telepon', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('supir', v_n);

  -- 6. pengurus
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'pengurus', '[]'::jsonb)) with ordinality
  loop
    select g.id into v_id from public.pengurus g where g.nama = trim(v_b ->> 'nama');
    perform public.simpan_pengurus(
      p_id => v_id, p_nama => trim(v_b ->> 'nama'),
      p_telepon => coalesce(v_b ->> 'telepon', ''), p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('pengurus', v_n);

  -- 7. uang jalan per rute
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'uang_jalan', '[]'::jsonb)) with ordinality
  loop
    v_rute := internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no);
    perform public.simpan_uang_jalan_rute(
      v_rute, (v_b ->> 'berlaku_mulai')::date, (v_b ->> 'nominal')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('uang_jalan', v_n);

  -- 8. tarif
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'tarif', '[]'::jsonb)) with ordinality
  loop
    v_rute := internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no);
    perform public.simpan_tarif(
      internal.wajib_ketemu(
        (select p.id from public.pelanggan p where p.nama = trim(v_b ->> 'pelanggan') and p.aktif),
        'pelanggan', v_b ->> 'pelanggan', v_no),
      v_rute,
      internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no),
      (v_b ->> 'berlaku_mulai')::date,
      (v_b ->> 'harga_satuan')::numeric);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('tarif', v_n);

  -- 9. aturan upah
  v_n := 0;
  for v_b, v_no in
    select value, ordinality from jsonb_array_elements(coalesce(v_d -> 'aturan_upah', '[]'::jsonb)) with ordinality
  loop
    v_rute := case when nullif(trim(v_b ->> 'rute'), '') is null then null else
      internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no) end;
    v_material := case when nullif(trim(v_b ->> 'material'), '') is null then null else
      internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no) end;
    select a.id into v_id from public.aturan_upah a
     where a.aktif and a.berlaku_mulai = (v_b ->> 'berlaku_mulai')::date
       and coalesce(a.rute_id, c_nol) = coalesce(v_rute, c_nol)
       and coalesce(a.material_id, c_nol) = coalesce(v_material, c_nol);
    perform public.simpan_aturan_upah(
      p_id => v_id,
      p_nama => trim(v_b ->> 'nama'),
      p_rute_id => v_rute,
      p_material_id => v_material,
      p_berlaku_mulai => (v_b ->> 'berlaku_mulai')::date,
      p_basis => trim(v_b ->> 'basis'),
      p_nominal => (v_b ->> 'nominal')::numeric,
      p_aktif => true);
    v_n := v_n + 1;
  end loop;
  v_hasil := v_hasil || jsonb_build_object('aturan_upah', v_n);

  perform internal.catat_audit('impor', 'master', null, v_hasil);
  return v_hasil;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Daftarkan di gerbang katalog**

Di `apps/bul/db/tests/keamanan.test.mjs`, tambahkan `'impor_master'` ke dalam array `RPC_TULIS` sambil menjaga urutan abjad. Baris yang sekarang berbunyi:

```javascript
  'buat_jurnal_manual', 'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'hitung_bonus',
```

menjadi:

```javascript
  'buat_jurnal_manual', 'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'hitung_bonus',
  'impor_master',
```

- [ ] **Step 5: Jalankan tes untuk memastikan LULUS**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: seluruh berkas lulus, termasuk `keamanan.test.mjs` yang memeriksa daftar fungsi `public` persis sama dengan katalog.

- [ ] **Step 6: Commit**

```bash
cd C:/Project/.worktrees/bul/impor && git add apps/bul/supabase/migrations/20260925000200_impor_master.sql apps/bul/db/tests/impor.test.mjs apps/bul/db/tests/keamanan.test.mjs && git commit -m "feat(bul): RPC impor master data dari berkas CSV"
```

---

### Task 3: `impor_surat_jalan`

**Files:**
- Create: `apps/bul/supabase/migrations/20260925000300_impor_sj.sql`
- Modify: `apps/bul/db/tests/impor.test.mjs` (tambah `describe` di akhir berkas)
- Modify: `apps/bul/db/tests/keamanan.test.mjs` (tambah `impor_surat_jalan` ke `RPC_TULIS`)

**Interfaces:**
- Consumes: `internal.wajib_ketemu`, `internal.cari_rute`, `internal.periksa_kiriman` (Task 1); `public.buat_sj`, `public.selesaikan_sj` (sudah ada).
- Produces: `public.impor_surat_jalan(p_baris jsonb) returns int` — mengembalikan jumlah SJ yang masuk.

Kunci tiap baris: `lini`, `nomor`, `tanggal`, `pelanggan`, `rute`, `rute_asal`, `rute_tujuan`, `material`, `nopol`, `supir`, `pengurus`, `qty_muat`, `uang_jalan`, `qty_bongkar`, `tanggal_selesai`, `upah`, `keterangan`.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di **akhir** `apps/bul/db/tests/impor.test.mjs`:

```javascript
describe('impor_surat_jalan', () => {
  const imporSj = (uid, baris) =>
    sebagai(uid, 'select public.impor_surat_jalan($1::jsonb) as n', [JSON.stringify(baris)]);

  // Master dengan tarif/uang jalan/upah yang SENGAJA berbeda dari angka di berkas,
  // supaya bisa dibuktikan yang dipakai adalah angka berkas.
  async function masterUji() {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const supir = unik('SUPIR-');
    const nopol = unik('B ');
    // tipe_rute dan aturan_komisi BUKAN cakupan impor; keduanya dibuat lewat layar master
    // aplikasi sebelum impor dijalankan. Fixture meniru prasyarat itu, sebab tanpa keduanya
    // komisi_berlaku(null, tanggal) mengembalikan null dan selesaikan_sj tidak membentuk
    // satu pun baris jurnal komisi -- diam-diam, tanpa galat.
    const tipe = unik('TIPE-');
    const [t] = await sebagai(owner,
      'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [tipe]);
    await sebagai(owner,
      `select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2,
         p_berlaku_mulai => '2026-01-01'::date, p_nominal => 50000)`, [unik('KOM-'), t.id]);
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta', tipe_rute: tipe }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3' }],
      pelanggan: [{ nama: plg, pemotong_pph: true }],
      truk: [{ nopol }],
      supir: [{ nama: supir }],
      uang_jalan: [{ rute, berlaku_mulai: '2026-01-01', nominal: '111111' }],
      aturan_upah: [{ nama: unik('UPAH-'), rute, berlaku_mulai: '2026-01-01', basis: 'per_sj', nominal: '222222' }],
    })]);
    return { rute, mat, plg, supir, nopol, tipe };
  }

  it('memakai angka dari berkas, bukan dari master', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    const [r] = await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-02', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '10',
      uang_jalan: '400000', qty_bongkar: '9.5', tanggal_selesai: '2026-03-03', upah: '175000',
      keterangan: 'impor uji',
    }]);
    expect(r.n).toBe(1);

    const [sj] = await sql(
      'select status, uang_jalan, upah, qty_bongkar, tanggal_selesai from public.surat_jalan where nomor = $1',
      [nomor]);
    expect(sj).toEqual({
      status: 'selesai', uang_jalan: '400000.00', upah: '175000.00',
      qty_bongkar: '9.500', tanggal_selesai: '2026-03-03',
    });
  });

  it('SJ tanpa tanggal_selesai tetap berstatus berangkat', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-04', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '8', uang_jalan: '400000',
    }]);
    const [sj] = await sql('select status, upah from public.surat_jalan where nomor = $1', [nomor]);
    expect(sj).toEqual({ status: 'berangkat', upah: null });
  });

  it('pengurus dari berkas ikut ke SJ dan ke baris jurnal komisi', async () => {
    const m = await masterUji();
    const pengurus = unik('PGR-');
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      pengurus: [{ nama: pengurus }],
    })]);
    const nomor = unik('SJ');
    await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-05', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, pengurus, qty_muat: '10',
      uang_jalan: '400000', qty_bongkar: '10', tanggal_selesai: '2026-03-06', upah: '150000',
    }]);
    const [sj] = await sql(
      `select g.nama from public.surat_jalan s join public.pengurus g on g.id = s.pengurus_id
        where s.nomor = $1`, [nomor]);
    expect(sj.nama).toBe(pengurus);

    // Cacah baris saja akan lulus walau nominalnya salah. Nilai dipatri, bukan dihitung
    // ulang lewat internal.akun_posting, supaya tes tidak sekadar mengulang rumus yang diuji.
    const baris = await sql(
      `select b.akun_kode, b.debit, b.kredit from public.surat_jalan s
         join public.jurnal_baris b on b.jurnal_id = s.jurnal_upah_id
        where s.nomor = $1 and b.pengurus_id = s.pengurus_id
        order by b.akun_kode`, [nomor]);
    expect(baris).toEqual([
      { akun_kode: '2125', debit: '0.00', kredit: '50000.00' },
      { akun_kode: '5180', debit: '50000.00', kredit: '0.00' },
    ]);
  });

  it('gagal di tengah tidak meninggalkan satu pun SJ atau jurnal', async () => {
    const m = await masterUji();
    const awalSj = (await sql('select count(*)::int as n from public.surat_jalan'))[0].n;
    const awalJurnal = (await sql('select count(*)::int as n from public.jurnal'))[0].n;
    const nomor = unik('SJ');

    const baris = [1, 2, 3, 4, 5].map((i) => ({
      lini: 'SJP', nomor: `${nomor}-${i}`, tanggal: '2026-03-10', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: i === 4 ? 'SUPIR HANTU' : m.supir,
      qty_muat: '10', uang_jalan: '400000', qty_bongkar: '10',
      tanggal_selesai: '2026-03-11', upah: '150000',
    }));

    await expect(imporSj(owner, baris)).rejects.toThrow(/Baris 4: supir "SUPIR HANTU" tidak ditemukan/);

    // Dibaca dari koneksi terpisah: tidak boleh ada sisa apa pun.
    expect((await sql('select count(*)::int as n from public.surat_jalan'))[0].n).toBe(awalSj);
    expect((await sql('select count(*)::int as n from public.jurnal'))[0].n).toBe(awalJurnal);
    expect(await sql('select nomor from public.surat_jalan where nomor like $1', [`${nomor}-%`])).toEqual([]);
  });

  it('nomor SJ kembar dalam lini yang sama ditolak', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    const satu = {
      lini: 'SJP', nomor, tanggal: '2026-03-12', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '10', uang_jalan: '400000',
    };
    await imporSj(owner, [satu]);
    await expect(imporSj(owner, [satu])).rejects.toMatchObject({ code: '23505' });
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan GAGAL**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx vitest run --config db/vitest.config.mjs db/tests/impor.test.mjs
```

Diharapkan: GAGAL dengan `function public.impor_surat_jalan(jsonb) does not exist`.

- [ ] **Step 3: Tulis migrasi**

Buat `apps/bul/supabase/migrations/20260925000300_impor_sj.sql`:

```sql
-- Impor surat jalan riwayat. Uang jalan dan upah diambil dari berkas apa adanya
-- lewat parameter penimpa yang memang sudah disediakan buat_sj/selesaikan_sj,
-- karena angka yang dulu benar-benar dibayarkan adalah fakta, bukan hasil hitung.

create function public.impor_surat_jalan(p_baris jsonb) returns int
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_b jsonb;
  v_no int;
  v_id uuid;
  v_pengurus uuid;
  v_n int := 0;
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(p_baris, 'surat-jalan.csv');

  for v_b, v_no in select value, ordinality from jsonb_array_elements(p_baris) with ordinality loop
    v_pengurus := case when nullif(trim(v_b ->> 'pengurus'), '') is null then null else
      internal.wajib_ketemu(
        (select g.id from public.pengurus g where g.nama = trim(v_b ->> 'pengurus') and g.aktif),
        'pengurus', v_b ->> 'pengurus', v_no) end;

    v_id := public.buat_sj(
      p_lini_kode => trim(v_b ->> 'lini'),
      p_nomor => trim(v_b ->> 'nomor'),
      p_tanggal => (v_b ->> 'tanggal')::date,
      p_pelanggan_id => internal.wajib_ketemu(
        (select p.id from public.pelanggan p where p.nama = trim(v_b ->> 'pelanggan') and p.aktif),
        'pelanggan', v_b ->> 'pelanggan', v_no),
      p_rute_id => internal.cari_rute(v_b ->> 'rute', v_b ->> 'rute_asal', v_b ->> 'rute_tujuan', v_no),
      p_material_id => internal.wajib_ketemu(
        (select m.id from public.material m
          where m.lini_kode = trim(v_b ->> 'lini') and m.nama = trim(v_b ->> 'material') and m.aktif),
        'material', v_b ->> 'material', v_no),
      p_truk_id => internal.wajib_ketemu(
        (select t.id from public.truk t where t.nopol = trim(v_b ->> 'nopol') and t.aktif),
        'truk', v_b ->> 'nopol', v_no),
      p_supir_id => internal.wajib_ketemu(
        (select s.id from public.supir s where s.nama = trim(v_b ->> 'supir') and s.aktif),
        'supir', v_b ->> 'supir', v_no),
      p_qty_muat => (v_b ->> 'qty_muat')::numeric,
      p_uang_jalan => (v_b ->> 'uang_jalan')::numeric,
      p_keterangan => coalesce(v_b ->> 'keterangan', ''));

    -- buat_sj tidak menerima pengurus sebagai parameter; ia menebak sendiri ketika
    -- pengurus aktif hanya satu. Untuk riwayat, pengurus yang benar ada di berkas.
    -- Harus dipasang SEBELUM penyelesaian, karena jurnal komisi membaca kolom ini.
    if v_pengurus is not null then
      update public.surat_jalan set pengurus_id = v_pengurus where id = v_id;
    end if;

    if nullif(trim(v_b ->> 'tanggal_selesai'), '') is not null then
      perform public.selesaikan_sj(
        v_id,
        (v_b ->> 'qty_bongkar')::numeric,
        (v_b ->> 'tanggal_selesai')::date,
        nullif(trim(v_b ->> 'upah'), '')::numeric);
    end if;

    v_n := v_n + 1;
  end loop;

  perform internal.catat_audit('impor', 'surat_jalan', null, jsonb_build_object('baris', v_n));
  return v_n;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Daftarkan di gerbang katalog**

Di `apps/bul/db/tests/keamanan.test.mjs`, ubah baris `'impor_master',` yang ditambahkan pada Task 2 menjadi:

```javascript
  'impor_master', 'impor_surat_jalan',
```

- [ ] **Step 5: Jalankan tes untuk memastikan LULUS**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: seluruh berkas lulus.

- [ ] **Step 6: Commit**

```bash
cd C:/Project/.worktrees/bul/impor && git add apps/bul/supabase/migrations/20260925000300_impor_sj.sql apps/bul/db/tests/impor.test.mjs apps/bul/db/tests/keamanan.test.mjs && git commit -m "feat(bul): RPC impor surat jalan dengan angka uang dari berkas"
```

---

### Task 4: `impor_kas`

**Files:**
- Create: `apps/bul/supabase/migrations/20260925000400_impor_kas.sql`
- Modify: `apps/bul/db/tests/impor.test.mjs` (tambah `describe` di akhir berkas)
- Modify: `apps/bul/db/tests/keamanan.test.mjs` (tambah `impor_kas` ke `RPC_TULIS`)

**Interfaces:**
- Consumes: `internal.wajib_ketemu`, `internal.periksa_kiriman` (Task 1); `public.catat_kas` (sudah ada).
- Produces: `public.impor_kas(p_baris jsonb) returns int` — mengembalikan jumlah **transaksi** (bukan baris rincian) yang masuk.

Kunci tiap baris: `ref`, `jenis`, `tanggal`, `akun_kas`, `keterangan`, `akun`, `jumlah`, `keterangan_baris`, `lini`, `nopol`, `supir`, `pengurus`. Baris dengan `ref` yang sama digabung menjadi satu transaksi; `ref` kosong berarti baris itu berdiri sendiri.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di **akhir** `apps/bul/db/tests/impor.test.mjs`:

```javascript
describe('impor_kas', () => {
  const imporKas = (uid, baris) =>
    sebagai(uid, 'select public.impor_kas($1::jsonb) as n', [JSON.stringify(baris)]);

  it('baris ber-ref sama menjadi satu transaksi multi-rincian', async () => {
    const ket = unik('KAS-');
    const [r] = await imporKas(owner, [
      { ref: 'A1', jenis: 'keluar', tanggal: '2026-04-01', akun_kas: '1111', keterangan: ket,
        akun: '5110', jumlah: '300000', keterangan_baris: 'Solar' },
      { ref: 'A1', jenis: 'keluar', tanggal: '2026-04-01', akun_kas: '1111', keterangan: ket,
        akun: '5160', jumlah: '200000', keterangan_baris: 'Tol' },
    ]);
    expect(r.n).toBe(1);

    const [t] = await sql('select id, jenis, total from public.transaksi_kas where keterangan = $1', [ket]);
    expect({ jenis: t.jenis, total: t.total }).toEqual({ jenis: 'keluar', total: '500000.00' });
    const rincian = await sql(
      'select akun_kode, jumlah from public.transaksi_kas_baris where transaksi_id = $1 order by urutan', [t.id]);
    expect(rincian).toEqual([
      { akun_kode: '5110', jumlah: '300000.00' },
      { akun_kode: '5160', jumlah: '200000.00' },
    ]);
  });

  it('ref kosong berarti setiap baris berdiri sendiri', async () => {
    const a = unik('KAS-');
    const b = unik('KAS-');
    const [r] = await imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-02', akun_kas: '1111', keterangan: a, akun: '5110', jumlah: '50000' },
      { jenis: 'keluar', tanggal: '2026-04-02', akun_kas: '1111', keterangan: b, akun: '5110', jumlah: '60000' },
    ]);
    expect(r.n).toBe(2);
    const rows = await sql(
      'select total from public.transaksi_kas where keterangan in ($1, $2) order by total', [a, b]);
    expect(rows).toEqual([{ total: '50000.00' }, { total: '60000.00' }]);
  });

  it('satu ref dengan tanggal berbeda ditolak dan menyebut ref-nya', async () => {
    await expect(imporKas(owner, [
      { ref: 'B2', jenis: 'keluar', tanggal: '2026-04-03', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '5110', jumlah: '10000' },
      { ref: 'B2', jenis: 'keluar', tanggal: '2026-04-04', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '5110', jumlah: '10000' },
    ])).rejects.toThrow(/ref "B2".*harus sama/);
  });

  it('penjagaan dimensi catat_kas tetap berlaku lewat jalur impor', async () => {
    // Kolomnya akun_kode, bukan nilai. Akun dibaca dari pengaturan_posting sebagai INPUT,
    // bukan sebagai nilai harapan; yang dipatri adalah pesan galatnya. Ketiga penjagaan
    // diuji karena dua di antaranya baru ditambahkan fase Bonus, dan jalur impor ini
    // belum pernah menyentuhnya.
    const akun = Object.fromEntries((await sql(
      `select kunci, akun_kode from public.pengaturan_posting
        where kunci in ('hutang_upah_sopir', 'hutang_komisi_pengurus', 'hutang_bonus')`))
      .map((r) => [r.kunci, r.akun_kode]));
    const kirim = (kode) => imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-05', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: kode, jumlah: '100000' },
    ]);
    await expect(kirim(akun.hutang_upah_sopir))
      .rejects.toThrow(/Pembayaran upah wajib memilih supir/);
    await expect(kirim(akun.hutang_komisi_pengurus))
      .rejects.toThrow(/Pembayaran komisi pengurus wajib memilih pengurus/);
    await expect(kirim(akun.hutang_bonus))
      .rejects.toThrow(/Pembayaran bonus wajib memilih supir atau pengurus/);
  });

  it('gagal di tengah tidak meninggalkan transaksi kas atau jurnal', async () => {
    const awalKas = (await sql('select count(*)::int as n from public.transaksi_kas'))[0].n;
    const awalJurnal = (await sql('select count(*)::int as n from public.jurnal'))[0].n;
    const ket = unik('KAS-');
    await expect(imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-06', akun_kas: '1111', keterangan: ket, akun: '5110', jumlah: '10000' },
      { jenis: 'keluar', tanggal: '2026-04-06', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '9999', jumlah: '10000' },
    ])).rejects.toThrow(/Akun 9999 tidak ada/);
    expect((await sql('select count(*)::int as n from public.transaksi_kas'))[0].n).toBe(awalKas);
    expect((await sql('select count(*)::int as n from public.jurnal'))[0].n).toBe(awalJurnal);
    expect(await sql('select id from public.transaksi_kas where keterangan = $1', [ket])).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan GAGAL**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx vitest run --config db/vitest.config.mjs db/tests/impor.test.mjs
```

Diharapkan: GAGAL dengan `function public.impor_kas(jsonb) does not exist`.

- [ ] **Step 3: Tulis migrasi**

Buat `apps/bul/supabase/migrations/20260925000400_impor_kas.sql`:

```sql
-- Impor kas & biaya. Satu transaksi kas bisa punya beberapa rincian, jadi baris
-- dikelompokkan lewat kolom ref bebas dari berkas. ref kosong = baris berdiri sendiri,
-- dan agar kelompoknya tetap unik ia diberi kunci sintetis dari nomor barisnya.

create function public.impor_kas(p_baris jsonb) returns int
language plpgsql security definer set search_path = '' set statement_timeout = '600s' as $$
declare
  v_k record;
  v_n int := 0;
begin
  perform internal.wajib_peran('owner');
  perform internal.periksa_kiriman(p_baris, 'kas.csv');

  for v_k in
    with baris as (
      select ordinality as no, value as b,
             coalesce(nullif(trim(value ->> 'ref'), ''), '#' || ordinality::text) as kunci
        from jsonb_array_elements(p_baris) with ordinality
    )
    select kunci,
           min(no) as no_awal,
           count(distinct b ->> 'jenis') as n_jenis,
           count(distinct b ->> 'tanggal') as n_tanggal,
           count(distinct b ->> 'akun_kas') as n_akun_kas,
           count(distinct b ->> 'keterangan') as n_keterangan,
           (array_agg(b ->> 'jenis' order by no))[1] as jenis,
           (array_agg(b ->> 'tanggal' order by no))[1] as tanggal,
           (array_agg(b ->> 'akun_kas' order by no))[1] as akun_kas,
           (array_agg(b ->> 'keterangan' order by no))[1] as keterangan,
           jsonb_agg(jsonb_build_object(
             'akun_kode', trim(b ->> 'akun'),
             'jumlah', b ->> 'jumlah',
             'keterangan', coalesce(b ->> 'keterangan_baris', ''),
             'lini_kode', nullif(trim(b ->> 'lini'), ''),
             'truk_id', case when nullif(trim(b ->> 'nopol'), '') is null then null else
               internal.wajib_ketemu(
                 (select t.id from public.truk t where t.nopol = trim(b ->> 'nopol') and t.aktif),
                 'truk', b ->> 'nopol', no::int) end,
             'supir_id', case when nullif(trim(b ->> 'supir'), '') is null then null else
               internal.wajib_ketemu(
                 (select s.id from public.supir s where s.nama = trim(b ->> 'supir') and s.aktif),
                 'supir', b ->> 'supir', no::int) end,
             'pengurus_id', case when nullif(trim(b ->> 'pengurus'), '') is null then null else
               internal.wajib_ketemu(
                 (select g.id from public.pengurus g where g.nama = trim(b ->> 'pengurus') and g.aktif),
                 'pengurus', b ->> 'pengurus', no::int) end)
             order by no) as rincian
      from baris
     group by kunci
     order by min(no)
  loop
    if v_k.n_jenis > 1 or v_k.n_tanggal > 1 or v_k.n_akun_kas > 1 or v_k.n_keterangan > 1 then
      raise exception 'Baris %: ref "%" memakai jenis, tanggal, akun_kas, dan keterangan yang harus sama di semua barisnya',
        v_k.no_awal, v_k.kunci using errcode = 'P0001';
    end if;
    perform public.catat_kas(v_k.jenis, v_k.tanggal::date, trim(v_k.akun_kas), v_k.keterangan, v_k.rincian);
    v_n := v_n + 1;
  end loop;

  perform internal.catat_audit('impor', 'transaksi_kas', null, jsonb_build_object('transaksi', v_n));
  return v_n;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Daftarkan di gerbang katalog**

Di `apps/bul/db/tests/keamanan.test.mjs`, ubah baris `'impor_master', 'impor_surat_jalan',` menjadi:

```javascript
  'impor_kas', 'impor_master', 'impor_surat_jalan',
```

- [ ] **Step 5: Jalankan tes untuk memastikan LULUS**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: seluruh berkas lulus.

- [ ] **Step 6: Commit**

```bash
cd C:/Project/.worktrees/bul/impor && git add apps/bul/supabase/migrations/20260925000400_impor_kas.sql apps/bul/db/tests/impor.test.mjs apps/bul/db/tests/keamanan.test.mjs && git commit -m "feat(bul): RPC impor kas dan biaya dengan pengelompokan ref"
```

---

### Task 5: Penjagaan lintas-RPC

**Files:**
- Modify: `apps/bul/db/tests/impor.test.mjs` (tambah `describe` di akhir berkas)

**Interfaces:**
- Consumes: `public.impor_master`, `public.impor_surat_jalan`, `public.impor_kas` (Task 2–4); `public.atur_kunci_periode` (sudah ada).
- Produces: tidak ada fungsi baru. Task ini membuktikan penjagaan yang sudah ditulis di Task 2–4 benar-benar berlaku pada ketiganya.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di **akhir** `apps/bul/db/tests/impor.test.mjs`:

```javascript
describe('penjagaan lintas-RPC impor', () => {
  it('hanya owner yang boleh mengimpor', async () => {
    const keuangan = await buatPengguna('keuangan');
    const operasional = await buatPengguna('operasional');
    for (const uid of [keuangan, operasional]) {
      await expect(sebagai(uid, `select public.impor_master('{}'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
      await expect(sebagai(uid, `select public.impor_surat_jalan('[]'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
      await expect(sebagai(uid, `select public.impor_kas('[]'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('ketiganya memasang statement_timeout 600s', async () => {
    const rows = await sql(`
      select p.proname, p.proconfig::text[] as cfg
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'impor\\_%'
       order by p.proname`);
    expect(rows.map((r) => r.proname)).toEqual(['impor_kas', 'impor_master', 'impor_surat_jalan']);
    for (const r of rows) {
      // toContain pada array adalah kesamaan ELEMEN, bukan substring. Nilai yang benar-benar
      // tersimpan adalah search_path="" lengkap dengan tanda kutipnya; 'search_path=' saja
      // tidak akan pernah cocok. Diverifikasi ke pg_proc.
      expect(r.cfg).toEqual(['search_path=""', 'statement_timeout=600s']);
    }
  });

  it('periode terkunci menolak impor SJ dan kas bertanggal di dalamnya', async () => {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const supir = unik('SUPIR-');
    const nopol = unik('B ');
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      rute: [{ nama: rute }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3' }],
      pelanggan: [{ nama: plg, pemotong_pph: true }],
      truk: [{ nopol }],
      supir: [{ nama: supir }],
      uang_jalan: [{ rute, berlaku_mulai: '2026-01-01', nominal: '400000' }],
      aturan_upah: [{ nama: unik('UPAH-'), rute, berlaku_mulai: '2026-01-01', basis: 'per_sj', nominal: '150000' }],
    })]);

    await sebagai(owner, `select public.atur_kunci_periode('2026-05-31'::date)`);
    try {
      await expect(sebagai(owner, 'select public.impor_surat_jalan($1::jsonb)', [JSON.stringify([{
        lini: 'SJP', nomor: unik('SJ'), tanggal: '2026-05-02', pelanggan: plg, rute,
        material: mat, nopol, supir, qty_muat: '10', uang_jalan: '400000',
        qty_bongkar: '10', tanggal_selesai: '2026-05-03', upah: '150000',
      }])])).rejects.toThrow(/Periode sampai 2026-05-31 sudah dikunci/);

      await expect(sebagai(owner, 'select public.impor_kas($1::jsonb)', [JSON.stringify([{
        jenis: 'keluar', tanggal: '2026-05-04', akun_kas: '1111',
        keterangan: unik('KAS-'), akun: '5110', jumlah: '10000',
      }])])).rejects.toThrow(/Periode sampai 2026-05-31 sudah dikunci/);
    } finally {
      // Kunci WAJIB dilepas: berkas ini berbagi satu database, dan describe
      // berikutnya akan ikut gagal kalau kunci dibiarkan menyala.
      await sebagai(owner, `select public.atur_kunci_periode(null)`);
    }
  });

  it('kiriman di atas 5000 baris ditolak sebelum apa pun ditulis', async () => {
    const baris = Array.from({ length: 5001 }, (_, i) => ({
      jenis: 'keluar', tanggal: '2026-04-20', akun_kas: '1111',
      keterangan: `Terlalu banyak ${i}`, akun: '5110', jumlah: '1000',
    }));
    await expect(sebagai(owner, 'select public.impor_kas($1::jsonb)', [JSON.stringify(baris)]))
      .rejects.toThrow(/kas\.csv berisi 5001 baris; maksimal 5000 baris per impor/);
  });
});
```

- [ ] **Step 2: Jalankan tes untuk memastikan hasilnya jujur**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx vitest run --config db/vitest.config.mjs db/tests/impor.test.mjs
```

Diharapkan: **LULUS semua**, karena penjagaannya memang sudah ditulis di Task 1–4. Kalau ada yang gagal, itu temuan asli — perbaiki migrasi yang bersangkutan, jangan melonggarkan tesnya.

Kalau uji `statement_timeout` gagal dengan nilai berbeda (mis. `statement_timeout=10min`), Postgres menormalkan satuannya; sesuaikan nilai harapan di tes agar cocok dengan yang benar-benar tersimpan, **bukan** dengan mengubah deklarasi fungsi.

- [ ] **Step 3: Jalankan suite DB penuh**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: seluruh berkas lulus. Jumlah tes bertambah dari 165 (baseline fase Bonus) menjadi sekitar 183.

- [ ] **Step 4: Commit**

```bash
cd C:/Project/.worktrees/bul/impor && git add apps/bul/db/tests/impor.test.mjs && git commit -m "test(bul): penjagaan peran, kunci periode, batas baris, dan timeout impor"
```

---

## Self-Review

**Cakupan spec:** Setiap perubahan database yang disebut spec punya task — `unique` supir/pengurus dan tiga penolong (Task 1), `impor_master` (Task 2), `impor_surat_jalan` termasuk penambalan `pengurus_id` (Task 3), `impor_kas` termasuk pengelompokan `ref` (Task 4), `statement_timeout` dan batas 5000 baris (Task 1 + Task 5). Sepuluh pembuktian yang diminta spec semuanya tercakup di Task 1–5.

**Kesesuaian nama:** `internal.wajib_ketemu`, `internal.cari_rute`, `internal.periksa_kiriman`, `public.impor_master`, `public.impor_surat_jalan`, `public.impor_kas` dipakai dengan ejaan dan tanda tangan yang sama di seluruh task dan di rencana web.

**Yang sengaja tidak ada di sini:** seluruh sisi browser ada di `2026-09-25-impor-web.md` dan dikerjakan setelah Task 5 selesai.
