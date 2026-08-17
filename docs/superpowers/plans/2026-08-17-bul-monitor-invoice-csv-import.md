# Invoice CSV Import (bul-monitor) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghilangkan proses centang-manual ratusan Surat Jalan saat membuat invoice, dengan cara mengisi otomatis dua nilai form (`selectedSJIds` dan `hargaPerGroup`) dari sebuah file CSV berisi `Nomor SJ` + `Harga Jual per Satuan`.

**Architecture:** Import CSV **tidak menambah satu pun jalur tulis baru ke Firestore.** Fitur ini hanya mengisi state form yang sudah ada di `Modal.jsx`; seluruh preview harga per grup, perhitungan Nilai Invoice, tombol Simpan, `addInvoice()`, dan `persistInvoiceWithFallback()` yang sudah berjalan hari ini tetap dipakai apa adanya tanpa diubah. Inti logika ditaruh di satu fungsi murni (`parseInvoiceCsv`) tanpa React dan tanpa Firebase, sehingga bisa diuji penuh dengan unit test.

**Tech Stack:** React 18, Vite 7, Vitest 4 (baru untuk app ini), JavaScript murni (tanpa dependency runtime baru).

## Global Constraints

- Semua perintah dijalankan dari `C:\Project\VPS\.claude\worktrees\interesting-noyce-5a85e6\apps\bul-monitor`.
- **Dilarang mengubah** `addInvoice`, `editInvoice`, `persistInvoiceWithFallback`, `pickSJInvoicePatch` di `src/App.jsx`, dan **dilarang mengubah** `firestore.rules`. Fitur ini nol perubahan pada jalur tulis Firestore.
- **Dilarang mengubah** rumus uang yang sudah ada. Nilai invoice tetap dihitung oleh kode lama: `qtyBongkar × hargaSatuan` per Surat Jalan.
- **Dilarang menambah dependency runtime.** Vitest masuk sebagai `devDependencies` saja.
- Scope hanya `type === 'addInvoice'`. Mode `editInvoice` **tidak** disentuh.
- Bahasa seluruh teks UI dan pesan error: **Bahasa Indonesia**.
- Domain memakai nama Indonesia apa adanya: `nomorSJ`, `rute`, `material`, `qtyBongkar`, `hargaSatuan`, `hargaPerGroup`, `suratJalan`.
- Production deployment **dilarang**. Plan ini berhenti di build lokal + smoke test lokal.
- Commit memakai conventional commit berbahasa Inggris (`feat:`, `test:`, `chore:`).
- Jangan me-refactor kode di luar scope. Duplikasi filter SJ yang sudah ada di `Modal.jsx:609-619` dan `Modal.jsx:642-650` **dibiarkan apa adanya**.

## Amandemen 2026-08-17 (setelah review Task 3)

Review Task 3 menemukan cacat pada plan versi pertama. Disetujui user untuk diperbaiki sebelum Task 4:

1. **Harga `50.000` diterima sebagai Rp 50 (salah 1000×).** Pola awal `/^\d+(\.\d+)?$/` menganggap titik selalu desimal, padahal Excel berlokal Indonesia mengekspor lima puluh ribu sebagai `50.000`. Baris itu lolos validasi dan `parseFloat` menghasilkan `50`. Pengecekan konsistensi harga di Task 4 tidak menangkapnya karena file yang seluruh barisnya `50.000` tetap konsisten. **Perbaikan:** desimal dibatasi maksimal 2 angka → `/^\d+(\.\d{1,2})?$/`. `50.000` ditolak, `50123.45` tetap diterima.
2. **Kolom berlebih dibuang diam-diam.** Dengan pemisah koma, `07214,50,000` terpecah jadi 3 kolom dan kolom ketiga dibuang, harga terbaca `50`. **Perbaikan:** jumlah kolom wajib tepat 2 (`kolom.length !== 2`).
3. **Nomor baris meleset bila ada baris kosong.** Nomor baris dihitung dari array yang sudah dibuang baris kosongnya, sehingga daftar penolakan menunjuk baris yang salah. **Perbaikan:** nomor baris asli di file disimpan saat pemisahan baris.
4. **Karakter BOM mentah di file test.** Diganti dengan escape enam karakter (garis miring terbalik, `u`, `FEFF`) agar tidak lenyap tersapu formatter/linter.

Jumlah test bertambah dari 21 menjadi 24 (Task 3: 14 → 17). Angka harapan di tiap langkah di bawah sudah menyesuaikan.

## Kontrak Format CSV

```
Nomor SJ;Harga Jual per Satuan
07214;50000
07215;50000
08120;60000
```

- Pemisah kolom: `;` (titik koma). Koma `,` juga diterima otomatis.
- Hanya 2 kolom. Rute, Material, Qty, dan Satuan **selalu** diambil dari data Surat Jalan yang sudah ada di aplikasi — tidak ada kolom untuk itu di CSV, sehingga mustahil salah ketik rute.
- Harga ditulis sebagai angka polos, titik `.` sebagai pemisah desimal, **tanpa pemisah ribuan** dan tanpa `Rp`. Contoh benar: `50000` atau `50123.45`. Contoh salah: `Rp 50.000`, `50,000`.
- Desimal diizinkan karena dipakai untuk "adjusted rate" (nilai bersih kwitansi ÷ total qty rute).

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/bul-monitor/vitest.config.js` (baru) | Konfigurasi test runner |
| `apps/bul-monitor/package.json` (ubah) | Script `test` + devDependency `vitest` |
| `apps/bul-monitor/src/utils/invoiceCsvParser.js` (baru) | **Fungsi murni**: baca teks CSV + daftar SJ eligible → hasil terparsir, tervalidasi, terkelompok. Tanpa React, tanpa Firebase, tanpa DOM. |
| `apps/bul-monitor/src/utils/invoiceCsvParser.test.js` (baru) | Unit test untuk seluruh aturan validasi & perhitungan di atas |
| `apps/bul-monitor/src/components/modals/InvoiceImportPanel.jsx` (baru) | **UI murni**: tombol Download Template, tombol Import CSV, banner hasil. Memanggil parser, melaporkan hasil lewat callback. Tidak menyentuh Firestore. |
| `apps/bul-monitor/src/components/Modal.jsx` (ubah) | Memasang panel di cabang `addInvoice` dan menyalurkan hasil import ke `formData` |

---

## Fase 1 — Fondasi Uji

**Model: Sonnet · Effort: rendah**
Alasan: murni mekanis, menyalin konvensi yang sudah dipakai `apps/bul-accounting` dan `apps/sj-monitor`. Tidak ada keputusan desain.

### Task 1: Pasang Vitest di bul-monitor

**Files:**
- Create: `apps/bul-monitor/vitest.config.js`
- Modify: `apps/bul-monitor/package.json`
- Test: `apps/bul-monitor/src/utils/smoke.test.js` (sementara, dihapus di langkah terakhir task ini)

**Interfaces:**
- Consumes: (tidak ada — task pertama)
- Produces: perintah `npm test` yang berjalan di `apps/bul-monitor` dan menemukan file `*.test.js` di dalam `src/`.

**Konteks:** App `bul-monitor` saat ini belum punya test runner apa pun. App tetangga `apps/bul-accounting` memakai `vitest ^4.1.9` dan `apps/sj-monitor` memakai `vitest ^4.1.5`. Kita ikuti pola yang sama, tapi dengan `environment: 'node'` (bukan `'jsdom'`) karena seluruh test di plan ini menguji fungsi murni tanpa DOM — ini menghindari penambahan dependency `jsdom` yang tidak terpakai.

- [ ] **Step 1: Buat file konfigurasi Vitest**

Buat `apps/bul-monitor/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
  },
})
```

- [ ] **Step 2: Tambahkan script dan devDependency di package.json**

Di `apps/bul-monitor/package.json`, pada objek `"scripts"`, tambahkan dua baris setelah `"preview": "vite preview"` (jangan lupa koma setelah baris `preview`):

```json
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
```

(`--passWithNoTests` mengikuti `apps/sj-monitor`; tanpa itu `npm test` gagal saat belum ada file test, yang akan terjadi sesaat di akhir task ini setelah smoke test dihapus.)

Pada objek `"devDependencies"`, tambahkan satu baris:

```json
    "vitest": "^4.1.9"
```

- [ ] **Step 3: Pasang dependency**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm install
```
Expected: selesai tanpa error, `vitest` muncul di `node_modules`.

- [ ] **Step 4: Tulis smoke test sementara untuk membuktikan runner hidup**

Buat `apps/bul-monitor/src/utils/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('menjalankan test', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: `Test Files  1 passed (1)` dan `Tests  1 passed (1)`.

- [ ] **Step 6: Pastikan build produksi tidak rusak**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm run build
```
Expected: `✓ built in ...` tanpa error.

- [ ] **Step 7: Hapus smoke test sementara**

Hapus file `apps/bul-monitor/src/utils/smoke.test.js`. Fungsinya hanya membuktikan runner hidup; test sesungguhnya ditulis di Fase 2.

- [ ] **Step 8: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/package.json apps/bul-monitor/package-lock.json apps/bul-monitor/vitest.config.js && git commit -m "chore(bul-monitor): add vitest test harness"
```

---

## Fase 2 — Parser CSV (inti logika)

**Model: Opus · Effort: tinggi**
Alasan: ini satu-satunya bagian yang memutuskan Surat Jalan mana yang masuk invoice dan berapa harganya. Salah di sini = salah nilai tagihan. Banyak edge case (BOM Excel, harga tidak konsisten, SJ duplikat/ambigu, presisi desimal). Ditulis penuh dengan TDD.

### Task 2: Kerangka parser + validasi header

**Files:**
- Create: `apps/bul-monitor/src/utils/invoiceCsvParser.js`
- Test: `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`

**Interfaces:**
- Consumes: harness Vitest dari Task 1.
- Produces: `export function parseInvoiceCsv(csvText, eligibleSJList)` yang mengembalikan objek dengan bentuk:
  ```
  {
    ok: boolean,
    error: string|null,          // terisi hanya saat ok === false
    matched: Array<{ nomorSJ: string, sj: object, harga: number }>,
    rejected: Array<{ baris: number, nomorSJ: string, alasan: string }>,
    groups: Array<{ groupKey: string, material: string, rute: string, satuan: string,
                    hargaSatuan: number, totalQty: number, nilai: number, jumlahSJ: number }>,
    selectedSJIds: string[],
    hargaPerGroup: Record<string, string>,   // nilai berupa STRING (dipakai langsung oleh input React)
    hargaSatuan: string|null,                // string harga bila hanya 1 grup, null bila >1 grup
    totalNilai: number
  }
  ```
  `groupKey` berformat `` `${material}|${rute}` `` — **persis** sama dengan kunci yang dipakai `Modal.jsx:734` dan `App.jsx:845`.

**Konteks penting:** `eligibleSJList` adalah array objek Surat Jalan yang SUDAH difilter oleh pemanggil (hanya SJ yang boleh masuk invoice baru). Parser tidak melakukan filter kelayakan sendiri. Tiap objek SJ punya field: `id`, `nomorSJ`, `rute`, `material`, `satuan`, `qtyBongkar`.

- [ ] **Step 1: Tulis test yang gagal untuk validasi header**

Buat `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseInvoiceCsv } from './invoiceCsvParser.js';

const RUTE_TA = 'Tanah Abang (Pasir KT-PT. PionirBeton Industri)';
const RUTE_KAMAL = 'Kamal (Pasir KT-PT. Pionirbeton Industri)';

const SJ_LIST = [
  { id: 'SJ-1', nomorSJ: '07214', rute: RUTE_TA, material: 'Pasir', satuan: 'm3', qtyBongkar: 25 },
  { id: 'SJ-2', nomorSJ: '07215', rute: RUTE_TA, material: 'Pasir', satuan: 'm3', qtyBongkar: 30 },
  { id: 'SJ-3', nomorSJ: '08120', rute: RUTE_KAMAL, material: 'Pasir', satuan: 'm3', qtyBongkar: 20 },
];

const HEADER = 'Nomor SJ;Harga Jual per Satuan';

describe('parseInvoiceCsv — validasi berkas', () => {
  it('menolak file kosong', () => {
    const hasil = parseInvoiceCsv('', SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('kosong');
  });

  it('menolak file yang hanya berisi header tanpa baris data', () => {
    const hasil = parseInvoiceCsv(HEADER, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('kosong');
  });

  it('menolak header yang tidak sesuai', () => {
    const hasil = parseInvoiceCsv('Nomor SJ;Rute;Qty\n07214;A;1', SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('Header');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: GAGAL dengan error resolusi modul — `Failed to resolve import "./invoiceCsvParser.js"`.

- [ ] **Step 3: Tulis implementasi minimal untuk header**

Buat `apps/bul-monitor/src/utils/invoiceCsvParser.js`:

```js
/**
 * Parser CSV untuk import Invoice (bul-monitor).
 *
 * Fungsi MURNI: tidak menyentuh React, Firebase, maupun DOM.
 * Tugasnya hanya mengubah teks CSV + daftar Surat Jalan yang layak di-invoice
 * menjadi nilai-nilai yang siap dimasukkan ke state form invoice yang SUDAH ADA.
 * Tidak ada rumus uang baru di sini: nilai dihitung persis seperti addInvoice()
 * di App.jsx, yaitu qtyBongkar * hargaSatuan per Surat Jalan.
 */

// Maksimal 2 angka desimal. Batas inilah yang menolak "50.000" — format ribuan
// Excel berlokal Indonesia — yang kalau diterima akan terbaca sebagai Rp 50,
// yaitu salah tagih 1000x tanpa peringatan apa pun.
const HARGA_PATTERN = /^\d+(\.\d{1,2})?$/;

const hasil = (patch = {}) => ({
  ok: true,
  error: null,
  matched: [],
  rejected: [],
  groups: [],
  selectedSJIds: [],
  hargaPerGroup: {},
  hargaSatuan: null,
  totalNilai: 0,
  ...patch,
});

export function parseInvoiceCsv(csvText, eligibleSJList = []) {
  // Excel menyimpan CSV UTF-8 dengan BOM di awal berkas; harus dibuang
  // agar pengecekan header tidak gagal karena karakter tak terlihat.
  const teks = String(csvText || '').replace(/^\uFEFF/, '');

  // Nomor baris ASLI di berkas ikut disimpan. Kalau baris kosong hanya dibuang,
  // daftar penolakan akan menunjuk baris yang salah dan operator mengoreksi
  // baris yang sebenarnya sudah benar.
  const baris = [];
  teks.split('\n').forEach((isi, idx) => {
    const bersih = isi.trim();
    if (bersih.length > 0) baris.push({ isi: bersih, nomorAsli: idx + 1 });
  });

  if (baris.length < 2) {
    return hasil({ ok: false, error: 'File CSV kosong atau tidak berisi baris data.' });
  }

  const pemisah = baris[0].isi.includes(';') ? ';' : ',';
  const header = baris[0].isi.split(pemisah).map((h) => h.trim().toLowerCase());

  const headerValid =
    header.length === 2 &&
    header[0].includes('nomor') &&
    header[0].includes('sj') &&
    header[1].includes('harga');

  if (!headerValid) {
    return hasil({
      ok: false,
      error:
        'Header CSV tidak sesuai.\n\nFormat yang benar:\nNomor SJ;Harga Jual per Satuan\n\n' +
        `Header yang ditemukan:\n${baris[0].isi}\n\nSilakan pakai tombol "Download Template CSV".`,
    });
  }

  return hasil();
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/src/utils/invoiceCsvParser.js apps/bul-monitor/src/utils/invoiceCsvParser.test.js && git commit -m "feat(bul-monitor): add invoice CSV parser skeleton with header validation"
```

### Task 3: Pencocokan baris ke Surat Jalan + penolakan per baris

**Files:**
- Modify: `apps/bul-monitor/src/utils/invoiceCsvParser.js`
- Test: `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`

**Interfaces:**
- Consumes: `parseInvoiceCsv(csvText, eligibleSJList)` dari Task 2, konstanta test `SJ_LIST`, `HEADER`, `RUTE_TA`, `RUTE_KAMAL`.
- Produces: field `matched` dan `rejected` terisi benar. `rejected` berisi `{ baris, nomorSJ, alasan }` di mana `baris` adalah nomor baris di file (header = baris 1, jadi baris data pertama = 2).

- [ ] **Step 1: Tulis test yang gagal untuk pencocokan dan penolakan**

Tambahkan blok berikut di akhir `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`:

```js
describe('parseInvoiceCsv — pencocokan baris', () => {
  it('mencocokkan nomor SJ ke objek Surat Jalan yang benar', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.matched[0].sj.id).toBe('SJ-1');
    expect(hasil.matched[0].harga).toBe(50000);
    expect(hasil.rejected).toHaveLength(0);
  });

  it('mengabaikan spasi berlebih dan beda huruf besar/kecil pada nomor SJ', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n  07214  ;  50000  `, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.matched[0].sj.id).toBe('SJ-1');
  });

  it('membuang BOM UTF-8 dari Excel di awal berkas', () => {
    const hasil = parseInvoiceCsv(`\uFEFF${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
  });

  it('menerima pemisah koma', () => {
    const hasil = parseInvoiceCsv('Nomor SJ,Harga Jual per Satuan\n07214,50000', SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.matched).toHaveLength(1);
  });

  it('menolak baris yang nomor SJ-nya tidak ada di daftar yang bisa di-invoice', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n99999;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].baris).toBe(3);
    expect(hasil.rejected[0].nomorSJ).toBe('99999');
    expect(hasil.rejected[0].alasan).toContain('tidak ditemukan');
  });

  it('menolak baris duplikat di dalam file yang sama', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07214;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('duplikat');
  });

  it('menolak nomor SJ yang ambigu (lebih dari satu SJ bernomor sama)', () => {
    const kembar = [
      ...SJ_LIST,
      { id: 'SJ-4', nomorSJ: '07214', rute: RUTE_KAMAL, material: 'Pasir', satuan: 'm3', qtyBongkar: 5 },
    ];
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, kembar);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected[0].alasan).toContain('ambigu');
  });

  it('menolak harga yang bukan angka polos', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;Rp 50.000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected[0].alasan).toContain('angka');
  });

  it('menolak harga nol atau negatif', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;0\n07215;-5`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(2);
    expect(hasil.rejected[0].alasan).toContain('lebih besar dari 0');
  });

  it('menolak baris yang kolomnya kurang', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214`, SJ_LIST);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('2 kolom');
  });

  it('menolak harga bergaya ribuan Indonesia yang akan terbaca 1000x lebih kecil', () => {
    // Excel berlokal Indonesia mengekspor lima puluh ribu sebagai "50.000".
    // parseFloat("50.000") = 50, jadi ini WAJIB ditolak, bukan diterima diam-diam.
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50.000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('angka');
  });

  it('menolak baris yang kolomnya lebih dari 2', () => {
    // Dengan pemisah koma, "07214,50,000" terpecah jadi 3 kolom; kalau kolom
    // ketiga dibuang diam-diam maka harga terbaca 50, bukan 50000.
    const hasil = parseInvoiceCsv('Nomor SJ,Harga Jual per Satuan\n07214,50,000', SJ_LIST);
    expect(hasil.matched).toHaveLength(0);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].alasan).toContain('2 kolom');
  });

  it('menomori baris sesuai posisi asli di berkas meski ada baris kosong', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n\n07214;50000\n\n99999;50000`, SJ_LIST);
    expect(hasil.matched).toHaveLength(1);
    expect(hasil.rejected).toHaveLength(1);
    expect(hasil.rejected[0].baris).toBe(5);
  });

  it('gagal keseluruhan bila tidak ada satu pun baris yang cocok', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n99999;50000`, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('Tidak ada baris');
    expect(hasil.rejected).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: 3 test lama LULUS, 14 test baru GAGAL (`matched` masih array kosong).

- [ ] **Step 3: Tulis implementasi pencocokan baris**

Di `apps/bul-monitor/src/utils/invoiceCsvParser.js`, ganti baris terakhir fungsi (`  return hasil();`) dengan blok berikut:

```js
  const matched = [];
  const rejected = [];
  const sudahDipakai = new Map(); // nomorSJ (lowercase) -> nomor baris pertama yang memakainya

  for (let i = 1; i < baris.length; i++) {
    const nomorBaris = baris[i].nomorAsli;
    const kolom = baris[i].isi.split(pemisah).map((v) => v.trim());
    const nomorSJ = kolom[0] || '';
    const hargaMentah = kolom[1] || '';

    // Wajib TEPAT 2 kolom. Kalau kolom berlebih dibiarkan, "07214,50,000"
    // akan terbaca sebagai harga 50 dan kolom ketiga hilang tanpa jejak.
    if (kolom.length !== 2 || !nomorSJ || !hargaMentah) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: 'Baris harus tepat 2 kolom: Nomor SJ dan Harga Jual per Satuan.',
      });
      continue;
    }

    if (!HARGA_PATTERN.test(hargaMentah)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          `Harga "${hargaMentah}" bukan angka polos. Tulis tanpa "Rp" dan tanpa pemisah ribuan, ` +
          'maksimal 2 angka desimal dengan titik. Contoh: 50000 atau 50123.45. ' +
          'Kalau maksud Anda lima puluh ribu, tulis 50000 — bukan 50.000.',
      });
      continue;
    }

    const harga = parseFloat(hargaMentah);
    if (!(harga > 0)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: 'Harga harus lebih besar dari 0.',
      });
      continue;
    }

    const kunci = nomorSJ.toLowerCase();
    if (sudahDipakai.has(kunci)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: `Nomor SJ duplikat di dalam file — sudah dipakai di baris ${sudahDipakai.get(kunci)}.`,
      });
      continue;
    }

    const kandidat = eligibleSJList.filter(
      (sj) => String(sj.nomorSJ || '').trim().toLowerCase() === kunci
    );

    if (kandidat.length === 0) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          'Nomor SJ tidak ditemukan di daftar Surat Jalan yang bisa di-invoice. ' +
          'Kemungkinan sudah terinvoice, belum berstatus terkirim, atau salah ketik.',
      });
      continue;
    }

    if (kandidat.length > 1) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: `Nomor SJ ambigu — ada ${kandidat.length} Surat Jalan dengan nomor yang sama. Selesaikan lewat pemilihan manual.`,
      });
      continue;
    }

    sudahDipakai.set(kunci, nomorBaris);
    matched.push({ nomorSJ, sj: kandidat[0], harga });
  }

  if (matched.length === 0) {
    return hasil({
      ok: false,
      error: 'Tidak ada baris yang bisa dipakai. Periksa daftar penolakan di bawah.',
      rejected,
    });
  }

  return hasil({ matched, rejected });
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: `Tests  17 passed (17)`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/src/utils/invoiceCsvParser.js apps/bul-monitor/src/utils/invoiceCsvParser.test.js && git commit -m "feat(bul-monitor): match invoice CSV rows to surat jalan with per-row rejection"
```

### Task 4: Pengelompokan per rute, konsistensi harga, dan perhitungan nilai

**Files:**
- Modify: `apps/bul-monitor/src/utils/invoiceCsvParser.js`
- Test: `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`

**Interfaces:**
- Consumes: field `matched` dari Task 3.
- Produces: field `groups`, `selectedSJIds`, `hargaPerGroup`, `hargaSatuan`, `totalNilai` terisi benar. Ini nilai-nilai yang akan disalin langsung ke `formData` di Fase 4.

**Aturan kunci:** bila dalam satu file ada dua baris dengan grup (`material|rute`) yang sama tapi harga berbeda, **seluruh file ditolak**. Sistem tidak boleh diam-diam merata-ratakan atau memilih salah satu — itu akan mengubah nilai tagihan tanpa disadari.

- [ ] **Step 1: Tulis test yang gagal untuk pengelompokan dan perhitungan**

Tambahkan blok berikut di akhir `apps/bul-monitor/src/utils/invoiceCsvParser.test.js`:

```js
describe('parseInvoiceCsv — pengelompokan dan nilai', () => {
  it('menghasilkan satu grup: hargaSatuan terisi, totalNilai benar', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(1);
    expect(hasil.selectedSJIds).toEqual(['SJ-1', 'SJ-2']);
    expect(hasil.hargaSatuan).toBe('50000');
    expect(hasil.hargaPerGroup).toEqual({ [`Pasir|${RUTE_TA}`]: '50000' });
    // 25 * 50000 + 30 * 50000
    expect(hasil.totalNilai).toBeCloseTo(2750000, 2);
    expect(hasil.groups[0].totalQty).toBeCloseTo(55, 2);
    expect(hasil.groups[0].jumlahSJ).toBe(2);
    expect(hasil.groups[0].satuan).toBe('m3');
  });

  it('menghasilkan banyak grup: hargaSatuan null, hargaPerGroup berisi tiap grup', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n08120;60000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(2);
    expect(hasil.hargaSatuan).toBeNull();
    expect(hasil.hargaPerGroup).toEqual({
      [`Pasir|${RUTE_TA}`]: '50000',
      [`Pasir|${RUTE_KAMAL}`]: '60000',
    });
    // 25 * 50000 + 20 * 60000
    expect(hasil.totalNilai).toBeCloseTo(2450000, 2);
  });

  it('memakai kunci grup dengan format material|rute', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000`, SJ_LIST);
    expect(hasil.groups[0].groupKey).toBe(`Pasir|${RUTE_TA}`);
    expect(hasil.groups[0].material).toBe('Pasir');
    expect(hasil.groups[0].rute).toBe(RUTE_TA);
  });

  it('mempertahankan presisi harga desimal (kasus adjusted rate dari kwitansi)', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50123.45\n07215;50123.45`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.hargaSatuan).toBe('50123.45');
    // 25 * 50123.45 + 30 * 50123.45 = 1253086.25 + 1503703.5
    expect(hasil.totalNilai).toBeCloseTo(2756789.75, 2);
  });

  it('menolak seluruh file bila harga tidak konsisten dalam satu grup', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;51000`, SJ_LIST);
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain('tidak konsisten');
    expect(hasil.error).toContain(RUTE_TA);
    expect(hasil.error).toContain('07215');
    expect(hasil.selectedSJIds).toHaveLength(0);
  });

  it('mengizinkan harga berbeda selama grupnya juga berbeda', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n07215;50000\n08120;60000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.groups).toHaveLength(2);
  });

  it('tetap mengembalikan daftar penolakan bersama hasil yang sukses', () => {
    const hasil = parseInvoiceCsv(`${HEADER}\n07214;50000\n99999;50000`, SJ_LIST);
    expect(hasil.ok).toBe(true);
    expect(hasil.selectedSJIds).toEqual(['SJ-1']);
    expect(hasil.rejected).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: 17 test lama LULUS, 7 test baru GAGAL (`groups` masih array kosong).

- [ ] **Step 3: Tulis implementasi pengelompokan**

Di `apps/bul-monitor/src/utils/invoiceCsvParser.js`, ganti baris terakhir fungsi (`  return hasil({ matched, rejected });`) dengan blok berikut:

```js
  // Kelompokkan per (material|rute) — kunci ini HARUS sama persis dengan yang
  // dipakai Modal.jsx dan addInvoice() di App.jsx agar harga tersambung benar.
  const peta = new Map();
  for (const item of matched) {
    const groupKey = `${item.sj.material}|${item.sj.rute}`;
    if (!peta.has(groupKey)) peta.set(groupKey, []);
    peta.get(groupKey).push(item);
  }

  // Harga wajib seragam dalam satu grup. Kalau tidak, tolak seluruh berkas —
  // menebak salah satu harga berarti diam-diam mengubah nilai tagihan.
  for (const [groupKey, anggota] of peta) {
    const pertama = anggota[0];
    const beda = anggota.find((a) => a.harga !== pertama.harga);
    if (beda) {
      const [material, rute] = groupKey.split('|');
      return hasil({
        ok: false,
        rejected,
        error:
          `Harga tidak konsisten untuk ${material} — ${rute}.\n\n` +
          `SJ ${pertama.nomorSJ}: Rp ${pertama.harga.toLocaleString('id-ID')}\n` +
          `SJ ${beda.nomorSJ}: Rp ${beda.harga.toLocaleString('id-ID')}\n\n` +
          'Satu rute hanya boleh punya satu harga per invoice. Perbaiki file lalu import ulang.',
      });
    }
  }

  const groups = [];
  let totalNilai = 0;
  const hargaPerGroup = {};

  for (const [groupKey, anggota] of peta) {
    const [material, rute] = groupKey.split('|');
    const hargaSatuanGrup = anggota[0].harga;
    const totalQty = anggota.reduce((s, a) => s + (Number(a.sj.qtyBongkar) || 0), 0);
    // Dihitung per Surat Jalan, persis seperti addInvoice() di App.jsx,
    // supaya angka pratinjau sama dengan angka yang tersimpan.
    const nilai = anggota.reduce(
      (s, a) => s + (Number(a.sj.qtyBongkar) || 0) * hargaSatuanGrup,
      0
    );

    totalNilai += nilai;
    hargaPerGroup[groupKey] = String(hargaSatuanGrup);
    groups.push({
      groupKey,
      material,
      rute,
      satuan: anggota[0].sj.satuan || 'satuan',
      hargaSatuan: hargaSatuanGrup,
      totalQty,
      nilai,
      jumlahSJ: anggota.length,
    });
  }

  return hasil({
    matched,
    rejected,
    groups,
    selectedSJIds: matched.map((m) => m.sj.id),
    hargaPerGroup,
    // Form invoice memakai satu input tunggal bila hanya ada 1 grup,
    // dan input per grup bila lebih dari 1 (lihat Modal.jsx:737 dan :766).
    hargaSatuan: groups.length === 1 ? String(groups[0].hargaSatuan) : null,
    totalNilai,
  });
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test
```
Expected: `Tests  24 passed (24)`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/src/utils/invoiceCsvParser.js apps/bul-monitor/src/utils/invoiceCsvParser.test.js && git commit -m "feat(bul-monitor): group invoice CSV rows by route with price consistency guard"
```

---

## Fase 3 — Komponen UI Import

**Model: Sonnet · Effort: sedang**
Alasan: React presentational murni, mengikuti pola tombol/`FileReader`/banner yang sudah ada di `App.jsx:1094-1152`. Tidak ada logika uang — semuanya sudah diputuskan di Fase 2.

### Task 5: Panel Import CSV

**Files:**
- Create: `apps/bul-monitor/src/components/modals/InvoiceImportPanel.jsx`

**Interfaces:**
- Consumes: `parseInvoiceCsv(csvText, eligibleSJList)` dari `../../utils/invoiceCsvParser.js`.
- Produces: komponen default-export `InvoiceImportPanel` dengan props:
  - `eligibleSJList: Array<object>` — daftar SJ yang boleh masuk invoice baru
  - `onImported: (result) => void` — dipanggil hanya saat `result.ok === true`, membawa objek hasil parser lengkap
  - `setAlertMessage: (pesan: string) => void` — dipakai untuk kegagalan yang membatalkan seluruh berkas

**Konteks pola yang diikuti:** `App.jsx:1126-1136` memakai `Blob` + `URL.createObjectURL` + anchor tersembunyi untuk mengunduh template, dan `App.jsx:1140-1144` memakai `FileReader.readAsText`. Ikuti keduanya. Folder `src/components/modals/` sudah berisi komponen sejenis (`TruckFormFields.jsx`, `RuteFormFields.jsx`, dst).

- [ ] **Step 1: Buat komponen**

Buat `apps/bul-monitor/src/components/modals/InvoiceImportPanel.jsx`:

```jsx
import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { parseInvoiceCsv } from '../../utils/invoiceCsvParser.js';

const TEMPLATE_CSV =
  'Nomor SJ;Harga Jual per Satuan\n' +
  '07214;50000\n' +
  '07215;50000\n' +
  '08120;60000\n';

/**
 * Panel import CSV untuk form "Buat Invoice Baru".
 *
 * Komponen ini TIDAK menulis apa pun ke Firestore. Tugasnya hanya membaca
 * berkas CSV, menyerahkannya ke parser, lalu melaporkan hasilnya ke induk
 * lewat onImported(). Yang menyimpan invoice tetap tombol Simpan yang lama.
 */
const InvoiceImportPanel = ({ eligibleSJList = [], onImported, setAlertMessage }) => {
  const fileInputRef = useRef(null);
  const [ringkasan, setRingkasan] = useState(null);

  const unduhTemplate = () => {
    // BOM UTF-8 agar Excel mengenali encoding — pola sama dengan downloadTemplate() di App.jsx
    const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_import_invoice.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const bacaFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const hasil = parseInvoiceCsv(e.target.result, eligibleSJList);

      if (!hasil.ok) {
        setRingkasan({ gagal: true, rejected: hasil.rejected });
        setAlertMessage('⛔ Import dibatalkan.\n\n' + hasil.error);
        return;
      }

      setRingkasan({
        gagal: false,
        jumlahSJ: hasil.selectedSJIds.length,
        groups: hasil.groups,
        rejected: hasil.rejected,
        totalNilai: hasil.totalNilai,
      });
      onImported(hasil);
    };
    reader.onerror = () => setAlertMessage('⛔ Gagal membaca file CSV.');
    reader.readAsText(file);
  };

  return (
    <div className="mb-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-purple-800 mr-auto">
          Import daftar SJ dari CSV
          <span className="ml-2 text-xs font-normal text-purple-600">
            (opsional — bisa juga pilih manual di bawah)
          </span>
        </p>
        <button
          type="button"
          onClick={unduhTemplate}
          className="bg-white hover:bg-gray-100 text-purple-700 border border-purple-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) bacaFile(file);
            // Kosongkan agar file yang sama bisa dipilih ulang setelah diperbaiki
            e.target.value = '';
          }}
        />
      </div>

      {ringkasan && !ringkasan.gagal && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-purple-200">
          <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {ringkasan.jumlahSJ} Surat Jalan terpilih dari CSV · {ringkasan.groups.length} rute
          </p>
          <div className="mt-2 space-y-1">
            {ringkasan.groups.map((g) => (
              <p key={g.groupKey} className="text-xs text-gray-700">
                {g.material} — {g.rute}: {g.jumlahSJ} SJ · {g.totalQty.toFixed(2)} {g.satuan} ×
                Rp {g.hargaSatuan.toLocaleString('id-ID')} ={' '}
                <strong>Rp {Math.round(g.nilai).toLocaleString('id-ID')}</strong>
              </p>
            ))}
          </div>
          <p className="mt-2 pt-2 border-t border-gray-200 text-sm font-bold text-blue-700 text-right">
            Total dari CSV: Rp {Math.round(ringkasan.totalNilai).toLocaleString('id-ID')}
          </p>
        </div>
      )}

      {ringkasan?.rejected?.length > 0 && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-orange-300">
          <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {ringkasan.rejected.length} baris ditolak
          </p>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {ringkasan.rejected.map((r, i) => (
              <p key={i} className="text-xs text-orange-800">
                Baris {r.baris} ({r.nomorSJ || '-'}): {r.alasan}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceImportPanel;
```

- [ ] **Step 2: Pastikan test lama tetap lulus dan build berhasil**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test && npm run build
```
Expected: `Tests  24 passed (24)` lalu `✓ built in ...` tanpa error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/src/components/modals/InvoiceImportPanel.jsx && git commit -m "feat(bul-monitor): add invoice CSV import panel component"
```

---

## Fase 4 — Integrasi Modal + Verifikasi

**Model: Opus · Effort: sedang**
Alasan: perubahannya kecil tapi menyentuh titik paling halus — pemilihan antara `hargaSatuan` (1 grup) vs `hargaPerGroup` (banyak grup) di `Modal.jsx:737`/`:766` dan `Modal.jsx:135-157`. Salah menyambung di sini membuat harga tidak terbaca saat Simpan. Ditutup dengan verifikasi memakai data kwitansi asli.

### Task 6: Pasang panel ke form Buat Invoice Baru

**Files:**
- Modify: `apps/bul-monitor/src/components/Modal.jsx`

**Interfaces:**
- Consumes: `InvoiceImportPanel` dari `./modals/InvoiceImportPanel.jsx` dengan props `eligibleSJList`, `onImported`, `setAlertMessage`.
- Produces: (tidak ada — task terakhir yang mengubah kode)

**Konteks kritis:**
- `formData.hargaPerGroup` adalah objek `{ 'material|rute': 'string harga' }` dan `formData.hargaSatuan` adalah string. Keduanya dipakai sebagai `value` input React, jadi **tidak boleh diisi `null`** — kalau tidak, React melempar peringatan uncontrolled input. Saat multi-grup, isi `hargaSatuan` dengan `''` bukan `null`.
- Isi **kedua** field (`hargaSatuan` dan `hargaPerGroup`) sekaligus. `handleSubmit` di `Modal.jsx:134-157` yang memutuskan mana yang dipakai berdasarkan jumlah grup, jadi mengisi keduanya aman dan menghindari kasus tepi.
- Filter kelayakan SJ sudah tertulis dua kali di `Modal.jsx:609-619` dan `Modal.jsx:642-650`. **Jangan diubah, jangan di-refactor.** Cukup buat satu variabel baru untuk keperluan panel.

- [ ] **Step 1: Tambahkan import komponen**

Di `apps/bul-monitor/src/components/Modal.jsx`, setelah baris 8 (`import MaterialFormFields from './modals/MaterialFormFields.jsx';`), tambahkan:

```jsx
import InvoiceImportPanel from './modals/InvoiceImportPanel.jsx';
```

- [ ] **Step 2: Hitung daftar SJ yang layak untuk panel**

Di `Modal.jsx`, tepat sebelum baris `const handleSubmit = () => {` (baris 76), sisipkan:

```jsx
  // Daftar SJ yang boleh masuk invoice BARU — dipakai oleh panel import CSV.
  // Kriterianya sengaja disamakan persis dengan filter checklist manual di bawah
  // (lihat blok filter pada bagian "Pilih Surat Jalan"), supaya hasil import
  // tidak pernah berbeda dari apa yang bisa dicentang manual.
  const eligibleSJForImport = React.useMemo(
    () =>
      suratJalanList.filter((sj) => {
        const belumInvoice =
          sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum';
        const layak = (sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false;
        return layak && belumInvoice;
      }),
    [suratJalanList]
  );
```

- [ ] **Step 3: Pasang panel di dalam form invoice**

Di `Modal.jsx`, temukan penutup blok Pelanggan dan pembuka blok Pilih Surat Jalan (sekitar baris 575-578):

```jsx
              </div>

              {/* Pilih Surat Jalan */}
```

Ganti menjadi:

```jsx
              </div>

              {/* Import CSV — hanya untuk invoice baru, bukan mode edit */}
              {type === 'addInvoice' && (
                <InvoiceImportPanel
                  eligibleSJList={eligibleSJForImport}
                  setAlertMessage={setAlertMessage}
                  onImported={(hasil) => {
                    setFormData((prev) => ({
                      ...prev,
                      selectedSJIds: hasil.selectedSJIds,
                      hargaPerGroup: hasil.hargaPerGroup,
                      // String kosong (bukan null) agar input tetap controlled.
                      // handleSubmit memilih hargaSatuan vs hargaPerGroup sendiri
                      // berdasarkan jumlah grup.
                      hargaSatuan: hasil.hargaSatuan ?? '',
                    }));
                  }}
                />
              )}

              {/* Pilih Surat Jalan */}
```

- [ ] **Step 4: Jalankan test dan build**

Run:
```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6/apps/bul-monitor" && npm test && npm run build
```
Expected: `Tests  24 passed (24)` lalu `✓ built in ...` tanpa error.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add apps/bul-monitor/src/components/Modal.jsx && git commit -m "feat(bul-monitor): wire CSV import into new invoice form"
```

### Task 7: Verifikasi manual dengan data kwitansi asli

**Files:**
- Create: `docs/superpowers/plans/2026-08-17-invoice-csv-import-verifikasi.md` (catatan hasil verifikasi)

**Interfaces:**
- Consumes: seluruh fitur dari Task 1-6.
- Produces: (tidak ada — task penutup)

**Konteks:** Jalankan dev server lokal dan uji dengan CSV kecil buatan sendiri. **Jangan menyimpan invoice apa pun ke Firestore produksi selama verifikasi** — cukup sampai melihat angka pratinjau, lalu tekan Batal. Penyimpanan sungguhan menunggu keputusan user.

- [ ] **Step 1: Jalankan dev server**

Gunakan `preview_start` (bukan Bash) dengan konfigurasi `.claude/launch.json` untuk `apps/bul-monitor`. Bila entri belum ada, buat dengan `runtimeExecutable: "npm"`, `runtimeArgs: ["run","dev"]`, dan port sesuai keluaran Vite.

- [ ] **Step 2: Uji jalur sukses satu rute**

Buat file CSV di scratchpad berisi header plus 2 nomor SJ yang benar-benar ada di daftar "Belum Terinvoice", dengan harga sama. Buka Invoicing → Buat Invoice Baru → Import CSV.
Expected: banner ungu menampilkan "2 Surat Jalan terpilih dari CSV · 1 rute", 2 kartu SJ di bawah ikut tercentang otomatis, dan kotak biru "Harga Jual per Satuan" sudah terisi dengan Nilai Invoice yang sama dengan "Total dari CSV".

- [ ] **Step 3: Uji jalur banyak rute**

Ulangi dengan CSV berisi SJ dari 2 rute berbeda dan harga berbeda.
Expected: kotak biru berubah menjadi input per grup, tiap grup sudah terisi harganya, dan "Total Nilai Invoice" di bawah sama dengan "Total dari CSV".

- [ ] **Step 4: Uji jalur penolakan**

Ulangi dengan CSV yang memuat satu nomor SJ palsu (`99999`) dan satu baris harga tidak konsisten untuk rute yang sama.
Expected: file dengan SJ palsu tetap diproses dengan banner oranye "1 baris ditolak"; file dengan harga tidak konsisten ditolak seluruhnya lewat alert yang menyebut nama rute dan kedua nomor SJ.

- [ ] **Step 5: Tutup tanpa menyimpan**

Tekan Batal. Pastikan jumlah pada kartu "Total Invoice" dan "Belum Terinvoice" di halaman Invoicing tidak berubah.

- [ ] **Step 6: Catat hasil verifikasi dan commit**

Tulis `docs/superpowers/plans/2026-08-17-invoice-csv-import-verifikasi.md` berisi: tanggal, langkah yang dijalankan, angka yang terlihat di layar untuk tiap langkah, dan pernyataan bahwa tidak ada invoice yang tersimpan.

```bash
cd "C:/Project/VPS/.claude/worktrees/interesting-noyce-5a85e6" && git add docs/superpowers/plans/2026-08-17-invoice-csv-import-verifikasi.md && git commit -m "docs(bul-monitor): record invoice CSV import verification results"
```

---

## Ringkasan Fase

| Fase | Isi | Model | Effort | Task |
|---|---|---|---|---|
| 1 | Fondasi uji (Vitest) | Sonnet | rendah | 1 |
| 2 | Parser CSV + 24 unit test | Opus | tinggi | 2, 3, 4 |
| 3 | Komponen UI panel import | Sonnet | sedang | 5 |
| 4 | Integrasi Modal + verifikasi | Opus | sedang | 6, 7 |

## Di Luar Scope

- Mode `editInvoice` tetap manual sepenuhnya.
- Tidak ada perbaikan pada 19 invoice lama Jan-Mar yang nilainya gross (temuan terpisah, keputusan user: cukup dicatat).
- Duplikasi filter kelayakan SJ di `Modal.jsx` dan `console.log` sisa debug di `Modal.jsx:674-684` tidak disentuh.
- Tidak ada deployment. Fitur diverifikasi lokal saja.
