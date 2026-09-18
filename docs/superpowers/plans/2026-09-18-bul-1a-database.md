# BUL 1a — Database (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Implementer:** Codex (lihat `2026-09-18-bul-1a-codex-handoff.md` untuk model/effort per batch). **Reviewer:** Claude (read-only).

**Goal:** Membangun seluruh lapisan database aplikasi BUL baru — master data, mesin jurnal, surat jalan, invoice, pembayaran, saldo awal, kas/bank, laporan — sebagai migrasi Supabase yang teruji.

**Architecture:** Semua tulisan lewat fungsi Postgres `SECURITY DEFINER` di schema `public` yang memanggil helper di schema `internal` (tidak terekspos PostgREST). Tabel hanya bisa di-`SELECT` oleh pengguna aktif (RLS). Setiap aksi operasional memposting jurnal di transaksi yang sama melalui `internal.posting_jurnal`. Pengujian memakai Vitest + `pg` langsung ke Supabase lokal, memanggil RPC sebagai pengguna berperan tertentu.

**Tech Stack:** Supabase CLI (lokal, Docker), PostgreSQL 17, Node 24, Vitest 5, `pg` 8.

**Spec:** `docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md`

## Global Constraints

- Root aplikasi: `apps/bul`. Tidak menyentuh `apps/bul-monitor`, `apps/bul-accounting`, `apps/erp-acc`, `apps/sj-monitor`, `shared/`.
- Uang: `numeric(18,2)`. Qty: `numeric(12,3)`. Tarif pajak: `numeric(6,4)`. Dilarang `float`/`real`/`double precision`.
- Semua fungsi `SECURITY DEFINER` wajib `set search_path = ''` dan mereferensikan objek dengan nama ber-schema (`public.`, `internal.`, `auth.`).
- Setiap RPC tulis di `public` memanggil `internal.wajib_peran(...)` sebagai pernyataan pertama.
- Setiap migrasi diakhiri `select internal.terapkan_hak_akses();`.
- Kode error: `42501` akses, `P0001` aturan bisnis, `P0002` tidak ditemukan, `23505` duplikat, `23514` cek/keseimbangan.
- Pesan error dalam Bahasa Indonesia.
- Nama tabel/kolom/fungsi dalam Bahasa Indonesia, snake_case.
- Tes hanya boleh ke database lokal (`127.0.0.1:54322`); `db/koneksi.mjs` menolak host lain.
- Dilarang: `supabase link`, `supabase db push`, deploy apa pun, mengubah project Supabase produksi, `git push --force`.
- Commit per task, pesan conventional commit Inggris, diakhiri baris `Co-Authored-By` sesuai kebijakan agen Codex.

## File Structure

```
apps/bul/
  package.json                 # skrip db:reset, test:db; devDeps pg, vitest, supabase
  .gitignore
  README.md                    # cara menjalankan Supabase lokal + tes
  supabase/
    config.toml
    migrations/
      20260918000100_fondasi.sql
      20260918000200_master_data.sql
      20260918000300_akuntansi_inti.sql
      20260918000400_surat_jalan.sql
      20260918000500_invoice.sql
      20260918000600_pembayaran.sql
      20260918000700_saldo_awal.sql
      20260918000800_kas.sql
      20260918000900_laporan.sql
  db/
    koneksi.mjs                # DB_URL + pagar host lokal
    reset-db.mjs               # hapus objek app, terapkan ulang semua migrasi
    vitest.config.mjs
    tests/
      helpers.mjs              # pool, sql(), buatAuthUser(), buatPengguna(), sebagai(), sebagaiAnon(), unik()
      fixtures.mjs             # siapkanMaster(), buatSjSelesai(), terbitkan()
      fondasi.test.mjs
      master.test.mjs
      akuntansi.test.mjs
      sj.test.mjs
      invoice.test.mjs
      pembayaran.test.mjs
      saldo-awal.test.mjs
      kas.test.mjs
      laporan.test.mjs
      keamanan.test.mjs
```

---

### Task 1: Kerangka, harness uji DB, dan migrasi fondasi

**Files:**
- Create: `apps/bul/package.json`, `apps/bul/.gitignore`, `apps/bul/README.md`
- Create: `apps/bul/supabase/config.toml`
- Create: `apps/bul/db/koneksi.mjs`, `apps/bul/db/reset-db.mjs`, `apps/bul/db/vitest.config.mjs`
- Create: `apps/bul/db/tests/helpers.mjs`, `apps/bul/db/tests/fondasi.test.mjs`
- Create: `apps/bul/supabase/migrations/20260918000100_fondasi.sql`

**Interfaces:**
- Produces (SQL): `public.profil`, `public.audit_log`, `public.nomor_urut`, `public.peran_saya() → text`, `public.atur_profil(p_id uuid, p_peran text, p_aktif boolean, p_nama text) → void`, `internal.wajib_peran(variadic text[]) → uuid`, `internal.catat_audit(p_aksi text, p_entitas text, p_entitas_id text, p_data jsonb) → void`, `internal.nomor_berikut(p_kunci text) → integer`, `internal.terapkan_hak_akses() → void`.
- Produces (JS): `resetDb()` dari `db/reset-db.mjs`; `pool, sql(text, params), buatAuthUser(), buatPengguna(peran, aktif), sebagai(userId, text, params), sebagaiAnon(text, params), unik(awalan), tutup()` dari `db/tests/helpers.mjs`.

- [ ] **Step 1: Buat `apps/bul/package.json`**

```json
{
  "name": "bul",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "db:reset": "node db/reset-db.mjs",
    "test:db": "vitest run --config db/vitest.config.mjs"
  }
}
```

Lalu dari `apps/bul`:

```bash
npm install --save-dev pg@^8.13.1 vitest@^5.0.0 supabase@latest
```

Expected: `package-lock.json` terbentuk, `node_modules/.bin/supabase` ada.

- [ ] **Step 2: Buat `apps/bul/.gitignore`**

```
node_modules/
supabase/.temp/
supabase/.branches/
.env
.env.*
!.env.example
```

- [ ] **Step 3: Buat `apps/bul/supabase/config.toml`**

```toml
project_id = "bul"

[api]
enabled = true
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324

[auth]
enabled = true
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173"]
enable_signup = false

[auth.email]
enable_signup = false
enable_confirmations = false
```

- [ ] **Step 4: Nyalakan Supabase lokal**

Dari `apps/bul`:

```bash
npx supabase start
```

Expected: daftar URL termasuk `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
**Jika gagal karena Docker/izin (misalnya `Access is denied` pada `.docker\config.json` atau pipe Docker):** BERHENTI, laporkan ke user dan minta user menjalankan `npx supabase start` sendiri di terminal biasa dari `C:\Project\.worktrees\bul\fase-1a\apps\bul`. Lanjutkan setelah user mengonfirmasi. Jangan mengubah ACL Windows sendiri.

- [ ] **Step 5: Buat `apps/bul/db/koneksi.mjs`**

```js
export const DB_URL =
  process.env.BUL_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const HOST_LOKAL = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function pastikanLokal(url) {
  const host = new URL(url).hostname;
  if (!HOST_LOKAL.has(host)) {
    throw new Error(`Menolak menjalankan terhadap host non-lokal: ${host}`);
  }
}
```

- [ ] **Step 6: Buat `apps/bul/db/reset-db.mjs`**

```js
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DB_URL, pastikanLokal } from './koneksi.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrasiDir = join(root, 'supabase', 'migrations');

const BERSIHKAN = `
do $$
declare r record;
begin
  for r in select format('%I.%I', schemaname, viewname) as n from pg_views where schemaname = 'public' loop
    execute 'drop view if exists ' || r.n || ' cascade';
  end loop;
  for r in select format('%I.%I', schemaname, tablename) as n from pg_tables where schemaname = 'public' loop
    execute 'drop table if exists ' || r.n || ' cascade';
  end loop;
  for r in select p.oid::regprocedure::text as n
           from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prokind in ('f', 'p') loop
    execute 'drop routine if exists ' || r.n || ' cascade';
  end loop;
end $$;
drop schema if exists internal cascade;
delete from auth.users where email like '%@uji.bul';
`;

export async function resetDb() {
  pastikanLokal(DB_URL);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(BERSIHKAN);
    const files = (await readdir(migrasiDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const isi = await readFile(join(migrasiDir, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(isi);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migrasi ${f} gagal: ${e.message}`);
      }
    }
    return files;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resetDb()
    .then((files) => console.log(`Reset selesai: ${files.length} migrasi diterapkan`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
```

- [ ] **Step 7: Buat `apps/bul/db/vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['db/tests/**/*.test.mjs'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
```

- [ ] **Step 8: Buat `apps/bul/db/tests/helpers.mjs`**

```js
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { DB_URL, pastikanLokal } from '../koneksi.mjs';

pastikanLokal(DB_URL);

// numeric → string (tanpa float), date → 'YYYY-MM-DD'
pg.types.setTypeParser(1700, (v) => v);
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export async function sql(text, params = []) {
  return (await pool.query(text, params)).rows;
}

export async function buatAuthUser() {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '{}'::jsonb, now(), now())`,
    [id, `${id}@uji.bul`],
  );
  return id;
}

export async function buatPengguna(peran = 'owner', aktif = true) {
  const id = await buatAuthUser();
  await pool.query('update public.profil set peran = $2, aktif = $3 where id = $1', [id, peran, aktif]);
  return id;
}

async function jalankan(role, claims, text, params) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    const r = await c.query(text, params);
    await c.query('set constraints all immediate');
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const sebagai = (userId, text, params = []) =>
  jalankan('authenticated', { sub: userId, role: 'authenticated' }, text, params);

export const sebagaiAnon = (text, params = []) => jalankan('anon', { role: 'anon' }, text, params);

export const unik = (awalan = 'U') => `${awalan}${randomUUID().slice(0, 8).toUpperCase()}`;

export async function tutup() {
  await pool.end();
}
```

- [ ] **Step 9: Tulis tes gagal `apps/bul/db/tests/fondasi.test.mjs`**

```js
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
```

- [ ] **Step 10: Jalankan tes, pastikan gagal**

Run (dari `apps/bul`): `npm run test:db -- fondasi`
Expected: FAIL — error seperti `relation "public.profil" does not exist` (belum ada migrasi).

- [ ] **Step 11: Buat `apps/bul/supabase/migrations/20260918000100_fondasi.sql`**

```sql
-- Fondasi: schema internal, profil & peran, audit, penomoran, hak akses.

create schema if not exists internal;
revoke all on schema internal from public;

create table public.profil (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  nama text not null default '',
  peran text not null default 'viewer'
    check (peran in ('owner', 'keuangan', 'operasional', 'viewer')),
  aktif boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  pengguna_id uuid,
  aksi text not null,
  entitas text not null,
  entitas_id text,
  data jsonb not null default '{}'::jsonb
);
create index audit_log_entitas_idx on public.audit_log (entitas, entitas_id);

create table public.nomor_urut (
  kunci text primary key,
  nilai integer not null
);

create function internal.buat_profil_baru() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profil (id, email, nama)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nama', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_profil
  after insert on auth.users
  for each row execute function internal.buat_profil_baru();

create function public.peran_saya() returns text
language sql stable security definer set search_path = '' as $$
  select p.peran from public.profil p where p.id = auth.uid() and p.aktif
$$;

create function internal.wajib_peran(variadic p_peran text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_peran text;
begin
  if v_uid is null then
    raise exception 'Harus login' using errcode = '42501';
  end if;
  select p.peran into v_peran from public.profil p where p.id = v_uid and p.aktif;
  if v_peran is null then
    raise exception 'Akun belum aktif' using errcode = '42501';
  end if;
  if not (v_peran = any (p_peran)) then
    raise exception 'Peran % tidak boleh melakukan aksi ini', v_peran using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function internal.catat_audit(p_aksi text, p_entitas text, p_entitas_id text, p_data jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (pengguna_id, aksi, entitas, entitas_id, data)
  values (auth.uid(), p_aksi, p_entitas, p_entitas_id, coalesce(p_data, '{}'::jsonb));
$$;

create function internal.nomor_berikut(p_kunci text) returns integer
language sql security definer set search_path = '' as $$
  insert into public.nomor_urut as n (kunci, nilai) values (p_kunci, 1)
  on conflict (kunci) do update set nilai = n.nilai + 1
  returning nilai;
$$;

create function public.atur_profil(p_id uuid, p_peran text, p_aktif boolean, p_nama text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  v_uid := internal.wajib_peran('owner');
  if p_id = v_uid and (p_peran <> 'owner' or not coalesce(p_aktif, false)) then
    raise exception 'Owner tidak boleh menurunkan atau menonaktifkan dirinya sendiri' using errcode = 'P0001';
  end if;
  update public.profil
     set peran = p_peran, aktif = coalesce(p_aktif, false), nama = coalesce(p_nama, nama)
   where id = p_id;
  if not found then
    raise exception 'Profil tidak ditemukan' using errcode = 'P0002';
  end if;
  perform internal.catat_audit('atur_profil', 'profil', p_id::text,
    jsonb_build_object('peran', p_peran, 'aktif', p_aktif));
end;
$$;

-- Dipanggil di akhir SETIAP migrasi. Idempoten.
create function internal.terapkan_hak_akses() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
    execute format('grant select on table public.%I to authenticated', r.relname);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.relname and policyname = 'baca_pengguna_aktif'
    ) then
      execute format(
        'create policy baca_pengguna_aktif on public.%I for select to authenticated using ((select public.peran_saya()) is not null)',
        r.relname);
    end if;
  end loop;

  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
    execute format('grant select on public.%I to authenticated', r.relname);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;

  revoke all on all sequences in schema public from anon, authenticated;
  revoke all on schema internal from anon, authenticated;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 12: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- fondasi`
Expected: PASS, 12 tes.

- [ ] **Step 13: Buat `apps/bul/README.md`**

````markdown
# BUL — aplikasi operasional + akuntansi

## Menjalankan database lokal

Prasyarat: Docker Desktop menyala, Node ≥ 22.

```bash
cd apps/bul
npm install
npx supabase start      # pertama kali mengunduh image Docker (beberapa GB)
npm run db:reset        # hapus objek aplikasi & terapkan ulang semua migrasi
npm run test:db         # seluruh tes database
```

`npm run db:reset` dan tes hanya mau berjalan terhadap `127.0.0.1`/`localhost`.
Frontend ada di `apps/bul/web` (lihat README di sana).
````

- [ ] **Step 14: Commit**

```bash
git add apps/bul
git commit -m "feat(bul): scaffold app, local db test harness and foundation migration"
```

---

### Task 2: Master data

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000200_master_data.sql`
- Create: `apps/bul/db/tests/master.test.mjs`
- Create: `apps/bul/db/tests/fixtures.mjs`

**Interfaces:**
- Consumes: `internal.wajib_peran`, `internal.catat_audit`, `internal.terapkan_hak_akses` (Task 1); helpers (Task 1).
- Produces (SQL tabel): `lini(kode,nama,aktif)`, `material(id,lini_kode,nama,satuan,aktif)`, `pelanggan(id,nama,alamat,npwp,catatan,pemotong_pph,aktif)`, `rute(id,nama,asal,tujuan,aktif)`, `uang_jalan_rute(id,rute_id,berlaku_mulai,nominal)`, `truk(id,nopol,jenis,aktif)`, `supir(id,nama,telepon,aktif)`, `tarif(id,pelanggan_id,rute_id,material_id,berlaku_mulai,harga_satuan)`, `aturan_upah(id,nama,rute_id,material_id,berlaku_mulai,basis,nominal,aktif)`.
- Produces (SQL RPC):
  - `simpan_lini(p_kode text, p_nama text, p_aktif boolean) → text` [owner]
  - `simpan_material(p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true) → uuid` [owner, operasional]
  - `simpan_pelanggan(p_id uuid, p_nama text, p_alamat text default '', p_npwp text default '', p_catatan text default '', p_pemotong_pph boolean default true, p_aktif boolean default true) → uuid` [owner, keuangan, operasional]
  - `simpan_rute(p_id uuid, p_nama text, p_asal text default '', p_tujuan text default '', p_aktif boolean default true) → uuid` [owner, operasional]
  - `simpan_uang_jalan_rute(p_rute_id uuid, p_berlaku_mulai date, p_nominal numeric) → uuid` [owner, operasional]
  - `simpan_truk(p_id uuid, p_nopol text, p_jenis text default '', p_aktif boolean default true) → uuid` [owner, operasional]
  - `simpan_supir(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true) → uuid` [owner, operasional]
  - `simpan_tarif(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_harga_satuan numeric) → uuid` [owner, keuangan]
  - `simpan_aturan_upah(p_id uuid, p_nama text, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_basis text, p_nominal numeric, p_aktif boolean default true) → uuid` [owner, keuangan]
  - `uang_jalan_berlaku(p_rute_id uuid, p_tanggal date) → numeric` (null bila belum diatur)
  - `tarif_berlaku(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_tanggal date) → numeric` (null bila belum ada)
  - `upah_berlaku(p_rute_id uuid, p_material_id uuid, p_tanggal date, p_qty numeric) → numeric` (null bila tak ada aturan)
- Produces (JS): `siapkanMaster(owner, opsi) → { lini, pelanggan, rute, material, truk, supir }` di `db/tests/fixtures.mjs`.

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/master.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';

let owner, ops, keu, viewer;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  viewer = await buatPengguna('viewer');
});
afterAll(tutup);

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

describe('lini', () => {
  it('memiliki seed SJP, SJS, SJT', async () => {
    const rows = await sql('select kode from public.lini order by kode');
    expect(rows.map((r) => r.kode)).toEqual(['SJP', 'SJS', 'SJT']);
  });
  it('hanya owner yang bisa menyimpan lini', async () => {
    await expect(sebagai(ops, "select public.simpan_lini('SJX', 'Uji', true)")).rejects.toMatchObject({ code: '42501' });
    const r = await satu(owner, "select public.simpan_lini(' sjx ', 'Uji', true) as kode");
    expect(r.kode).toBe('SJX');
  });
});

describe('truk dan supir', () => {
  it('menormalkan nomor polisi', async () => {
    const r = await satu(ops, 'select public.simpan_truk(p_id => null, p_nopol => $1, p_jenis => $2) as id', ['  b 1234  cd ', 'Dump']);
    const [t] = await sql('select nopol from public.truk where id = $1', [r.id]);
    expect(t.nopol).toBe('B 1234 CD');
  });
  it('menolak nomor polisi ganda', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_truk(p_id => null, p_nopol => $1)', ['B 1234 CD']),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('viewer dan keuangan tidak boleh menyimpan truk/supir', async () => {
    await expect(sebagai(viewer, 'select public.simpan_supir(p_id => null, p_nama => $1)', ['X'])).rejects.toMatchObject({ code: '42501' });
    await expect(sebagai(keu, 'select public.simpan_truk(p_id => null, p_nopol => $1)', ['B 1 X'])).rejects.toMatchObject({ code: '42501' });
  });
  it('mengubah id yang tidak ada → P0002', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_supir(p_id => $1, p_nama => $2)', ['00000000-0000-0000-0000-000000000001', 'X']),
    ).rejects.toMatchObject({ code: 'P0002' });
  });
  it('mencatat audit', async () => {
    const r = await satu(ops, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', ['Budi']);
    const a = await sql("select aksi from public.audit_log where entitas = 'supir' and entitas_id = $1", [r.id]);
    expect(a).toEqual([{ aksi: 'simpan' }]);
  });
  it('authenticated tidak bisa insert langsung', async () => {
    await expect(sebagai(owner, "insert into public.truk (nopol) values ('B 9 Z')")).rejects.toMatchObject({ code: '42501' });
  });
});

describe('pelanggan dan material', () => {
  it('keuangan boleh menyimpan pelanggan', async () => {
    const r = await satu(keu, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('PLG-')]);
    const [p] = await sql('select pemotong_pph, aktif from public.pelanggan where id = $1', [r.id]);
    expect(p).toEqual({ pemotong_pph: true, aktif: true });
  });
  it('material wajib lini yang ada dan aktif', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3)', ['ZZZ', 'Pasir', 'm3']),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
  it('material wajib satuan', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3)', ['SJP', unik('M'), ' ']),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('nilai berlaku menurut tanggal', () => {
  it('uang jalan rute mengikuti tanggal berlaku', async () => {
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    await sebagai(ops, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, '2026-01-01', '400000']);
    await sebagai(ops, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, '2026-03-01', '450000']);
    const q = 'select public.uang_jalan_berlaku($1, $2) as v';
    expect((await satu(ops, q, [rute, '2025-12-31'])).v).toBeNull();
    expect((await satu(ops, q, [rute, '2026-02-28'])).v).toBe('400000.00');
    expect((await satu(ops, q, [rute, '2026-03-01'])).v).toBe('450000.00');
  });

  it('tarif mengikuti tanggal berlaku dan upsert pada tanggal yang sama', async () => {
    const { id: plg } = await satu(keu, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('P')]);
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: mat } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const simpan = 'select public.simpan_tarif($1, $2, $3, $4, $5)';
    await sebagai(keu, simpan, [plg, rute, mat, '2026-01-01', '60000']);
    await sebagai(keu, simpan, [plg, rute, mat, '2026-01-01', '63000']);
    await sebagai(keu, simpan, [plg, rute, mat, '2026-07-01', '65000']);
    const q = 'select public.tarif_berlaku($1, $2, $3, $4) as v';
    expect((await satu(keu, q, [plg, rute, mat, '2026-06-30'])).v).toBe('63000.00');
    expect((await satu(keu, q, [plg, rute, mat, '2026-07-01'])).v).toBe('65000.00');
    await expect(sebagai(ops, simpan, [plg, rute, mat, '2026-08-01', '1'])).rejects.toMatchObject({ code: '42501' });
  });

  it('aturan upah paling spesifik menang', async () => {
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: ruteLain } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: mat } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const { id: matLain } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const simpan = 'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => $2, p_material_id => $3, p_berlaku_mulai => $4, p_basis => $5, p_nominal => $6)';
    await sebagai(keu, simpan, ['Default', null, null, '2026-01-01', 'per_sj', '100000']);
    await sebagai(keu, simpan, ['Rute khusus', rute, null, '2026-01-01', 'per_sj', '150000']);
    await sebagai(keu, simpan, ['Rute+material', rute, mat, '2026-01-01', 'per_satuan', '10000']);
    const q = 'select public.upah_berlaku($1, $2, $3, $4) as v';
    expect((await satu(ops, q, [rute, mat, '2026-02-01', '12.5'])).v).toBe('125000.00');
    expect((await satu(ops, q, [rute, matLain, '2026-02-01', '12.5'])).v).toBe('150000.00');
    expect((await satu(ops, q, [ruteLain, mat, '2026-02-01', '12.5'])).v).toBe('100000.00');
    expect((await satu(ops, q, [ruteLain, mat, '2025-12-31', '12.5'])).v).toBeNull();
  });

  it('basis aturan upah tidak dikenal ditolak', async () => {
    await expect(
      sebagai(keu, 'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => null, p_material_id => null, p_berlaku_mulai => $2, p_basis => $3, p_nominal => $4)', ['X', '2027-01-01', 'per_jam', '1']),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- master`
Expected: FAIL — `relation "public.lini" does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000200_master_data.sql`**

```sql
-- Master data: lini, material, pelanggan, rute, uang jalan, truk, supir, tarif, aturan upah.

create table public.lini (
  kode text primary key check (kode ~ '^[A-Z]{2,5}$'),
  nama text not null check (length(trim(nama)) > 0),
  aktif boolean not null default true
);
insert into public.lini (kode, nama) values ('SJP', 'Pasir'), ('SJT', 'Tanah/Clay'), ('SJS', 'Sodium');

create table public.material (
  id uuid primary key default gen_random_uuid(),
  lini_kode text not null references public.lini (kode),
  nama text not null check (length(trim(nama)) > 0),
  satuan text not null check (length(trim(satuan)) > 0),
  aktif boolean not null default true,
  unique (lini_kode, nama)
);

create table public.pelanggan (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  alamat text not null default '',
  npwp text not null default '',
  catatan text not null default '',
  pemotong_pph boolean not null default true,
  aktif boolean not null default true
);

create table public.rute (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  asal text not null default '',
  tujuan text not null default '',
  aktif boolean not null default true
);

create table public.uang_jalan_rute (
  id uuid primary key default gen_random_uuid(),
  rute_id uuid not null references public.rute (id),
  berlaku_mulai date not null,
  nominal numeric(18,2) not null check (nominal >= 0),
  unique (rute_id, berlaku_mulai)
);

create table public.truk (
  id uuid primary key default gen_random_uuid(),
  nopol text not null unique check (length(trim(nopol)) > 0),
  jenis text not null default '',
  aktif boolean not null default true
);

create table public.supir (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  telepon text not null default '',
  aktif boolean not null default true
);

create table public.tarif (
  id uuid primary key default gen_random_uuid(),
  pelanggan_id uuid not null references public.pelanggan (id),
  rute_id uuid not null references public.rute (id),
  material_id uuid not null references public.material (id),
  berlaku_mulai date not null,
  harga_satuan numeric(18,2) not null check (harga_satuan >= 0),
  unique (pelanggan_id, rute_id, material_id, berlaku_mulai)
);

create table public.aturan_upah (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  rute_id uuid references public.rute (id),
  material_id uuid references public.material (id),
  berlaku_mulai date not null,
  basis text not null check (basis in ('per_sj', 'per_satuan')),
  nominal numeric(18,2) not null check (nominal >= 0),
  aktif boolean not null default true
);
create unique index aturan_upah_unik on public.aturan_upah (
  coalesce(rute_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(material_id, '00000000-0000-0000-0000-000000000000'::uuid),
  berlaku_mulai
) where aktif;

-- ---------- RPC simpan ----------

create function public.simpan_lini(p_kode text, p_nama text, p_aktif boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_kode text := upper(trim(p_kode));
begin
  perform internal.wajib_peran('owner');
  insert into public.lini (kode, nama, aktif) values (v_kode, trim(p_nama), coalesce(p_aktif, true))
  on conflict (kode) do update set nama = excluded.nama, aktif = excluded.aktif;
  perform internal.catat_audit('simpan', 'lini', v_kode, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_kode;
end;
$$;

create function public.simpan_material(p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true)
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
    insert into public.material (lini_kode, nama, satuan, aktif)
    values (p_lini_kode, trim(p_nama), trim(p_satuan), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.material
       set lini_kode = p_lini_kode, nama = trim(p_nama), satuan = trim(p_satuan), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Material tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'material', v_id::text, jsonb_build_object('nama', p_nama, 'satuan', p_satuan));
  return v_id;
end;
$$;

create function public.simpan_pelanggan(
  p_id uuid, p_nama text, p_alamat text default '', p_npwp text default '', p_catatan text default '',
  p_pemotong_pph boolean default true, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama pelanggan wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.pelanggan (nama, alamat, npwp, catatan, pemotong_pph, aktif)
    values (trim(p_nama), coalesce(p_alamat, ''), coalesce(p_npwp, ''), coalesce(p_catatan, ''),
            coalesce(p_pemotong_pph, true), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.pelanggan
       set nama = trim(p_nama), alamat = coalesce(p_alamat, ''), npwp = coalesce(p_npwp, ''),
           catatan = coalesce(p_catatan, ''), pemotong_pph = coalesce(p_pemotong_pph, true),
           aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Pelanggan tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'pelanggan', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_rute(p_id uuid, p_nama text, p_asal text default '', p_tujuan text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.rute (nama, asal, tujuan, aktif)
    values (trim(p_nama), coalesce(p_asal, ''), coalesce(p_tujuan, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.rute
       set nama = trim(p_nama), asal = coalesce(p_asal, ''), tujuan = coalesce(p_tujuan, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_uang_jalan_rute(p_rute_id uuid, p_berlaku_mulai date, p_nominal numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rute r where r.id = p_rute_id) then
    raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into public.uang_jalan_rute (rute_id, berlaku_mulai, nominal)
  values (p_rute_id, p_berlaku_mulai, p_nominal)
  on conflict (rute_id, berlaku_mulai) do update set nominal = excluded.nominal
  returning id into v_id;
  perform internal.catat_audit('simpan', 'uang_jalan_rute', v_id::text,
    jsonb_build_object('rute_id', p_rute_id, 'berlaku_mulai', p_berlaku_mulai, 'nominal', p_nominal));
  return v_id;
end;
$$;

create function public.simpan_truk(p_id uuid, p_nopol text, p_jenis text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nopol text := upper(regexp_replace(trim(coalesce(p_nopol, '')), '\s+', ' ', 'g'));
begin
  perform internal.wajib_peran('owner', 'operasional');
  if v_nopol = '' then
    raise exception 'Nomor polisi wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.truk (nopol, jenis, aktif) values (v_nopol, coalesce(p_jenis, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.truk set nopol = v_nopol, jenis = coalesce(p_jenis, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Truk tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'truk', v_id::text, jsonb_build_object('nopol', v_nopol, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_supir(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama supir wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.supir (nama, telepon, aktif) values (trim(p_nama), coalesce(p_telepon, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.supir set nama = trim(p_nama), telepon = coalesce(p_telepon, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Supir tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'supir', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_tarif(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_harga_satuan numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  insert into public.tarif (pelanggan_id, rute_id, material_id, berlaku_mulai, harga_satuan)
  values (p_pelanggan_id, p_rute_id, p_material_id, p_berlaku_mulai, p_harga_satuan)
  on conflict (pelanggan_id, rute_id, material_id, berlaku_mulai) do update set harga_satuan = excluded.harga_satuan
  returning id into v_id;
  perform internal.catat_audit('simpan', 'tarif', v_id::text,
    jsonb_build_object('pelanggan_id', p_pelanggan_id, 'rute_id', p_rute_id, 'material_id', p_material_id,
                       'berlaku_mulai', p_berlaku_mulai, 'harga_satuan', p_harga_satuan));
  return v_id;
end;
$$;

create function public.simpan_aturan_upah(
  p_id uuid, p_nama text, p_rute_id uuid, p_material_id uuid, p_berlaku_mulai date, p_basis text,
  p_nominal numeric, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_id is null then
    insert into public.aturan_upah (nama, rute_id, material_id, berlaku_mulai, basis, nominal, aktif)
    values (trim(p_nama), p_rute_id, p_material_id, p_berlaku_mulai, p_basis, p_nominal, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_upah
       set nama = trim(p_nama), rute_id = p_rute_id, material_id = p_material_id, berlaku_mulai = p_berlaku_mulai,
           basis = p_basis, nominal = p_nominal, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan upah tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_upah', v_id::text,
    jsonb_build_object('nama', p_nama, 'basis', p_basis, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- ---------- Nilai berlaku (baca) ----------

create function public.uang_jalan_berlaku(p_rute_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select u.nominal from public.uang_jalan_rute u
  where u.rute_id = p_rute_id and u.berlaku_mulai <= p_tanggal
  order by u.berlaku_mulai desc limit 1
$$;

create function public.tarif_berlaku(p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select t.harga_satuan from public.tarif t
  where t.pelanggan_id = p_pelanggan_id and t.rute_id = p_rute_id and t.material_id = p_material_id
    and t.berlaku_mulai <= p_tanggal
  order by t.berlaku_mulai desc limit 1
$$;

-- Urutan: rute+material > rute saja > material saja > default; lalu tanggal berlaku terbaru.
create function public.upah_berlaku(p_rute_id uuid, p_material_id uuid, p_tanggal date, p_qty numeric) returns numeric
language sql stable set search_path = '' as $$
  select case a.basis when 'per_sj' then a.nominal else round(a.nominal * coalesce(p_qty, 0), 2) end
  from public.aturan_upah a
  where a.aktif and a.berlaku_mulai <= p_tanggal
    and (a.rute_id is null or a.rute_id = p_rute_id)
    and (a.material_id is null or a.material_id = p_material_id)
  order by (a.rute_id is not null)::int * 2 + (a.material_id is not null)::int desc, a.berlaku_mulai desc
  limit 1
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- master`
Expected: PASS, 14 tes.

- [ ] **Step 5: Buat `apps/bul/db/tests/fixtures.mjs`**

```js
import { sebagai, unik } from './helpers.mjs';

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

/**
 * Membuat satu set master lengkap untuk satu lini.
 * Semua nilai uang dikirim sebagai string agar tidak melewati float.
 */
export async function siapkanMaster(owner, opsi = {}) {
  const {
    lini = 'SJP',
    tanggal = '2026-01-01',
    harga = '63000',
    uangJalan = '400000',
    upah = '150000',
    basis = 'per_sj',
  } = opsi;
  const { id: pelanggan } = await satu(owner, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('PLG-')]);
  const { id: rute } = await satu(owner, 'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3) as id', [unik('RUTE-'), 'Pasir JB', 'Bogor']);
  await sebagai(owner, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, tanggal, uangJalan]);
  const { id: material } = await satu(owner, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', [lini, unik('MAT-'), 'm3']);
  const { id: truk } = await satu(owner, 'select public.simpan_truk(p_id => null, p_nopol => $1, p_jenis => $2) as id', [unik('B '), 'Dump']);
  const { id: supir } = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
  await sebagai(owner, 'select public.simpan_tarif($1, $2, $3, $4, $5)', [pelanggan, rute, material, tanggal, harga]);
  await sebagai(owner,
    'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => $2, p_material_id => null, p_berlaku_mulai => $3, p_basis => $4, p_nominal => $5)',
    [unik('UPAH-'), rute, tanggal, basis, upah]);
  return { lini, pelanggan, rute, material, truk, supir };
}
```

- [ ] **Step 6: Jalankan seluruh tes DB**

Run: `npm run test:db`
Expected: PASS semua file (fondasi + master).

- [ ] **Step 7: Commit**

```bash
git add apps/bul
git commit -m "feat(bul): master data tables, save RPCs and effective-date lookups"
```

---

### Task 3: Inti akuntansi — COA, pengaturan, mesin jurnal, jurnal manual

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000300_akuntansi_inti.sql`
- Create: `apps/bul/db/tests/akuntansi.test.mjs`

**Interfaces:**
- Consumes: Task 1–2.
- Produces (tabel): `akun(kode,nama,induk_kode,tipe,saldo_normal,kas_bank,aktif)`, `pengaturan_posting(kunci,akun_kode,keterangan)`, `pengaturan_pajak(berlaku_mulai,pp55_aktif,tarif_pph_final,batas_omzet)`, `kunci_periode(id,terkunci_sampai)`, `jurnal(id,nomor,tanggal,keterangan,sumber_tipe,sumber_id,membalik_id,dibalik_oleh_id,dibuat_oleh,dibuat_pada)`, `jurnal_baris(id,jurnal_id,urutan,akun_kode,debit,kredit,keterangan,lini_kode,truk_id,supir_id,pelanggan_id,rute_id)`; view `v_buku_besar`.
- Produces (internal):
  - `internal.posting_jurnal(p_tanggal date, p_keterangan text, p_sumber_tipe text, p_sumber_id uuid, p_baris jsonb, p_membalik_id uuid default null) → uuid`. `p_baris` = array objek `{akun_kode, debit?, kredit?, keterangan?, lini_kode?, truk_id?, supir_id?, pelanggan_id?, rute_id?}`; baris bernilai 0/0 dilewati.
  - `internal.balik_jurnal(p_jurnal_id uuid, p_tanggal date, p_alasan text) → uuid`
  - `internal.akun_posting(p_kunci text) → text`
- Produces (public): `kategori_akun(p_kode text) → text`, `pajak_berlaku(p_tanggal date) → table(berlaku_mulai, pp55_aktif, tarif_pph_final, batas_omzet)`, `simpan_akun(p_kode, p_nama, p_induk_kode, p_tipe, p_saldo_normal, p_kas_bank default false, p_aktif default true) → text` [owner], `atur_pengaturan_posting(p_kunci text, p_akun_kode text) → void` [owner], `simpan_pengaturan_pajak(p_berlaku_mulai date, p_pp55_aktif boolean, p_tarif_pph_final numeric, p_batas_omzet numeric) → void` [owner], `atur_kunci_periode(p_sampai date) → void` [owner], `buat_jurnal_manual(p_tanggal date, p_keterangan text, p_baris jsonb) → uuid` [owner, keuangan], `batalkan_jurnal_manual(p_id uuid, p_alasan text, p_tanggal date default current_date) → uuid` [owner, keuangan].
- Kunci `pengaturan_posting`: `piutang_usaha`=1121, `pendapatan_jasa`=4100, `beban_uang_jalan`=5150, `beban_upah_sopir`=5130, `hutang_upah_sopir`=2121, `beban_pph_final`=6251.

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/akuntansi.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { pool, sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, viewer, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  viewer = await buatPengguna('viewer');
  m = await siapkanMaster(owner);
});
afterAll(tutup);
afterEach(async () => {
  await sql('update public.kunci_periode set terkunci_sampai = null');
});

const jurnalManual = (uid, tanggal, baris, ket = 'Uji jurnal') =>
  sebagai(uid, 'select public.buat_jurnal_manual($1, $2, $3) as id', [tanggal, ket, JSON.stringify(baris)]).then((r) => r[0].id);

describe('seed akuntansi', () => {
  it('COA bul-accounting + 6251 tersedia', async () => {
    const [{ n }] = await sql('select count(*)::int as n from public.akun');
    expect(n).toBe(160);
    const [a] = await sql("select nama, tipe, saldo_normal from public.akun where kode = '6251'");
    expect(a).toEqual({ nama: 'Beban PPh Final UMKM (PP 55)', tipe: 'detail', saldo_normal: 'debit' });
    const kas = await sql('select kode from public.akun where kas_bank order by kode');
    expect(kas.map((r) => r.kode)).toEqual(['1111', '1112', '1113']);
  });
  it('pengaturan posting default', async () => {
    const rows = await sql('select kunci, akun_kode from public.pengaturan_posting order by kunci');
    expect(rows).toEqual([
      { kunci: 'beban_pph_final', akun_kode: '6251' },
      { kunci: 'beban_uang_jalan', akun_kode: '5150' },
      { kunci: 'beban_upah_sopir', akun_kode: '5130' },
      { kunci: 'hutang_upah_sopir', akun_kode: '2121' },
      { kunci: 'pendapatan_jasa', akun_kode: '4100' },
      { kunci: 'piutang_usaha', akun_kode: '1121' },
    ]);
  });
  it('pajak berlaku 2026: PP 55 aktif 0,5%', async () => {
    const [p] = await sebagai(viewer, "select * from public.pajak_berlaku('2026-06-01')");
    expect(p).toMatchObject({ pp55_aktif: true, tarif_pph_final: '0.0050', batas_omzet: '4800000000.00' });
  });
  it('kategori_akun', async () => {
    const [r] = await sql("select public.kategori_akun('5130') as a, public.kategori_akun('4100') as b, public.kategori_akun('2121') as c");
    expect(r).toEqual({ a: 'hpp', b: 'pendapatan', c: 'kewajiban' });
  });
});

describe('mesin jurnal lewat jurnal manual', () => {
  it('memposting jurnal seimbang dengan nomor tahunan dan dimensi', async () => {
    const id = await jurnalManual(keu, '2026-02-01', [
      { akun_kode: '5110', debit: '100000', truk_id: m.truk, keterangan: 'Solar' },
      { akun_kode: '1111', kredit: '100000' },
    ]);
    const [j] = await sql('select nomor, sumber_tipe from public.jurnal where id = $1', [id]);
    expect(j.nomor).toMatch(/^JU-2026-\d{6}$/);
    expect(j.sumber_tipe).toBe('manual');
    const baris = await sql('select urutan, akun_kode, debit, kredit, keterangan, truk_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [id]);
    expect(baris).toEqual([
      { urutan: 1, akun_kode: '5110', debit: '100000.00', kredit: '0.00', keterangan: 'Solar', truk_id: m.truk },
      { urutan: 2, akun_kode: '1111', debit: '0.00', kredit: '100000.00', keterangan: 'Uji jurnal', truk_id: null },
    ]);
  });

  it('melewati baris bernilai nol', async () => {
    const id = await jurnalManual(keu, '2026-02-01', [
      { akun_kode: '6150', debit: '50000' },
      { akun_kode: '6160', debit: '0' },
      { akun_kode: '1111', kredit: '50000' },
    ]);
    const [{ n }] = await sql('select count(*)::int as n from public.jurnal_baris where jurnal_id = $1', [id]);
    expect(n).toBe(2);
  });

  it('menolak jurnal tidak seimbang dan tidak menyimpan apa pun', async () => {
    const [{ n: sebelum }] = await sql('select count(*)::int as n from public.jurnal');
    await expect(jurnalManual(keu, '2026-02-01', [
      { akun_kode: '6150', debit: '50000' },
      { akun_kode: '1111', kredit: '40000' },
    ])).rejects.toMatchObject({ code: '23514' });
    const [{ n: sesudah }] = await sql('select count(*)::int as n from public.jurnal');
    expect(sesudah).toBe(sebelum);
  });

  it('menolak akun header, kurang dari dua baris, angka negatif, dan >2 desimal', async () => {
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1110', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1111', debit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '-5' }, { akun_kode: '1111', kredit: '-5' }])).rejects.toMatchObject({ code: '23514' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '1.005' }, { akun_kode: '1111', kredit: '1.005' }])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('menolak akun nonaktif', async () => {
    await sebagai(owner, "select public.simpan_akun('1114', 'Deposito Berjangka', '1110', 'detail', 'debit', false, false)");
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1114', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('jurnal manual tidak boleh menyentuh piutang; hutang upah wajib supir', async () => {
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1121', debit: '1' }, { akun_kode: '4100', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '2121', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '2121', debit: '1', supir_id: m.supir }, { akun_kode: '1111', kredit: '1' }])).resolves.toBeTruthy();
  });

  it('menolak posting di periode terkunci', async () => {
    await sebagai(owner, "select public.atur_kunci_periode('2026-01-31')");
    await expect(jurnalManual(keu, '2026-01-15', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).resolves.toBeTruthy();
    await expect(sebagai(keu, "select public.atur_kunci_periode('2026-12-31')")).rejects.toMatchObject({ code: '42501' });
  });

  it('viewer tidak boleh membuat jurnal', async () => {
    await expect(jurnalManual(viewer, '2026-02-01', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('kekekalan jurnal', () => {
  it('trigger menolak update dan delete bahkan untuk superuser', async () => {
    const id = await jurnalManual(keu, '2026-02-02', [{ akun_kode: '6150', debit: '7' }, { akun_kode: '1111', kredit: '7' }]);
    await expect(sql("update public.jurnal set keterangan = 'ubah' where id = $1", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sql('delete from public.jurnal_baris where jurnal_id = $1', [id])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('constraint tertunda menolak jurnal satu baris yang ditulis langsung', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const { rows } = await c.query(
        "insert into public.jurnal (nomor, tanggal, keterangan, sumber_tipe) values ('UJI-RAW-1', '2026-02-03', 'mentah', 'manual') returning id");
      await c.query("insert into public.jurnal_baris (jurnal_id, urutan, akun_kode, debit, keterangan) values ($1, 1, '1111', 100, 'x')", [rows[0].id]);
      await expect(c.query('commit')).rejects.toMatchObject({ code: '23514' });
    } finally {
      await c.query('rollback').catch(() => {});
      c.release();
    }
  });
});

describe('pembatalan jurnal manual', () => {
  it('membuat jurnal pembalik dan menandai jurnal asal', async () => {
    const id = await jurnalManual(keu, '2026-02-04', [
      { akun_kode: '6150', debit: '25000', truk_id: m.truk },
      { akun_kode: '1111', kredit: '25000' },
    ]);
    const [{ id: pembalik }] = await sebagai(keu, "select public.batalkan_jurnal_manual($1, 'salah input', '2026-02-05') as id", [id]);
    const [asal] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [id]);
    expect(asal.dibalik_oleh_id).toBe(pembalik);
    const [pb] = await sql('select sumber_tipe, membalik_id, tanggal from public.jurnal where id = $1', [pembalik]);
    expect(pb).toEqual({ sumber_tipe: 'pembalik', membalik_id: id, tanggal: '2026-02-05' });
    const baris = await sql('select akun_kode, debit, kredit, truk_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [pembalik]);
    expect(baris).toEqual([
      { akun_kode: '6150', debit: '0.00', kredit: '25000.00', truk_id: m.truk },
      { akun_kode: '1111', debit: '25000.00', kredit: '0.00', truk_id: null },
    ]);
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'lagi', '2026-02-05')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'pembalik', '2026-02-05')", [pembalik])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('alasan wajib dan tanggal batal tidak boleh mundur', async () => {
    const id = await jurnalManual(keu, '2026-02-10', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }]);
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, ' ', '2026-02-10')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'x', '2026-02-09')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('pengaturan akun', () => {
  it('owner menambah akun detail di bawah header', async () => {
    await sebagai(owner, "select public.simpan_akun('6361', 'Beban Uji', '6300', 'detail', 'debit')");
    const [a] = await sql("select induk_kode, aktif from public.akun where kode = '6361'");
    expect(a).toEqual({ induk_kode: '6300', aktif: true });
  });
  it('induk harus header; kode harus 4 digit', async () => {
    await expect(sebagai(owner, "select public.simpan_akun('6362', 'X', '1111', 'detail', 'debit')")).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(owner, "select public.simpan_akun('ABCD', 'X', '6300', 'detail', 'debit')")).rejects.toMatchObject({ code: '23514' });
  });
  it('akun yang dipakai pengaturan posting tidak bisa dinonaktifkan', async () => {
    await expect(sebagai(owner, "select public.simpan_akun('4100', 'Pendapatan Usaha', '4000', 'detail', 'kredit', false, false)")).rejects.toMatchObject({ code: 'P0001' });
  });
  it('pengaturan posting hanya ke akun detail aktif', async () => {
    await expect(sebagai(owner, "select public.atur_pengaturan_posting('pendapatan_jasa', '4000')")).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(owner, "select public.atur_pengaturan_posting('pendapatan_jasa', '4100')");
    await expect(sebagai(keu, "select public.atur_pengaturan_posting('pendapatan_jasa', '4100')")).rejects.toMatchObject({ code: '42501' });
  });
  it('owner menyimpan pengaturan pajak bertanggal', async () => {
    await sebagai(owner, "select public.simpan_pengaturan_pajak('2027-01-01', false, 0.005, 4800000000)");
    const [p] = await sql("select * from public.pajak_berlaku('2027-03-01')");
    expect(p.pp55_aktif).toBe(false);
  });
  it('viewer bisa membaca buku besar', async () => {
    const rows = await sebagai(viewer, 'select nomor, akun_kode from public.v_buku_besar limit 1');
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- akuntansi`
Expected: FAIL — `relation "public.akun" does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000300_akuntansi_inti.sql`**

```sql
-- Inti akuntansi: COA, pengaturan posting & pajak, kunci periode, jurnal, mesin posting, jurnal manual.

create table public.akun (
  kode text primary key check (kode ~ '^[0-9]{4}$'),
  nama text not null check (length(trim(nama)) > 0),
  induk_kode text references public.akun (kode),
  tipe text not null check (tipe in ('header', 'detail')),
  saldo_normal text not null check (saldo_normal in ('debit', 'kredit')),
  kas_bank boolean not null default false,
  aktif boolean not null default true,
  check (not kas_bank or tipe = 'detail')
);

-- Sumber: apps/bul-accounting/src/data/chartOfAccounts.js (+ 6251).
insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
-- (160 baris VALUES dari blok "Seed COA" di bawah — salin persis)
;

create function public.kategori_akun(p_kode text) returns text
language sql immutable set search_path = '' as $$
  select case left(p_kode, 1)
    when '1' then 'aset' when '2' then 'kewajiban' when '3' then 'ekuitas'
    when '4' then 'pendapatan' when '5' then 'hpp' when '6' then 'beban'
    when '7' then 'pendapatan_lain' when '8' then 'beban_lain' else 'penutup' end
$$;

create table public.pengaturan_posting (
  kunci text primary key check (kunci in (
    'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final')),
  akun_kode text not null references public.akun (kode),
  keterangan text not null
);
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('piutang_usaha', '1121', 'Piutang pelanggan (bersih setelah potong uang jalan)'),
  ('pendapatan_jasa', '4100', 'Pendapatan jasa angkut (bruto)'),
  ('beban_uang_jalan', '5150', 'Uang jalan diakui saat invoice terbit'),
  ('beban_upah_sopir', '5130', 'Upah supir diakui saat SJ selesai'),
  ('hutang_upah_sopir', '2121', 'Hutang upah supir sampai dibayar'),
  ('beban_pph_final', '6251', 'PPh final PP 55 yang dipotong pelanggan');

create table public.pengaturan_pajak (
  berlaku_mulai date primary key,
  pp55_aktif boolean not null,
  tarif_pph_final numeric(6,4) not null check (tarif_pph_final >= 0 and tarif_pph_final < 1),
  batas_omzet numeric(18,2) not null check (batas_omzet > 0)
);
insert into public.pengaturan_pajak values ('2026-01-01', true, 0.005, 4800000000);

create table public.kunci_periode (
  id boolean primary key default true check (id),
  terkunci_sampai date
);
insert into public.kunci_periode (id, terkunci_sampai) values (true, null);

create table public.jurnal (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  tanggal date not null,
  keterangan text not null check (length(trim(keterangan)) > 0),
  sumber_tipe text not null check (sumber_tipe in (
    'saldo_awal', 'sj_selesai', 'invoice', 'pembayaran', 'kas', 'manual', 'pembalik')),
  sumber_id uuid,
  membalik_id uuid references public.jurnal (id),
  dibalik_oleh_id uuid references public.jurnal (id),
  dibuat_oleh uuid references auth.users (id),
  dibuat_pada timestamptz not null default now()
);
create unique index jurnal_satu_pembalik on public.jurnal (membalik_id) where membalik_id is not null;
create index jurnal_tanggal_idx on public.jurnal (tanggal);
create index jurnal_sumber_idx on public.jurnal (sumber_tipe, sumber_id);

create table public.jurnal_baris (
  id bigint generated always as identity primary key,
  jurnal_id uuid not null references public.jurnal (id),
  urutan int not null,
  akun_kode text not null references public.akun (kode),
  debit numeric(18,2) not null default 0 check (debit >= 0),
  kredit numeric(18,2) not null default 0 check (kredit >= 0),
  keterangan text not null check (length(trim(keterangan)) > 0),
  lini_kode text references public.lini (kode),
  truk_id uuid references public.truk (id),
  supir_id uuid references public.supir (id),
  pelanggan_id uuid references public.pelanggan (id),
  rute_id uuid references public.rute (id),
  check ((debit > 0) <> (kredit > 0)),
  unique (jurnal_id, urutan)
);
create index jurnal_baris_akun_idx on public.jurnal_baris (akun_kode);

-- Keseimbangan dicek saat COMMIT. tg_argv[0] = nama kolom id jurnal pada tabel pemicu.
create function internal.cek_jurnal_seimbang() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_d numeric;
  v_k numeric;
  v_n int;
begin
  select coalesce(sum(debit), 0), coalesce(sum(kredit), 0), count(*)
    into v_d, v_k, v_n
    from public.jurnal_baris where jurnal_id = v_id;
  if v_n < 2 or v_d <> v_k then
    raise exception 'Jurnal % tidak seimbang (debit %, kredit %, baris %)', v_id, v_d, v_k, v_n
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_jurnal_seimbang
  after insert on public.jurnal deferrable initially deferred
  for each row execute function internal.cek_jurnal_seimbang('id');
create constraint trigger trg_jurnal_baris_seimbang
  after insert on public.jurnal_baris deferrable initially deferred
  for each row execute function internal.cek_jurnal_seimbang('jurnal_id');

create function internal.tolak_ubah_jurnal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Jurnal tidak boleh dihapus; gunakan jurnal pembalik' using errcode = 'P0001';
  end if;
  if tg_table_name = 'jurnal'
     and (to_jsonb(old) ->> 'dibalik_oleh_id') is null
     and (to_jsonb(new) ->> 'dibalik_oleh_id') is not null
     and (to_jsonb(new) - 'dibalik_oleh_id') = (to_jsonb(old) - 'dibalik_oleh_id') then
    return new;
  end if;
  raise exception 'Jurnal yang sudah diposting tidak boleh diubah' using errcode = 'P0001';
end;
$$;

create trigger trg_jurnal_tetap before update or delete on public.jurnal
  for each row execute function internal.tolak_ubah_jurnal();
create trigger trg_jurnal_baris_tetap before update or delete on public.jurnal_baris
  for each row execute function internal.tolak_ubah_jurnal();

create function internal.akun_posting(p_kunci text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kode text;
begin
  select pp.akun_kode into v_kode
    from public.pengaturan_posting pp join public.akun a on a.kode = pp.akun_kode
   where pp.kunci = p_kunci and a.tipe = 'detail' and a.aktif;
  if v_kode is null then
    raise exception 'Pengaturan posting % belum valid', p_kunci using errcode = 'P0001';
  end if;
  return v_kode;
end;
$$;

create function internal.posting_jurnal(
  p_tanggal date, p_keterangan text, p_sumber_tipe text, p_sumber_id uuid, p_baris jsonb,
  p_membalik_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_kunci date;
  v_b jsonb;
  v_i int := 0;
  v_d numeric := 0;
  v_k numeric := 0;
  v_debit numeric;
  v_kredit numeric;
  v_akun public.akun;
begin
  if p_tanggal is null then
    raise exception 'Tanggal jurnal wajib diisi' using errcode = 'P0001';
  end if;
  select terkunci_sampai into v_kunci from public.kunci_periode where id;
  if v_kunci is not null and p_tanggal <= v_kunci then
    raise exception 'Periode sampai % sudah dikunci', v_kunci using errcode = 'P0001';
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception 'Baris jurnal harus berupa daftar' using errcode = 'P0001';
  end if;

  insert into public.jurnal (nomor, tanggal, keterangan, sumber_tipe, sumber_id, membalik_id, dibuat_oleh)
  values (
    'JU-' || to_char(p_tanggal, 'YYYY') || '-'
      || lpad(internal.nomor_berikut('jurnal-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0'),
    p_tanggal, p_keterangan, p_sumber_tipe, p_sumber_id, p_membalik_id, auth.uid())
  returning id into v_id;

  for v_b in select value from jsonb_array_elements(p_baris) loop
    v_debit := coalesce(nullif(v_b ->> 'debit', '')::numeric, 0);
    v_kredit := coalesce(nullif(v_b ->> 'kredit', '')::numeric, 0);
    continue when v_debit = 0 and v_kredit = 0;
    if v_debit <> round(v_debit, 2) or v_kredit <> round(v_kredit, 2) then
      raise exception 'Nilai jurnal maksimal 2 desimal' using errcode = 'P0001';
    end if;
    select * into v_akun from public.akun where kode = v_b ->> 'akun_kode';
    if not found then
      raise exception 'Akun % tidak ada', v_b ->> 'akun_kode' using errcode = 'P0001';
    end if;
    if v_akun.tipe <> 'detail' or (not v_akun.aktif and p_membalik_id is null) then
      raise exception 'Akun % bukan akun detail aktif', v_akun.kode using errcode = 'P0001';
    end if;
    v_i := v_i + 1;
    insert into public.jurnal_baris (
      jurnal_id, urutan, akun_kode, debit, kredit, keterangan,
      lini_kode, truk_id, supir_id, pelanggan_id, rute_id)
    values (
      v_id, v_i, v_akun.kode, v_debit, v_kredit,
      coalesce(nullif(trim(v_b ->> 'keterangan'), ''), p_keterangan),
      nullif(v_b ->> 'lini_kode', ''),
      nullif(v_b ->> 'truk_id', '')::uuid,
      nullif(v_b ->> 'supir_id', '')::uuid,
      nullif(v_b ->> 'pelanggan_id', '')::uuid,
      nullif(v_b ->> 'rute_id', '')::uuid);
    v_d := v_d + v_debit;
    v_k := v_k + v_kredit;
  end loop;

  if v_i < 2 then
    raise exception 'Jurnal minimal dua baris bernilai' using errcode = 'P0001';
  end if;
  if v_d <> v_k then
    raise exception 'Jurnal tidak seimbang: debit % kredit %', v_d, v_k using errcode = '23514';
  end if;
  return v_id;
end;
$$;

create function internal.balik_jurnal(p_jurnal_id uuid, p_tanggal date, p_alasan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_asal public.jurnal;
  v_baris jsonb;
  v_id uuid;
begin
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  select * into v_asal from public.jurnal where id = p_jurnal_id for update;
  if not found then
    raise exception 'Jurnal tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_asal.dibalik_oleh_id is not null then
    raise exception 'Jurnal % sudah dibatalkan', v_asal.nomor using errcode = 'P0001';
  end if;
  if v_asal.sumber_tipe = 'pembalik' then
    raise exception 'Jurnal pembalik tidak dapat dibatalkan' using errcode = 'P0001';
  end if;
  if p_tanggal is null or p_tanggal < v_asal.tanggal then
    raise exception 'Tanggal pembatalan tidak boleh sebelum %', v_asal.tanggal using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object(
           'akun_kode', b.akun_kode, 'debit', b.kredit, 'kredit', b.debit,
           'keterangan', 'Pembalik: ' || b.keterangan,
           'lini_kode', b.lini_kode, 'truk_id', b.truk_id, 'supir_id', b.supir_id,
           'pelanggan_id', b.pelanggan_id, 'rute_id', b.rute_id) order by b.urutan)
    into v_baris
    from public.jurnal_baris b where b.jurnal_id = p_jurnal_id;
  v_id := internal.posting_jurnal(
    p_tanggal, 'Pembalik ' || v_asal.nomor || ': ' || trim(p_alasan), 'pembalik', v_asal.sumber_id, v_baris, p_jurnal_id);
  update public.jurnal set dibalik_oleh_id = v_id where id = p_jurnal_id;
  return v_id;
end;
$$;

create view public.v_buku_besar with (security_invoker = true) as
select j.id as jurnal_id, j.nomor, j.tanggal, j.keterangan as jurnal_keterangan, j.sumber_tipe, j.sumber_id,
       j.membalik_id, j.dibalik_oleh_id, b.id as baris_id, b.urutan, b.akun_kode, a.nama as akun_nama,
       b.debit, b.kredit, b.keterangan, b.lini_kode, b.truk_id, b.supir_id, b.pelanggan_id, b.rute_id
  from public.jurnal_baris b
  join public.jurnal j on j.id = b.jurnal_id
  join public.akun a on a.kode = b.akun_kode;

create function public.pajak_berlaku(p_tanggal date)
returns table (berlaku_mulai date, pp55_aktif boolean, tarif_pph_final numeric, batas_omzet numeric)
language sql stable set search_path = '' as $$
  select p.berlaku_mulai, p.pp55_aktif, p.tarif_pph_final, p.batas_omzet
    from public.pengaturan_pajak p
   where p.berlaku_mulai <= p_tanggal
   order by p.berlaku_mulai desc limit 1
$$;

create function public.simpan_akun(
  p_kode text, p_nama text, p_induk_kode text, p_tipe text, p_saldo_normal text,
  p_kas_bank boolean default false, p_aktif boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_induk public.akun;
  v_lama public.akun;
begin
  perform internal.wajib_peran('owner');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama akun wajib diisi' using errcode = 'P0001';
  end if;
  if p_induk_kode is not null then
    select * into v_induk from public.akun where kode = p_induk_kode;
    if not found or v_induk.tipe <> 'header' then
      raise exception 'Induk % harus akun header', p_induk_kode using errcode = 'P0001';
    end if;
  end if;
  select * into v_lama from public.akun where kode = p_kode;
  if found then
    if v_lama.tipe = 'detail' and p_tipe = 'header'
       and exists (select 1 from public.jurnal_baris b where b.akun_kode = p_kode) then
      raise exception 'Akun % sudah dipakai jurnal, tidak bisa dijadikan header', p_kode using errcode = 'P0001';
    end if;
    if not coalesce(p_aktif, true)
       and exists (select 1 from public.pengaturan_posting pp where pp.akun_kode = p_kode) then
      raise exception 'Akun % dipakai pengaturan posting, tidak bisa dinonaktifkan', p_kode using errcode = 'P0001';
    end if;
    update public.akun
       set nama = trim(p_nama), induk_kode = p_induk_kode, tipe = p_tipe, saldo_normal = p_saldo_normal,
           kas_bank = coalesce(p_kas_bank, false), aktif = coalesce(p_aktif, true)
     where kode = p_kode;
  else
    insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank, aktif)
    values (p_kode, trim(p_nama), p_induk_kode, p_tipe, p_saldo_normal, coalesce(p_kas_bank, false), coalesce(p_aktif, true));
  end if;
  perform internal.catat_audit('simpan', 'akun', p_kode,
    jsonb_build_object('nama', p_nama, 'tipe', p_tipe, 'aktif', p_aktif));
  return p_kode;
end;
$$;

create function public.atur_pengaturan_posting(p_kunci text, p_akun_kode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  if not exists (select 1 from public.akun a where a.kode = p_akun_kode and a.tipe = 'detail' and a.aktif) then
    raise exception 'Akun % harus akun detail aktif', p_akun_kode using errcode = 'P0001';
  end if;
  update public.pengaturan_posting set akun_kode = p_akun_kode where kunci = p_kunci;
  if not found then
    raise exception 'Kunci pengaturan % tidak dikenal', p_kunci using errcode = 'P0002';
  end if;
  perform internal.catat_audit('atur', 'pengaturan_posting', p_kunci, jsonb_build_object('akun_kode', p_akun_kode));
end;
$$;

create function public.simpan_pengaturan_pajak(
  p_berlaku_mulai date, p_pp55_aktif boolean, p_tarif_pph_final numeric, p_batas_omzet numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  insert into public.pengaturan_pajak (berlaku_mulai, pp55_aktif, tarif_pph_final, batas_omzet)
  values (p_berlaku_mulai, p_pp55_aktif, p_tarif_pph_final, p_batas_omzet)
  on conflict (berlaku_mulai) do update
    set pp55_aktif = excluded.pp55_aktif, tarif_pph_final = excluded.tarif_pph_final, batas_omzet = excluded.batas_omzet;
  perform internal.catat_audit('simpan', 'pengaturan_pajak', p_berlaku_mulai::text,
    jsonb_build_object('pp55_aktif', p_pp55_aktif, 'tarif', p_tarif_pph_final, 'batas', p_batas_omzet));
end;
$$;

create function public.atur_kunci_periode(p_sampai date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  update public.kunci_periode set terkunci_sampai = p_sampai where id;
  perform internal.catat_audit('atur', 'kunci_periode', null, jsonb_build_object('terkunci_sampai', p_sampai));
end;
$$;

create function public.buat_jurnal_manual(p_tanggal date, p_keterangan text, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_b jsonb;
  v_piutang text;
  v_hutang text;
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan jurnal wajib diisi' using errcode = 'P0001';
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception 'Baris jurnal harus berupa daftar' using errcode = 'P0001';
  end if;
  v_piutang := internal.akun_posting('piutang_usaha');
  v_hutang := internal.akun_posting('hutang_upah_sopir');
  for v_b in select value from jsonb_array_elements(p_baris) loop
    if v_b ->> 'akun_kode' = v_piutang then
      raise exception 'Akun piutang usaha hanya boleh lewat invoice dan pembayaran' using errcode = 'P0001';
    end if;
    if v_b ->> 'akun_kode' = v_hutang and nullif(v_b ->> 'supir_id', '') is null then
      raise exception 'Baris hutang upah wajib memilih supir' using errcode = 'P0001';
    end if;
  end loop;
  v_id := internal.posting_jurnal(p_tanggal, trim(p_keterangan), 'manual', null, p_baris);
  perform internal.catat_audit('buat', 'jurnal', v_id::text, jsonb_build_object('tanggal', p_tanggal));
  return v_id;
end;
$$;

create function public.batalkan_jurnal_manual(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_j public.jurnal;
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_j from public.jurnal where id = p_id;
  if not found then
    raise exception 'Jurnal tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_j.sumber_tipe <> 'manual' then
    raise exception 'Hanya jurnal manual yang dibatalkan di sini; batalkan dokumen sumbernya' using errcode = 'P0001';
  end if;
  v_id := internal.balik_jurnal(p_id, p_tanggal, p_alasan);
  perform internal.catat_audit('batal', 'jurnal', p_id::text, jsonb_build_object('pembalik', v_id, 'alasan', p_alasan));
  return v_id;
end;
$$;

select internal.terapkan_hak_akses();
```

Ganti baris komentar `-- (160 baris VALUES ...)` dengan 160 baris VALUES berikut **persis** (sudah dibuat otomatis dari `chartOfAccounts.js`; jangan diketik ulang):

```sql
  ('1000', 'ASET', null, 'header', 'debit', false),
  ('1100', 'Aset Lancar', '1000', 'header', 'debit', false),
  ('1110', 'Kas dan Setara Kas', '1100', 'header', 'debit', false),
  ('1111', 'Kas Kecil', '1110', 'detail', 'debit', true),
  ('1112', 'Bank BCA Operasional', '1110', 'detail', 'debit', true),
  ('1113', 'Bank Mandiri Operasional', '1110', 'detail', 'debit', true),
  ('1114', 'Deposito Berjangka', '1110', 'detail', 'debit', false),
  ('1120', 'Piutang Usaha', '1100', 'header', 'debit', false),
  ('1121', 'Piutang Pelanggan - Proyek', '1120', 'detail', 'debit', false),
  ('1122', 'Piutang Tagihan Belum Ditagih', '1120', 'detail', 'debit', false),
  ('1130', 'Cadangan Kerugian Piutang', '1100', 'detail', 'kredit', false),
  ('1140', 'Persediaan Operasional', '1100', 'header', 'debit', false),
  ('1141', 'Persediaan Solar/BBM', '1140', 'detail', 'debit', false),
  ('1142', 'Persediaan Oli & Pelumas', '1140', 'detail', 'debit', false),
  ('1143', 'Persediaan Sparepart', '1140', 'detail', 'debit', false),
  ('1144', 'Persediaan Ban', '1140', 'detail', 'debit', false),
  ('1150', 'Uang Muka', '1100', 'header', 'debit', false),
  ('1151', 'Uang Muka Sopir/Uang Jalan', '1150', 'detail', 'debit', false),
  ('1152', 'Uang Muka Pembelian Sparepart', '1150', 'detail', 'debit', false),
  ('1153', 'Uang Muka Pembelian BBM', '1150', 'detail', 'debit', false),
  ('1160', 'Biaya Dibayar di Muka', '1100', 'header', 'debit', false),
  ('1161', 'Sewa Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1162', 'Asuransi Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1163', 'STNK/KIR/Izin Trayek Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1170', 'Pajak Dibayar di Muka', '1100', 'header', 'debit', false),
  ('1171', 'PPN Masukan', '1170', 'detail', 'debit', false),
  ('1172', 'PPh 23 Dibayar di Muka', '1170', 'detail', 'debit', false),
  ('1173', 'PPh 25 Dibayar di Muka', '1170', 'detail', 'debit', false),
  ('1180', 'Aset Lancar Lainnya', '1100', 'header', 'debit', false),
  ('1181', 'Piutang Karyawan', '1180', 'detail', 'debit', false),
  ('1182', 'Saldo E-Toll / Deposit Tol', '1180', 'detail', 'debit', false),
  ('1200', 'Aset Tidak Lancar', '1000', 'header', 'debit', false),
  ('1210', 'Aset Tetap', '1200', 'header', 'debit', false),
  ('1211', 'Tanah', '1210', 'detail', 'debit', false),
  ('1212', 'Bangunan/Gudang', '1210', 'detail', 'debit', false),
  ('1213', 'Kendaraan Truck', '1210', 'detail', 'debit', false),
  ('1214', 'Kendaraan Operasional Kantor', '1210', 'detail', 'debit', false),
  ('1215', 'Alat Bengkel', '1210', 'detail', 'debit', false),
  ('1216', 'Peralatan Kantor', '1210', 'detail', 'debit', false),
  ('1217', 'Furnitur & Inventaris', '1210', 'detail', 'debit', false),
  ('1218', 'Komputer & Printer', '1210', 'detail', 'debit', false),
  ('1219', 'GPS/Tracker Armada', '1210', 'detail', 'debit', false),
  ('1220', 'Akumulasi Penyusutan', '1200', 'header', 'debit', false),
  ('1221', 'Akumulasi Penyusutan Bangunan/Gudang', '1220', 'detail', 'kredit', false),
  ('1222', 'Akumulasi Penyusutan Kendaraan Truck', '1220', 'detail', 'kredit', false),
  ('1223', 'Akumulasi Penyusutan Kendaraan Operasional', '1220', 'detail', 'kredit', false),
  ('1224', 'Akumulasi Penyusutan Alat Bengkel', '1220', 'detail', 'kredit', false),
  ('1225', 'Akumulasi Penyusutan Peralatan Kantor', '1220', 'detail', 'kredit', false),
  ('1226', 'Akumulasi Penyusutan Furnitur & Inventaris', '1220', 'detail', 'kredit', false),
  ('1227', 'Akumulasi Penyusutan Komputer & Printer', '1220', 'detail', 'kredit', false),
  ('1228', 'Akumulasi Penyusutan GPS/Tracker Armada', '1220', 'detail', 'kredit', false),
  ('1240', 'Aset Lain-lain', '1200', 'header', 'debit', false),
  ('1241', 'Uang Jaminan', '1240', 'detail', 'debit', false),
  ('1242', 'Deposit Sewa', '1240', 'detail', 'debit', false),
  ('2000', 'KEWAJIBAN', null, 'header', 'kredit', false),
  ('2100', 'Kewajiban Lancar', '2000', 'header', 'kredit', false),
  ('2110', 'Hutang Usaha', '2100', 'header', 'kredit', false),
  ('2111', 'Hutang Supplier BBM', '2110', 'detail', 'kredit', false),
  ('2112', 'Hutang Supplier Sparepart', '2110', 'detail', 'kredit', false),
  ('2113', 'Hutang Bengkel/Servis', '2110', 'detail', 'kredit', false),
  ('2114', 'Hutang Vendor Lainnya', '2110', 'detail', 'kredit', false),
  ('2120', 'Hutang Operasional', '2100', 'header', 'kredit', false),
  ('2121', 'Hutang Gaji dan Upah', '2120', 'detail', 'kredit', false),
  ('2122', 'Hutang Uang Jalan Sopir', '2120', 'detail', 'kredit', false),
  ('2123', 'Hutang Tol/Parkir/Retribusi', '2120', 'detail', 'kredit', false),
  ('2124', 'Biaya Masih Harus Dibayar', '2120', 'detail', 'kredit', false),
  ('2130', 'Hutang Pajak', '2100', 'header', 'kredit', false),
  ('2131', 'Hutang PPh 21', '2130', 'detail', 'kredit', false),
  ('2132', 'Hutang PPh 23', '2130', 'detail', 'kredit', false),
  ('2133', 'Hutang PPh 29', '2130', 'detail', 'kredit', false),
  ('2134', 'Hutang PPN Keluaran', '2130', 'detail', 'kredit', false),
  ('2135', 'Hutang Pajak Kendaraan', '2130', 'detail', 'kredit', false),
  ('2140', 'Pendapatan Diterima di Muka', '2100', 'header', 'kredit', false),
  ('2141', 'Uang Muka Pelanggan', '2140', 'detail', 'kredit', false),
  ('2150', 'Hutang Jangka Pendek Lainnya', '2100', 'header', 'kredit', false),
  ('2151', 'Hutang Leasing Jatuh Tempo < 1 Tahun', '2150', 'detail', 'kredit', false),
  ('2152', 'Hutang Bank Jangka Pendek', '2150', 'detail', 'kredit', false),
  ('2153', 'Hutang Pemegang Saham', '2150', 'detail', 'kredit', false),
  ('2200', 'Kewajiban Jangka Panjang', '2000', 'header', 'kredit', false),
  ('2210', 'Hutang Bank Jangka Panjang', '2200', 'detail', 'kredit', false),
  ('2220', 'Hutang Leasing Kendaraan > 1 Tahun', '2200', 'detail', 'kredit', false),
  ('2230', 'Liabilitas Imbalan Kerja', '2200', 'detail', 'kredit', false),
  ('2240', 'Kewajiban Jangka Panjang Lainnya', '2200', 'detail', 'kredit', false),
  ('3000', 'EKUITAS', null, 'header', 'kredit', false),
  ('3100', 'Modal', '3000', 'header', 'kredit', false),
  ('3110', 'Modal Disetor', '3100', 'detail', 'kredit', false),
  ('3120', 'Tambahan Modal Disetor', '3100', 'detail', 'kredit', false),
  ('3200', 'Saldo Laba', '3000', 'header', 'kredit', false),
  ('3210', 'Saldo Laba Ditahan', '3200', 'detail', 'kredit', false),
  ('3220', 'Laba/Rugi Tahun Berjalan', '3200', 'detail', 'kredit', false),
  ('3230', 'Prive Pemilik', '3000', 'detail', 'debit', false),
  ('4000', 'PENDAPATAN', null, 'header', 'kredit', false),
  ('4100', 'Pendapatan Usaha', '4000', 'detail', 'kredit', false),
  ('4200', 'Potongan & Penyesuaian Pendapatan', '4000', 'header', 'kredit', false),
  ('4210', 'Potongan Penjualan Jasa', '4200', 'detail', 'debit', false),
  ('5000', 'BEBAN POKOK PENDAPATAN', null, 'header', 'debit', false),
  ('5100', 'Beban Langsung Armada', '5000', 'header', 'debit', false),
  ('5110', 'BBM Armada', '5100', 'detail', 'debit', false),
  ('5120', 'Oli & Pelumas Armada', '5100', 'detail', 'debit', false),
  ('5130', 'Upah Sopir', '5100', 'detail', 'debit', false),
  ('5140', 'Upah Kernet/Helper', '5100', 'detail', 'debit', false),
  ('5150', 'Uang Jalan, Makan & Penginapan Sopir', '5100', 'detail', 'debit', false),
  ('5160', 'Tol, Parkir & Retribusi Jalan', '5100', 'detail', 'debit', false),
  ('5170', 'Jasa Bongkar Muat/Loader', '5100', 'detail', 'debit', false),
  ('5180', 'Komisi Ritase/Dispatcher', '5100', 'detail', 'debit', false),
  ('5190', 'Sewa Truck Pihak Ketiga', '5100', 'detail', 'debit', false),
  ('5200', 'Perawatan Armada', '5000', 'header', 'debit', false),
  ('5210', 'Servis & Perbaikan Berkala', '5200', 'detail', 'debit', false),
  ('5220', 'Sparepart Armada', '5200', 'detail', 'debit', false),
  ('5230', 'Ban & Vulkanisir', '5200', 'detail', 'debit', false),
  ('5240', 'Cuci, Grease & Aksesoris Kecil', '5200', 'detail', 'debit', false),
  ('5250', 'STNK, KIR & Izin Trayek', '5200', 'detail', 'debit', false),
  ('5260', 'Asuransi Armada', '5200', 'detail', 'debit', false),
  ('5270', 'Penyusutan Truck', '5200', 'detail', 'debit', false),
  ('5280', 'Klaim/Kerusakan Muatan', '5200', 'detail', 'debit', false),
  ('6000', 'BEBAN USAHA / OPERASIONAL', null, 'header', 'debit', false),
  ('6100', 'Beban Umum & Administrasi', '6000', 'header', 'debit', false),
  ('6110', 'Gaji Staf Kantor', '6100', 'detail', 'debit', false),
  ('6120', 'Tunjangan & Lembur Staf', '6100', 'detail', 'debit', false),
  ('6130', 'BPJS Tenaga Kerja & Kesehatan', '6100', 'detail', 'debit', false),
  ('6140', 'ATK & Cetakan Surat Jalan', '6100', 'detail', 'debit', false),
  ('6150', 'Listrik, Air & Internet', '6100', 'detail', 'debit', false),
  ('6160', 'Telepon & Pulsa Operasional', '6100', 'detail', 'debit', false),
  ('6170', 'Sewa Kantor/Gudang', '6100', 'detail', 'debit', false),
  ('6180', 'Perawatan Kantor/Gudang', '6100', 'detail', 'debit', false),
  ('6190', 'Bahan Kebersihan & Rumah Tangga', '6100', 'detail', 'debit', false),
  ('6200', 'Beban Administrasi', '6000', 'header', 'debit', false),
  ('6210', 'Administrasi Bank', '6200', 'detail', 'debit', false),
  ('6220', 'Biaya Transfer & Materai', '6200', 'detail', 'debit', false),
  ('6230', 'Jasa Profesional (Akuntan/Konsultan/Legal)', '6200', 'detail', 'debit', false),
  ('6240', 'Perizinan & Legalitas Usaha', '6200', 'detail', 'debit', false),
  ('6250', 'Pajak & Retribusi Perusahaan', '6200', 'detail', 'debit', false),
  ('6260', 'Penyusutan Aset Kantor', '6200', 'detail', 'debit', false),
  ('6270', 'Amortisasi Aset Lainnya', '6200', 'detail', 'debit', false),
  ('6280', 'Software & Langganan Sistem', '6200', 'detail', 'debit', false),
  ('6290', 'Beban Piutang Tak Tertagih', '6200', 'detail', 'debit', false),
  ('6300', 'Beban Pemasaran & Lainnya', '6000', 'header', 'debit', false),
  ('6310', 'Promosi & Pemasaran', '6300', 'detail', 'debit', false),
  ('6320', 'Jamuan & Representasi', '6300', 'detail', 'debit', false),
  ('6330', 'Perjalanan Dinas', '6300', 'detail', 'debit', false),
  ('6340', 'Pelatihan & Rekrutmen', '6300', 'detail', 'debit', false),
  ('6350', 'Sumbangan', '6300', 'detail', 'debit', false),
  ('6360', 'Beban Lain-lain Operasional', '6300', 'detail', 'debit', false),
  ('7000', 'PENDAPATAN LAIN-LAIN', null, 'header', 'kredit', false),
  ('7100', 'Pendapatan Bunga Bank', '7000', 'detail', 'kredit', false),
  ('7110', 'Keuntungan Penjualan Aset Tetap', '7000', 'detail', 'kredit', false),
  ('7120', 'Pendapatan Klaim Asuransi', '7000', 'detail', 'kredit', false),
  ('7130', 'Pendapatan Selisih Kurs', '7000', 'detail', 'kredit', false),
  ('7140', 'Pendapatan Lain-lain', '7000', 'detail', 'kredit', false),
  ('8000', 'BEBAN LAIN-LAIN', null, 'header', 'debit', false),
  ('8100', 'Beban Bunga Bank', '8000', 'detail', 'debit', false),
  ('8110', 'Beban Bunga Leasing', '8000', 'detail', 'debit', false),
  ('8120', 'Denda & Penalti', '8000', 'detail', 'debit', false),
  ('8130', 'Kerugian Penjualan Aset Tetap', '8000', 'detail', 'debit', false),
  ('8140', 'Beban Selisih Kurs', '8000', 'detail', 'debit', false),
  ('8150', 'Beban Lain-lain', '8000', 'detail', 'debit', false),
  ('9000', 'AKUN PENUTUP', null, 'header', 'debit', false),
  ('9100', 'Ikhtisar Laba/Rugi', '9000', 'detail', 'kredit', false),
  ('9110', 'Pajak Penghasilan Badan', '9000', 'detail', 'debit', false),
  ('6251', 'Beban PPh Final UMKM (PP 55)', '6200', 'detail', 'debit', false)
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- akuntansi`
Expected: PASS, 22 tes.

- [ ] **Step 5: Jalankan seluruh tes DB**

Run: `npm run test:db`
Expected: PASS semua file.

- [ ] **Step 6: Commit**

```bash
git add apps/bul
git commit -m "feat(bul): chart of accounts, immutable balanced journal engine and manual journals"
```

---

### Task 4: Surat jalan

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000400_surat_jalan.sql`
- Create: `apps/bul/db/tests/sj.test.mjs`
- Modify: `apps/bul/db/tests/fixtures.mjs` (tambah `buatSj`, `buatSjSelesai`)

**Interfaces:**
- Consumes: Task 2 (`uang_jalan_berlaku`, `upah_berlaku`), Task 3 (`internal.posting_jurnal`, `internal.balik_jurnal`, `internal.akun_posting`).
- Produces (tabel): `surat_jalan(id, lini_kode, nomor, tanggal, pelanggan_id, rute_id, material_id, truk_id, supir_id, qty_muat, qty_bongkar, uang_jalan, upah, status, tanggal_selesai, invoice_id, jurnal_upah_id, keterangan, alasan_batal, dibuat_oleh, dibuat_pada, diubah_oleh, diubah_pada)`. `status ∈ {berangkat, selesai, batal}`. `invoice_id` diberi FK di Task 5.
- Produces (RPC, peran owner/operasional):
  - `buat_sj(p_lini_kode text, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric default null, p_keterangan text default '') → uuid`
  - `ubah_sj(p_id uuid, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric, p_keterangan text default '') → uuid` (hanya status `berangkat`)
  - `selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null) → uuid`
  - `batalkan_sj(p_id uuid, p_alasan text, p_tanggal date default current_date) → uuid`
- Produces (JS fixtures): `buatSj(uid, m, opsi) → id`, `buatSjSelesai(uid, m, opsi) → id`.

- [ ] **Step 1: Tambahkan ke `apps/bul/db/tests/fixtures.mjs`**

```js
export async function buatSj(uid, m, opsi = {}) {
  const { nomor = unik('SJ'), tanggal = '2026-02-02', qty = '10', uangJalan = null } = opsi;
  const [r] = await sebagai(uid,
    `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
       p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10) as id`,
    [m.lini, nomor, tanggal, m.pelanggan, m.rute, m.material, m.truk, m.supir, qty, uangJalan]);
  return r.id;
}

export async function buatSjSelesai(uid, m, opsi = {}) {
  const { qtyBongkar = opsi.qty ?? '10', tanggalSelesai = opsi.tanggal ?? '2026-02-02', upah = null } = opsi;
  const id = await buatSj(uid, m, opsi);
  await sebagai(uid, 'select public.selesaikan_sj($1, $2, $3, $4)', [id, qtyBongkar, tanggalSelesai, upah]);
  return id;
}
```

- [ ] **Step 2: Tulis tes gagal `apps/bul/db/tests/sj.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSj, buatSjSelesai } from './fixtures.mjs';

let owner, ops, keu, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const ambilSj = async (id) => (await sql('select * from public.surat_jalan where id = $1', [id]))[0];

describe('buat SJ', () => {
  it('mengambil uang jalan dari master menurut tanggal SJ', async () => {
    const id = await buatSj(ops, m);
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'berangkat', uang_jalan: '400000.00', qty_muat: '10.000', lini_kode: 'SJP' });
  });
  it('uang jalan boleh diisi manual', async () => {
    const id = await buatSj(ops, m, { uangJalan: '375000' });
    expect((await ambilSj(id)).uang_jalan).toBe('375000.00');
  });
  it('menolak uang jalan yang belum diatur untuk tanggal itu', async () => {
    await expect(buatSj(ops, m, { tanggal: '2025-12-15' })).rejects.toMatchObject({ code: 'P0001' });
  });
  it('material harus milik lini SJ', async () => {
    await expect(buatSj(ops, { ...m, lini: 'SJT' })).rejects.toMatchObject({ code: 'P0001' });
  });
  it('nomor unik per lini di antara SJ yang tidak batal', async () => {
    const nomor = unik('SJ');
    await buatSj(ops, m, { nomor });
    await expect(buatSj(ops, m, { nomor })).rejects.toMatchObject({ code: '23505' });
  });
  it('keuangan tidak boleh membuat SJ', async () => {
    await expect(buatSj(keu, m)).rejects.toMatchObject({ code: '42501' });
  });
  it('ubah_sj hanya untuk status berangkat', async () => {
    const id = await buatSj(ops, m);
    await sebagai(ops,
      `select public.ubah_sj(p_id => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5, p_material_id => $6,
        p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10)`,
      [id, 'SJ-UBAH-1', '2026-02-03', m.pelanggan, m.rute, m.material, m.truk, m.supir, '11', '410000']);
    expect(await ambilSj(id)).toMatchObject({ nomor: 'SJ-UBAH-1', qty_muat: '11.000', uang_jalan: '410000.00' });
    await sebagai(ops, "select public.selesaikan_sj($1, '11', '2026-02-03')", [id]);
    await expect(sebagai(ops,
      `select public.ubah_sj(p_id => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5, p_material_id => $6,
        p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10)`,
      [id, 'SJ-UBAH-1', '2026-02-03', m.pelanggan, m.rute, m.material, m.truk, m.supir, '12', '410000'])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('selesaikan SJ', () => {
  it('memposting upah dari aturan: Dr 5130 / Cr 2121 dengan dimensi', async () => {
    const id = await buatSjSelesai(ops, m, { qty: '10', qtyBongkar: '9.5', tanggalSelesai: '2026-02-03' });
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'selesai', qty_bongkar: '9.500', upah: '150000.00', tanggal_selesai: '2026-02-03' });
    const baris = await sql(
      'select akun_kode, debit, kredit, supir_id, truk_id, pelanggan_id, rute_id, lini_kode from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [sj.jurnal_upah_id]);
    expect(baris).toEqual([
      { akun_kode: '5130', debit: '150000.00', kredit: '0.00', supir_id: m.supir, truk_id: m.truk, pelanggan_id: m.pelanggan, rute_id: m.rute, lini_kode: 'SJP' },
      { akun_kode: '2121', debit: '0.00', kredit: '150000.00', supir_id: m.supir, truk_id: m.truk, pelanggan_id: m.pelanggan, rute_id: m.rute, lini_kode: 'SJP' },
    ]);
    const [j] = await sql('select tanggal, sumber_tipe, sumber_id from public.jurnal where id = $1', [sj.jurnal_upah_id]);
    expect(j).toEqual({ tanggal: '2026-02-03', sumber_tipe: 'sj_selesai', sumber_id: id });
  });
  it('upah manual 0 tidak membuat jurnal', async () => {
    const id = await buatSjSelesai(ops, m, { upah: '0' });
    const sj = await ambilSj(id);
    expect(sj.upah).toBe('0.00');
    expect(sj.jurnal_upah_id).toBeNull();
  });
  it('menolak bila tidak ada aturan upah dan tidak diisi manual', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.aturan_upah set aktif = false where rute_id = $1', [lain.rute]);
    const id = await buatSj(ops, lain);
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('menolak selesai dua kali dan tanggal selesai sebelum tanggal SJ', async () => {
    const id = await buatSj(ops, m, { tanggal: '2026-02-05' });
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-04')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-05')", [id]);
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-05')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('batalkan SJ', () => {
  it('SJ selesai dibatalkan dengan jurnal pembalik', async () => {
    const id = await buatSjSelesai(ops, m, { tanggalSelesai: '2026-02-06', tanggal: '2026-02-06' });
    const sebelum = await ambilSj(id);
    await sebagai(ops, "select public.batalkan_sj($1, 'salah truk', '2026-02-07')", [id]);
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'batal', alasan_batal: 'salah truk' });
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [sebelum.jurnal_upah_id]);
    expect(j.dibalik_oleh_id).not.toBeNull();
  });
  it('nomor yang sama boleh dipakai lagi setelah batal', async () => {
    const nomor = unik('SJ');
    const id = await buatSj(ops, m, { nomor });
    await sebagai(ops, "select public.batalkan_sj($1, 'dobel', '2026-02-02')", [id]);
    await expect(buatSj(ops, m, { nomor })).resolves.toBeTruthy();
  });
  it('alasan wajib; batal dua kali ditolak', async () => {
    const id = await buatSj(ops, m);
    await expect(sebagai(ops, "select public.batalkan_sj($1, '', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(ops, "select public.batalkan_sj($1, 'x', '2026-02-02')", [id]);
    await expect(sebagai(ops, "select public.batalkan_sj($1, 'x', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- sj`
Expected: FAIL — `function public.buat_sj(...) does not exist`.

- [ ] **Step 4: Buat `apps/bul/supabase/migrations/20260918000400_surat_jalan.sql`**

```sql
-- Surat jalan: buat, ubah, selesaikan (posting upah), batalkan (jurnal pembalik).

create table public.surat_jalan (
  id uuid primary key default gen_random_uuid(),
  lini_kode text not null references public.lini (kode),
  nomor text not null check (length(trim(nomor)) > 0),
  tanggal date not null,
  pelanggan_id uuid not null references public.pelanggan (id),
  rute_id uuid not null references public.rute (id),
  material_id uuid not null references public.material (id),
  truk_id uuid not null references public.truk (id),
  supir_id uuid not null references public.supir (id),
  qty_muat numeric(12,3) not null check (qty_muat > 0),
  qty_bongkar numeric(12,3) check (qty_bongkar > 0),
  uang_jalan numeric(18,2) not null check (uang_jalan >= 0),
  upah numeric(18,2) check (upah >= 0),
  status text not null default 'berangkat' check (status in ('berangkat', 'selesai', 'batal')),
  tanggal_selesai date,
  invoice_id uuid,
  jurnal_upah_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diubah_oleh uuid,
  diubah_pada timestamptz,
  check (status <> 'selesai' or (qty_bongkar is not null and tanggal_selesai is not null and upah is not null)),
  check (tanggal_selesai is null or tanggal_selesai >= tanggal)
);
create unique index surat_jalan_nomor_unik on public.surat_jalan (lini_kode, nomor) where status <> 'batal';
create index surat_jalan_tanggal_idx on public.surat_jalan (tanggal);
create index surat_jalan_belum_invoice_idx on public.surat_jalan (lini_kode, pelanggan_id) where status = 'selesai' and invoice_id is null;

create function internal.validasi_master_sj(
  p_lini_kode text, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_truk_id uuid, p_supir_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.lini where kode = p_lini_kode and aktif) then
    raise exception 'Lini % tidak aktif', p_lini_kode using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pelanggan where id = p_pelanggan_id and aktif) then
    raise exception 'Pelanggan tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rute where id = p_rute_id and aktif) then
    raise exception 'Rute tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.material where id = p_material_id and aktif and lini_kode = p_lini_kode) then
    raise exception 'Material tidak aktif atau bukan milik lini %', p_lini_kode using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.truk where id = p_truk_id and aktif) then
    raise exception 'Truk tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.supir where id = p_supir_id and aktif) then
    raise exception 'Supir tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
end;
$$;

create function public.buat_sj(
  p_lini_kode text, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid;
  v_uj numeric;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nomor), '') = '' then
    raise exception 'Nomor SJ wajib diisi' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal SJ wajib diisi' using errcode = 'P0001';
  end if;
  perform internal.validasi_master_sj(p_lini_kode, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id);
  v_uj := coalesce(p_uang_jalan, public.uang_jalan_berlaku(p_rute_id, p_tanggal));
  if v_uj is null then
    raise exception 'Uang jalan rute belum diatur untuk tanggal %', p_tanggal using errcode = 'P0001';
  end if;
  insert into public.surat_jalan (
    lini_kode, nomor, tanggal, pelanggan_id, rute_id, material_id, truk_id, supir_id,
    qty_muat, uang_jalan, keterangan, dibuat_oleh)
  values (
    p_lini_kode, trim(p_nomor), p_tanggal, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id,
    p_qty_muat, v_uj, coalesce(p_keterangan, ''), v_uid)
  returning id into v_id;
  perform internal.catat_audit('buat', 'surat_jalan', v_id::text,
    jsonb_build_object('lini', p_lini_kode, 'nomor', trim(p_nomor)));
  return v_id;
end;
$$;

create function public.ubah_sj(
  p_id uuid, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status <> 'berangkat' then
    raise exception 'SJ % berstatus %, tidak bisa diubah; batalkan lalu buat ulang', v_sj.nomor, v_sj.status
      using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nomor), '') = '' or p_tanggal is null or p_uang_jalan is null then
    raise exception 'Nomor, tanggal, dan uang jalan wajib diisi' using errcode = 'P0001';
  end if;
  perform internal.validasi_master_sj(v_sj.lini_kode, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id);
  update public.surat_jalan
     set nomor = trim(p_nomor), tanggal = p_tanggal, pelanggan_id = p_pelanggan_id, rute_id = p_rute_id,
         material_id = p_material_id, truk_id = p_truk_id, supir_id = p_supir_id, qty_muat = p_qty_muat,
         uang_jalan = p_uang_jalan, keterangan = coalesce(p_keterangan, ''), diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('ubah', 'surat_jalan', p_id::text, jsonb_build_object('nomor', trim(p_nomor)));
  return p_id;
end;
$$;

create function public.selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
  v_upah numeric;
  v_jurnal uuid;
  v_dim jsonb;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status <> 'berangkat' then
    raise exception 'SJ % berstatus %, tidak bisa diselesaikan', v_sj.nomor, v_sj.status using errcode = 'P0001';
  end if;
  if p_qty_bongkar is null or p_qty_bongkar <= 0 then
    raise exception 'Qty bongkar harus lebih dari 0' using errcode = 'P0001';
  end if;
  if p_tanggal_selesai is null or p_tanggal_selesai < v_sj.tanggal then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal SJ (%)', v_sj.tanggal using errcode = 'P0001';
  end if;
  v_upah := coalesce(p_upah, public.upah_berlaku(v_sj.rute_id, v_sj.material_id, v_sj.tanggal, p_qty_bongkar));
  if v_upah is null then
    raise exception 'Tidak ada aturan upah yang berlaku untuk SJ %; isi upah manual', v_sj.nomor using errcode = 'P0001';
  end if;
  if v_upah < 0 then
    raise exception 'Upah tidak boleh negatif' using errcode = 'P0001';
  end if;
  if v_upah > 0 then
    v_dim := jsonb_build_object(
      'lini_kode', v_sj.lini_kode, 'truk_id', v_sj.truk_id, 'supir_id', v_sj.supir_id,
      'pelanggan_id', v_sj.pelanggan_id, 'rute_id', v_sj.rute_id);
    v_jurnal := internal.posting_jurnal(
      p_tanggal_selesai, 'Upah SJ ' || v_sj.lini_kode || ' ' || v_sj.nomor, 'sj_selesai', v_sj.id,
      jsonb_build_array(
        v_dim || jsonb_build_object('akun_kode', internal.akun_posting('beban_upah_sopir'), 'debit', v_upah),
        v_dim || jsonb_build_object('akun_kode', internal.akun_posting('hutang_upah_sopir'), 'kredit', v_upah)));
  end if;
  update public.surat_jalan
     set status = 'selesai', qty_bongkar = p_qty_bongkar, tanggal_selesai = p_tanggal_selesai, upah = v_upah,
         jurnal_upah_id = v_jurnal, diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('selesai', 'surat_jalan', p_id::text,
    jsonb_build_object('qty_bongkar', p_qty_bongkar, 'upah', v_upah));
  return p_id;
end;
$$;

create function public.batalkan_sj(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status = 'batal' then
    raise exception 'SJ % sudah batal', v_sj.nomor using errcode = 'P0001';
  end if;
  if v_sj.invoice_id is not null then
    raise exception 'SJ % sudah masuk invoice; batalkan invoice dulu', v_sj.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  if v_sj.jurnal_upah_id is not null then
    perform internal.balik_jurnal(v_sj.jurnal_upah_id, p_tanggal, 'Batal SJ ' || v_sj.nomor || ': ' || trim(p_alasan));
  end if;
  update public.surat_jalan
     set status = 'batal', alasan_batal = trim(p_alasan), diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('batal', 'surat_jalan', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- sj`
Expected: PASS, 14 tes.

- [ ] **Step 6: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua.

```bash
git add apps/bul
git commit -m "feat(bul): delivery notes with wage posting on completion and reversal on cancel"
```

---

### Task 5: Invoice

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000500_invoice.sql`
- Create: `apps/bul/db/tests/invoice.test.mjs`
- Modify: `apps/bul/db/tests/fixtures.mjs` (tambah `terbitkan`)

**Interfaces:**
- Consumes: Task 3 (`posting_jurnal`, `balik_jurnal`, `akun_posting`), Task 2 (`tarif_berlaku`), Task 4 (`surat_jalan`).
- Produces (tabel): `invoice(id, nomor, lini_kode, pelanggan_id, tanggal, jatuh_tempo, subtotal, total_uang_jalan, total_akhir, saldo_awal, status, jurnal_id, jurnal_batal_id, keterangan, alasan_batal, dibuat_oleh, dibuat_pada)`, `invoice_baris(id, invoice_id, surat_jalan_id, qty, harga_satuan, jumlah, uang_jalan, aktif)`.
- Produces (internal): `internal.total_alokasi_invoice(p_invoice_id uuid) → numeric` (Task 5 mengembalikan 0; diganti Task 6), `internal.hitung_baris_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[]) → table(surat_jalan_id, nomor, tanggal, rute_id, material_id, truk_id, supir_id, qty, harga_satuan, jumlah, uang_jalan, masalah)`.
- Produces (RPC):
  - `pratinjau_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[]) → table(sama dengan hitung_baris_invoice)` [semua peran aktif]
  - `terbitkan_invoice(p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_sj_ids uuid[], p_nomor text default null, p_jatuh_tempo date default null, p_keterangan text default '') → uuid` [owner, keuangan]. Nomor otomatis: `{LINI}/{NNN}/{MM}/{YYYY}`, penghitung per lini per tahun.
  - `batalkan_invoice(p_id uuid, p_alasan text, p_tanggal date default current_date) → uuid` [owner, keuangan]
- Produces (JS fixtures): `terbitkan(uid, m, sjIds, opsi) → id`.

- [ ] **Step 1: Tambahkan ke `apps/bul/db/tests/fixtures.mjs`**

```js
export async function terbitkan(uid, m, sjIds, opsi = {}) {
  const { tanggal = '2026-02-10', nomor = null } = opsi;
  const [r] = await sebagai(uid,
    'select public.terbitkan_invoice(p_lini_kode => $1, p_pelanggan_id => $2, p_tanggal => $3, p_sj_ids => $4, p_nomor => $5) as id',
    [m.lini, m.pelanggan, tanggal, sjIds, nomor]);
  return r.id;
}
```

- [ ] **Step 2: Tulis tes gagal `apps/bul/db/tests/invoice.test.mjs`**

```js
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
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- invoice`
Expected: FAIL — `function public.terbitkan_invoice(...) does not exist`.

- [ ] **Step 4: Buat `apps/bul/supabase/migrations/20260918000500_invoice.sql`**

```sql
-- Invoice: pratinjau, terbitkan (posting pendapatan bruto, beban UJ, piutang bersih), batalkan.

create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  nomor text not null check (length(trim(nomor)) > 0),
  lini_kode text not null references public.lini (kode),
  pelanggan_id uuid not null references public.pelanggan (id),
  tanggal date not null,
  jatuh_tempo date,
  subtotal numeric(18,2) not null check (subtotal >= 0),
  total_uang_jalan numeric(18,2) not null check (total_uang_jalan >= 0),
  total_akhir numeric(18,2) not null check (total_akhir >= 0),
  saldo_awal boolean not null default false,
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check (total_akhir = subtotal - total_uang_jalan),
  check (saldo_awal or jurnal_id is not null)
);
create unique index invoice_nomor_unik on public.invoice (nomor) where status = 'terbit';
create index invoice_pelanggan_idx on public.invoice (pelanggan_id, tanggal);

create table public.invoice_baris (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoice (id),
  surat_jalan_id uuid not null references public.surat_jalan (id),
  qty numeric(12,3) not null,
  harga_satuan numeric(18,2) not null,
  jumlah numeric(18,2) not null,
  uang_jalan numeric(18,2) not null,
  aktif boolean not null default true
);
create unique index invoice_baris_sj_aktif on public.invoice_baris (surat_jalan_id) where aktif;

alter table public.surat_jalan
  add constraint surat_jalan_invoice_fk foreign key (invoice_id) references public.invoice (id);

-- Diganti di migrasi pembayaran.
create function internal.total_alokasi_invoice(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select 0::numeric
$$;

create function internal.hitung_baris_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[])
returns table (
  surat_jalan_id uuid, nomor text, tanggal date, rute_id uuid, material_id uuid, truk_id uuid, supir_id uuid,
  qty numeric, harga_satuan numeric, jumlah numeric, uang_jalan numeric, masalah text)
language sql stable security definer set search_path = '' as $$
  with ids as (select distinct unnest(p_sj_ids) as id)
  select ids.id, sj.nomor, sj.tanggal, sj.rute_id, sj.material_id, sj.truk_id, sj.supir_id,
         sj.qty_bongkar, t.harga, round(sj.qty_bongkar * t.harga, 2), sj.uang_jalan,
         case
           when sj.id is null then 'SJ tidak ditemukan'
           when sj.status <> 'selesai' then 'SJ ' || sj.nomor || ' berstatus ' || sj.status
           when sj.invoice_id is not null then 'SJ ' || sj.nomor || ' sudah masuk invoice lain'
           when sj.lini_kode <> p_lini_kode then 'SJ ' || sj.nomor || ' bukan lini ' || p_lini_kode
           when sj.pelanggan_id <> p_pelanggan_id then 'SJ ' || sj.nomor || ' milik pelanggan lain'
           when t.harga is null then 'Tarif belum ada untuk SJ ' || sj.nomor || ' (tanggal ' || sj.tanggal || ')'
         end
    from ids
    left join public.surat_jalan sj on sj.id = ids.id
    left join lateral (
      select public.tarif_berlaku(sj.pelanggan_id, sj.rute_id, sj.material_id, sj.tanggal) as harga
    ) t on true
   order by sj.tanggal, sj.nomor
$$;

create function public.pratinjau_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[])
returns table (
  surat_jalan_id uuid, nomor text, tanggal date, rute_id uuid, material_id uuid, truk_id uuid, supir_id uuid,
  qty numeric, harga_satuan numeric, jumlah numeric, uang_jalan numeric, masalah text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner', 'keuangan', 'operasional', 'viewer');
  return query select * from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids);
end;
$$;

create function public.terbitkan_invoice(
  p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_sj_ids uuid[],
  p_nomor text default null, p_jatuh_tempo date default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_masalah text;
  v_subtotal numeric;
  v_uj numeric;
  v_total numeric;
  v_max_tgl date;
  v_baris jsonb;
  v_dim jsonb;
  v_jurnal uuid;
  v_piutang text;
  v_pendapatan text;
  v_beban_uj text;
  r record;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_sj_ids is null or cardinality(p_sj_ids) = 0 then
    raise exception 'Pilih minimal satu SJ' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal invoice wajib diisi' using errcode = 'P0001';
  end if;

  -- Kunci SJ agar dua penerbitan bersamaan tidak memakai SJ yang sama.
  perform 1 from public.surat_jalan where id = any (p_sj_ids) order by id for update;

  select string_agg(h.masalah, '; ') into v_masalah
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h
   where h.masalah is not null;
  if v_masalah is not null then
    raise exception '%', v_masalah using errcode = 'P0001';
  end if;

  select coalesce(sum(h.jumlah), 0), coalesce(sum(h.uang_jalan), 0), max(h.tanggal)
    into v_subtotal, v_uj, v_max_tgl
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h;
  v_total := v_subtotal - v_uj;
  if v_total < 0 then
    raise exception 'Total uang jalan (%) melebihi subtotal (%)', v_uj, v_subtotal using errcode = 'P0001';
  end if;
  if p_tanggal < v_max_tgl then
    raise exception 'Tanggal invoice tidak boleh sebelum tanggal SJ terakhir (%)', v_max_tgl using errcode = 'P0001';
  end if;

  if coalesce(trim(p_nomor), '') = '' then
    v_nomor := p_lini_kode || '/'
      || lpad(internal.nomor_berikut('invoice-' || p_lini_kode || '-' || to_char(p_tanggal, 'YYYY'))::text, 3, '0')
      || '/' || to_char(p_tanggal, 'MM') || '/' || to_char(p_tanggal, 'YYYY');
  else
    v_nomor := trim(p_nomor);
  end if;
  if exists (select 1 from public.invoice where nomor = v_nomor and status = 'terbit') then
    raise exception 'Nomor invoice % sudah dipakai', v_nomor using errcode = '23505';
  end if;

  v_piutang := internal.akun_posting('piutang_usaha');
  v_pendapatan := internal.akun_posting('pendapatan_jasa');
  v_beban_uj := internal.akun_posting('beban_uang_jalan');

  v_baris := jsonb_build_array(jsonb_build_object(
    'akun_kode', v_piutang, 'debit', v_total, 'lini_kode', p_lini_kode, 'pelanggan_id', p_pelanggan_id,
    'keterangan', 'Piutang invoice ' || v_nomor));
  for r in select * from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) loop
    v_dim := jsonb_build_object(
      'lini_kode', p_lini_kode, 'pelanggan_id', p_pelanggan_id, 'rute_id', r.rute_id,
      'truk_id', r.truk_id, 'supir_id', r.supir_id);
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', v_beban_uj, 'debit', r.uang_jalan, 'keterangan', 'Uang jalan SJ ' || r.nomor),
      v_dim || jsonb_build_object('akun_kode', v_pendapatan, 'kredit', r.jumlah, 'keterangan', 'Pendapatan SJ ' || r.nomor));
  end loop;

  v_jurnal := internal.posting_jurnal(p_tanggal, 'Invoice ' || v_nomor, 'invoice', v_id, v_baris);

  insert into public.invoice (
    id, nomor, lini_kode, pelanggan_id, tanggal, jatuh_tempo, subtotal, total_uang_jalan, total_akhir,
    jurnal_id, keterangan, dibuat_oleh)
  values (
    v_id, v_nomor, p_lini_kode, p_pelanggan_id, p_tanggal, p_jatuh_tempo, v_subtotal, v_uj, v_total,
    v_jurnal, coalesce(p_keterangan, ''), v_uid);

  insert into public.invoice_baris (invoice_id, surat_jalan_id, qty, harga_satuan, jumlah, uang_jalan)
  select v_id, h.surat_jalan_id, h.qty, h.harga_satuan, h.jumlah, h.uang_jalan
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h;

  update public.surat_jalan set invoice_id = v_id, diubah_oleh = v_uid, diubah_pada = now()
   where id = any (p_sj_ids);

  perform internal.catat_audit('terbit', 'invoice', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'subtotal', v_subtotal, 'uang_jalan', v_uj, 'total_akhir', v_total));
  return v_id;
end;
$$;

create function public.batalkan_invoice(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_inv public.invoice;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  select * into v_inv from public.invoice where id = p_id for update;
  if not found then
    raise exception 'Invoice tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_inv.status = 'batal' then
    raise exception 'Invoice % sudah batal', v_inv.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  if internal.total_alokasi_invoice(p_id) > 0 then
    raise exception 'Invoice % sudah memiliki pembayaran; batalkan pembayaran dulu', v_inv.nomor using errcode = 'P0001';
  end if;
  if not v_inv.saldo_awal then
    v_jurnal := internal.balik_jurnal(v_inv.jurnal_id, p_tanggal, 'Batal invoice ' || v_inv.nomor || ': ' || trim(p_alasan));
  end if;
  update public.invoice
     set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan)
   where id = p_id;
  update public.invoice_baris set aktif = false where invoice_id = p_id;
  update public.surat_jalan set invoice_id = null, diubah_oleh = v_uid, diubah_pada = now() where invoice_id = p_id;
  perform internal.catat_audit('batal', 'invoice', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- invoice`
Expected: PASS, 11 tes.

- [ ] **Step 6: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua.

```bash
git add apps/bul
git commit -m "feat(bul): invoices with gross revenue, net receivable and per-trip cost posting"
```

---

### Task 6: Pembayaran pelanggan

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000600_pembayaran.sql`
- Create: `apps/bul/db/tests/pembayaran.test.mjs`

**Interfaces:**
- Consumes: Task 3, Task 5.
- Produces (tabel): `pembayaran(id, nomor, tanggal, pelanggan_id, akun_kas_kode, jumlah_diterima, jumlah_pph, status, jurnal_id, jurnal_batal_id, keterangan, alasan_batal, dibuat_oleh, dibuat_pada)`, `pembayaran_alokasi(id, pembayaran_id, invoice_id, jumlah, aktif)`; view `v_invoice_saldo(id, nomor, lini_kode, pelanggan_id, pelanggan_nama, tanggal, jatuh_tempo, subtotal, total_uang_jalan, total_akhir, dibayar, sisa, status, saldo_awal, keterangan)`.
- Produces (internal): `internal.wajib_akun_kas(p_kode text) → public.akun`; `internal.total_alokasi_invoice` versi nyata.
- Produces (RPC):
  - `catat_pembayaran(p_tanggal date, p_pelanggan_id uuid, p_akun_kas_kode text, p_jumlah_diterima numeric, p_jumlah_pph numeric, p_alokasi jsonb, p_keterangan text default '') → uuid` [owner, keuangan]; `p_alokasi` = `[{invoice_id, jumlah}]`, Σjumlah = diterima + pph. Nomor `BYR-YYYY-NNNNNN`.
  - `batalkan_pembayaran(p_id uuid, p_alasan text, p_tanggal date default current_date) → uuid` [owner, keuangan]
  - `saran_pph_invoice(p_invoice_id uuid, p_tanggal date) → numeric` (baca)

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/pembayaran.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster, buatSjSelesai, terbitkan } from './fixtures.mjs';

let owner, ops, keu;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
});
afterAll(tutup);

// Invoice standar: subtotal 1.417.500, UJ 850.000, total akhir 567.500
async function invoiceStandar() {
  const m = await siapkanMaster(owner);
  const sj1 = await buatSjSelesai(ops, m, { qty: '10' });
  const sj2 = await buatSjSelesai(ops, m, { qty: '12.5', uangJalan: '450000' });
  const id = await terbitkan(keu, m, [sj1, sj2]);
  return { m, id };
}

const bayar = (uid, m, alokasi, { tanggal = '2026-02-20', akun = '1112', diterima, pph = '0' } = {}) =>
  sebagai(uid,
    'select public.catat_pembayaran($1, $2, $3, $4, $5, $6) as id',
    [tanggal, m.pelanggan, akun, diterima, pph, JSON.stringify(alokasi)]).then((r) => r[0].id);

const saldo = async (id) => (await sql('select dibayar, sisa from public.v_invoice_saldo where id = $1', [id]))[0];

describe('catat pembayaran', () => {
  it('saran PPh = 0,5% × subtotal bruto, dibulatkan ke rupiah', async () => {
    const { id } = await invoiceStandar();
    const [{ v }] = await sebagai(keu, "select public.saran_pph_invoice($1, '2026-02-20') as v", [id]);
    expect(v).toBe('7088');
  });

  it('pelunasan penuh dengan PPh dipotong: Dr Bank + Dr 6251 / Cr 1121', async () => {
    const { m, id } = await invoiceStandar();
    const bid = await bayar(keu, m, [{ invoice_id: id, jumlah: '567500' }], { diterima: '560412', pph: '7088' });
    const [p] = await sql('select nomor, jurnal_id from public.pembayaran where id = $1', [bid]);
    expect(p.nomor).toMatch(/^BYR-2026-\d{6}$/);
    const baris = await sql('select akun_kode, debit, kredit, pelanggan_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [p.jurnal_id]);
    expect(baris).toEqual([
      { akun_kode: '1112', debit: '560412.00', kredit: '0.00', pelanggan_id: m.pelanggan },
      { akun_kode: '6251', debit: '7088.00', kredit: '0.00', pelanggan_id: m.pelanggan },
      { akun_kode: '1121', debit: '0.00', kredit: '567500.00', pelanggan_id: m.pelanggan },
    ]);
    expect(await saldo(id)).toEqual({ dibayar: '567500.00', sisa: '0.00' });
  });

  it('pembayaran sebagian lalu sisanya', async () => {
    const { m, id } = await invoiceStandar();
    await bayar(keu, m, [{ invoice_id: id, jumlah: '300000' }], { diterima: '300000' });
    expect(await saldo(id)).toEqual({ dibayar: '300000.00', sisa: '267500.00' });
    await bayar(keu, m, [{ invoice_id: id, jumlah: '267500' }], { diterima: '260412', pph: '7088' });
    expect((await saldo(id)).sisa).toBe('0.00');
  });

  it('satu transfer untuk dua invoice', async () => {
    const m = await siapkanMaster(owner);
    const a = await terbitkan(keu, m, [await buatSjSelesai(ops, m, { qty: '10' })]);
    const b = await terbitkan(keu, m, [await buatSjSelesai(ops, m, { qty: '10' })]);
    await bayar(keu, m, [{ invoice_id: a, jumlah: '230000' }, { invoice_id: b, jumlah: '230000' }], { diterima: '460000' });
    expect((await saldo(a)).sisa).toBe('0.00');
    expect((await saldo(b)).sisa).toBe('0.00');
  });

  it('menolak kelebihan bayar, jumlah tidak cocok, pelanggan lain, akun bukan kas, alokasi ganda', async () => {
    const { m, id } = await invoiceStandar();
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '567501' }], { diterima: '567501' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '500000' }], { diterima: '400000' })).rejects.toMatchObject({ code: 'P0001' });
    const lain = await siapkanMaster(owner);
    await expect(bayar(keu, lain, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000', akun: '5110' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '1000' }, { invoice_id: id, jumlah: '1000' }], { diterima: '2000' })).rejects.toMatchObject({ code: 'P0001' });
  });

  it('operasional tidak boleh mencatat pembayaran', async () => {
    const { m, id } = await invoiceStandar();
    await expect(bayar(ops, m, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000' })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('pembatalan', () => {
  it('batal pembayaran memulihkan sisa; invoice berpembayaran tidak bisa dibatalkan', async () => {
    const { m, id } = await invoiceStandar();
    const bid = await bayar(keu, m, [{ invoice_id: id, jumlah: '567500' }], { diterima: '567500' });
    await expect(sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-21')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(keu, "select public.batalkan_pembayaran($1, 'salah rekening', '2026-02-21')", [bid]);
    expect((await saldo(id)).sisa).toBe('567500.00');
    const [p] = await sql('select status, jurnal_batal_id from public.pembayaran where id = $1', [bid]);
    expect(p.status).toBe('batal');
    expect(p.jurnal_batal_id).not.toBeNull();
    await expect(sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-21')", [id])).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- pembayaran`
Expected: FAIL — `function public.saran_pph_invoice(...) does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000600_pembayaran.sql`**

```sql
-- Pembayaran pelanggan: alokasi ke banyak invoice, PPh final dipotong, pembatalan.

create table public.pembayaran (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  tanggal date not null,
  pelanggan_id uuid not null references public.pelanggan (id),
  akun_kas_kode text not null references public.akun (kode),
  jumlah_diterima numeric(18,2) not null check (jumlah_diterima >= 0),
  jumlah_pph numeric(18,2) not null default 0 check (jumlah_pph >= 0),
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid not null references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check (jumlah_diterima + jumlah_pph > 0)
);

create table public.pembayaran_alokasi (
  id bigint generated always as identity primary key,
  pembayaran_id uuid not null references public.pembayaran (id),
  invoice_id uuid not null references public.invoice (id),
  jumlah numeric(18,2) not null check (jumlah > 0),
  aktif boolean not null default true,
  unique (pembayaran_id, invoice_id)
);
create index pembayaran_alokasi_invoice_idx on public.pembayaran_alokasi (invoice_id) where aktif;

create or replace function internal.total_alokasi_invoice(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.jumlah), 0)
    from public.pembayaran_alokasi a
    join public.pembayaran p on p.id = a.pembayaran_id
   where a.invoice_id = p_invoice_id and a.aktif and p.status = 'terbit'
$$;

create function internal.wajib_akun_kas(p_kode text) returns public.akun
language plpgsql stable security definer set search_path = '' as $$
declare
  v_akun public.akun;
begin
  select * into v_akun from public.akun where kode = p_kode;
  if not found or not v_akun.kas_bank or v_akun.tipe <> 'detail' or not v_akun.aktif then
    raise exception 'Akun % bukan akun kas/bank aktif', p_kode using errcode = 'P0001';
  end if;
  return v_akun;
end;
$$;

create view public.v_invoice_saldo with (security_invoker = true) as
select i.id, i.nomor, i.lini_kode, i.pelanggan_id, p.nama as pelanggan_nama, i.tanggal, i.jatuh_tempo,
       i.subtotal, i.total_uang_jalan, i.total_akhir,
       coalesce(a.dibayar, 0)::numeric(18,2) as dibayar,
       (i.total_akhir - coalesce(a.dibayar, 0))::numeric(18,2) as sisa,
       i.status, i.saldo_awal, i.keterangan
  from public.invoice i
  join public.pelanggan p on p.id = i.pelanggan_id
  left join (
    select pa.invoice_id, sum(pa.jumlah) as dibayar
      from public.pembayaran_alokasi pa
      join public.pembayaran b on b.id = pa.pembayaran_id
     where pa.aktif and b.status = 'terbit'
     group by pa.invoice_id
  ) a on a.invoice_id = i.id;

create function public.saran_pph_invoice(p_invoice_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select case
           when pj.pp55_aktif and pl.pemotong_pph and not i.saldo_awal
             then round(i.subtotal * pj.tarif_pph_final, 0)
           else 0
         end
    from public.invoice i
    join public.pelanggan pl on pl.id = i.pelanggan_id
    cross join lateral public.pajak_berlaku(p_tanggal) pj
   where i.id = p_invoice_id
$$;

create function public.catat_pembayaran(
  p_tanggal date, p_pelanggan_id uuid, p_akun_kas_kode text, p_jumlah_diterima numeric, p_jumlah_pph numeric,
  p_alokasi jsonb, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_akun public.akun;
  v_diterima numeric := coalesce(p_jumlah_diterima, 0);
  v_pph numeric := coalesce(p_jumlah_pph, 0);
  v_a jsonb;
  v_inv public.invoice;
  v_jml numeric;
  v_sisa numeric;
  v_total numeric := 0;
  v_seen uuid[] := '{}';
  v_baris jsonb;
  v_piutang text;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_tanggal is null then
    raise exception 'Tanggal pembayaran wajib diisi' using errcode = 'P0001';
  end if;
  if v_diterima < 0 or v_pph < 0 then
    raise exception 'Jumlah tidak boleh negatif' using errcode = 'P0001';
  end if;
  v_akun := internal.wajib_akun_kas(p_akun_kas_kode);
  if p_alokasi is null or jsonb_typeof(p_alokasi) <> 'array' or jsonb_array_length(p_alokasi) = 0 then
    raise exception 'Alokasi invoice wajib diisi' using errcode = 'P0001';
  end if;

  v_nomor := 'BYR-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('pembayaran-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_piutang := internal.akun_posting('piutang_usaha');
  v_baris := jsonb_build_array(
    jsonb_build_object('akun_kode', v_akun.kode, 'debit', v_diterima, 'pelanggan_id', p_pelanggan_id,
                       'keterangan', 'Penerimaan ' || v_nomor),
    jsonb_build_object('akun_kode', internal.akun_posting('beban_pph_final'), 'debit', v_pph,
                       'pelanggan_id', p_pelanggan_id, 'keterangan', 'PPh final dipotong pelanggan ' || v_nomor));

  for v_a in select value from jsonb_array_elements(p_alokasi) loop
    select * into v_inv from public.invoice where id = nullif(v_a ->> 'invoice_id', '')::uuid for update;
    if not found then
      raise exception 'Invoice tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_inv.id = any (v_seen) then
      raise exception 'Invoice % dialokasikan dua kali', v_inv.nomor using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_inv.id;
    if v_inv.status <> 'terbit' then
      raise exception 'Invoice % sudah batal', v_inv.nomor using errcode = 'P0001';
    end if;
    if v_inv.pelanggan_id <> p_pelanggan_id then
      raise exception 'Invoice % milik pelanggan lain', v_inv.nomor using errcode = 'P0001';
    end if;
    if p_tanggal < v_inv.tanggal then
      raise exception 'Tanggal pembayaran sebelum tanggal invoice %', v_inv.nomor using errcode = 'P0001';
    end if;
    v_jml := nullif(v_a ->> 'jumlah', '')::numeric;
    if v_jml is null or v_jml <= 0 then
      raise exception 'Jumlah alokasi invoice % harus lebih dari 0', v_inv.nomor using errcode = 'P0001';
    end if;
    v_sisa := v_inv.total_akhir - internal.total_alokasi_invoice(v_inv.id);
    if v_jml > v_sisa then
      raise exception 'Alokasi % melebihi sisa piutang invoice % (%)', v_jml, v_inv.nomor, v_sisa using errcode = 'P0001';
    end if;
    v_total := v_total + v_jml;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'akun_kode', v_piutang, 'kredit', v_jml, 'pelanggan_id', p_pelanggan_id, 'lini_kode', v_inv.lini_kode,
      'keterangan', 'Pelunasan ' || v_inv.nomor));
  end loop;

  if v_total <> v_diterima + v_pph then
    raise exception 'Total alokasi (%) harus sama dengan diterima + PPh (%)', v_total, v_diterima + v_pph
      using errcode = 'P0001';
  end if;

  v_jurnal := internal.posting_jurnal(p_tanggal, 'Pembayaran ' || v_nomor, 'pembayaran', v_id, v_baris);

  insert into public.pembayaran (
    id, nomor, tanggal, pelanggan_id, akun_kas_kode, jumlah_diterima, jumlah_pph, jurnal_id, keterangan, dibuat_oleh)
  values (v_id, v_nomor, p_tanggal, p_pelanggan_id, v_akun.kode, v_diterima, v_pph, v_jurnal, coalesce(p_keterangan, ''), v_uid);

  insert into public.pembayaran_alokasi (pembayaran_id, invoice_id, jumlah)
  select v_id, (e ->> 'invoice_id')::uuid, (e ->> 'jumlah')::numeric
    from jsonb_array_elements(p_alokasi) e;

  perform internal.catat_audit('buat', 'pembayaran', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'diterima', v_diterima, 'pph', v_pph));
  return v_id;
end;
$$;

create function public.batalkan_pembayaran(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.pembayaran;
  v_jurnal uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_p from public.pembayaran where id = p_id for update;
  if not found then
    raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_p.status = 'batal' then
    raise exception 'Pembayaran % sudah batal', v_p.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  v_jurnal := internal.balik_jurnal(v_p.jurnal_id, p_tanggal, 'Batal pembayaran ' || v_p.nomor || ': ' || trim(p_alasan));
  update public.pembayaran set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan) where id = p_id;
  update public.pembayaran_alokasi set aktif = false where pembayaran_id = p_id;
  perform internal.catat_audit('batal', 'pembayaran', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- pembayaran`
Expected: PASS, 7 tes.

- [ ] **Step 5: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua (termasuk `invoice.test.mjs` yang kini memakai `total_alokasi_invoice` versi nyata).

```bash
git add apps/bul
git commit -m "feat(bul): customer payments with multi-invoice allocation and final tax withholding"
```

---

### Task 7: Saldo awal

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000700_saldo_awal.sql`
- Create: `apps/bul/db/tests/saldo-awal.test.mjs`

**Interfaces:**
- Consumes: Task 3, 5, 6.
- Produces (RPC, owner):
  - `posting_saldo_awal(p_tanggal date, p_baris jsonb) → uuid` (hanya satu jurnal saldo awal aktif)
  - `batalkan_saldo_awal(p_alasan text) → uuid`
  - `buat_piutang_saldo_awal(p_nomor text, p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_jumlah numeric, p_keterangan text default '') → uuid`
  - `cek_saldo_awal_piutang() → table(saldo_gl numeric, total_invoice numeric, selisih numeric)` (baca, semua peran aktif)

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/saldo-awal.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const baris = (piutang = '2500000') => [
  { akun_kode: '1112', debit: '10000000', keterangan: 'Saldo BCA 31-12-2025' },
  { akun_kode: '1121', debit: piutang, pelanggan_id: m.pelanggan },
  { akun_kode: '2121', kredit: '500000', supir_id: m.supir },
  { akun_kode: '3110', kredit: String(10000000 + Number(piutang) - 500000) },
];
const posting = (uid, b = baris()) =>
  sebagai(uid, "select public.posting_saldo_awal('2025-12-31', $1) as id", [JSON.stringify(b)]).then((r) => r[0].id);

describe('saldo awal', () => {
  it('hanya owner; menolak jurnal tidak seimbang', async () => {
    await expect(posting(keu)).rejects.toMatchObject({ code: '42501' });
    const salah = baris();
    salah[0].debit = '9999999';
    await expect(posting(owner, salah)).rejects.toMatchObject({ code: '23514' });
  });

  it('memposting satu jurnal saldo_awal; yang kedua ditolak', async () => {
    const id = await posting(owner);
    const [j] = await sql('select sumber_tipe, tanggal from public.jurnal where id = $1', [id]);
    expect(j).toEqual({ sumber_tipe: 'saldo_awal', tanggal: '2025-12-31' });
    await expect(posting(owner)).rejects.toMatchObject({ code: 'P0001' });
  });

  it('piutang saldo awal per invoice dan pengecekan selisih', async () => {
    const buat = (nomor, jumlah) => sebagai(owner,
      "select public.buat_piutang_saldo_awal($1, 'SJP', $2, '2025-12-20', $3) as id", [nomor, m.pelanggan, jumlah]).then((r) => r[0].id);
    await buat('SJP/090/12/2025', '1500000');
    let [c] = await sebagai(keu, 'select * from public.cek_saldo_awal_piutang()');
    expect(c).toEqual({ saldo_gl: '2500000.00', total_invoice: '1500000.00', selisih: '1000000.00' });
    const id2 = await buat('SJP/091/12/2025', '1000000');
    [c] = await sebagai(keu, 'select * from public.cek_saldo_awal_piutang()');
    expect(c.selisih).toBe('0.00');
    const [inv] = await sql('select saldo_awal, jurnal_id, total_akhir from public.invoice where id = $1', [id2]);
    expect(inv).toEqual({ saldo_awal: true, jurnal_id: null, total_akhir: '1000000.00' });
  });

  it('piutang saldo awal bisa dilunasi lewat pembayaran biasa', async () => {
    const [inv] = await sql("select id from public.invoice where nomor = 'SJP/091/12/2025'");
    await sebagai(keu, "select public.catat_pembayaran('2026-01-10', $1, '1112', '995000', '5000', $2)", [
      m.pelanggan, JSON.stringify([{ invoice_id: inv.id, jumlah: '1000000' }]),
    ]);
    const [s] = await sql('select sisa from public.v_invoice_saldo where id = $1', [inv.id]);
    expect(s.sisa).toBe('0.00');
  });

  it('tanggal piutang saldo awal tidak boleh setelah tanggal saldo awal', async () => {
    await expect(sebagai(owner,
      "select public.buat_piutang_saldo_awal('SJP/X/01/2026', 'SJP', $1, '2026-01-05', '1')", [m.pelanggan])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('batal saldo awal lalu posting ulang', async () => {
    await sebagai(owner, "select public.batalkan_saldo_awal('angka akuntan direvisi')");
    await expect(posting(owner)).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- saldo-awal`
Expected: FAIL — `function public.posting_saldo_awal(...) does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000700_saldo_awal.sql`**

```sql
-- Saldo awal: satu jurnal saldo_awal aktif + rincian piutang lama per invoice.

create unique index jurnal_saldo_awal_tunggal on public.jurnal ((true))
  where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;

create function public.posting_saldo_awal(p_tanggal date, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner');
  if exists (select 1 from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null) then
    raise exception 'Saldo awal sudah diposting; batalkan dulu sebelum memposting ulang' using errcode = 'P0001';
  end if;
  v_id := internal.posting_jurnal(p_tanggal, 'Saldo awal per ' || to_char(p_tanggal, 'DD-MM-YYYY'), 'saldo_awal', null, p_baris);
  perform internal.catat_audit('posting', 'saldo_awal', v_id::text, jsonb_build_object('tanggal', p_tanggal));
  return v_id;
end;
$$;

create function public.batalkan_saldo_awal(p_alasan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_j public.jurnal;
  v_id uuid;
begin
  perform internal.wajib_peran('owner');
  select * into v_j from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;
  if not found then
    raise exception 'Belum ada saldo awal aktif' using errcode = 'P0002';
  end if;
  v_id := internal.balik_jurnal(v_j.id, v_j.tanggal, p_alasan);
  perform internal.catat_audit('batal', 'saldo_awal', v_j.id::text, jsonb_build_object('alasan', p_alasan));
  return v_id;
end;
$$;

create function public.buat_piutang_saldo_awal(
  p_nomor text, p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_jumlah numeric, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_tgl_sa date;
  v_id uuid;
begin
  v_uid := internal.wajib_peran('owner');
  select tanggal into v_tgl_sa from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;
  if v_tgl_sa is null then
    raise exception 'Posting saldo awal dulu sebelum mencatat piutang lama' using errcode = 'P0001';
  end if;
  if p_tanggal is null or p_tanggal > v_tgl_sa then
    raise exception 'Tanggal piutang lama harus paling lambat %', v_tgl_sa using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nomor), '') = '' then
    raise exception 'Nomor invoice lama wajib diisi' using errcode = 'P0001';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah piutang harus lebih dari 0' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invoice where nomor = trim(p_nomor) and status = 'terbit') then
    raise exception 'Nomor invoice % sudah dipakai', trim(p_nomor) using errcode = '23505';
  end if;
  insert into public.invoice (
    nomor, lini_kode, pelanggan_id, tanggal, subtotal, total_uang_jalan, total_akhir, saldo_awal, keterangan, dibuat_oleh)
  values (trim(p_nomor), p_lini_kode, p_pelanggan_id, p_tanggal, p_jumlah, 0, p_jumlah, true, coalesce(p_keterangan, ''), v_uid)
  returning id into v_id;
  perform internal.catat_audit('buat', 'invoice_saldo_awal', v_id::text,
    jsonb_build_object('nomor', trim(p_nomor), 'jumlah', p_jumlah));
  return v_id;
end;
$$;

create function public.cek_saldo_awal_piutang()
returns table (saldo_gl numeric, total_invoice numeric, selisih numeric)
language sql stable set search_path = '' as $$
  with gl as (
    select coalesce(sum(b.debit - b.kredit), 0) as v
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
      join public.pengaturan_posting pp on pp.kunci = 'piutang_usaha' and pp.akun_kode = b.akun_kode
     where j.sumber_tipe = 'saldo_awal' and j.dibalik_oleh_id is null),
  inv as (
    select coalesce(sum(total_akhir), 0) as v from public.invoice where saldo_awal and status = 'terbit')
  select gl.v::numeric(18,2), inv.v::numeric(18,2), (gl.v - inv.v)::numeric(18,2) from gl, inv
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- saldo-awal`
Expected: PASS, 6 tes.

- [ ] **Step 5: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua.

```bash
git add apps/bul
git commit -m "feat(bul): opening balance journal and legacy receivables"
```

---

### Task 8: Kas dan bank

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000800_kas.sql`
- Create: `apps/bul/db/tests/kas.test.mjs`

**Interfaces:**
- Consumes: Task 3, Task 6 (`internal.wajib_akun_kas`).
- Produces (tabel): `transaksi_kas(id, nomor, jenis, tanggal, akun_kas_kode, akun_tujuan_kode, total, keterangan, status, jurnal_id, jurnal_batal_id, alasan_batal, dibuat_oleh, dibuat_pada)`, `transaksi_kas_baris(id, transaksi_id, urutan, akun_kode, jumlah, keterangan, lini_kode, truk_id, supir_id)`.
- Produces (RPC, owner/keuangan):
  - `catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb) → uuid`; `p_jenis ∈ {keluar, masuk}`; `p_baris` = `[{akun_kode, jumlah, keterangan?, lini_kode?, truk_id?, supir_id?}]`. Nomor `KK-YYYY-NNNNNN` / `KM-YYYY-NNNNNN`.
  - `transfer_kas(p_tanggal date, p_dari_kode text, p_ke_kode text, p_jumlah numeric, p_keterangan text) → uuid`. Nomor `TF-YYYY-NNNNNN`.
  - `batalkan_kas(p_id uuid, p_alasan text, p_tanggal date default current_date) → uuid`

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/kas.test.mjs`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, ops, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  ops = await buatPengguna('operasional');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const kas = (uid, jenis, baris, { tanggal = '2026-02-15', akun = '1112', ket = 'Uji kas' } = {}) =>
  sebagai(uid, 'select public.catat_kas($1, $2, $3, $4, $5) as id', [jenis, tanggal, akun, ket, JSON.stringify(baris)]).then((r) => r[0].id);

const barisJurnal = async (id) => {
  const [t] = await sql('select jurnal_id from public.transaksi_kas where id = $1', [id]);
  return sql('select akun_kode, debit, kredit, truk_id, supir_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [t.jurnal_id]);
};

describe('kas keluar dan masuk', () => {
  it('biaya multi-baris dengan dimensi truk', async () => {
    const id = await kas(keu, 'keluar', [
      { akun_kode: '5220', jumlah: '350000', truk_id: m.truk, keterangan: 'Kampas rem' },
      { akun_kode: '5210', jumlah: '150000', truk_id: m.truk, keterangan: 'Jasa bengkel' },
    ]);
    const [t] = await sql('select nomor, total, jenis from public.transaksi_kas where id = $1', [id]);
    expect(t).toMatchObject({ total: '500000.00', jenis: 'keluar' });
    expect(t.nomor).toMatch(/^KK-2026-\d{6}$/);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '5220', debit: '350000.00', kredit: '0.00', truk_id: m.truk, supir_id: null },
      { akun_kode: '5210', debit: '150000.00', kredit: '0.00', truk_id: m.truk, supir_id: null },
      { akun_kode: '1112', debit: '0.00', kredit: '500000.00', truk_id: null, supir_id: null },
    ]);
  });

  it('kas masuk: setoran modal', async () => {
    const id = await kas(owner, 'masuk', [{ akun_kode: '3110', jumlah: '5000000' }]);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '3110', debit: '0.00', kredit: '5000000.00', truk_id: null, supir_id: null },
      { akun_kode: '1112', debit: '5000000.00', kredit: '0.00', truk_id: null, supir_id: null },
    ]);
  });

  it('bayar upah supir wajib memilih supir', async () => {
    await expect(kas(keu, 'keluar', [{ akun_kode: '2121', jumlah: '150000' }])).rejects.toMatchObject({ code: 'P0001' });
    const id = await kas(keu, 'keluar', [{ akun_kode: '2121', jumlah: '150000', supir_id: m.supir }]);
    expect((await barisJurnal(id))[0]).toMatchObject({ akun_kode: '2121', debit: '150000.00', supir_id: m.supir });
  });

  it('menolak baris akun kas/bank, piutang, jumlah ≤ 0, jenis tak dikenal, akun sumber bukan kas', async () => {
    await expect(kas(keu, 'keluar', [{ akun_kode: '1111', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'masuk', [{ akun_kode: '1121', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '0' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'transfer', [{ akun_kode: '5110', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '1' }], { akun: '5110' })).rejects.toMatchObject({ code: 'P0001' });
  });

  it('operasional tidak boleh mencatat kas', async () => {
    await expect(kas(ops, 'keluar', [{ akun_kode: '5110', jumlah: '1' }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('transfer dan pembatalan', () => {
  it('transfer antar kas/bank', async () => {
    const [{ id }] = await sebagai(keu, "select public.transfer_kas('2026-02-16', '1112', '1111', '2000000', 'Isi kas kecil') as id");
    const [t] = await sql('select nomor, akun_tujuan_kode, total from public.transaksi_kas where id = $1', [id]);
    expect(t.nomor).toMatch(/^TF-2026-\d{6}$/);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '1111', debit: '2000000.00', kredit: '0.00', truk_id: null, supir_id: null },
      { akun_kode: '1112', debit: '0.00', kredit: '2000000.00', truk_id: null, supir_id: null },
    ]);
    await expect(sebagai(keu, "select public.transfer_kas('2026-02-16', '1112', '1112', '1', 'x')")).rejects.toMatchObject({ code: 'P0001' });
  });

  it('batal kas membuat jurnal pembalik', async () => {
    const id = await kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '200000', truk_id: m.truk }]);
    await sebagai(keu, "select public.batalkan_kas($1, 'nota dobel', '2026-02-17')", [id]);
    const [t] = await sql('select status, jurnal_id, jurnal_batal_id from public.transaksi_kas where id = $1', [id]);
    expect(t.status).toBe('batal');
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [t.jurnal_id]);
    expect(j.dibalik_oleh_id).toBe(t.jurnal_batal_id);
    await expect(sebagai(keu, "select public.batalkan_kas($1, 'x', '2026-02-17')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- kas`
Expected: FAIL — `function public.catat_kas(...) does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000800_kas.sql`**

```sql
-- Kas & bank: pengeluaran/penerimaan multi-baris, transfer, pembatalan.

create table public.transaksi_kas (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  jenis text not null check (jenis in ('keluar', 'masuk', 'transfer')),
  tanggal date not null,
  akun_kas_kode text not null references public.akun (kode),
  akun_tujuan_kode text references public.akun (kode),
  total numeric(18,2) not null check (total > 0),
  keterangan text not null check (length(trim(keterangan)) > 0),
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid not null references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check ((jenis = 'transfer') = (akun_tujuan_kode is not null))
);
create index transaksi_kas_tanggal_idx on public.transaksi_kas (tanggal);

create table public.transaksi_kas_baris (
  id bigint generated always as identity primary key,
  transaksi_id uuid not null references public.transaksi_kas (id),
  urutan int not null,
  akun_kode text not null references public.akun (kode),
  jumlah numeric(18,2) not null check (jumlah > 0),
  keterangan text not null,
  lini_kode text references public.lini (kode),
  truk_id uuid references public.truk (id),
  supir_id uuid references public.supir (id),
  unique (transaksi_id, urutan)
);

create function public.catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb)
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
        'lini_kode', v_b ->> 'lini_kode', 'truk_id', v_b ->> 'truk_id', 'supir_id', v_b ->> 'supir_id'));
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

  insert into public.transaksi_kas_baris (transaksi_id, urutan, akun_kode, jumlah, keterangan, lini_kode, truk_id, supir_id)
  select v_id, e.ord, e.val ->> 'akun_kode', (e.val ->> 'jumlah')::numeric,
         coalesce(nullif(trim(e.val ->> 'keterangan'), ''), trim(p_keterangan)),
         nullif(e.val ->> 'lini_kode', ''), nullif(e.val ->> 'truk_id', '')::uuid, nullif(e.val ->> 'supir_id', '')::uuid
    from jsonb_array_elements(p_baris) with ordinality as e(val, ord);

  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'jenis', p_jenis, 'total', v_total));
  return v_id;
end;
$$;

create function public.transfer_kas(p_tanggal date, p_dari_kode text, p_ke_kode text, p_jumlah numeric, p_keterangan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_dari public.akun;
  v_ke public.akun;
  v_nomor text;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  v_dari := internal.wajib_akun_kas(p_dari_kode);
  v_ke := internal.wajib_akun_kas(p_ke_kode);
  if v_dari.kode = v_ke.kode then
    raise exception 'Akun asal dan tujuan transfer harus berbeda' using errcode = 'P0001';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah transfer harus lebih dari 0' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan wajib diisi' using errcode = 'P0001';
  end if;
  v_nomor := 'TF-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('kas-TF-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_jurnal := internal.posting_jurnal(p_tanggal, v_nomor || ' ' || trim(p_keterangan), 'kas', v_id, jsonb_build_array(
    jsonb_build_object('akun_kode', v_ke.kode, 'debit', p_jumlah),
    jsonb_build_object('akun_kode', v_dari.kode, 'kredit', p_jumlah)));
  insert into public.transaksi_kas (id, nomor, jenis, tanggal, akun_kas_kode, akun_tujuan_kode, total, keterangan, jurnal_id, dibuat_oleh)
  values (v_id, v_nomor, 'transfer', p_tanggal, v_dari.kode, v_ke.kode, p_jumlah, trim(p_keterangan), v_jurnal, v_uid);
  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text, jsonb_build_object('nomor', v_nomor, 'jenis', 'transfer'));
  return v_id;
end;
$$;

create function public.batalkan_kas(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_t public.transaksi_kas;
  v_jurnal uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_t from public.transaksi_kas where id = p_id for update;
  if not found then
    raise exception 'Transaksi kas tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_t.status = 'batal' then
    raise exception 'Transaksi % sudah batal', v_t.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  v_jurnal := internal.balik_jurnal(v_t.jurnal_id, p_tanggal, 'Batal ' || v_t.nomor || ': ' || trim(p_alasan));
  update public.transaksi_kas set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan) where id = p_id;
  perform internal.catat_audit('batal', 'transaksi_kas', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- kas`
Expected: PASS, 7 tes.

- [ ] **Step 5: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua.

```bash
git add apps/bul
git commit -m "feat(bul): cash and bank transactions, transfers and reversals"
```

---

### Task 9: Laporan

**Files:**
- Create: `apps/bul/supabase/migrations/20260918000900_laporan.sql`
- Create: `apps/bul/db/tests/laporan.test.mjs`

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces (baca, `security invoker`):
  - `laporan_saldo_akun(p_dari date, p_sampai date) → table(kode, nama, kategori, saldo_normal, saldo_awal, debit, kredit, saldo_akhir)`
  - `laporan_neraca(p_per date) → table(bagian text, kode text, nama text, saldo numeric)`; `bagian ∈ {aset, kewajiban, ekuitas}`; dua baris sintetis ekuitas (`kode` null): "Laba (rugi) tahun berjalan", "Laba (rugi) tahun lalu belum ditutup".
  - `laporan_laba_rugi(p_dari date, p_sampai date) → table(kategori, kode, nama, jumlah)`; pendapatan (4,7) = kredit−debit, beban (5,6,8,9110) = debit−kredit.
  - `laporan_laba_dimensi(p_dari date, p_sampai date, p_dimensi text) → table(dimensi_id text, dimensi_nama text, pendapatan numeric, beban numeric, laba numeric)`; `p_dimensi ∈ {truk, supir, pelanggan, rute, lini}`.
  - `laporan_umur_piutang(p_per date) → table(invoice_id, nomor, pelanggan_id, pelanggan_nama, tanggal, jatuh_tempo, sisa, umur_hari, kelompok)`; `kelompok ∈ {0-30, 31-60, 61-90, >90}`; `sisa` adalah sisa saat ini.
  - `laporan_omzet(p_tahun int) → table(tahun, omzet, batas_omzet, persen, pp55_aktif)`
  - view `v_hutang_upah_supir(supir_id, supir_nama, saldo)`

- [ ] **Step 1: Tulis tes gagal `apps/bul/db/tests/laporan.test.mjs`**

```js
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
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test:db -- laporan`
Expected: FAIL — `function public.laporan_umur_piutang(...) does not exist`.

- [ ] **Step 3: Buat `apps/bul/supabase/migrations/20260918000900_laporan.sql`**

```sql
-- Laporan: saldo akun, neraca, laba rugi, laba per dimensi, umur piutang, hutang upah, omzet.

create function public.laporan_saldo_akun(p_dari date, p_sampai date)
returns table (kode text, nama text, kategori text, saldo_normal text,
               saldo_awal numeric, debit numeric, kredit numeric, saldo_akhir numeric)
language sql stable set search_path = '' as $$
  with m as (
    select b.akun_kode,
           sum(case when j.tanggal < p_dari then b.debit - b.kredit else 0 end) as awal_dk,
           sum(case when j.tanggal >= p_dari then b.debit else 0 end) as d,
           sum(case when j.tanggal >= p_dari then b.kredit else 0 end) as k
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_sampai
     group by b.akun_kode)
  select a.kode, a.nama, public.kategori_akun(a.kode), a.saldo_normal,
         (case when a.saldo_normal = 'debit' then coalesce(m.awal_dk, 0) else -coalesce(m.awal_dk, 0) end)::numeric(18,2),
         coalesce(m.d, 0)::numeric(18,2),
         coalesce(m.k, 0)::numeric(18,2),
         (case when a.saldo_normal = 'debit'
               then coalesce(m.awal_dk, 0) + coalesce(m.d, 0) - coalesce(m.k, 0)
               else -coalesce(m.awal_dk, 0) + coalesce(m.k, 0) - coalesce(m.d, 0) end)::numeric(18,2)
    from public.akun a
    left join m on m.akun_kode = a.kode
   where a.tipe = 'detail' and (m.akun_kode is not null or a.aktif)
   order by a.kode
$$;

create function public.laporan_neraca(p_per date)
returns table (bagian text, kode text, nama text, saldo numeric)
language sql stable set search_path = '' as $$
  with s as (
    select b.akun_kode, sum(b.debit - b.kredit) as dk
      from public.jurnal_baris b join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_per
     group by b.akun_kode),
  pl as (
    select coalesce(sum(case when j.tanggal >= date_trunc('year', p_per)::date then b.kredit - b.debit else 0 end), 0) as berjalan,
           coalesce(sum(case when j.tanggal < date_trunc('year', p_per)::date then b.kredit - b.debit else 0 end), 0) as lalu
      from public.jurnal_baris b join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_per and left(b.akun_kode, 1) in ('4', '5', '6', '7', '8', '9'))
  select x.bagian, x.kode, x.nama, x.saldo::numeric(18,2) from (
    select case left(a.kode, 1) when '1' then 'aset' when '2' then 'kewajiban' else 'ekuitas' end as bagian,
           a.kode, a.nama,
           case when left(a.kode, 1) = '1' then s.dk else -s.dk end as saldo
      from public.akun a join s on s.akun_kode = a.kode
     where left(a.kode, 1) in ('1', '2', '3') and s.dk <> 0
    union all
    select 'ekuitas', null, 'Laba (rugi) tahun berjalan', pl.berjalan from pl
    union all
    select 'ekuitas', null, 'Laba (rugi) tahun lalu belum ditutup', pl.lalu from pl
  ) x
  order by case x.bagian when 'aset' then 1 when 'kewajiban' then 2 else 3 end, x.kode nulls last, x.nama
$$;

create function public.laporan_laba_rugi(p_dari date, p_sampai date)
returns table (kategori text, kode text, nama text, jumlah numeric)
language sql stable set search_path = '' as $$
  select public.kategori_akun(a.kode), a.kode, a.nama,
         sum(case when left(a.kode, 1) in ('4', '7') then b.kredit - b.debit else b.debit - b.kredit end)::numeric(18,2)
    from public.jurnal_baris b
    join public.jurnal j on j.id = b.jurnal_id
    join public.akun a on a.kode = b.akun_kode
   where j.tanggal between p_dari and p_sampai
     and (left(a.kode, 1) in ('4', '5', '6', '7', '8') or a.kode = '9110')
   group by a.kode, a.nama
  having sum(b.debit - b.kredit) <> 0
   order by a.kode
$$;

create function public.laporan_laba_dimensi(p_dari date, p_sampai date, p_dimensi text)
returns table (dimensi_id text, dimensi_nama text, pendapatan numeric, beban numeric, laba numeric)
language plpgsql stable set search_path = '' as $$
begin
  if p_dimensi is null or p_dimensi not in ('truk', 'supir', 'pelanggan', 'rute', 'lini') then
    raise exception 'Dimensi % tidak dikenal', p_dimensi using errcode = 'P0001';
  end if;
  return query
  with baris as (
    select case p_dimensi
             when 'truk' then b.truk_id::text
             when 'supir' then b.supir_id::text
             when 'pelanggan' then b.pelanggan_id::text
             when 'rute' then b.rute_id::text
             else b.lini_kode end as did,
           case when left(b.akun_kode, 1) in ('4', '7') then b.kredit - b.debit else 0 end as pdpt,
           case when left(b.akun_kode, 1) in ('5', '6', '8') or b.akun_kode = '9110' then b.debit - b.kredit else 0 end as bbn
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal between p_dari and p_sampai
       and (left(b.akun_kode, 1) in ('4', '5', '6', '7', '8') or b.akun_kode = '9110'))
  select x.did,
         coalesce(
           case p_dimensi
             when 'truk' then (select t.nopol from public.truk t where t.id::text = x.did)
             when 'supir' then (select s.nama from public.supir s where s.id::text = x.did)
             when 'pelanggan' then (select p.nama from public.pelanggan p where p.id::text = x.did)
             when 'rute' then (select r.nama from public.rute r where r.id::text = x.did)
             else (select l.nama from public.lini l where l.kode = x.did) end,
           '(tanpa ' || p_dimensi || ')'),
         sum(x.pdpt)::numeric(18,2), sum(x.bbn)::numeric(18,2), (sum(x.pdpt) - sum(x.bbn))::numeric(18,2)
    from baris x
   group by x.did
   order by 5 desc;
end;
$$;

create function public.laporan_umur_piutang(p_per date)
returns table (invoice_id uuid, nomor text, pelanggan_id uuid, pelanggan_nama text, tanggal date,
               jatuh_tempo date, sisa numeric, umur_hari int, kelompok text)
language sql stable set search_path = '' as $$
  select v.id, v.nomor, v.pelanggan_id, v.pelanggan_nama, v.tanggal, v.jatuh_tempo, v.sisa,
         (p_per - coalesce(v.jatuh_tempo, v.tanggal))::int,
         case
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 30 then '0-30'
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 60 then '31-60'
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 90 then '61-90'
           else '>90'
         end
    from public.v_invoice_saldo v
   where v.status = 'terbit' and v.sisa > 0 and v.tanggal <= p_per
   order by v.pelanggan_nama, v.tanggal
$$;

create view public.v_hutang_upah_supir with (security_invoker = true) as
select b.supir_id, s.nama as supir_nama, sum(b.kredit - b.debit)::numeric(18,2) as saldo
  from public.jurnal_baris b
  join public.pengaturan_posting pp on pp.kunci = 'hutang_upah_sopir' and pp.akun_kode = b.akun_kode
  left join public.supir s on s.id = b.supir_id
 group by b.supir_id, s.nama
having sum(b.kredit - b.debit) <> 0;

create function public.laporan_omzet(p_tahun int)
returns table (tahun int, omzet numeric, batas_omzet numeric, persen numeric, pp55_aktif boolean)
language sql stable set search_path = '' as $$
  with o as (
    select coalesce(sum(b.kredit - b.debit), 0) as omzet
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
      join public.pengaturan_posting pp on pp.kunci = 'pendapatan_jasa' and pp.akun_kode = b.akun_kode
     where extract(year from j.tanggal) = p_tahun)
  select p_tahun, o.omzet::numeric(18,2), pj.batas_omzet, round(o.omzet / pj.batas_omzet * 100, 2), pj.pp55_aktif
    from o
    left join lateral public.pajak_berlaku(make_date(p_tahun, 12, 31)) pj on true
$$;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test:db -- laporan`
Expected: PASS, 7 tes.

- [ ] **Step 5: Jalankan seluruh tes DB, lalu commit**

Run: `npm run test:db` → Expected: PASS semua.

```bash
git add apps/bul
git commit -m "feat(bul): balance sheet, profit and loss, dimensional profit and receivable reports"
```

---

### Task 10: Gerbang keamanan berbasis katalog

**Files:**
- Create: `apps/bul/db/tests/keamanan.test.mjs`
- Modify: migrasi mana pun **hanya** bila tes ini menemukan pelanggaran (perbaiki di migrasi asal, jangan buat migrasi tambalan)

**Interfaces:**
- Consumes: seluruh migrasi 0100–0900.
- Produces: tes yang gagal bila ada tabel/fungsi/view baru yang melanggar aturan hak akses, atau inventaris fungsi publik berubah tanpa diperbarui.

- [ ] **Step 1: Tulis `apps/bul/db/tests/keamanan.test.mjs`**

```js
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
  'buat_piutang_saldo_awal', 'buat_sj', 'catat_kas', 'catat_pembayaran', 'posting_saldo_awal', 'pratinjau_invoice',
  'selesaikan_sj', 'simpan_akun', 'simpan_aturan_upah', 'simpan_lini', 'simpan_material', 'simpan_pelanggan',
  'simpan_pengaturan_pajak', 'simpan_rute', 'simpan_supir', 'simpan_tarif', 'simpan_truk', 'simpan_uang_jalan_rute',
  'terbitkan_invoice', 'transfer_kas', 'ubah_sj',
];
const FUNGSI_BACA = [
  'cek_saldo_awal_piutang', 'kategori_akun', 'laporan_laba_dimensi', 'laporan_laba_rugi', 'laporan_neraca',
  'laporan_omzet', 'laporan_saldo_akun', 'laporan_umur_piutang', 'pajak_berlaku', 'peran_saya', 'saran_pph_invoice',
  'tarif_berlaku', 'uang_jalan_berlaku', 'upah_berlaku',
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
    expect(rows.map((r) => r.relname).sort()).toEqual(['v_buku_besar', 'v_hutang_upah_supir', 'v_invoice_saldo']);
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
```

- [ ] **Step 2: Jalankan tes**

Run: `npm run test:db -- keamanan`
Expected: PASS. Bila ada yang gagal, perbaiki **migrasi asal** yang relevan (misalnya fungsi tanpa `set search_path`), jalankan `npm run test:db` penuh, lalu ulangi.

- [ ] **Step 3: Jalankan seluruh tes DB dua kali berturut-turut** (membuktikan reset idempoten)

Run: `npm run test:db && npm run test:db`
Expected: PASS dua kali.

- [ ] **Step 4: Commit**

```bash
git add apps/bul
git commit -m "test(bul): catalog-driven security gate for tables, views and functions"
```
