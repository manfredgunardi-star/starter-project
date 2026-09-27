# Rencana: Kode master yang terlihat manusia

## Konteks

User melihat baris `RUTE-529E27DF, Pasir JB - Bogor` di layar Rute dan menyimpulkan kode unik sedang dijejalkan ke dalam `nama`. **Baris itu sisa data uji**, bukan perilaku aplikasi: `db/tests/fixtures.mjs:19` membuatnya lewat `unik('RUTE-')` di `db/tests/helpers.mjs:56`, dan `npm run test:db` meninggalkannya di database lokal.

Meski premisnya keliru, kebutuhannya sah. Master data sekarang hanya bisa disebut lewat nama, dan nama berubah-ubah, berulang antar-lokasi, serta canggung dipakai di percakapan sehari-hari. Kode pendek yang stabil memperbaiki itu.

## Keputusan user

1. Kode dipasang pada **tujuh tabel**: `pelanggan`, `rute`, `material`, `truk`, `supir`, `pengurus`, `tipe_rute`. `lini` dan `akun` dikecualikan — keduanya sudah ber-primary key kode manusia (`SJP`, `5110`).
2. Kode **dibuat otomatis dan tidak bisa diubah**.
3. Bentuknya **awalan + nomor urut**: `RTE-0001`, `PLG-0001`, dan seterusnya.
4. **Kontrak CSV impor TIDAK disentuh.** Kode murni untuk dibaca di layar.
5. Dikerjakan sebagai **PR terpisah sesudah #84 merged**.

## Batas yang tidak boleh dilanggar

Keputusan 4 adalah pagar terpenting rencana ini. Berkas-berkas berikut **tidak boleh berubah satu baris pun**:

- `supabase/migrations/20260925000100_impor_fondasi.sql` (`internal.cari_rute`)
- `supabase/migrations/20260925000200_impor_master.sql`, `…000300_impor_sj.sql`, `…000400_impor_kas.sql`
- `web/src/halaman/impor/skema.js` dan `skema.test.js`
- `web/src/halaman/impor/ImporPage.jsx`
- `db/tests/impor.test.mjs`

Kalau salah satu berkas itu ikut berubah, perbaikannya sudah keluar jalur. Impor tetap mencocokkan master lewat nama, persis seperti sekarang.

Penautan antar-tabel **sudah** memakai `uuid` (`surat_jalan.rute_id`, `tarif.rute_id`, `uang_jalan_rute.rute_id`, dan seterusnya). Kode ini **tidak menggantikan foreign key mana pun**. Tidak ada satu pun `references` yang berubah.

## Baseline

Sebelum task pertama: **187 tes DB / 14 berkas** dan **80 tes web / 16 berkas** lulus, `npm run build` sukses.

---

### Task 1: Migrasi kolom kode

**Files:**
- Create: `apps/bul/supabase/migrations/20260926000100_kode_master.sql`

**Interfaces:**
- Consumes: skema `public` dan `internal` yang sudah ada.
- Produces: kolom `kode text not null unique` pada tujuh tabel master, terisi otomatis lewat `default` yang memanggil sequence di skema `internal`.
- Tidak menambah satu pun fungsi di skema `public`, sehingga **gerbang katalog tertutup di `db/tests/keamanan.test.mjs` tidak perlu disentuh**. Jumlah fungsi `public` tetap 57.

- [ ] **Step 1: Tulis migrasinya**

Penolong dinamis dipakai supaya tujuh tabel tidak ditulis tujuh kali, lalu **dibuang di akhir migrasi** agar tidak ada fungsi SQL dinamis yang menetap di database.

```sql
-- Kode master yang terlihat manusia: RTE-0001, PLG-0001, dan seterusnya.
--
-- Kode ini MURNI untuk dibaca. Penautan antar-tabel tetap lewat uuid, dan kontrak CSV
-- impor tetap mencocokkan master lewat nama. Tidak ada foreign key, tidak ada RPC impor,
-- dan tidak ada berkas CSV yang berubah karena migrasi ini.

create function internal.pasang_kode_master(p_tabel text, p_awalan text, p_urut text)
returns void language plpgsql as $$
begin
  execute format('create sequence internal.%I_kode_seq', p_tabel);
  execute format('alter table public.%I add column kode text', p_tabel);

  -- Backfill DETERMINISTIK. Tanpa order by yang eksplisit, nomor urut mengikuti urutan
  -- baris fisik, dan db:reset bisa menghasilkan kode berbeda tiap kali sehingga tes yang
  -- mematri nilai akan goyah tanpa sebab yang kelihatan.
  execute format(
    'update public.%1$I t set kode = %2$L || ''-'' || lpad(u.n::text, 4, ''0'')
       from (select id, row_number() over (order by %3$I, id) as n from public.%1$I) u
      where t.id = u.id',
    p_tabel, p_awalan, p_urut);

  -- Sequence dimulai sesudah baris yang sudah ada, supaya baris berikutnya melanjutkan
  -- nomor, bukan menabraknya.
  execute format(
    'select setval(''internal.%1$I_kode_seq'', coalesce((select count(*) from public.%1$I), 0) + 1, false)',
    p_tabel);

  execute format(
    'alter table public.%1$I alter column kode set default %2$L || ''-'' || lpad(nextval(''internal.%1$I_kode_seq'')::text, 4, ''0'')',
    p_tabel, p_awalan);
  execute format('alter table public.%I alter column kode set not null', p_tabel);
  execute format('alter table public.%1$I add constraint %1$s_kode_key unique (kode)', p_tabel);
end $$;

select internal.pasang_kode_master('pelanggan', 'PLG', 'nama');
select internal.pasang_kode_master('rute',      'RTE', 'nama');
select internal.pasang_kode_master('material',  'MAT', 'nama');
select internal.pasang_kode_master('truk',      'TRK', 'nopol');
select internal.pasang_kode_master('supir',     'SPR', 'nama');
select internal.pasang_kode_master('pengurus',  'PGR', 'nama');
select internal.pasang_kode_master('tipe_rute', 'TPR', 'nama');

drop function internal.pasang_kode_master(text, text, text);

select internal.terapkan_hak_akses();
```

- [ ] **Step 2: Jalankan `npm run db:reset` dan pastikan migrasi lolos**

```bash
cd C:/Project/.worktrees/bul/kode-master/apps/bul && npm run db:reset
```

Kalau gagal, jangan menambal dengan menghapus `not null` atau `unique`. Keduanya justru inti dari task ini.

---

### Task 2: Tes DB untuk kode master

**Files:**
- Create: `apps/bul/db/tests/kode-master.test.mjs`

**Interfaces:**
- Consumes: `jalankan`, `sebagai`, `satu`, `unik` dari `db/tests/helpers.mjs`.

- [ ] **Step 1: Tulis tes yang gagal**

```javascript
import { describe, it, expect } from 'vitest';
import { jalankan, sebagai, satu, sql, unik } from './helpers.mjs';

const TABEL = [
  ['pelanggan', 'PLG'], ['rute', 'RTE'], ['material', 'MAT'], ['truk', 'TRK'],
  ['supir', 'SPR'], ['pengurus', 'PGR'], ['tipe_rute', 'TPR'],
];

describe('kode master', () => {
  // Barisnya dibuat sendiri, tidak mengandalkan seed. Diverifikasi ke database lokal:
  // `pengurus` dan `tipe_rute` bisa KOSONG, sehingga tes yang hanya menyaring baris yang
  // sudah ada akan lolos tanpa memeriksa apa pun untuk kedua tabel itu.
  const BUAT = {
    pelanggan: ['select public.simpan_pelanggan(p_id => null, p_nama => $1)', () => [unik('PLG-')]],
    rute: ['select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      () => [unik('RTE-'), 'Bogor', 'Jakarta']],
    material: ['select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3)',
      () => ['SJP', unik('MAT-'), 'm3']],
    truk: ['select public.simpan_truk(p_id => null, p_nopol => $1, p_jenis => $2)', () => [unik('B '), 'Dump']],
    supir: ['select public.simpan_supir(p_id => null, p_nama => $1)', () => [unik('SPR-')]],
    pengurus: ['select public.simpan_pengurus(p_id => null, p_nama => $1)', () => [unik('PGR-')]],
    tipe_rute: ['select public.simpan_tipe_rute(p_id => null, p_nama => $1)', () => [unik('TPR-')]],
  };

  it('ketujuh tabel punya kode yang berbentuk awalan dan empat angka', async () => {
    for (const [tabel, awalan] of TABEL) {
      const [kueri, args] = BUAT[tabel];
      await sebagai('owner', kueri, args());
      const baris = await sql(`select kode from public.${tabel}`);
      expect(baris.length).toBeGreaterThan(0);
      for (const r of baris) {
        expect(r.kode).toMatch(new RegExp(`^${awalan}-\\d{4}$`));
      }
    }
  });

  it('kode wajib ada dan unik di setiap tabel', async () => {
    for (const [tabel] of TABEL) {
      // Kolomnya not null dan unique; dua-duanya dibuktikan ke katalog, bukan ke perilaku,
      // supaya jaminannya tetap berlaku untuk jalur tulis yang belum ada hari ini.
      const [k] = await sql(
        `select a.attnotnull as wajib,
                exists (select 1 from pg_constraint c
                         where c.conrelid = a.attrelid and c.contype = 'u'
                           and c.conkey = array[a.attnum]) as unik
           from pg_attribute a
          where a.attrelid = 'public.${tabel}'::regclass and a.attname = 'kode'`);
      expect(k).toEqual({ wajib: true, unik: true });
    }
  });

  it('baris baru mendapat kode otomatis yang melanjutkan nomor, bukan menabraknya', async () => {
    const owner = 'owner';
    const a = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SPR-')]);
    const b = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SPR-')]);
    const [ka] = await sql('select kode from public.supir where id = $1', [a.id]);
    const [kb] = await sql('select kode from public.supir where id = $1', [b.id]);
    expect(Number(kb.kode.slice(4))).toBe(Number(ka.kode.slice(4)) + 1);
  });

  it('kode tidak berubah ketika master disunting lewat RPC', async () => {
    const owner = 'owner';
    const { id } = await satu(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3) as id',
      [unik('R-'), 'Bogor', 'Jakarta']);
    const [sebelum] = await sql('select kode from public.rute where id = $1', [id]);

    // simpan_rute yang sama dipakai untuk menyunting. Kolom kode tidak termasuk dalam
    // UPDATE-nya, dan browser tidak punya hak tulis tabel sama sekali, jadi inilah satu-
    // satunya jalur yang bisa mengubah rute — dan ia tidak menyentuh kodenya.
    await sebagai(owner,
      'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4)',
      [id, unik('R-BARU-'), 'Depok', 'Bekasi']);
    const [sesudah] = await sql('select kode, nama from public.rute where id = $1', [id]);

    expect(sesudah.kode).toBe(sebelum.kode);
    expect(sesudah.nama).toMatch(/^R-BARU-/);
  });

  it('impor tetap mencocokkan master lewat nama, bukan lewat kode', async () => {
    // Pagar rencana ini. Kalau seseorang kelak mengubah cari_rute agar menerima kode,
    // tes ini gagal dan memaksa keputusan itu dibicarakan ulang, bukan menyelinap masuk.
    const rute = unik('RUTE-');
    await sebagai('owner',
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [rute, 'Bogor', 'Jakarta']);
    const [ok] = await sql('select internal.cari_rute($1, $2, $3, 1) as id', [rute, 'Bogor', 'Jakarta']);
    expect(ok.id).toBeTruthy();

    const [k] = await sql('select kode from public.rute where nama = $1', [rute]);
    await expect(sql('select internal.cari_rute($1, $2, $3, 1) as id', [k.kode, 'Bogor', 'Jakarta']))
      .rejects.toThrow(/rute .* tidak ditemukan/);
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan GAGAL sebelum migrasi, LULUS sesudahnya**

```bash
cd C:/Project/.worktrees/bul/kode-master/apps/bul && npm run test:db
```

Diharapkan: **187 + 5 = 192 tes / 15 berkas** lulus.

---

### Task 3: Kode tampil di layar master

**Files:**
- Modify: `apps/bul/web/src/halaman/master/konfigurasi.js`
- Modify: `apps/bul/web/src/halaman/master/konfigurasi.test.js`

**Interfaces:**
- `useDaftar` sudah memakai `select = '*'` secara bawaan ([`web/src/lib/data.js:6`](../../../apps/bul/web/src/lib/data.js)), jadi kolom baru ikut terbawa tanpa mengubah pengambilan datanya.

- [ ] **Step 1: Tambahkan kolom Kode**

Pada ketujuh entri master (`pelanggan`, `rute`, `material`, `truk`, `supir`, `pengurus`, `tipeRute`), sisipkan kolom ini sebagai **kolom pertama** pada `kolom`:

```javascript
{ title: 'Kode', dataIndex: 'kode', width: 110 },
```

**Jangan menambahkannya ke `field`.** Kode dibuat sistem dan tidak bisa diubah; memunculkannya di formulir akan menjanjikan sesuatu yang tidak benar.

**Jangan menyentuh `keArgs`.** Tidak ada RPC yang menerima kode.

- [ ] **Step 2: Tulis tes**

Tambahkan di akhir `konfigurasi.test.js`:

```javascript
describe('kode master', () => {
  const BERKODE = ['pelanggan', 'rute', 'material', 'truk', 'supir', 'pengurus', 'tipeRute'];

  it('ketujuh master menampilkan kolom Kode paling depan', () => {
    for (const k of BERKODE) {
      expect(MASTER[k].kolom[0]).toMatchObject({ title: 'Kode', dataIndex: 'kode' });
    }
  });

  it('kode tidak muncul sebagai isian formulir di mana pun', () => {
    // Kode dibuat sistem dan tidak bisa diubah. Isian formulir akan menjanjikan
    // sebaliknya, dan nilainya pun tidak akan sampai ke RPC mana pun.
    for (const def of Object.values(MASTER)) {
      expect((def.field ?? []).map((f) => f.name)).not.toContain('kode');
    }
  });
});
```

Sesuaikan nama `MASTER` dan cara mengimpornya dengan yang sudah dipakai berkas tes itu; jangan menambah baris `import` kedua untuk simbol yang sudah diimpor.

- [ ] **Step 3: Jalankan**

```bash
cd C:/Project/.worktrees/bul/kode-master/apps/bul/web && npx vitest run
```

Diharapkan: **80 + 2 = 82 tes / 16 berkas** lulus.

```bash
cd C:/Project/.worktrees/bul/kode-master/apps/bul/web && npm run build
```

---

### Task 4: Verifikasi manual di browser

**Files:** tidak ada perubahan kode.

- [ ] **Step 1: Jalankan aplikasi**

```bash
cd C:/Project/.worktrees/bul/kode-master/apps/bul/web && npm run dev
```

Salin `.env.local` dari worktree impor kalau belum ada. Kunci yang dipakai harus **Publishable** (`sb_publishable_…`); kunci Secret tidak boleh masuk variabel `VITE_` karena seluruhnya ikut ke bundel browser dan kunci itu melewati semua RLS.

- [ ] **Step 2: Periksa**

1. Ketujuh layar master menampilkan kolom **Kode** paling kiri, terisi semua, tak satu pun kosong.
2. Formulir Tambah/Ubah **tidak** punya isian Kode.
3. Tambah satu rute baru: kodenya muncul melanjutkan nomor terakhir.
4. Ubah nama rute itu: **kodenya tidak berubah**.
5. Buka layar **Impor**, muat `rute.csv` berisi rute yang sudah ada. Pencocokan tetap jalan lewat nama, dan tidak ada galat baru — ini membuktikan pagar keputusan 4 masih utuh.

- [ ] **Step 3: Tulis laporan**

Sebutkan branch, commit, hasil `npm run test:db`, `npx vitest run`, `npm run build`, dan temuan Step 2 butir demi butir.

---

## Cakupan

Kode master tujuh tabel (Task 1), jaminan wajib/unik/otomatis/tak-berubah (Task 2), tampilan di layar tanpa isian formulir (Task 3), verifikasi manual termasuk pagar kontrak impor (Task 4). Kontrak CSV, foreign key, dan RPC impor sengaja tidak tersentuh.
