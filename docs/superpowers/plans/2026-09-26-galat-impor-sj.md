# Rencana: Pesan kesalahan impor surat jalan yang menunjuk tempatnya

## Temuan

Seluruhnya dibuktikan dengan menjalankan `bacaBerkas` dan `namaTakDikenal` yang di-commit, bukan dengan membaca kodenya.

`surat-jalan.csv` punya **17 kolom** — `A` sampai `Q` — dan delapan di antaranya wajib. Pesan galat yang ada sekarang tidak cukup untuk menemukan letak kesalahan di berkas selebar itu.

### T1 — Nomor baris menunjuk baris yang salah

`skema.js:57` memakai `const no = i + 1`, sedangkan `i` adalah indeks baris **sesudah** baris judul dan baris kosong dibuang oleh `dariCsv`. Dibuktikan:

| berkas | isi | pesan |
|---|---|---|
| baris 1 | judul | — |
| baris 2 | SJ-001 | — |
| baris 3 | *kosong* | dibuang |
| baris 4 | SJ-002, `qty_muat` salah | `surat-jalan.csv baris 2: qty_muat "xx" bukan angka` |

User membuka baris 2 dan menemukan SJ-001 yang tidak bermasalah. Selisihnya minimal satu (baris judul) dan **bertambah setiap ada baris kosong di atasnya**, jadi tidak bisa dikoreksi user dengan menambah satu.

### T2 — Nomor SJ tidak pernah disebut

Kolom `nomor` adalah cara user mengenali barisnya sehari-hari. Tidak satu pun pesan menyebutnya.

### T3 — Nama kolom tanpa posisi

`qty_muat` adalah kolom ke-12 dari 17. User harus menghitung sendiri untuk menemukannya di Excel.

### T4 — Pesan format tidak menunjukkan bentuk yang benar

`"Rp 400.000" bukan angka` tidak memberi tahu bahwa desimal memakai koma dan pemisah ribuan tidak boleh ada. `"01/03/2026" bukan tanggal YYYY-MM-DD` menyebut formatnya tetapi tidak memberi contoh.

### T5 — "belum ada" menyembunyikan sebab yang berbeda

`namaTakDikenal` membandingkan dengan daftar master dari `useDaftar`, yang **tidak menyaring `aktif`** (`web/src/lib/data.js:6`). Master yang ada tetapi non-aktif lolos pemeriksaan web, lalu ditolak database dengan `tidak ditemukan atau tidak aktif` — dua keadaan dengan perbaikan yang sama sekali berbeda, digabung dalam satu kalimat.

### T6 — Satu kesalahan menghasilkan delapan pesan

Baris judul yang salah menghasilkan delapan baris `kolom "x" tidak ada` berturut-turut, padahal penyebabnya satu.

## Batas

Perbaikan ini **khusus `surat-jalan.csv`**, sesuai permintaan user. Dua bagian tetap dikerjakan di tempat bersama karena di situlah diff-nya paling kecil dan agar sepuluh berkas lain tidak ditinggalkan rusak:

- nomor baris sumber (T1) diperbaiki di `dariCsv`, satu-satunya tempat yang tahu nomor itu;
- huruf kolom (T3) lahir dari perulangan kolom yang sama untuk semua berkas, sehingga membuatnya khusus SJ justru butuh cabang tambahan.

Nomor SJ (T2) memang khusus, dan dipasang lewat satu field opsional `penanda` pada definisi berkas.

**Kontrak CSV tidak berubah.** Tidak ada kolom yang ditambah, dihapus, atau diganti nama.

## Baseline

**187 tes DB / 14 berkas** dan **80 tes web / 16 berkas** lulus, `npm run build` sukses.

---

### Task 1: `dariCsv` membawa nomor baris sumber

**Files:**
- Modify: `apps/bul/web/src/lib/csv.js`
- Modify: `apps/bul/web/src/lib/csv.test.js`

- [ ] **Step 1: Pecah `dariCsv` menjadi dua**

Ganti badan `dariCsv` yang ada dengan dua fungsi ini. Bagian penguraiannya **tidak berubah sama sekali** — yang berubah hanya penyaringan baris kosong, yang kini mempertahankan indeks aslinya.

```javascript
// Nomor baris sumber ikut dibawa supaya pesan galat bisa menunjuk baris yang SAMA dengan
// yang dilihat user di Excel. Baris judul adalah baris 1, jadi baris data ke-k berada di
// baris k+1 — dan setiap baris kosong yang dibuang menggeser selisihnya lebih jauh lagi,
// sehingga user tidak bisa mengoreksinya sendiri dengan menambah satu.
export function dariCsvBernomor(teks) {
  const s = String(teks ?? '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const semua = [];
  let baris = [];
  let sel = '';
  let dalamKutip = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (dalamKutip) {
      if (c !== '"') sel += c;
      else if (s[i + 1] === '"') { sel += '"'; i += 1; }
      else dalamKutip = false;
      continue;
    }
    if (c === '"' && sel === '') dalamKutip = true;
    else if (c === ';') { baris.push(sel); sel = ''; }
    else if (c === '\n') { baris.push(sel); semua.push(baris); baris = []; sel = ''; }
    else sel += c;
  }
  if (sel !== '' || baris.length) { baris.push(sel); semua.push(baris); }

  // Indeks asli dipertahankan SEBELUM menyaring, karena setelah disaring ia hilang.
  const isi = semua
    .map((r, i) => ({ no: i + 1, sel: r }))
    .filter((r) => r.sel.some((v) => v.trim() !== ''));
  if (isi.length < 2) return [];
  const judul = isi[0].sel.map((h) => h.trim());
  return isi.slice(1).map((r) => ({
    no: r.no,
    nilai: Object.fromEntries(judul.map((h, i) => [h, (r.sel[i] ?? '').trim()])),
  }));
}

export function dariCsv(teks) {
  return dariCsvBernomor(teks).map((r) => r.nilai);
}
```

- [ ] **Step 2: Tambahkan tes**

Ketujuh tes `dariCsv` yang ada **tidak boleh diubah** — kalau ada yang gagal, pemecahannya salah, bukan tesnya. Tambahkan di akhir `describe('dariCsv')`:

```javascript
  it('dariCsvBernomor menyebut baris sumber, bukan urutan sesudah baris kosong dibuang', () => {
    // Inilah cacatnya: SJ-002 ada di baris 4 berkas, tetapi sesudah judul dan baris kosong
    // dibuang ia menjadi elemen ke-2. Pesan galat yang memakai urutan itu mengirim user ke
    // baris yang isinya justru tidak bermasalah.
    const r = dariCsvBernomor('\ufeffnomor;qty\r\nSJ-001;10\r\n\r\nSJ-002;xx\r\n');
    expect(r.map((x) => x.no)).toEqual([2, 4]);
    expect(r[1].nilai).toEqual({ nomor: 'SJ-002', qty: 'xx' });
  });

  it('dariCsv tetap mengembalikan bentuk lama, tanpa nomor', () => {
    const teks = '\ufeffnomor;qty\r\nSJ-001;10\r\n';
    expect(dariCsv(teks)).toEqual([{ nomor: 'SJ-001', qty: '10' }]);
  });
```

Jangan menambah baris `import` baru untuk `dariCsv`; berkas ini sudah mengimpornya. Tambahkan `dariCsvBernomor` ke daftar impor yang sudah ada.

- [ ] **Step 3: Jalankan**

```bash
cd C:/Project/.worktrees/bul/galat-sj/apps/bul/web && npx vitest run src/lib/csv.test.js
```

Diharapkan: **10 tes** lulus (8 lama + 2 baru).

---

### Task 2: Pesan menyebut berkas, baris Excel, nomor SJ, dan huruf kolom

**Files:**
- Modify: `apps/bul/web/src/halaman/impor/skema.js`
- Modify: `apps/bul/web/src/halaman/impor/skema.test.js`

- [ ] **Step 1: Tambahkan penanda pada definisi surat-jalan.csv**

Pada entri `surat-jalan.csv` di `BERKAS`, tambahkan satu field sesudah `kunci`:

```javascript
penanda: 'nomor',
```

Hanya `surat-jalan.csv` yang mendapatkannya. Berkas lain tidak punya kolom pengenal yang sepadan, dan `tempat()` menanganinya dengan tidak menyebut apa-apa.

- [ ] **Step 2: Tambahkan pembangun pesan**

Sisipkan di atas `bacaBerkas`:

```javascript
// Huruf kolom seperti yang dilihat user di Excel. surat-jalan.csv punya 17 kolom (A..Q),
// dan "kolom qty_muat" saja memaksa user menghitung sendiri kolom ke-12 dari 17.
const HURUF = (i) => {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// Satu tempat untuk menyebut LETAK kesalahan: berkas, baris sebagaimana terlihat di Excel,
// pengenal baris kalau berkasnya punya, dan huruf kolom. Semua pesan memakainya supaya
// bentuknya tidak pernah berbeda antar-cabang.
function tempat(def, no, m, kolom) {
  const penanda = def.penanda ? String(m?.[def.penanda] ?? '').trim() : '';
  const dasar = `${def.berkas} baris ${no}${penanda ? ` (${penanda})` : ''}`;
  if (!kolom) return dasar;
  return `${dasar} kolom ${HURUF(def.kolom.findIndex((k) => k.nama === kolom))} "${kolom}"`;
}
```

- [ ] **Step 3: Pakai nomor baris sumber dan pembangun pesan di `bacaBerkas`**

Tiga perubahan di dalam `bacaBerkas`:

1. `const mentah = dariCsv(teks);` menjadi `const mentah = dariCsvBernomor(teks);` dan impornya disesuaikan.
2. Judul dibaca dari `mentah[0]?.nilai`, bukan `mentah[0]`.
3. Kolom wajib yang hilang dijadikan **satu** pesan:

```javascript
  const hilang = def.kolom.filter((k) => k.wajib && !judul.has(k.nama)).map((k) => k.nama);
  if (hilang.length) {
    // Satu baris judul yang salah dulu menghasilkan delapan pesan berturut-turut untuk satu
    // kesalahan yang sama, sehingga daftar galat terlihat jauh lebih parah daripada keadaannya.
    return { kunci: def.kunci, baris: [], galat: [
      `${def.berkas}: ${hilang.length} kolom wajib tidak ada — ${hilang.join(', ')}. Pastikan baris pertama berkas adalah baris judul dari templat dan pemisahnya titik koma.`,
    ] };
  }
```

4. Perulangan barisnya menjadi:

```javascript
  mentah.forEach(({ no, nilai: m }) => {
```

`const no = i + 1;` **dihapus** — `no` kini datang dari berkasnya.

5. Setiap `galat.push` di dalam perulangan itu memakai `tempat`:

```javascript
      if (v === '') {
        if (k.wajib) { galat.push(`${tempat(def, no, m, k.nama)}: wajib diisi`); rusak = true; }
        keluar[k.nama] = k.jenis === 'boolean' ? null : '';
        continue;
      }
      if (k.jenis === 'angka') {
        const a = keAngka(v);
        if (a === null) {
          galat.push(`${tempat(def, no, m, k.nama)}: "${v}" bukan angka. Contoh yang benar: 10 atau 10,5 — pakai koma untuk desimal, tanpa titik ribuan dan tanpa "Rp"`);
          rusak = true;
        }
        keluar[k.nama] = a ?? '';
      } else if (k.jenis === 'tanggal') {
        const d = keTanggal(v);
        if (d === null) {
          galat.push(`${tempat(def, no, m, k.nama)}: "${v}" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01`);
          rusak = true;
        }
        keluar[k.nama] = d ?? '';
      } else if (k.jenis === 'boolean') {
        const l = v.toLowerCase();
        if (YA.includes(l)) keluar[k.nama] = true;
        else if (TIDAK.includes(l)) keluar[k.nama] = false;
        else { galat.push(`${tempat(def, no, m, k.nama)}: "${v}" harus ya atau tidak`); rusak = true; keluar[k.nama] = null; }
      } else if (k.jenis === 'pilihan' && !k.pilihan.includes(v)) {
        galat.push(`${tempat(def, no, m, k.nama)}: "${v}" harus salah satu dari ${k.pilihan.join(', ')}`);
        rusak = true;
        keluar[k.nama] = v;
      } else {
        keluar[k.nama] = v;
      }
```

6. Penjaga silang `qty_bongkar` ikut memakainya, dan menyebut huruf kolom pasangannya:

```javascript
    if (def.kunci === 'surat_jalan' && keluar.qty_bongkar !== ''
        && (m.tanggal_selesai ?? '').trim() === '') {
      galat.push(`${tempat(def, no, m, 'qty_bongkar')}: diisi tetapi ${tempat(def, no, m, 'tanggal_selesai').split('kolom ')[1]} kosong, jadi qty_bongkar akan terbuang`);
      rusak = true;
    }
```

7. Baris yang lolos membawa nomor barisnya, supaya `namaTakDikenal` tidak mengulang cacat yang sama:

```javascript
    if (!rusak) baris.push({ ...keluar, __baris: no });
```

`__baris` tidak bisa bertabrakan dengan kolom mana pun karena kolom ditetapkan oleh `BERKAS`. Ia ikut terkirim ke RPC sebagai kunci jsonb tambahan; `internal.periksa_kiriman` hanya memeriksa bentuk array dan jumlah baris, jadi kunci tambahan diabaikan — diverifikasi ke migrasi `20260925000100_impor_fondasi.sql`.

- [ ] **Step 4: `namaTakDikenal` memakai nomor baris dan huruf kolom yang sama**

Di dalam `namaTakDikenal`, ganti penyusunan pesannya:

```javascript
  for (const [kunci, kolom] of Object.entries(RUJUKAN)) {
    const def = BERKAS.find((b) => b.kunci === kunci);
    (kiriman[kunci] ?? []).forEach((b, i) => {
      const no = b.__baris ?? i + 1;
      for (const [nama, jenis] of Object.entries(kolom)) {
        const v = (b[nama] ?? '').trim();
        if (v && !ada[jenis].has(v)) {
          galat.push(`${tempat(def, no, b, nama)}: "${v}" belum ada di master. Tambahkan lewat ${kunci === 'kas' ? 'layar Akun' : `${jenis}.csv`} pada kiriman yang sama, atau lewat layar masternya`);
        }
      }
      if (PUNYA_MATERIAL.includes(kunci)) {
        const m = (b.material ?? '').trim();
        if (m && !ada.material.has(`${(b.lini ?? '').trim()}|${m}`)) {
          galat.push(`${tempat(def, no, b, 'material')}: "${m}" belum ada untuk lini "${(b.lini ?? '').trim()}". Material dicocokkan per lini, jadi nama yang sama di lini berbeda dianggap material berbeda`);
        }
      }
    });
  }
```

`BERKAS_DARI_KUNCI` tidak dipakai lagi dan **dihapus**.

- [ ] **Step 5: Tes**

Tambahkan `describe` baru di akhir `skema.test.js`:

```javascript
describe('pesan galat surat jalan', () => {
  const def = BERKAS.find((b) => b.berkas === 'surat-jalan.csv');
  const J = def.kolom.map((k) => k.nama).join(';');
  const isi = (o = {}) => def.kolom.map((k) => o[k.nama] ?? ({
    lini: 'SJP', nomor: 'SJ-001', tanggal: '2026-03-01', pelanggan: 'PT A', rute: 'R1',
    rute_asal: 'Bogor', rute_tujuan: 'Jakarta', material: 'Pasir', nopol: 'B 1 AA',
    supir: 'Budi', pengurus: 'Andi', qty_muat: '10', uang_jalan: '400000',
  }[k.nama] ?? '')).join(';');

  it('menunjuk baris berkas, bukan urutan sesudah baris kosong dibuang', () => {
    // SJ-002 ada di baris 4 berkas. Sebelum perbaikan ini pesannya menyebut "baris 2",
    // yang isinya justru SJ-001 yang tidak bermasalah.
    const h = bacaBerkas('surat-jalan.csv', csv(J, isi({ nomor: 'SJ-001' }), '', isi({ nomor: 'SJ-002', qty_muat: 'xx' })));
    expect(h.galat).toHaveLength(1);
    expect(h.galat[0]).toContain('baris 4 (SJ-002)');
    expect(h.galat[0]).not.toContain('baris 2');
  });

  it('menyebut huruf kolom sebagaimana terlihat di Excel', () => {
    // 17 kolom, A sampai Q. qty_muat kolom ke-12 = L, tanggal ke-3 = C.
    const h = bacaBerkas('surat-jalan.csv', csv(J, isi({ nomor: 'SJ-007', qty_muat: 'xx', tanggal: '01/03/2026' })));
    expect(h.galat).toEqual([
      'surat-jalan.csv baris 2 (SJ-007) kolom C "tanggal": "01/03/2026" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01',
      'surat-jalan.csv baris 2 (SJ-007) kolom L "qty_muat": "xx" bukan angka. Contoh yang benar: 10 atau 10,5 — pakai koma untuk desimal, tanpa titik ribuan dan tanpa "Rp"',
    ]);
  });

  it('kolom wajib yang hilang menjadi satu pesan, bukan delapan', () => {
    const h = bacaBerkas('surat-jalan.csv', csv('nomor;tanggal', 'SJ-1;2026-03-01'));
    expect(h.galat).toHaveLength(1);
    expect(h.galat[0]).toContain('8 kolom wajib tidak ada');
    expect(h.galat[0]).toContain('baris pertama berkas adalah baris judul');
  });

  it('baris yang lolos membawa nomor barisnya untuk pemeriksaan berikutnya', () => {
    const h = bacaBerkas('surat-jalan.csv', csv(J, '', isi({ nomor: 'SJ-005' })));
    expect(h.baris[0].__baris).toBe(3);
  });

  it('namaTakDikenal memakai nomor baris dan huruf kolom yang sama', () => {
    const master = { pelanggan: [], rute: ['R1'], truk: ['B 1 AA'], supir: ['Budi'],
      pengurus: ['Andi'], material: ['SJP|Pasir'], lini: ['SJP'], tipe_rute: [], akun: [] };
    const baris = { lini: 'SJP', nomor: 'SJ-009', pelanggan: 'PT B', rute: 'R1', rute_asal: 'Bogor',
      rute_tujuan: 'Jakarta', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi', pengurus: 'Andi', __baris: 7 };
    expect(namaTakDikenal({ surat_jalan: [baris] }, master)[0])
      .toContain('surat-jalan.csv baris 7 (SJ-009) kolom D "pelanggan": "PT B" belum ada di master');
  });
});
```

Sesuaikan impor di berkas tes: `BERKAS` dan `namaTakDikenal` mungkin belum diimpor. **Jangan menambah baris `import` kedua** untuk simbol yang sudah ada — gabungkan ke baris impor yang sudah ada.

- [ ] **Step 6: Jalankan**

```bash
cd C:/Project/.worktrees/bul/galat-sj/apps/bul/web && npx vitest run
```

Diharapkan: **80 + 2 + 5 = 87 tes / 16 berkas** lulus.

**Tes lama yang gagal karena bunyi pesannya berubah harus diperbarui bunyinya, bukan dilemahkan.** Kalau ada tes yang gagal karena *isi* yang diperiksanya hilang, berhenti dan laporkan.

---

### Task 3: Master non-aktif dibedakan dari master yang belum ada

**Files:**
- Modify: `apps/bul/web/src/halaman/impor/skema.js`
- Modify: `apps/bul/web/src/halaman/impor/ImporPage.jsx`
- Modify: `apps/bul/web/src/halaman/impor/skema.test.js`

`useDaftar` tidak menyaring `aktif` (`web/src/lib/data.js:6`), jadi master non-aktif lolos pemeriksaan web lalu ditolak database dengan `tidak ditemukan atau tidak aktif` — dua keadaan dengan perbaikan yang berbeda, digabung dalam satu kalimat. Datanya sudah ada di klien; perbaikannya cukup memakainya.

- [ ] **Step 1: `namaTakDikenal` menerima daftar non-aktif**

Tambahkan parameter ketiga `takAktif` yang bentuknya sama dengan `master` dan boleh kosong:

```javascript
export function namaTakDikenal(kiriman, master, takAktif = {}) {
```

Di dalam pemeriksaannya, sebelum melaporkan "belum ada":

```javascript
        if (v && !ada[jenis].has(v)) {
          const mati = new Set(takAktif[jenis] ?? []).has(v);
          galat.push(mati
            ? `${tempat(def, no, b, nama)}: "${v}" ada di master tetapi statusnya TIDAK AKTIF, jadi impor akan menolaknya. Aktifkan kembali lewat layar masternya`
            : `${tempat(def, no, b, nama)}: "${v}" belum ada di master. ...`);
        }
```

- [ ] **Step 2: `ImporPage` mengirimkan daftar non-aktif**

`useDaftar` untuk pelanggan, rute, truk, supir, pengurus, dan material sudah mengambil kolom namanya. Tambahkan `aktif` ke `select` masing-masing, lalu bangun dua peta: `master` dari baris yang `aktif`, dan `takAktif` dari yang tidak. Teruskan keduanya ke `namaTakDikenal`.

- [ ] **Step 3: Tes**

```javascript
  it('membedakan master non-aktif dari master yang belum ada', () => {
    // Keduanya dulu berakhir sebagai pesan database yang sama: "tidak ditemukan atau tidak
    // aktif". Perbaikannya berbeda jauh — yang satu dibuat, yang satu diaktifkan kembali.
    const master = { pelanggan: [], rute: ['R1'], truk: ['B 1 AA'], supir: [],
      pengurus: ['Andi'], material: ['SJP|Pasir'], lini: ['SJP'], tipe_rute: [], akun: [] };
    const baris = { lini: 'SJP', nomor: 'SJ-011', pelanggan: 'PT B', rute: 'R1', rute_asal: 'Bogor',
      rute_tujuan: 'Jakarta', material: 'Pasir', nopol: 'B 1 AA', supir: 'Sukirman', pengurus: 'Andi', __baris: 3 };
    const g = namaTakDikenal({ surat_jalan: [baris] }, master, { supir: ['Sukirman'] });
    expect(g.find((x) => x.includes('"PT B"'))).toContain('belum ada di master');
    expect(g.find((x) => x.includes('"Sukirman"'))).toContain('TIDAK AKTIF');
  });
```

- [ ] **Step 4: Jalankan**

```bash
cd C:/Project/.worktrees/bul/galat-sj/apps/bul/web && npx vitest run
```

Diharapkan: **88 tes / 16 berkas** lulus.

```bash
cd C:/Project/.worktrees/bul/galat-sj/apps/bul/web && npm run build
```

---

### Task 4: Pesan database ikut menyebut berkas dan nomor SJ

**Files:**
- Create: `apps/bul/supabase/migrations/20260926000200_galat_impor_sj.sql`
- Create: `apps/bul/db/tests/galat-impor.test.mjs`

Pemeriksaan web menangkap hampir semua kasus lebih dulu, jadi pesan database adalah jaring terakhir. Ia tetap perlu menyebut berkas dan nomor SJ, karena user melihatnya berdampingan dengan galat berkas lain tanpa tahu asalnya.

- [ ] **Step 1: Tulis migrasinya**

`internal.wajib_ketemu` dan `internal.cari_rute` mendapat dua parameter **opsional** dengan nilai bawaan, sehingga `impor_master` dan `impor_kas` yang memanggilnya tidak perlu diubah sama sekali dan perilakunya tidak bergeser.

```sql
-- Pesan galat impor menyebut berkas dan pengenal barisnya. Parameter barunya OPSIONAL:
-- impor_master dan impor_kas memanggil tanpa keduanya dan mendapat bunyi yang persis sama
-- seperti sebelumnya, jadi migrasi ini tidak menyentuh perilaku keduanya.

create or replace function internal.wajib_ketemu(
  p_id uuid, p_jenis text, p_nilai text, p_no int,
  p_berkas text default null, p_penanda text default null)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_id is null then
    raise exception '%Baris %%: % "%" tidak ditemukan atau tidak aktif',
      coalesce(p_berkas || ' ', ''), p_no,
      coalesce(' (' || p_penanda || ')', ''), p_jenis, p_nilai
      using errcode = 'P0001';
  end if;
  return p_id;
end $$;
```

**Perhatikan format stringnya.** Bunyi yang dituju persis:

```
surat-jalan.csv baris 4 (SJ-002): supir "Sukirman" tidak ditemukan atau tidak aktif
```

dan ketika kedua parameter baru kosong:

```
Baris 4: supir "Sukirman" tidak ditemukan atau tidak aktif
```

Susun `format`/`raise` dengan cara apa pun yang menghasilkan kedua bunyi itu; **buktikan keduanya lewat tes, jangan dikira-kira.** Perlakukan `internal.cari_rute` dengan pola yang sama, termasuk pesan "ada lebih dari satu".

`impor_surat_jalan` lalu meneruskan berkas dan penandanya, dan memakai `__baris` kalau ada:

```sql
  v_no := coalesce((v_b ->> '__baris')::int, v_no);
```

Akhiri migrasi dengan `select internal.terapkan_hak_akses();`.

- [ ] **Step 2: Tes**

```javascript
import { describe, it, expect } from 'vitest';
import { sebagai, sql, unik } from './helpers.mjs';

describe('pesan galat impor', () => {
  it('impor_surat_jalan menyebut berkas, baris sumber, dan nomor SJ', async () => {
    await expect(sebagai('owner', 'select public.impor_surat_jalan($1::jsonb)', [JSON.stringify([
      { lini: 'SJP', nomor: 'SJ-002', tanggal: '2026-03-01', pelanggan: 'PT HANTU',
        rute: 'R1', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi',
        qty_muat: '10', uang_jalan: '400000', __baris: 4 },
    ])])).rejects.toThrow(/surat-jalan\.csv baris 4 \(SJ-002\): pelanggan "PT HANTU"/);
  });

  it('pemanggil tanpa parameter baru mendapat bunyi yang persis sama seperti sebelumnya', async () => {
    // impor_master dan impor_kas tidak diubah migrasi ini. Kalau bunyinya bergeser,
    // parameter bawaannya salah dan dua RPC lain ikut berubah tanpa disengaja.
    const [r] = await sql(`select internal.wajib_ketemu(null, 'supir', 'X', 3) as x`)
      .then(() => [{ x: null }], (e) => [{ x: e.message }]);
    expect(r.x).toBe('Baris 3: supir "X" tidak ditemukan atau tidak aktif');
  });
});
```

- [ ] **Step 3: Jalankan**

```bash
cd C:/Project/.worktrees/bul/galat-sj/apps/bul && npm run db:reset && npm run test:db
```

Diharapkan: **189 tes / 15 berkas** lulus.

---

### Task 5: Verifikasi manual

- [ ] Jalankan aplikasi, buka layar Impor, muat `surat-jalan.csv` yang sengaja dirusak: satu baris kosong di tengah, satu `tanggal` berformat `01/03/2026`, satu `qty_muat` berisi `Rp 400.000`, dan satu nama supir yang tidak ada.
- [ ] Pastikan tiap pesan menyebut nomor baris yang **sama dengan yang terlihat di Excel**, nomor SJ-nya, dan huruf kolomnya.
- [ ] Buka berkasnya di Excel, ikuti satu pesan, dan pastikan kursor mendarat tepat di sel yang salah.

---

## Cakupan

T1 nomor baris (Task 1–2), T2 nomor SJ (Task 2), T3 huruf kolom (Task 2), T4 contoh format (Task 2), T5 non-aktif (Task 3), T6 kolom hilang (Task 2), pesan database (Task 4), pembuktian di berkas sungguhan (Task 5).
