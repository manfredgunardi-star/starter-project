# Komisi Pengurus, Tipe Rute, Format Rute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan rute sebagai `Nama, Asal - Tujuan` di semua layar, dan hitung komisi Pengurus (staf koordinator supir) berdasarkan Tipe Rute, diposting otomatis saat SJ selesai — sejalan/dalam jurnal yang sama dengan upah supir.

**Architecture:** Fase 1 murni frontend (helper format + pemakaiannya di semua layar rute). Fase 2 menambah 3 tabel master (`pengurus`, `tipe_rute`, `aturan_komisi`), 3 kolom baru (`rute.tipe_rute_id`, `surat_jalan.pengurus_id`, `jurnal_baris.pengurus_id`), 1 akun baru (`2125`), dan mengubah 5 fungsi database yang sudah ada (`simpan_rute`, `buat_sj`, `selesaikan_sj`, `internal.posting_jurnal`, `internal.balik_jurnal`) secara aditif — SJ tanpa Tipe Rute tetap berjalan persis seperti sebelumnya (komisi dilewati, tidak error).

**Tech Stack:** Supabase Postgres (migrasi SQL, RPC `security definer`), Vitest + `pg` untuk uji DB, React 19 + antd 6 + Vitest/Testing Library untuk frontend.

## Global Constraints

- Semua migrasi ditulis untuk Supabase lokal (`127.0.0.1:54322`), dijalankan lewat `npm run db:reset` — TIDAK ADA migrasi ke project produksi dalam plan ini.
- Uang: `numeric(18,2)`. Tidak ada tipe float untuk nilai uang.
- Kode error: `P0001` aturan bisnis, `P0002` tidak ditemukan, `42501` akses ditolak, `23505` duplikat.
- Setiap migrasi baru diakhiri `select internal.terapkan_hak_akses();`.
- Setiap RPC tulis baru memanggil `internal.wajib_peran(...)` di baris pertama badan fungsi.
- Jangan mengubah assertion pada test yang sudah ada (`db/tests/*.test.mjs`, `web/src/**/*.test.*`) — semua 111 test DB dan 43 test web yang ada harus tetap lulus tanpa modifikasi.
- Working directory database: `apps/bul` (menjalankan `npm run test:db`, `npm run db:reset` dari sana). Working directory frontend: `apps/bul/web` (menjalankan `npm run test`, `npm run build` dari sana).

---

## Fase 1 — Format tampilan rute

### Task 1: Helper `formatRute`

**Files:**
- Modify: `apps/bul/web/src/lib/format.js`
- Test: `apps/bul/web/src/lib/format.test.js`

**Interfaces:**
- Produces: `formatRute(r: { nama: string, asal?: string, tujuan?: string } | null | undefined): string` — dipakai oleh Task 2, 3, 4.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/bul/web/src/lib/format.test.js` (setelah `import` yang sudah ada, ubah baris import dan tambah blok `it` baru):

```js
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { formatRupiah, formatQty, formatTanggal, formatRute, keTanggalDb } from './format.js';

describe('format', () => {
  it('formatRupiah', () => {
    expect(formatRupiah('1417500.00')).toBe('Rp 1.417.500');
    expect(formatRupiah('7088.5')).toBe('Rp 7.088,50');
    expect(formatRupiah('-200000')).toBe('-Rp 200.000');
    expect(formatRupiah(null)).toBe('Rp 0');
  });
  it('formatQty', () => {
    expect(formatQty('12.500')).toBe('12,5');
    expect(formatQty('10.000')).toBe('10');
    expect(formatQty('1234.125')).toBe('1.234,125');
  });
  it('tanggal', () => {
    expect(formatTanggal('2026-02-03')).toBe('03/02/2026');
    expect(formatTanggal(null)).toBe('');
    expect(keTanggalDb(dayjs('2026-02-03'))).toBe('2026-02-03');
    expect(keTanggalDb(null)).toBeNull();
  });
  it('formatRute', () => {
    expect(formatRute({ nama: 'Pasir JB', asal: 'Pasir JB', tujuan: 'Bogor' })).toBe('Pasir JB, Pasir JB - Bogor');
    expect(formatRute({ nama: 'Rute X', asal: '', tujuan: '' })).toBe('Rute X');
    expect(formatRute({ nama: 'Rute Y', asal: 'A', tujuan: '' })).toBe('Rute Y, A');
    expect(formatRute(null)).toBe('');
    expect(formatRute(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run (dari `apps/bul/web`): `npm run test -- --run src/lib/format.test.js`
Expected: FAIL — `formatRute is not a function` atau `does not provide an export named 'formatRute'`.

- [ ] **Step 3: Implementasi minimal**

Tambahkan ke akhir `apps/bul/web/src/lib/format.js`:

```js
export function formatRute(r) {
  if (!r) return '';
  const bagian = [r.asal, r.tujuan].filter(Boolean).join(' - ');
  return bagian ? `${r.nama}, ${bagian}` : r.nama;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm run test -- --run src/lib/format.test.js`
Expected: PASS (4 test dalam `describe('format')`).

- [ ] **Step 5: Commit**

```bash
git add apps/bul/web/src/lib/format.js apps/bul/web/src/lib/format.test.js
git commit -m "feat(bul-web): add formatRute helper for Nama, Asal - Tujuan display"
```

---

### Task 2: Pakai `formatRute` di layar Master Data

**Files:**
- Modify: `apps/bul/web/src/halaman/master/konfigurasi.js`

**Interfaces:**
- Consumes: `formatRute` dari Task 1 (`../../lib/format.js`).

- [ ] **Step 1: Import `formatRute`**

Di `apps/bul/web/src/halaman/master/konfigurasi.js` baris 1, ubah:
```js
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
```
menjadi:
```js
import { formatRupiah, formatRute, formatTanggal, keTanggalDb } from '../../lib/format.js';
```

- [ ] **Step 2: Ubah `OPSI_RUTE` supaya label dropdown ikut format baru**

Baris 7, ubah:
```js
const OPSI_RUTE = { tabel: 'rute', label: 'nama' };
```
menjadi:
```js
const OPSI_RUTE = { tabel: 'rute', label: formatRute, order: 'nama' };
```
(`order: 'nama'` wajib ditambahkan — `useOpsi` di `lib/data.js` memakai `sumber?.order ?? label` untuk kolom `order()`; kalau `label` adalah fungsi dan `order` tidak diisi, query akan mencoba `.order()` dengan fungsi sebagai nama kolom.)

- [ ] **Step 3: Ubah kolom tabel Rute**

Baris 35-39, ubah:
```js
    kolom: [
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'Asal', dataIndex: 'asal' },
      { title: 'Tujuan', dataIndex: 'tujuan' },
    ],
```
menjadi:
```js
    kolom: [
      { title: 'Rute', render: (_, r) => formatRute(r) },
      { title: 'Asal', dataIndex: 'asal' },
      { title: 'Tujuan', dataIndex: 'tujuan' },
    ],
```

- [ ] **Step 4: Ubah kolom Rute di tabel Uang Jalan Rute**

Baris 53, ubah:
```js
      { title: 'Rute', dataIndex: ['rute', 'nama'] },
```
menjadi:
```js
      { title: 'Rute', render: (_, r) => formatRute(r.rute) },
```

- [ ] **Step 5: Ubah kolom Rute di tabel Tarif**

Baris 108, ubah:
```js
      { title: 'Rute', dataIndex: ['rute', 'nama'] },
```
menjadi:
```js
      { title: 'Rute', render: (_, r) => formatRute(r.rute) },
```

- [ ] **Step 6: Ubah kolom Rute di tabel Aturan Upah**

Baris 131, ubah:
```js
      { title: 'Rute', dataIndex: ['rute', 'nama'], render: (v) => v ?? 'Semua' },
```
menjadi:
```js
      { title: 'Rute', render: (_, r) => (r.rute ? formatRute(r.rute) : 'Semua') },
```

- [ ] **Step 7: Jalankan test dan build, pastikan lulus**

Run (dari `apps/bul/web`): `npm run test -- --run` lalu `npm run build`
Expected: 44 test lulus (43 sudah ada + 1 dari Task 1), build sukses tanpa error.

- [ ] **Step 8: Commit**

```bash
git add apps/bul/web/src/halaman/master/konfigurasi.js
git commit -m "feat(bul-web): show route as Nama, Asal - Tujuan in master data screens"
```

---

### Task 3: Pakai `formatRute` di layar Surat Jalan

**Files:**
- Modify: `apps/bul/web/src/halaman/sj/FormSj.jsx`
- Modify: `apps/bul/web/src/halaman/sj/SuratJalanPage.jsx`

**Interfaces:**
- Consumes: `formatRute` dari Task 1.

- [ ] **Step 1: Ubah dropdown Rute di form SJ**

Di `apps/bul/web/src/halaman/sj/FormSj.jsx` baris 7, ubah:
```js
import { formatRupiah, keTanggalDb } from '../../lib/format.js';
```
menjadi:
```js
import { formatRupiah, formatRute, keTanggalDb } from '../../lib/format.js';
```
Baris 13, ubah:
```js
  rute: { tabel: 'rute', label: 'nama' },
```
menjadi:
```js
  rute: { tabel: 'rute', label: formatRute, order: 'nama' },
```

- [ ] **Step 2: Ubah select dan kolom Rute di tabel Surat Jalan**

Di `apps/bul/web/src/halaman/sj/SuratJalanPage.jsx` baris 7, ubah:
```js
import { formatQty, formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
```
menjadi:
```js
import { formatQty, formatRupiah, formatRute, formatTanggal, keTanggalDb } from '../../lib/format.js';
```
Baris 30, ubah:
```js
    select: '*, pelanggan(nama), rute(nama), material(nama, satuan), truk(nopol), supir(nama), invoice(nomor)',
```
menjadi:
```js
    select: '*, pelanggan(nama), rute(nama, asal, tujuan), material(nama, satuan), truk(nopol), supir(nama), invoice(nomor)',
```
Baris 57, ubah:
```js
          { title: 'Rute', dataIndex: ['rute', 'nama'] },
```
menjadi:
```js
          { title: 'Rute', render: (_, r) => formatRute(r.rute) },
```

- [ ] **Step 3: Jalankan test dan build, pastikan lulus**

Run (dari `apps/bul/web`): `npm run test -- --run` lalu `npm run build`
Expected: 44 test lulus, build sukses.

- [ ] **Step 4: Commit**

```bash
git add apps/bul/web/src/halaman/sj/FormSj.jsx apps/bul/web/src/halaman/sj/SuratJalanPage.jsx
git commit -m "feat(bul-web): show route as Nama, Asal - Tujuan in SJ form and list"
```

---

### Task 4: Pakai `formatRute` di layar Invoice & Kwitansi

**Files:**
- Modify: `apps/bul/web/src/halaman/invoice/InvoiceBaruPage.jsx`
- Modify: `apps/bul/web/src/halaman/invoice/InvoiceDetailPage.jsx`
- Modify: `apps/bul/web/src/halaman/invoice/Kwitansi.jsx`

**Interfaces:**
- Consumes: `formatRute` dari Task 1.

- [ ] **Step 1: `InvoiceBaruPage.jsx`**

Baris 20, ubah:
```js
    select: 'id, nomor, tanggal, qty_bongkar, uang_jalan, rute(nama), material(nama, satuan), truk(nopol)',
```
menjadi:
```js
    select: 'id, nomor, tanggal, qty_bongkar, uang_jalan, rute(nama, asal, tujuan), material(nama, satuan), truk(nopol)',
```
Baris 55, ubah:
```js
            { title: 'Rute', dataIndex: ['rute', 'nama'] },
```
menjadi:
```js
            { title: 'Rute', render: (_, r) => formatRute(r.rute) },
```
Tambahkan `formatRute` ke import `../../lib/format.js` di baris paling atas file (cek import yang sudah ada dan tambahkan `formatRute` ke daftarnya, konsisten dengan Task 3 Step 1).

- [ ] **Step 2: `InvoiceDetailPage.jsx`**

Baris 19, ubah:
```js
    select: '*, surat_jalan(nomor, tanggal, rute(nama), material(nama, satuan), truk(nopol))',
```
menjadi:
```js
    select: '*, surat_jalan(nomor, tanggal, rute(nama, asal, tujuan), material(nama, satuan), truk(nopol))',
```
Baris 56, ubah:
```js
          { title: 'Rute', dataIndex: ['surat_jalan', 'rute', 'nama'] },
```
menjadi:
```js
          { title: 'Rute', render: (_, r) => formatRute(r.surat_jalan.rute) },
```
Tambahkan `formatRute` ke import `../../lib/format.js` di file ini.

- [ ] **Step 3: `Kwitansi.jsx`**

Baris 13, ubah:
```js
    select: '*, surat_jalan(nomor, tanggal, rute(nama), material(nama, satuan), truk(nopol))',
```
menjadi:
```js
    select: '*, surat_jalan(nomor, tanggal, rute(nama, asal, tujuan), material(nama, satuan), truk(nopol))',
```
Baris 38, ubah:
```js
                <td>{b.surat_jalan.truk.nopol}</td><td>{b.surat_jalan.rute.nama}</td><td>{b.surat_jalan.material.nama}</td>
```
menjadi:
```js
                <td>{b.surat_jalan.truk.nopol}</td><td>{formatRute(b.surat_jalan.rute)}</td><td>{b.surat_jalan.material.nama}</td>
```
Tambahkan `formatRute` ke import `../../lib/format.js` di file ini.

- [ ] **Step 4: Jalankan test dan build, pastikan lulus**

Run (dari `apps/bul/web`): `npm run test -- --run` lalu `npm run build`
Expected: 44 test lulus, build sukses. Fase 1 selesai.

- [ ] **Step 5: Commit**

```bash
git add apps/bul/web/src/halaman/invoice/InvoiceBaruPage.jsx apps/bul/web/src/halaman/invoice/InvoiceDetailPage.jsx apps/bul/web/src/halaman/invoice/Kwitansi.jsx
git commit -m "feat(bul-web): show route as Nama, Asal - Tujuan in invoice and kwitansi"
```

---

## Fase 2 — Pengurus, Tipe Rute, Aturan Komisi, posting

### Task 5: Migrasi database — tabel, RPC, posting, laporan

**Files:**
- Create: `apps/bul/supabase/migrations/20260923000100_komisi_pengurus.sql`
- Create: `apps/bul/db/tests/komisi-pengurus.test.mjs`

**Interfaces:**
- Consumes: `internal.wajib_peran`, `internal.catat_audit`, `internal.akun_posting`, `internal.posting_jurnal`, `internal.balik_jurnal` (semua sudah ada di `20260918000300_akuntansi_inti.sql`); `public.buat_sj`, `public.selesaikan_sj`, `public.simpan_rute` (sudah ada di `20260918000200_master_data.sql` / `20260918000400_surat_jalan.sql`); helper test `sql, buatPengguna, sebagai, unik, tutup` dari `db/tests/helpers.mjs`; fixture `siapkanMaster, buatSj, buatSjSelesai` dari `db/tests/fixtures.mjs`.
- Produces: tabel `public.pengurus`, `public.tipe_rute`, `public.aturan_komisi`; kolom `public.rute.tipe_rute_id`, `public.surat_jalan.pengurus_id`, `public.jurnal_baris.pengurus_id`; akun `2125`; RPC `public.simpan_pengurus(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true) returns uuid`, `public.simpan_tipe_rute(p_id uuid, p_nama text, p_aktif boolean default true) returns uuid`, `public.simpan_aturan_komisi(p_id uuid, p_nama text, p_tipe_rute_id uuid, p_berlaku_mulai date, p_nominal numeric, p_aktif boolean default true) returns uuid`, `public.komisi_berlaku(p_tipe_rute_id uuid, p_tanggal date) returns numeric`; `public.simpan_rute` dengan parameter baru `p_tipe_rute_id uuid default null` (parameter ke-6, ditambahkan lewat `drop function` + `create function`, BUKAN `create or replace`, karena jumlah parameter berubah); view `public.v_hutang_komisi_pengurus`. Dipakai oleh Task 6 (frontend).

- [ ] **Step 1: Tulis test database yang gagal**

Buat file baru `apps/bul/db/tests/komisi-pengurus.test.mjs`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSj, buatSjSelesai } from './fixtures.mjs';

let owner, ops, keu, m;

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

async function buatPengurus(uid, opsi = {}) {
  const { nama = unik('PENGURUS-'), aktif = true } = opsi;
  const { id } = await satu(uid, 'select public.simpan_pengurus(p_id => null, p_nama => $1, p_aktif => $2) as id', [nama, aktif]);
  return id;
}

async function tetapkanTipeRute(uid, ruteId, opsi = {}) {
  const { nominal = '25000', berlakuMulai = '2026-01-01' } = opsi;
  const { id: tipeRute } = await satu(uid, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
  const [r] = await sql('select nama, asal, tujuan from public.rute where id = $1', [ruteId]);
  await sebagai(uid,
    'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4, p_aktif => true, p_tipe_rute_id => $5)',
    [ruteId, r.nama, r.asal, r.tujuan, tipeRute]);
  await sebagai(uid,
    'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4)',
    [unik('KOMISI-'), tipeRute, berlakuMulai, nominal]);
  return tipeRute;
}

const ambilSj = async (id) => (await sql('select * from public.surat_jalan where id = $1', [id]))[0];

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

describe('master: pengurus', () => {
  it('simpan membuat dan mengubah', async () => {
    const id = await buatPengurus(owner, { nama: 'Budi' });
    const [row] = await sql('select nama, telepon, aktif from public.pengurus where id = $1', [id]);
    expect(row).toEqual({ nama: 'Budi', telepon: '', aktif: true });
    await sebagai(owner, 'select public.simpan_pengurus(p_id => $1, p_nama => $2, p_telepon => $3, p_aktif => $4)', [id, 'Budi S', '0811', false]);
    const [ubah] = await sql('select nama, telepon, aktif from public.pengurus where id = $1', [id]);
    expect(ubah).toEqual({ nama: 'Budi S', telepon: '0811', aktif: false });
  });
  it('nama wajib diisi', async () => {
    await expect(sebagai(owner, "select public.simpan_pengurus(p_id => null, p_nama => '')", [])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('keuangan tidak boleh menyimpan pengurus', async () => {
    await expect(sebagai(keu, "select public.simpan_pengurus(p_id => null, p_nama => 'X')", [])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('master: tipe_rute', () => {
  it('simpan membuat dan mengubah', async () => {
    const nama = unik('TIPE-');
    const { id } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [nama]);
    const [row] = await sql('select nama, aktif from public.tipe_rute where id = $1', [id]);
    expect(row).toEqual({ nama, aktif: true });
  });
  it('nama unik', async () => {
    const nama = unik('TIPE-');
    await sebagai(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1)', [nama]);
    await expect(sebagai(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1)', [nama])).rejects.toMatchObject({ code: '23505' });
  });
});

describe('master: aturan_komisi', () => {
  it('simpan membuat dengan tipe_rute_id wajib', async () => {
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    const { id } = await satu(owner,
      'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4) as id',
      [unik('KOMISI-'), tipeRute, '2026-01-01', '25000']);
    const [row] = await sql('select tipe_rute_id, nominal, aktif from public.aturan_komisi where id = $1', [id]);
    expect(row).toEqual({ tipe_rute_id: tipeRute, nominal: '25000.00', aktif: true });
  });
  it('menolak tipe_rute_id kosong', async () => {
    await expect(sebagai(owner,
      "select public.simpan_aturan_komisi(p_id => null, p_nama => 'X', p_tipe_rute_id => null, p_berlaku_mulai => '2026-01-01', p_nominal => '25000')",
      [])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('operasional tidak boleh menyimpan aturan komisi', async () => {
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    await expect(sebagai(ops,
      'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4)',
      [unik('KOMISI-'), tipeRute, '2026-01-01', '25000'])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('buat_sj mengisi pengurus_id otomatis', () => {
  it('kosong kalau belum ada pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBeNull();
  });
  it('terisi otomatis kalau tepat 1 pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBe(pengurus);
  });
  it('kosong kalau lebih dari 1 pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    await buatPengurus(owner);
    await buatPengurus(owner);
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBeNull();
  });
});

describe('selesaikan_sj memposting komisi pengurus', () => {
  it('Dr 5180 / Cr 2125 dengan pengurus_id, dalam jurnal yang sama dengan upah', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    await tetapkanTipeRute(owner, lain.rute);
    const id = await buatSjSelesai(ops, lain, { qty: '10', qtyBongkar: '9.5', tanggalSelesai: '2026-03-03', tanggal: '2026-03-03' });
    const sj = await ambilSj(id);
    expect(sj.pengurus_id).toBe(pengurus);
    const baris = await sql(
      'select akun_kode, debit, kredit, pengurus_id from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [sj.jurnal_upah_id]);
    expect(baris).toEqual([
      { akun_kode: '5130', debit: '150000.00', kredit: '0.00', pengurus_id: null },
      { akun_kode: '2121', debit: '0.00', kredit: '150000.00', pengurus_id: null },
      { akun_kode: '5180', debit: '25000.00', kredit: '0.00', pengurus_id: pengurus },
      { akun_kode: '2125', debit: '0.00', kredit: '25000.00', pengurus_id: pengurus },
    ]);
  });
  it('melewati komisi (SJ tetap selesai) kalau rute belum punya tipe_rute', async () => {
    const lain = await siapkanMaster(owner);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-04', tanggal: '2026-03-04' });
    const sj = await ambilSj(id);
    expect(sj.status).toBe('selesai');
    const baris = await sql('select akun_kode from public.jurnal_baris where jurnal_id = $1', [sj.jurnal_upah_id]);
    expect(baris.map((b) => b.akun_kode).sort()).toEqual(['2121', '5130']);
  });
  it('melewati komisi (SJ tetap selesai) kalau tipe_rute belum punya aturan_komisi berlaku', async () => {
    const lain = await siapkanMaster(owner);
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    await sebagai(owner,
      'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4, p_aktif => true, p_tipe_rute_id => $5)',
      [lain.rute, unik('RUTE-'), 'A', 'B', tipeRute]);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-05', tanggal: '2026-03-05' });
    const sj = await ambilSj(id);
    expect(sj.status).toBe('selesai');
    const baris = await sql('select akun_kode from public.jurnal_baris where jurnal_id = $1', [sj.jurnal_upah_id]);
    expect(baris.map((b) => b.akun_kode).sort()).toEqual(['2121', '5130']);
  });
});

describe('batalkan_sj membalik komisi', () => {
  it('jurnal pembalik membawa pengurus_id', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    await tetapkanTipeRute(owner, lain.rute);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-06', tanggal: '2026-03-06' });
    const sj = await ambilSj(id);
    await sebagai(ops, "select public.batalkan_sj($1, 'salah data', '2026-03-07')", [id]);
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [sj.jurnal_upah_id]);
    const pembalik = await sql(
      'select akun_kode, debit, kredit, pengurus_id from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [j.dibalik_oleh_id]);
    expect(pembalik).toEqual([
      { akun_kode: '5130', debit: '0.00', kredit: '150000.00', pengurus_id: null },
      { akun_kode: '2121', debit: '150000.00', kredit: '0.00', pengurus_id: null },
      { akun_kode: '5180', debit: '0.00', kredit: '25000.00', pengurus_id: pengurus },
      { akun_kode: '2125', debit: '25000.00', kredit: '0.00', pengurus_id: pengurus },
    ]);
  });
});

describe('v_hutang_komisi_pengurus', () => {
  it('menjumlah saldo hutang komisi per pengurus', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner, { nama: unik('PENGURUS-') });
    await tetapkanTipeRute(owner, lain.rute);
    await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-08', tanggal: '2026-03-08' });
    const [row] = await sql('select saldo from public.v_hutang_komisi_pengurus where pengurus_id = $1', [pengurus]);
    expect(row.saldo).toBe('25000.00');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run (dari `apps/bul`): `npm run test:db`
Expected: FAIL — tabel/fungsi `pengurus`, `tipe_rute`, `aturan_komisi`, `simpan_pengurus`, dll belum ada (`relation "public.pengurus" does not exist` atau error serupa).

- [ ] **Step 3: Tulis migrasi**

Buat file baru `apps/bul/supabase/migrations/20260923000100_komisi_pengurus.sql`:

```sql
-- Komisi pengurus + tipe rute: master data baru, posting saat SJ selesai (satu jurnal dengan upah).

create table public.tipe_rute (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  aktif boolean not null default true
);

create table public.pengurus (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  telepon text not null default '',
  aktif boolean not null default true
);

alter table public.rute add column tipe_rute_id uuid references public.tipe_rute (id);

create table public.aturan_komisi (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  tipe_rute_id uuid not null references public.tipe_rute (id),
  berlaku_mulai date not null,
  nominal numeric(18,2) not null check (nominal >= 0),
  aktif boolean not null default true
);
create unique index aturan_komisi_unik on public.aturan_komisi (tipe_rute_id, berlaku_mulai) where aktif;

alter table public.jurnal_baris add column pengurus_id uuid references public.pengurus (id);
alter table public.surat_jalan add column pengurus_id uuid references public.pengurus (id);

insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
  ('2125', 'Hutang Komisi Pengurus', '2120', 'detail', 'kredit', false);

alter table public.pengaturan_posting drop constraint pengaturan_posting_kunci_check;
alter table public.pengaturan_posting add constraint pengaturan_posting_kunci_check check (kunci in (
  'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final',
  'beban_komisi_pengurus', 'hutang_komisi_pengurus'));
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('beban_komisi_pengurus', '5180', 'Komisi pengurus diakui saat SJ selesai'),
  ('hutang_komisi_pengurus', '2125', 'Hutang komisi pengurus sampai dibayar');

-- ---------- RPC simpan ----------

create function public.simpan_pengurus(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama pengurus wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.pengurus (nama, telepon, aktif) values (trim(p_nama), coalesce(p_telepon, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.pengurus set nama = trim(p_nama), telepon = coalesce(p_telepon, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Pengurus tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'pengurus', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_tipe_rute(p_id uuid, p_nama text, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama tipe rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.tipe_rute (nama, aktif) values (trim(p_nama), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.tipe_rute set nama = trim(p_nama), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Tipe rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'tipe_rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_aturan_komisi(
  p_id uuid, p_nama text, p_tipe_rute_id uuid, p_berlaku_mulai date, p_nominal numeric, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_tipe_rute_id is null then
    raise exception 'Tipe rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.aturan_komisi (nama, tipe_rute_id, berlaku_mulai, nominal, aktif)
    values (trim(p_nama), p_tipe_rute_id, p_berlaku_mulai, p_nominal, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_komisi
       set nama = trim(p_nama), tipe_rute_id = p_tipe_rute_id, berlaku_mulai = p_berlaku_mulai,
           nominal = p_nominal, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan komisi tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_komisi', v_id::text,
    jsonb_build_object('nama', p_nama, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- p_tipe_rute_id adalah parameter baru (ke-6) pada public.simpan_rute — CREATE OR REPLACE tidak bisa
-- dipakai untuk menambah parameter (akan membuat overload baru, bukan mengganti fungsi lama), jadi
-- fungsi lama harus di-drop eksplisit dulu.
drop function public.simpan_rute(uuid, text, text, text, boolean);

create function public.simpan_rute(
  p_id uuid, p_nama text, p_asal text default '', p_tujuan text default '', p_aktif boolean default true,
  p_tipe_rute_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.rute (nama, asal, tujuan, aktif, tipe_rute_id)
    values (trim(p_nama), coalesce(p_asal, ''), coalesce(p_tujuan, ''), coalesce(p_aktif, true), p_tipe_rute_id)
    returning id into v_id;
  else
    update public.rute
       set nama = trim(p_nama), asal = coalesce(p_asal, ''), tujuan = coalesce(p_tujuan, ''), aktif = coalesce(p_aktif, true),
           tipe_rute_id = p_tipe_rute_id
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.komisi_berlaku(p_tipe_rute_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select a.nominal
  from public.aturan_komisi a
  where a.aktif and a.tipe_rute_id = p_tipe_rute_id and a.berlaku_mulai <= p_tanggal
  order by a.berlaku_mulai desc
  limit 1
$$;

-- ---------- Posting: pengurus_id sebagai dimensi baru ----------

create or replace function internal.posting_jurnal(
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
      lini_kode, truk_id, supir_id, pelanggan_id, rute_id, pengurus_id)
    values (
      v_id, v_i, v_akun.kode, v_debit, v_kredit,
      coalesce(nullif(trim(v_b ->> 'keterangan'), ''), p_keterangan),
      nullif(v_b ->> 'lini_kode', ''),
      nullif(v_b ->> 'truk_id', '')::uuid,
      nullif(v_b ->> 'supir_id', '')::uuid,
      nullif(v_b ->> 'pelanggan_id', '')::uuid,
      nullif(v_b ->> 'rute_id', '')::uuid,
      nullif(v_b ->> 'pengurus_id', '')::uuid);
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

create or replace function internal.balik_jurnal(p_jurnal_id uuid, p_tanggal date, p_alasan text)
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
           'pelanggan_id', b.pelanggan_id, 'rute_id', b.rute_id, 'pengurus_id', b.pengurus_id) order by b.urutan)
    into v_baris
    from public.jurnal_baris b where b.jurnal_id = p_jurnal_id;
  v_id := internal.posting_jurnal(
    p_tanggal, 'Pembalik ' || v_asal.nomor || ': ' || trim(p_alasan), 'pembalik', v_asal.sumber_id, v_baris, p_jurnal_id);
  update public.jurnal set dibalik_oleh_id = v_id where id = p_jurnal_id;
  return v_id;
end;
$$;

create or replace function public.buat_sj(
  p_lini_kode text, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid;
  v_uj numeric;
  v_pengurus_id uuid;
  v_jumlah_pengurus int;
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
  select count(*), min(id) into v_jumlah_pengurus, v_pengurus_id from public.pengurus where aktif;
  if v_jumlah_pengurus <> 1 then
    v_pengurus_id := null;
  end if;
  insert into public.surat_jalan (
    lini_kode, nomor, tanggal, pelanggan_id, rute_id, material_id, truk_id, supir_id,
    qty_muat, uang_jalan, keterangan, dibuat_oleh, pengurus_id)
  values (
    p_lini_kode, trim(p_nomor), p_tanggal, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id,
    p_qty_muat, v_uj, coalesce(p_keterangan, ''), v_uid, v_pengurus_id)
  returning id into v_id;
  perform internal.catat_audit('buat', 'surat_jalan', v_id::text,
    jsonb_build_object('lini', p_lini_kode, 'nomor', trim(p_nomor)));
  return v_id;
end;
$$;

create or replace function public.selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
  v_upah numeric;
  v_tipe_rute_id uuid;
  v_komisi numeric;
  v_jurnal uuid;
  v_dim jsonb;
  v_baris jsonb := '[]'::jsonb;
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
  v_dim := jsonb_build_object(
    'lini_kode', v_sj.lini_kode, 'truk_id', v_sj.truk_id, 'supir_id', v_sj.supir_id,
    'pelanggan_id', v_sj.pelanggan_id, 'rute_id', v_sj.rute_id);
  if v_upah > 0 then
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('beban_upah_sopir'), 'debit', v_upah),
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('hutang_upah_sopir'), 'kredit', v_upah));
  end if;
  select tipe_rute_id into v_tipe_rute_id from public.rute where id = v_sj.rute_id;
  v_komisi := public.komisi_berlaku(v_tipe_rute_id, v_sj.tanggal);
  if v_komisi is not null and v_komisi > 0 then
    v_baris := v_baris || jsonb_build_array(
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('beban_komisi_pengurus'), 'debit', v_komisi),
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('hutang_komisi_pengurus'), 'kredit', v_komisi));
  end if;
  if jsonb_array_length(v_baris) > 0 then
    v_jurnal := internal.posting_jurnal(
      p_tanggal_selesai, 'SJ selesai ' || v_sj.lini_kode || ' ' || v_sj.nomor, 'sj_selesai', v_sj.id, v_baris);
  end if;
  update public.surat_jalan
     set status = 'selesai', qty_bongkar = p_qty_bongkar, tanggal_selesai = p_tanggal_selesai, upah = v_upah,
         jurnal_upah_id = v_jurnal, diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('selesai', 'surat_jalan', p_id::text,
    jsonb_build_object('qty_bongkar', p_qty_bongkar, 'upah', v_upah, 'komisi', v_komisi));
  return p_id;
end;
$$;

-- ---------- Laporan ----------

create view public.v_hutang_komisi_pengurus with (security_invoker = true) as
select b.pengurus_id, p.nama as pengurus_nama, sum(b.kredit - b.debit)::numeric(18,2) as saldo
  from public.jurnal_baris b
  join public.pengaturan_posting pp on pp.kunci = 'hutang_komisi_pengurus' and pp.akun_kode = b.akun_kode
  left join public.pengurus p on p.id = b.pengurus_id
 group by b.pengurus_id, p.nama
having sum(b.kredit - b.debit) <> 0;

select internal.terapkan_hak_akses();
```

- [ ] **Step 4: Terapkan migrasi**

Run (dari `apps/bul`): `npm run db:reset`
Expected: sukses tanpa error SQL. Kalau ada error sintaks/urutan objek, perbaiki lalu ulangi.

- [ ] **Step 5: Jalankan test baru, pastikan lulus**

Run: `npx vitest run --config db/vitest.config.mjs db/tests/komisi-pengurus.test.mjs`
Expected: PASS — 16 test (3 pengurus + 2 tipe_rute + 3 aturan_komisi + 3 auto-fill pengurus + 3 komisi posting + 1 pembalikan + 1 view).

- [ ] **Step 6: Jalankan seluruh suite DB, pastikan tidak ada regresi**

Run: `npm run test:db`
Expected: PASS — 127 test total (111 lama + 16 baru), tanpa satu pun assertion lama diubah.

- [ ] **Step 7: Commit**

```bash
git add apps/bul/supabase/migrations/20260923000100_komisi_pengurus.sql apps/bul/db/tests/komisi-pengurus.test.mjs
git commit -m "feat(bul-db): add pengurus, tipe rute, aturan komisi with posting on SJ completion"
```

---

### Task 6: Frontend — layar master baru + field Tipe Rute di form Rute

**Files:**
- Modify: `apps/bul/web/src/halaman/master/konfigurasi.js`
- Test: `apps/bul/web/src/halaman/master/konfigurasi.test.js`

**Interfaces:**
- Consumes: RPC `simpan_pengurus`, `simpan_tipe_rute`, `simpan_aturan_komisi`, `simpan_rute` (dengan `p_tipe_rute_id`) dari Task 5. `HAK['master.operasional']` dan `HAK['tarif.simpan']` dari `apps/bul/web/src/layout/menu.js` (sudah ada, tidak perlu diubah).
- Produces: entri baru `KONFIG_MASTER.pengurus`, `KONFIG_MASTER['tipe-rute']`, `KONFIG_MASTER['aturan-komisi']` — otomatis muncul sebagai tab baru di `MasterPage.jsx` (yang me-render `Object.values(KONFIG_MASTER)`, tidak perlu diubah).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke akhir `describe('konfigurasi master', ...)` di `apps/bul/web/src/halaman/master/konfigurasi.test.js` (sebelum penutup `});` terakhir):

```js
  it('pengurus: baris baru mengirim p_id null', () => {
    expect(KONFIG_MASTER.pengurus.keArgs({ nama: 'Budi', telepon: '0811', aktif: true }, null))
      .toEqual({ p_id: null, p_nama: 'Budi', p_telepon: '0811', p_aktif: true });
  });
  it('rute: tipe_rute_id kosong jadi null', () => {
    expect(KONFIG_MASTER.rute.keArgs({ nama: 'X', asal: 'A', tujuan: 'B', tipe_rute_id: undefined, aktif: true }, null))
      .toEqual({ p_id: null, p_nama: 'X', p_asal: 'A', p_tujuan: 'B', p_aktif: true, p_tipe_rute_id: null });
  });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run (dari `apps/bul/web`): `npm run test -- --run src/halaman/master/konfigurasi.test.js`
Expected: FAIL — `KONFIG_MASTER.pengurus` undefined, atau `rute.keArgs` belum mengirim `p_tipe_rute_id`.

- [ ] **Step 3: Tambah 3 konfigurasi master baru + field Tipe Rute di Rute**

Di `apps/bul/web/src/halaman/master/konfigurasi.js`:

Tambahkan konstanta baru setelah `const OPSI_MATERIAL = ...` (baris 8):
```js
const OPSI_TIPE_RUTE = { tabel: 'tipe_rute', label: 'nama' };
```

Ubah entri `rute` (baris 32-47) — tambahkan field `tipe_rute_id` dan `p_tipe_rute_id` di `keArgs`:
```js
  rute: {
    kunci: 'rute', judul: 'Rute', tabel: 'rute', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_rute',
    kolom: [
      { title: 'Rute', render: (_, r) => formatRute(r) },
      { title: 'Asal', dataIndex: 'asal' },
      { title: 'Tujuan', dataIndex: 'tujuan' },
    ],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'asal', label: 'Asal', tipe: 'teks' },
      { name: 'tujuan', label: 'Tujuan', tipe: 'teks' },
      { name: 'tipe_rute_id', label: 'Tipe Rute', tipe: 'pilihan', sumber: OPSI_TIPE_RUTE },
      AKTIF,
    ],
    keArgs: (v, b) => ({
      p_id: b?.id ?? null, p_nama: v.nama, p_asal: v.asal ?? '', p_tujuan: v.tujuan ?? '', p_aktif: v.aktif ?? true,
      p_tipe_rute_id: kosongNull(v.tipe_rute_id),
    }),
  },
```
(Baris `kolom` di sini sudah memakai `formatRute` dari Task 2 — kalau Task 2 sudah dikerjakan, JANGAN duplikasi, cukup pastikan baris ini sesuai. Kalau plan ini dijalankan mulai dari Task 6 tanpa Task 1-4, tambahkan dulu import `formatRute` seperti Task 2 Step 1.)

Tambahkan 3 entri baru ke `KONFIG_MASTER`, setelah entri `supir` (setelah baris yang berakhir `},` milik `supir`, sebelum `tarif:`):
```js
  pengurus: {
    kunci: 'pengurus', judul: 'Pengurus', tabel: 'pengurus', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_pengurus',
    kolom: [{ title: 'Nama', dataIndex: 'nama' }, { title: 'Telepon', dataIndex: 'telepon' }],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'telepon', label: 'Telepon', tipe: 'teks' },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_nama: v.nama, p_telepon: v.telepon ?? '', p_aktif: v.aktif ?? true }),
  },
  'tipe-rute': {
    kunci: 'tipe-rute', judul: 'Tipe Rute', tabel: 'tipe_rute', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_tipe_rute',
    kolom: [{ title: 'Nama', dataIndex: 'nama' }],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_nama: v.nama, p_aktif: v.aktif ?? true }),
  },
  'aturan-komisi': {
    kunci: 'aturan-komisi', judul: 'Aturan Komisi Pengurus', tabel: 'aturan_komisi',
    select: '*, tipe_rute(nama)', order: { kolom: 'berlaku_mulai', naik: false },
    hak: 'tarif.simpan', rpc: 'simpan_aturan_komisi',
    kolom: [
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'Tipe Rute', dataIndex: ['tipe_rute', 'nama'] },
      { title: 'Berlaku mulai', dataIndex: 'berlaku_mulai', render: formatTanggal },
      { title: 'Nominal', dataIndex: 'nominal', align: 'right', render: formatRupiah },
    ],
    field: [
      { name: 'nama', label: 'Nama aturan', tipe: 'teks', wajib: true },
      { name: 'tipe_rute_id', label: 'Tipe Rute', tipe: 'pilihan', sumber: OPSI_TIPE_RUTE, wajib: true },
      { name: 'berlaku_mulai', label: 'Berlaku mulai', tipe: 'tanggal', wajib: true, bawaan: 'hari_ini' },
      { name: 'nominal', label: 'Nominal', tipe: 'uang', wajib: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({
      p_id: b?.id ?? null, p_nama: v.nama, p_tipe_rute_id: v.tipe_rute_id,
      p_berlaku_mulai: keTanggalDb(v.berlaku_mulai), p_nominal: v.nominal, p_aktif: v.aktif ?? true,
    }),
  },
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run (dari `apps/bul/web`): `npm run test -- --run` lalu `npm run build`
Expected: 46 test lulus (44 dari Fase 1 + 2 baru), build sukses.

- [ ] **Step 5: Commit**

```bash
git add apps/bul/web/src/halaman/master/konfigurasi.js apps/bul/web/src/halaman/master/konfigurasi.test.js
git commit -m "feat(bul-web): add Pengurus, Tipe Rute, Aturan Komisi Pengurus master screens"
```

---

### Task 7: Beranda — kartu Hutang Komisi Pengurus

**Files:**
- Modify: `apps/bul/web/src/halaman/Beranda.jsx`

**Interfaces:**
- Consumes: view `public.v_hutang_komisi_pengurus` (kolom `saldo`) dari Task 5, helper `useDaftar` dari `../lib/data.js` (sudah ada), `dariSen`/`jumlahkan` dari `../lib/uang.js` (sudah ada, dipakai pola yang sama seperti kartu "Hutang upah supir").

- [ ] **Step 1: Tambah kartu baru**

Di `apps/bul/web/src/halaman/Beranda.jsx`, baris 10, tambahkan setelah:
```js
  const hutang = useDaftar('v_hutang_upah_supir');
```
baris baru:
```js
  const hutangKomisi = useDaftar('v_hutang_komisi_pengurus');
```

Baris 20-21, tambahkan kartu baru setelah kartu "Hutang upah supir":
```js
        <Card><Statistic title="Hutang upah supir" value={formatRupiah(dariSen(jumlahkan((hutang.data ?? []).map((r) => r.saldo))))} /></Card>
        <Card><Statistic title="Hutang komisi pengurus" value={formatRupiah(dariSen(jumlahkan((hutangKomisi.data ?? []).map((r) => r.saldo))))} /></Card>
```

- [ ] **Step 2: Build, pastikan sukses**

Run (dari `apps/bul/web`): `npm run test -- --run` lalu `npm run build`
Expected: 46 test tetap lulus (tidak ada test baru untuk Beranda — konsisten dengan cakupan test yang sudah ada, komponen ini sebelumnya juga tidak punya test unit tersendiri), build sukses.

Catatan: verifikasi visual kartu ini di browser TIDAK termasuk langkah otomatis di plan ini — perlu login manual ke aplikasi dengan akun `owner` untuk melihat Beranda setelah migrasi Task 5 diterapkan.

- [ ] **Step 3: Commit**

```bash
git add apps/bul/web/src/halaman/Beranda.jsx
git commit -m "feat(bul-web): add hutang komisi pengurus card to Beranda"
```

Fase 2 selesai.

---

## Self-review (dilakukan penulis plan, bukan reviewer terpisah)

**Cakupan spec:** D1 (tabel pengurus) → Task 5. D2 (auto-fill) → Task 5 (`buat_sj`) + test. D3 (tipe_rute nama bebas) → Task 5 (tabel `tipe_rute`, tanpa enum). D4 (nominal flat per SJ dari tipe_rute) → Task 5 (`komisi_berlaku`, `aturan_komisi.nominal`). D5 (posting saat SJ selesai) → Task 5 (`selesaikan_sj`). D6 (skip kalau tidak ada aturan) → Task 5 (`v_komisi is not null and v_komisi > 0`, test "melewati komisi"). D7 (tanpa override manual) → `selesaikan_sj` tidak menerima parameter baru. D8 (Bonus terpisah) → sengaja tidak ada task untuk Bonus di plan ini. §3 skema → Task 5 DDL. §4 posting (termasuk perubahan `internal.posting_jurnal`/`internal.balik_jurnal`) → Task 5. §5 UI/hak akses → Task 6. Format rute (§5 bagian akhir) → Task 1-4. §6 pembagian fase → struktur plan ini (Fase 1 = Task 1-4, Fase 2 = Task 5-7). Tidak ada requirement spec yang belum tercakup task.

**Placeholder scan:** tidak ada "TBD"/"TODO"/"tambahkan validasi yang sesuai" di manapun dalam plan ini — semua step berisi kode lengkap siap tempel atau perintah shell persis.

**Konsistensi tipe/signature:** `formatRute(r)` dipakai identik di Task 1-4 dan Task 6. `p_tipe_rute_id` konsisten sebagai parameter ke-6 `simpan_rute` di Task 5 dan dikonsumsi di Task 6's `keArgs`. `komisi_berlaku(p_tipe_rute_id uuid, p_tanggal date)` dideklarasikan dan dipanggil dengan urutan argumen yang sama di Task 5. Nama kolom `pengurus_id` konsisten di `jurnal_baris`, `surat_jalan`, dan view `v_hutang_komisi_pengurus`. Angka test (111→127 DB, 43→44→46 web) dihitung dari isi test yang benar-benar ditulis di setiap task, bukan tebakan.

---

## Eksekusi

Implementasi dikerjakan **Codex** (bukan subagent Claude), sesuai keputusan kerja proyek ini — Codex menjadi satu-satunya implementer per task/branch/worktree, Claude berperan sebagai reviewer read-only setelah setiap batch commit. Prompt Codex untuk Fase 1 dan Fase 2 disiapkan terpisah (lihat pesan berikutnya).
