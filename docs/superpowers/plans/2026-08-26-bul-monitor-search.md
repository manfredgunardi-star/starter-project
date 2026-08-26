# Fitur Search bul-monitor (Opsi B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan search bar client-side bergaya sj-monitor ke menu Surat Jalan, Invoicing (2 tab), dan Master Data (5 sub-tab) di bul-monitor, sekaligus menghapus duplikasi logika filter di modal "Buat Invoice Baru".

**Architecture:** Satu fungsi murni `filterBySearch()` di `src/utils/searchFilter.js` (bisa diuji di environment node tanpa dependensi baru), dibungkus hook tipis `useSearchFilter()`, dan satu komponen presentasional `SearchInput.jsx`. Seluruh titik search memakai tiga artefak ini. Invoice memerlukan pencocokan bersarang (nomor SJ di dalam invoice), sehingga mendapat matcher terpisah `src/utils/invoiceSearch.js`. Tidak ada query Firestore baru — semua daftar sudah dimuat penuh oleh listener `onSnapshot`.

**Tech Stack:** React 18 (functional components + hooks), Vite 7, Vitest 4 (environment node), Tailwind CSS 3, lucide-react.

---

## Global Constraints

- **Tanpa dependensi baru.** `apps/bul-monitor/package.json` tidak boleh bertambah dependency maupun devDependency. Konsekuensinya: test hanya untuk fungsi murni (environment node), bukan component test. `apps/bul-monitor/vite.config.js` tidak diubah.
- **Client-side murni.** Dilarang menambah query Firestore, `where()`, `orderBy()`, composite index, atau perubahan Firestore rules.
- **Tidak menyentuh financial logic.** Dilarang mengubah `src/utils/invoiceTotals.js`, `src/utils/invoiceEligibility.js`, `src/integrationService.js`, `src/services/firestoreWrites.js`, perhitungan uang jalan, potongan, harga, maupun alur approval/kirim-ke-accounting.
- **Bahasa UI Indonesia.** Placeholder memakai awalan `Cari `, empty state memakai kalimat `Tidak ada <entitas> yang cocok dengan pencarian.`
- **Aksen warna hijau.** bul-monitor memakai `focus:ring-green-500` (lihat `Modal.jsx:621`), bukan `focus:ring-blue-500` milik sj-monitor.
- **Semantik pencarian:** case-insensitive, substring (`includes`), kata kunci di-`trim()`, OR antar-field, kata kunci kosong mengembalikan daftar apa adanya.
- **Perintah validasi dijalankan dari `apps/bul-monitor`:** `npm test` dan `npm run build`. Dependensi belum terpasang di worktree — jalankan `npm install` sekali sebelum task pertama yang butuh validasi.
- **Dilarang deploy.** `firebase deploy` diserahkan ke user. Build lokal bukan izin deployment.
- **Commit style:** English conventional commit (`feat:`, `refactor:`, `test:`).

---

## Keputusan Desain (asumsi yang dipakai plan ini)

Tiga risiko diidentifikasi saat analisa. Keputusan yang diambil:

**1. Search x paginasi (Surat Jalan).** Mengetik saat berada di halaman 5 akan menghasilkan halaman kosong. **Keputusan:** setiap perubahan kata kunci mereset `sjPage` ke 1.

**2. Search x bulk-select — risiko operasional.** `eligibleInView` (`App.jsx:2356`) dan `eligibleBatalInView` (`App.jsx:2390`) berasal dari daftar yang tampil. Skenario bahaya: user mencari "Citeureup", menekan "Pilih Semua" (12 SJ), menghapus kata kunci, lalu menekan "Kirim ke Accounting" — 12 SJ yang tak lagi terlihat ikut terkirim dan terkunci. **Keputusan:** setiap perubahan kata kunci **mengosongkan** `selectedSJIds` dan `selectedBatalSJIds` (Surat Jalan) serta `selectedInvoiceIds` (Invoicing). Ini mengikuti perilaku yang sudah ada pada tombol filter tab (`App.jsx:3264`), jadi konsisten dan konservatif. Alur approval itu sendiri tidak diubah.

**3. Kedalaman search invoice.** **Keputusan:** tab "Belum Terinvoice" memakai search datar atas field SJ; tab "Sudah Terinvoice" memakai search dalam — cocok bila kata kunci ada di `noInvoice` **atau** di salah satu SJ dalam `invoice.suratJalanList`. Ini menjawab "invoice mana yang memuat SJ 02193?".

---

## File Structure

**Dibuat:**

| File | Tanggung jawab |
|---|---|
| `apps/bul-monitor/src/utils/searchFilter.js` | Fungsi murni: `normalizeTerm`, `matchesSearch`, `filterBySearch`. Tidak tahu React. |
| `apps/bul-monitor/src/utils/searchFilter.test.js` | Test fungsi murni, environment node. |
| `apps/bul-monitor/src/hooks/useSearchFilter.js` | Hook `useMemo` tipis di atas `filterBySearch`. Direktori `src/hooks/` baru. |
| `apps/bul-monitor/src/components/SearchInput.jsx` | Komponen presentasional: input + ikon cari + tombol clear. |
| `apps/bul-monitor/src/utils/invoiceSearch.js` | Matcher bersarang khusus invoice. |
| `apps/bul-monitor/src/utils/invoiceSearch.test.js` | Test matcher invoice, environment node. |

**Dimodifikasi:**

| File | Perubahan |
|---|---|
| `apps/bul-monitor/src/components/MasterDataManagement.jsx` | 5 search bar (Truck, Supir, Rute, Material, Pelanggan). |
| `apps/bul-monitor/src/App.jsx` | Search bar Surat Jalan + integrasi paginasi & bulk-select. |
| `apps/bul-monitor/src/components/InvoiceManagement.jsx` | Search bar 2 tab + reset seleksi invoice. |
| `apps/bul-monitor/src/components/Modal.jsx` | Ganti search inline duplikat dengan `SearchInput` + `filterBySearch`. |

---

## Peta Fase

Fase dijalankan **berurutan**. Setiap fase = satu subagent segar per task, dengan review di antara task.

| Fase | Isi | Task | Model | Effort | Alasan |
|---|---|---|---|---|---|
| 1 | Fondasi: util + test + hook + komponen | 1-2 | `sonnet` | medium | Spesifikasi lengkap, kode kecil, murni, tanpa integrasi. |
| 2 | Master Data (5 sub-tab) | 3-4 | `sonnet` | medium | Berulang dan mekanis; satu file, tanpa paginasi/seleksi. |
| 3 | Surat Jalan (`App.jsx`) | 5 | `opus` | high | File 3.597 baris; bersinggungan dengan paginasi dan bulk-select yang memicu kirim-ke-accounting. |
| 4 | Invoicing (2 tab) | 6-7 | `opus` | medium-high | Matcher bersarang baru + bulk-select invoice. |
| 5 | Dedup `Modal.jsx` + validasi akhir | 8-9 | `opus` | medium | Menyentuh UI pembuatan invoice; perlu kehati-hatian ekuivalensi perilaku. |

---

# FASE 1 — Fondasi Pencarian

**Model: `sonnet` · Effort: medium**

### Task 1: Fungsi murni `filterBySearch`

**Files:**
- Create: `apps/bul-monitor/src/utils/searchFilter.js`
- Test: `apps/bul-monitor/src/utils/searchFilter.test.js`

**Interfaces:**
- Consumes: tidak ada (task pertama).
- Produces:
  - `normalizeTerm(term: unknown) => string` — trim + lowercase, `''` bila null/undefined.
  - `matchesSearch(item: object, term: string, fields: string[]) => boolean`
  - `filterBySearch(list: unknown, term: string, fields: string[]) => object[]`

- [x] **Step 1: Pasang dependensi (sekali saja untuk seluruh plan)**

```bash
cd apps/bul-monitor && npm install
```

Expected: selesai tanpa error, direktori `node_modules` terbentuk.

- [x] **Step 2: Tulis test yang gagal**

Buat `apps/bul-monitor/src/utils/searchFilter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeTerm, matchesSearch, filterBySearch } from './searchFilter.js';

const items = [
  { id: 1, nomorSJ: '012705', rute: 'CITEUREUP (PASIR KT - PT. MORTAR PRAKASA UTAMA)', material: 'Pasir' },
  { id: 2, nomorSJ: '012706', rute: 'BALARAJA (PASIR KT - PT. BRIK)', material: 'Pasir' },
  { id: 3, nomorSJ: '02193', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
];

const FIELDS = ['nomorSJ', 'rute', 'material'];

describe('normalizeTerm', () => {
  it('trim dan lowercase', () => {
    expect(normalizeTerm('  CiTeUreUp  ')).toBe('citeureup');
  });

  it('mengembalikan string kosong untuk null/undefined', () => {
    expect(normalizeTerm(null)).toBe('');
    expect(normalizeTerm(undefined)).toBe('');
  });
});

describe('matchesSearch', () => {
  it('kata kunci kosong selalu cocok', () => {
    expect(matchesSearch(items[0], '', FIELDS)).toBe(true);
    expect(matchesSearch(items[0], '   ', FIELDS)).toBe(true);
  });

  it('cocok pada salah satu field (OR)', () => {
    expect(matchesSearch(items[2], 'clay', FIELDS)).toBe(true);
    expect(matchesSearch(items[2], '02193', FIELDS)).toBe(true);
  });

  it('tidak cocok jika tidak ada field yang mengandung kata kunci', () => {
    expect(matchesSearch(items[0], 'surabaya', FIELDS)).toBe(false);
  });

  it('aman saat field tidak ada di item', () => {
    expect(matchesSearch({ id: 9 }, 'apa saja', FIELDS)).toBe(false);
  });
});

describe('filterBySearch', () => {
  it('mengembalikan semua item saat kata kunci kosong', () => {
    expect(filterBySearch(items, '', FIELDS)).toHaveLength(3);
  });

  it('mengembalikan semua item saat kata kunci hanya spasi', () => {
    expect(filterBySearch(items, '   ', FIELDS)).toHaveLength(3);
  });

  it('case-insensitive', () => {
    expect(filterBySearch(items, 'citeureup', FIELDS).map((i) => i.id)).toEqual([1]);
    expect(filterBySearch(items, 'CITEUREUP', FIELDS).map((i) => i.id)).toEqual([1]);
  });

  it('cocok substring di tengah teks', () => {
    expect(filterBySearch(items, 'pasir kt', FIELDS).map((i) => i.id)).toEqual([1, 2]);
  });

  it('mencari lintas field', () => {
    expect(filterBySearch(items, 'tanah', FIELDS).map((i) => i.id)).toEqual([3]);
  });

  it('mengembalikan array kosong bila tidak ada yang cocok', () => {
    expect(filterBySearch(items, 'zzz', FIELDS)).toEqual([]);
  });

  it('aman saat list null/undefined', () => {
    expect(filterBySearch(null, 'apa saja', FIELDS)).toEqual([]);
    expect(filterBySearch(undefined, '', FIELDS)).toEqual([]);
  });
});
```

- [x] **Step 3: Jalankan test, pastikan GAGAL**

```bash
cd apps/bul-monitor && npx vitest run src/utils/searchFilter.test.js
```

Expected: FAIL — `Failed to resolve import "./searchFilter.js"`.

- [x] **Step 4: Tulis implementasi minimal**

Buat `apps/bul-monitor/src/utils/searchFilter.js`:

```js
/**
 * Utilitas pencarian client-side untuk daftar yang sudah dimuat penuh di memori.
 * Tidak melakukan query Firestore — seluruh list bul-monitor sudah di-cache
 * oleh listener onSnapshot, sehingga pencarian cukup dilakukan di sisi klien.
 */

/** Normalisasi kata kunci: trim + lowercase. Mengembalikan '' untuk null/undefined. */
export function normalizeTerm(term) {
  return String(term ?? '').trim().toLowerCase();
}

/**
 * Cek apakah satu item cocok dengan kata kunci pada salah satu field (OR).
 * Field yang tidak ada / null diperlakukan sebagai string kosong.
 * Kata kunci kosong selalu dianggap cocok.
 */
export function matchesSearch(item, term, fields) {
  const needle = normalizeTerm(term);
  if (!needle) return true;
  return fields.some((field) =>
    String(item?.[field] ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Filter daftar berdasarkan kata kunci pada beberapa field.
 * Kata kunci kosong mengembalikan daftar apa adanya (bukan salinan) agar
 * referensinya stabil dan useMemo di pemanggil tidak memicu render ulang.
 */
export function filterBySearch(list, term, fields) {
  const items = Array.isArray(list) ? list : [];
  const needle = normalizeTerm(term);
  if (!needle) return items;
  return items.filter((item) => matchesSearch(item, needle, fields));
}
```

- [x] **Step 5: Jalankan test, pastikan LULUS**

```bash
cd apps/bul-monitor && npx vitest run src/utils/searchFilter.test.js
```

Expected: PASS — 12 test lulus.

- [x] **Step 6: Commit**

```bash
git add apps/bul-monitor/src/utils/searchFilter.js apps/bul-monitor/src/utils/searchFilter.test.js
git commit -m "feat(bul-monitor): add pure client-side search filter utility"
```

---

### Task 2: Hook `useSearchFilter` dan komponen `SearchInput`

**Files:**
- Create: `apps/bul-monitor/src/hooks/useSearchFilter.js`
- Create: `apps/bul-monitor/src/components/SearchInput.jsx`

**Interfaces:**
- Consumes: `filterBySearch(list, term, fields)` dari `../utils/searchFilter.js` (Task 1).
- Produces:
  - `useSearchFilter(list, searchTerm, fields) => object[]` — named export dari `src/hooks/useSearchFilter.js`.
  - `SearchInput({ value, onChange, placeholder })` — default export dari `src/components/SearchInput.jsx`. `onChange` menerima **string**, bukan event.

- [x] **Step 1: Buat hook**

Buat `apps/bul-monitor/src/hooks/useSearchFilter.js`:

```js
import { useMemo } from 'react';
import { filterBySearch } from '../utils/searchFilter.js';

/**
 * Bungkus useMemo di atas filterBySearch.
 *
 * PENTING: `fields` harus berupa konstanta level-modul (bukan array literal
 * inline), supaya referensinya stabil antar-render dan useMemo benar-benar
 * mencegah perhitungan ulang.
 */
export function useSearchFilter(list, searchTerm, fields) {
  return useMemo(
    () => filterBySearch(list, searchTerm, fields),
    [list, searchTerm, fields]
  );
}
```

- [x] **Step 2: Buat komponen SearchInput**

Buat `apps/bul-monitor/src/components/SearchInput.jsx`:

```jsx
import { Search, XCircle } from 'lucide-react';

/**
 * Search bar standar bul-monitor. Mengikuti pola sj-monitor (ikon cari di kiri,
 * tombol clear di kanan yang hanya muncul saat ada isi) dengan aksen hijau
 * khas bul-monitor.
 *
 * onChange menerima string nilai baru, bukan event.
 */
export default function SearchInput({ value, onChange, placeholder = 'Cari...' }) {
  return (
    <div className="relative">
      <input
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
      />
      <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Hapus pencarian"
          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
        >
          <XCircle className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
```

- [x] **Step 3: Verifikasi build**

```bash
cd apps/bul-monitor && npm run build
```

Expected: `built in Xs`, tanpa error.

- [x] **Step 4: Verifikasi seluruh test masih lulus**

```bash
cd apps/bul-monitor && npm test
```

Expected: PASS — `searchFilter.test.js`, `invoiceCsvParser.test.js`, `invoiceEligibility.test.js`, `invoiceTotals.test.js`.

- [x] **Step 5: Commit**

```bash
git add apps/bul-monitor/src/hooks/useSearchFilter.js apps/bul-monitor/src/components/SearchInput.jsx
git commit -m "feat(bul-monitor): add useSearchFilter hook and SearchInput component"
```

---

# FASE 2 — Master Data (5 sub-tab)

**Model: `sonnet` · Effort: medium**

### Task 3: Search Truck dan Supir

**Files:**
- Modify: `apps/bul-monitor/src/components/MasterDataManagement.jsx:1-15` (import + konstanta + state)
- Modify: `apps/bul-monitor/src/components/MasterDataManagement.jsx:66-153` (tab Truck)
- Modify: `apps/bul-monitor/src/components/MasterDataManagement.jsx:154-250` (tab Supir)

**Interfaces:**
- Consumes: `SearchInput` (default export) dan `useSearchFilter` (named export) dari Task 2.
- Produces: pola penempatan search bar yang diulang Task 4 — konstanta field di level modul, state `searchX`, list `filteredX`, `SearchInput` di antara kartu header dan daftar, plus empty state pencarian.

- [x] **Step 1: Tambahkan import dan konstanta field di level modul**

Ganti baris 1-3 `apps/bul-monitor/src/components/MasterDataManagement.jsx`:

```jsx
import { useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw, FileText, Package, Truck, Users } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';
```

menjadi:

```jsx
import { useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw, FileText, Package, Truck, Users } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';

// Konstanta level-modul: referensi array stabil antar-render agar useMemo
// di dalam useSearchFilter benar-benar efektif.
const TRUCK_SEARCH_FIELDS = ['nomorPolisi'];
const SUPIR_SEARCH_FIELDS = ['namaSupir', 'pt'];
const RUTE_SEARCH_FIELDS = ['rute'];
const MATERIAL_SEARCH_FIELDS = ['material', 'satuan'];
const PELANGGAN_SEARCH_FIELDS = ['name', 'address', 'npwp'];
```

- [x] **Step 2: Tambahkan state dan daftar terfilter**

Ganti dua baris ini (berada tepat setelah daftar props destructuring):

```jsx
  const [masterTab, setMasterTab] = useState('truck');
  const [alertMessage, setAlertMessage] = useState('');
```

menjadi:

```jsx
  const [masterTab, setMasterTab] = useState('truck');
  const [alertMessage, setAlertMessage] = useState('');
  const [searchTruck, setSearchTruck] = useState('');
  const [searchSupir, setSearchSupir] = useState('');
  const [searchRute, setSearchRute] = useState('');
  const [searchMaterial, setSearchMaterial] = useState('');
  const [searchPelanggan, setSearchPelanggan] = useState('');

  const filteredTruck = useSearchFilter(truckList, searchTruck, TRUCK_SEARCH_FIELDS);
  const filteredSupir = useSearchFilter(supirList, searchSupir, SUPIR_SEARCH_FIELDS);
  const filteredRute = useSearchFilter(ruteList, searchRute, RUTE_SEARCH_FIELDS);
  const filteredMaterial = useSearchFilter(materialList, searchMaterial, MATERIAL_SEARCH_FIELDS);
  const filteredPelanggan = useSearchFilter(pelangganList, searchPelanggan, PELANGGAN_SEARCH_FIELDS);
```

- [x] **Step 3: Tampilkan jumlah hasil pada header Truck**

Ganti:

```jsx
                <p className="text-sm text-gray-600">Total: {truckList.length} truck</p>
```

menjadi:

```jsx
                <p className="text-sm text-gray-600">
                  Total: {truckList.length} truck
                  {searchTruck && ` · ${filteredTruck.length} cocok`}
                </p>
```

- [x] **Step 4: Sisipkan search bar dan empty state pada tab Truck**

Ganti blok daftar Truck:

```jsx
          <div className="space-y-3">
            {truckList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data truck</p>
              </div>
            ) : (
              truckList.map(truck => (
```

menjadi:

```jsx
          {truckList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchTruck}
                onChange={setSearchTruck}
                placeholder="Cari nomor polisi..."
              />
            </div>
          )}

          <div className="space-y-3">
            {truckList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data truck</p>
              </div>
            ) : filteredTruck.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada truck yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredTruck.map(truck => (
```

- [x] **Step 5: Terapkan pola yang sama pada tab Supir**

Ganti header count Supir:

```jsx
                <p className="text-sm text-gray-600">Total: {supirList.length} supir</p>
```

menjadi:

```jsx
                <p className="text-sm text-gray-600">
                  Total: {supirList.length} supir
                  {searchSupir && ` · ${filteredSupir.length} cocok`}
                </p>
```

Sisipkan search bar tepat sebelum wadah daftar Supir, yaitu ganti:

```jsx
          <div className="space-y-3">
            {supirList.length === 0 ? (
```

menjadi:

```jsx
          {supirList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchSupir}
                onChange={setSearchSupir}
                placeholder="Cari nama supir atau PT..."
              />
            </div>
          )}

          <div className="space-y-3">
            {supirList.length === 0 ? (
```

Lalu ganti penutup kondisi dan iterasinya:

```jsx
            ) : (
              supirList.map(supir => (
```

menjadi:

```jsx
            ) : filteredSupir.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada supir yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredSupir.map(supir => (
```

- [x] **Step 6: Verifikasi build**

```bash
cd apps/bul-monitor && npm run build
```

Expected: `built in Xs`, tanpa error. Variabel `filteredRute`/`filteredMaterial`/`filteredPelanggan` memang belum dipakai sampai Task 4 — itu disengaja dan tidak menggagalkan build (bul-monitor tidak menjalankan ESLint).

- [x] **Step 7: Commit**

```bash
git add apps/bul-monitor/src/components/MasterDataManagement.jsx
git commit -m "feat(bul-monitor): add search to master data truck and supir tabs"
```

---

### Task 4: Search Rute, Material, dan Pelanggan

**Files:**
- Modify: `apps/bul-monitor/src/components/MasterDataManagement.jsx` (tab Rute, Material, Pelanggan)

**Interfaces:**
- Consumes: konstanta `RUTE_SEARCH_FIELDS`, `MATERIAL_SEARCH_FIELDS`, `PELANGGAN_SEARCH_FIELDS`, state `searchRute`/`searchMaterial`/`searchPelanggan`, dan list `filteredRute`/`filteredMaterial`/`filteredPelanggan` yang sudah dideklarasikan di Task 3.
- Produces: tidak ada yang dikonsumsi task berikutnya.

- [x] **Step 1: Tab Rute — header count**

Ganti:

```jsx
                <p className="text-sm text-gray-600">Total: {ruteList.length} rute</p>
```

menjadi:

```jsx
                <p className="text-sm text-gray-600">
                  Total: {ruteList.length} rute
                  {searchRute && ` · ${filteredRute.length} cocok`}
                </p>
```

- [x] **Step 2: Tab Rute — search bar, empty state, iterasi**

Ganti:

```jsx
          <div className="space-y-3">
            {ruteList.length === 0 ? (
```

menjadi:

```jsx
          {ruteList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchRute}
                onChange={setSearchRute}
                placeholder="Cari nama rute..."
              />
            </div>
          )}

          <div className="space-y-3">
            {ruteList.length === 0 ? (
```

Lalu ganti:

```jsx
            ) : (
              ruteList.map(rute => (
```

menjadi:

```jsx
            ) : filteredRute.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada rute yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredRute.map(rute => (
```

- [x] **Step 3: Tab Material — header count**

Ganti:

```jsx
                <p className="text-sm text-gray-600">Total: {materialList.length} material</p>
```

menjadi:

```jsx
                <p className="text-sm text-gray-600">
                  Total: {materialList.length} material
                  {searchMaterial && ` · ${filteredMaterial.length} cocok`}
                </p>
```

- [x] **Step 4: Tab Material — search bar, empty state, iterasi**

Ganti:

```jsx
          <div className="space-y-3">
            {materialList.length === 0 ? (
```

menjadi:

```jsx
          {materialList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchMaterial}
                onChange={setSearchMaterial}
                placeholder="Cari nama material atau satuan..."
              />
            </div>
          )}

          <div className="space-y-3">
            {materialList.length === 0 ? (
```

Lalu ganti:

```jsx
            ) : (
              materialList.map(material => (
```

menjadi:

```jsx
            ) : filteredMaterial.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada material yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredMaterial.map(material => (
```

- [x] **Step 5: Tab Pelanggan — header count**

Ganti:

```jsx
                <p className="text-sm text-gray-600">Total: {pelangganList.length} pelanggan</p>
```

menjadi:

```jsx
                <p className="text-sm text-gray-600">
                  Total: {pelangganList.length} pelanggan
                  {searchPelanggan && ` · ${filteredPelanggan.length} cocok`}
                </p>
```

- [x] **Step 6: Tab Pelanggan — search bar, empty state, iterasi**

Sisipkan search bar tepat sebelum wadah daftar Pelanggan. Ganti:

```jsx
          <div className="space-y-3">
            {pelangganList.length === 0 ? (
```

menjadi:

```jsx
          {pelangganList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchPelanggan}
                onChange={setSearchPelanggan}
                placeholder="Cari nama pelanggan, alamat, atau NPWP..."
              />
            </div>
          )}

          <div className="space-y-3">
            {pelangganList.length === 0 ? (
```

Perhatikan: `pelangganList.length === 0` juga muncul di kartu header (sekitar baris 440) untuk mengatur tombol migrasi. **Jangan** ubah kemunculan itu — yang diubah adalah kemunculan di dalam wadah daftar (sekitar baris 461), yang dikenali dari baris `<div className="space-y-3">` tepat di atasnya.

Lalu ganti:

```jsx
            ) : (
              pelangganList.map(pelanggan => (
```

menjadi:

```jsx
            ) : filteredPelanggan.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada pelanggan yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredPelanggan.map(pelanggan => (
```

- [x] **Step 7: Verifikasi build**

```bash
cd apps/bul-monitor && npm run build
```

Expected: `built in Xs`, tanpa error.

- [x] **Step 8: Verifikasi manual di dev server**

```bash
cd apps/bul-monitor && npm run dev
```

Cek berurutan di tab Master Data: (a) ketik `bal` di Rute → hanya rute Balaraja tampil dan header menunjukkan `· 2 cocok`; (b) tekan tombol ✕ → seluruh 70 rute kembali; (c) ketik `zzz` → muncul "Tidak ada rute yang cocok dengan pencarian."; (d) ulangi pada Truck, Supir, Material, dan Pelanggan.

- [x] **Step 9: Commit**

```bash
git add apps/bul-monitor/src/components/MasterDataManagement.jsx
git commit -m "feat(bul-monitor): add search to master data rute, material, and pelanggan tabs"
```

---

# FASE 3 — Surat Jalan (`App.jsx`)

**Model: `opus` · Effort: high**

Fase paling berisiko. `App.jsx` berukuran 3.597 baris dan daftar Surat Jalan bersinggungan dengan paginasi serta dua bulk-select yang memicu "Kirim ke Accounting" dan "Batalkan SJ". Baca ulang Keputusan Desain #2 sebelum mulai.

### Task 5: Search Surat Jalan dengan pengaman paginasi dan bulk-select

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx:12-26` (import)
- Modify: `apps/bul-monitor/src/App.jsx:108-110` (state)
- Modify: `apps/bul-monitor/src/App.jsx:2339-2347` (daftar terfilter + paginasi)
- Modify: `apps/bul-monitor/src/App.jsx:2356` (`eligibleInView`)
- Modify: `apps/bul-monitor/src/App.jsx:2390` (`eligibleBatalInView`)
- Modify: `apps/bul-monitor/src/App.jsx` sekitar baris 2415 (handler `handleSearchSJChange`)
- Modify: `apps/bul-monitor/src/App.jsx:3309` (penempatan search bar di JSX)
- Modify: `apps/bul-monitor/src/App.jsx:3378` (empty state)
- Modify: `apps/bul-monitor/src/App.jsx:3435` (gerbang paginasi)

**Interfaces:**
- Consumes: `SearchInput` (default export dari `./components/SearchInput.jsx`) dan `useSearchFilter` (named export dari `./hooks/useSearchFilter.js`).
- Produces: `searchedSuratJalan` — daftar SJ yang sudah difilter tab **dan** kata kunci; menjadi satu-satunya sumber untuk paginasi, empty state, `eligibleInView`, dan `eligibleBatalInView`.

- [ ] **Step 1: Tambahkan import**

Ganti baris 22-24:

```jsx
import SuratJalanCard from './components/SuratJalanCard.jsx';
import Modal from './components/Modal.jsx';
```

menjadi:

```jsx
import SuratJalanCard from './components/SuratJalanCard.jsx';
import Modal from './components/Modal.jsx';
import SearchInput from './components/SearchInput.jsx';
import { useSearchFilter } from './hooks/useSearchFilter.js';
```

- [ ] **Step 2: Tambahkan konstanta field di level modul**

Sisipkan tepat sebelum deklarasi komponen `App` (setelah seluruh blok import di bagian atas file, sejajar dengan konstanta level-modul lain seperti `EMPTY_BIAYA`):

```jsx
// Field yang dicari pada daftar Surat Jalan. Konstanta level-modul agar
// referensinya stabil antar-render dan useMemo di useSearchFilter efektif.
const SJ_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'namaSupir', 'pt', 'rute', 'material'];
```

- [ ] **Step 3: Tambahkan state kata kunci**

Ganti baris 108-110:

```jsx
  const [filter, setFilter] = useState('all');
  const [sjPage, setSjPage] = useState(1);
  const SJ_PAGE_SIZE = 10;
```

menjadi:

```jsx
  const [filter, setFilter] = useState('all');
  const [searchSJ, setSearchSJ] = useState('');
  const [sjPage, setSjPage] = useState(1);
  const SJ_PAGE_SIZE = 10;
```

- [ ] **Step 4: Sisipkan lapisan pencarian di antara filter tab dan paginasi**

Ganti blok baris 2339-2347:

```jsx
  const filteredSuratJalan = useMemo(() =>
    filter === 'gagal'
      ? gagalSuratJalanList
      : suratJalanList.filter(sj => filter === 'all' || sj.status === filter),
    [filter, gagalSuratJalanList, suratJalanList]);

  const sjTotalPages = Math.max(1, Math.ceil(filteredSuratJalan.length / SJ_PAGE_SIZE));
  const sjPageClamped = Math.min(sjPage, sjTotalPages);
  const paginatedSuratJalan = filteredSuratJalan.slice((sjPageClamped - 1) * SJ_PAGE_SIZE, sjPageClamped * SJ_PAGE_SIZE);
```

menjadi:

```jsx
  const filteredSuratJalan = useMemo(() =>
    filter === 'gagal'
      ? gagalSuratJalanList
      : suratJalanList.filter(sj => filter === 'all' || sj.status === filter),
    [filter, gagalSuratJalanList, suratJalanList]);

  // Lapisan pencarian di atas filter tab. searchedSuratJalan adalah "apa yang
  // dilihat user" dan menjadi satu-satunya sumber untuk paginasi, empty state,
  // dan kedua bulk-select di bawah.
  const searchedSuratJalan = useSearchFilter(filteredSuratJalan, searchSJ, SJ_SEARCH_FIELDS);

  const sjTotalPages = Math.max(1, Math.ceil(searchedSuratJalan.length / SJ_PAGE_SIZE));
  const sjPageClamped = Math.min(sjPage, sjTotalPages);
  const paginatedSuratJalan = searchedSuratJalan.slice((sjPageClamped - 1) * SJ_PAGE_SIZE, sjPageClamped * SJ_PAGE_SIZE);
```

- [ ] **Step 5: Arahkan bulk-select "Kirim" ke daftar yang benar-benar terlihat**

Ganti baris 2356:

```jsx
  const eligibleInView = useMemo(() => filteredSuratJalan.filter(isSJEligibleForBulkKirim), [filteredSuratJalan, isSJEligibleForBulkKirim]);
```

menjadi:

```jsx
  const eligibleInView = useMemo(() => searchedSuratJalan.filter(isSJEligibleForBulkKirim), [searchedSuratJalan, isSJEligibleForBulkKirim]);
```

- [ ] **Step 6: Arahkan bulk-select "Batalkan" ke daftar yang benar-benar terlihat**

Ganti baris 2390:

```jsx
  const eligibleBatalInView = useMemo(() => filteredSuratJalan.filter(isSJEligibleForBulkBatalkan), [filteredSuratJalan, isSJEligibleForBulkBatalkan]);
```

menjadi:

```jsx
  const eligibleBatalInView = useMemo(() => searchedSuratJalan.filter(isSJEligibleForBulkBatalkan), [searchedSuratJalan, isSJEligibleForBulkBatalkan]);
```

- [ ] **Step 7: Tambahkan handler yang mereset paginasi dan seleksi**

Sisipkan tepat setelah penutup fungsi `toggleSelectAllBatal` (sekitar baris 2415). Penempatan ini penting: `setSelectedBatalSJIds` baru dideklarasikan pada baris 2385, sehingga handler tidak boleh berada di atasnya.

```jsx
  /**
   * Perubahan kata kunci mereset halaman DAN mengosongkan kedua seleksi bulk.
   *
   * Alasan seleksi ikut dikosongkan: eligibleInView / eligibleBatalInView kini
   * bersumber dari searchedSuratJalan. Tanpa reset, user bisa menekan "Pilih
   * Semua" di bawah satu kata kunci, menghapus kata kuncinya, lalu mengirim SJ
   * yang tidak lagi terlihat ke Accounting — SJ tersebut akan terkunci dan
   * masuk antrean review akuntan. Perilaku ini sama dengan tombol filter tab.
   */
  const handleSearchSJChange = useCallback((value) => {
    setSearchSJ(value);
    setSjPage(1);
    setSelectedSJIds(new Set());
    setSelectedBatalSJIds(new Set());
  }, []);
```

- [ ] **Step 8: Sisipkan search bar di JSX**

Cari penutup wadah tombol filter (`<div className="flex gap-2 flex-wrap">` yang berisi tombol Semua sampai Gagal, sekitar baris 3309). Ganti:

```jsx
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Kirim Bar — hanya tampil untuk superadmin jika ada SJ eligible di view */}
```

menjadi:

```jsx
              </button>
            </div>

            <div className="mt-4">
              <SearchInput
                value={searchSJ}
                onChange={handleSearchSJChange}
                placeholder="Cari nomor SJ, nomor polisi, supir, PT, rute, atau material..."
              />
              {searchSJ && (
                <p className="mt-2 text-sm text-gray-600">
                  {searchedSuratJalan.length} dari {filteredSuratJalan.length} Surat Jalan cocok
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Kirim Bar — hanya tampil untuk superadmin jika ada SJ eligible di view */}
```

- [ ] **Step 9: Tambahkan empty state pencarian**

Ganti baris 3378 dan sekitarnya:

```jsx
        <div className="space-y-4">
          {filteredSuratJalan.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Belum ada data Surat Jalan</p>
```

menjadi:

```jsx
        <div className="space-y-4">
          {filteredSuratJalan.length > 0 && searchedSuratJalan.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Tidak ada Surat Jalan yang cocok dengan pencarian.</p>
            </div>
          ) : filteredSuratJalan.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Belum ada data Surat Jalan</p>
```

Sisa blok (tombol "Tambah Surat Jalan Pertama", penutup `) : (`, dan `paginatedSuratJalan.map(...)`) tidak berubah.

- [ ] **Step 10: Perbaiki gerbang paginasi**

Ganti baris 3435:

```jsx
        {filteredSuratJalan.length > SJ_PAGE_SIZE && (
```

menjadi:

```jsx
        {searchedSuratJalan.length > SJ_PAGE_SIZE && (
```

- [ ] **Step 11: Verifikasi build**

```bash
cd apps/bul-monitor && npm run build
```

Expected: `built in Xs`, tanpa error. Bila muncul `Cannot access 'setSelectedBatalSJIds' before initialization`, `handleSearchSJChange` diletakkan terlalu tinggi — pindahkan ke bawah baris 2385.

- [ ] **Step 12: Verifikasi seluruh test masih lulus**

```bash
cd apps/bul-monitor && npm test
```

Expected: PASS — 4 file test, tidak ada regresi.

- [ ] **Step 13: Verifikasi manual — wajib, ini gerbang keamanan fase ini**

```bash
cd apps/bul-monitor && npm run dev
```

Login sebagai superadmin, buka tab Surat Jalan, lalu jalankan enam pemeriksaan berikut:

1. **Pencocokan.** Ketik `citeureup` → hanya SJ rute Citeureup tampil; label "N dari 1273 Surat Jalan cocok" muncul.
2. **Reset paginasi.** Buka halaman 5, lalu ketik `9549` → langsung berada di halaman 1 dengan hasil yang benar (tidak kosong).
3. **Clear.** Tekan ✕ → seluruh 1273 SJ kembali dan paginasi kembali ke halaman 1.
4. **Kombinasi dengan filter tab.** Pilih tab `Terkunci`, lalu ketik `pasir` → hasil hanya SJ berstatus terkunci yang mengandung "pasir".
5. **Pengaman bulk-select (paling penting).** Cari `citeureup` → tekan "Pilih Semua" → hapus kata kunci dengan ✕ → **verifikasi bar bulk kembali ke keadaan tidak ada yang dipilih** (tidak muncul teks "N dipilih" dan tombol "Kirim N SJ ke Accounting" hilang). Jangan menekan tombol kirim selama pengujian.
6. **Empty state.** Ketik `zzzz` → muncul "Tidak ada Surat Jalan yang cocok dengan pencarian.", bukan "Belum ada data Surat Jalan".

- [ ] **Step 14: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "feat(bul-monitor): add surat jalan search with pagination and bulk-select guards"
```

---

# FASE 4 — Invoicing (2 tab)

**Model: `opus` · Effort: medium-high**

### Task 6: Matcher pencarian invoice bersarang

**Files:**
- Create: `apps/bul-monitor/src/utils/invoiceSearch.js`
- Test: `apps/bul-monitor/src/utils/invoiceSearch.test.js`

**Interfaces:**
- Consumes: `normalizeTerm(term)` dari `./searchFilter.js` (Task 1).
- Produces:
  - `INVOICE_SJ_SEARCH_FIELDS: string[]` — `['nomorSJ', 'nomorPolisi', 'rute', 'material']`
  - `matchesInvoiceSearch(invoice: object, term: string) => boolean`
  - `filterInvoicesBySearch(invoiceList: unknown, term: string) => object[]`

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/bul-monitor/src/utils/invoiceSearch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { matchesInvoiceSearch, filterInvoicesBySearch } from './invoiceSearch.js';

const invoiceA = {
  id: 'inv-a',
  noInvoice: 'SJT/006/06/2026',
  suratJalanList: [
    { id: 'sj-1', nomorSJ: '02193', nomorPolisi: 'B 9549 CYU', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
    { id: 'sj-2', nomorSJ: '02266', nomorPolisi: 'B 9550 CYU', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
  ],
};

const invoiceB = {
  id: 'inv-b',
  noInvoice: 'SJT/007/07/2026',
  suratJalanList: [
    { id: 'sj-3', nomorSJ: '012705', nomorPolisi: 'B 1111 AAA', rute: 'BALARAJA (PASIR KT - PT. BRIK)', material: 'Pasir' },
  ],
};

const invoiceKosong = { id: 'inv-c', noInvoice: 'SJT/008/08/2026' };

const list = [invoiceA, invoiceB, invoiceKosong];

describe('matchesInvoiceSearch', () => {
  it('kata kunci kosong selalu cocok', () => {
    expect(matchesInvoiceSearch(invoiceA, '')).toBe(true);
    expect(matchesInvoiceSearch(invoiceA, '  ')).toBe(true);
  });

  it('cocok pada nomor invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, '006/06')).toBe(true);
  });

  it('cocok pada nomor SJ di dalam invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, '02193')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, '02193')).toBe(false);
  });

  it('cocok pada rute, material, dan nomor polisi SJ di dalam invoice', () => {
    expect(matchesInvoiceSearch(invoiceA, 'platinum')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, 'pasir')).toBe(true);
    expect(matchesInvoiceSearch(invoiceB, 'b 1111')).toBe(true);
  });

  it('case-insensitive', () => {
    expect(matchesInvoiceSearch(invoiceA, 'TANAH/CLAY')).toBe(true);
  });

  it('aman saat suratJalanList tidak ada', () => {
    expect(matchesInvoiceSearch(invoiceKosong, '02193')).toBe(false);
    expect(matchesInvoiceSearch(invoiceKosong, '008/08')).toBe(true);
  });
});

describe('filterInvoicesBySearch', () => {
  it('mengembalikan semua invoice saat kata kunci kosong', () => {
    expect(filterInvoicesBySearch(list, '')).toHaveLength(3);
  });

  it('menemukan invoice yang memuat satu nomor SJ tertentu', () => {
    expect(filterInvoicesBySearch(list, '012705').map((i) => i.id)).toEqual(['inv-b']);
  });

  it('mengembalikan array kosong bila tidak ada yang cocok', () => {
    expect(filterInvoicesBySearch(list, 'zzz')).toEqual([]);
  });

  it('aman saat list null/undefined', () => {
    expect(filterInvoicesBySearch(null, 'apa saja')).toEqual([]);
    expect(filterInvoicesBySearch(undefined, '')).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd apps/bul-monitor && npx vitest run src/utils/invoiceSearch.test.js
```

Expected: FAIL — `Failed to resolve import "./invoiceSearch.js"`.

- [ ] **Step 3: Tulis implementasi**

Buat `apps/bul-monitor/src/utils/invoiceSearch.js`:

```js
import { normalizeTerm } from './searchFilter.js';

/**
 * Pencarian invoice bersifat "dalam": kata kunci dicocokkan ke nomor invoice
 * DAN ke setiap Surat Jalan yang termuat di dalamnya. Ini menjawab pertanyaan
 * operasional "invoice mana yang memuat SJ 02193?".
 *
 * Snapshot SJ disimpan di invoice.suratJalanList (lihat App.jsx saat invoice
 * dibuat). Data invoice lama bisa saja tidak memilikinya, sehingga field ini
 * selalu diperlakukan opsional.
 */
export const INVOICE_SJ_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'rute', 'material'];

export function matchesInvoiceSearch(invoice, term) {
  const needle = normalizeTerm(term);
  if (!needle) return true;

  if (String(invoice?.noInvoice ?? '').toLowerCase().includes(needle)) return true;

  const nested = Array.isArray(invoice?.suratJalanList) ? invoice.suratJalanList : [];
  return nested.some((sj) =>
    INVOICE_SJ_SEARCH_FIELDS.some((field) =>
      String(sj?.[field] ?? '').toLowerCase().includes(needle)
    )
  );
}

export function filterInvoicesBySearch(invoiceList, term) {
  const items = Array.isArray(invoiceList) ? invoiceList : [];
  const needle = normalizeTerm(term);
  if (!needle) return items;
  return items.filter((invoice) => matchesInvoiceSearch(invoice, needle));
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd apps/bul-monitor && npx vitest run src/utils/invoiceSearch.test.js
```

Expected: PASS — 10 test lulus.

- [ ] **Step 5: Commit**

```bash
git add apps/bul-monitor/src/utils/invoiceSearch.js apps/bul-monitor/src/utils/invoiceSearch.test.js
git commit -m "feat(bul-monitor): add nested invoice search matcher"
```

---

### Task 7: Search di kedua tab Invoicing

**Files:**
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx:1-20` (import, konstanta, state)
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx:96` (`filteredSJ`)
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx:220-260` (tab Belum Terinvoice)
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx:310-330` (tab Sudah Terinvoice)

**Interfaces:**
- Consumes: `SearchInput` (Task 2), `useSearchFilter` (Task 2), `filterInvoicesBySearch` (Task 6).
- Produces: tidak ada yang dikonsumsi task berikutnya.

- [ ] **Step 1: Import dan konstanta**

Ganti baris 1-3:

```jsx
import { useState, useEffect } from 'react';
import { Send, Lock, Plus, Clock, CheckCircle, FileText, Package, XCircle } from 'lucide-react';
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
```

menjadi:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { Send, Lock, Plus, Clock, CheckCircle, FileText, Package, XCircle } from 'lucide-react';
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { filterInvoicesBySearch } from '../utils/invoiceSearch.js';

// Konstanta level-modul: referensi array stabil antar-render.
const SJ_INVOICE_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'rute', 'material'];
```

- [ ] **Step 2: Tambahkan state kata kunci dan kosongkan saat pindah tab**

Ganti baris 15-20:

```jsx
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  // Reset seleksi saat pindah tab
  useEffect(() => { setSelectedInvoiceIds(new Set()); }, [activeFilter]);
```

menjadi:

```jsx
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  // Reset seleksi dan kata kunci saat pindah tab — kedua tab mencari entitas
  // yang berbeda (Surat Jalan vs Invoice), jadi kata kunci tidak dibawa-bawa.
  useEffect(() => {
    setSelectedInvoiceIds(new Set());
    setSearch('');
  }, [activeFilter]);

  /**
   * Perubahan kata kunci mengosongkan seleksi invoice. Tanpa ini, user bisa
   * memilih invoice di bawah satu kata kunci, menghapus kata kuncinya, lalu
   * mengirim invoice yang tidak lagi terlihat ke Accounting.
   */
  const handleSearchChange = (value) => {
    setSearch(value);
    setSelectedInvoiceIds(new Set());
  };
```

- [ ] **Step 3: Tambahkan lapisan pencarian pada daftar SJ dan daftar invoice**

Ganti baris 96:

```jsx
  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
```

menjadi:

```jsx
  const baseSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  const filteredSJ = useSearchFilter(baseSJ, search, SJ_INVOICE_SEARCH_FIELDS);

  // Pencarian invoice bersifat "dalam": cocok pada noInvoice ATAU pada salah
  // satu Surat Jalan di dalamnya.
  const searchedInvoices = useMemo(
    () => filterInvoicesBySearch(invoiceList, search),
    [invoiceList, search]
  );
```

- [ ] **Step 4: Arahkan bulk-select invoice ke daftar yang terlihat**

Ganti baris 39:

```jsx
  const eligibleInvoicesInView = activeFilter === 'terinvoice' ? invoiceList.filter(canKirimInvoice) : [];
```

menjadi:

```jsx
  const eligibleInvoicesInView = activeFilter === 'terinvoice' ? searchedInvoices.filter(canKirimInvoice) : [];
```

**Catatan urutan deklarasi:** `searchedInvoices` dideklarasikan pada baris ~96 (Step 3), sedangkan `eligibleInvoicesInView` berada pada baris 39 — di atasnya. Pindahkan blok `baseSJ` / `filteredSJ` / `searchedInvoices` dari Step 3 ke atas baris 39 (tepat setelah `handleSearchChange` dari Step 2), lalu hapus deklarasi `filteredSJ` yang lama di baris 96. Definisi `sjBelumTerinvoice` dan `sjTerinvoice` juga harus ikut naik bersamanya karena `baseSJ` bergantung padanya. Jalankan build setelah pemindahan untuk membuktikan tidak ada TDZ error.

- [ ] **Step 5: Search bar tab "Belum Terinvoice"**

Ganti:

```jsx
              <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <p className="text-sm text-green-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="overflow-x-auto">
```

menjadi:

```jsx
              <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <p className="text-sm text-green-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="mb-4">
                <SearchInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Cari nomor SJ, nomor polisi, rute, atau material..."
                />
              </div>
              {filteredSJ.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang cocok dengan pencarian.</p>
                </div>
              ) : (
              <div className="overflow-x-auto">
```

Lalu tutup percabangan baru tersebut: cari `</table>` penutup tabel SJ beserta `</div>` penutup `overflow-x-auto`, dan tambahkan `)}` sesudahnya.

Gerbang `filteredSJ.length === 0` yang sudah ada di baris 226 tetap dipertahankan apa adanya — gerbang itu menangani "belum ada SJ sama sekali" sebelum search bar dirender. Karena `filteredSJ` kini sudah tersaring kata kunci, ubah gerbang lama tersebut agar memeriksa daftar dasar:

```jsx
          {filteredSJ.length === 0 ? (
```

menjadi:

```jsx
          {baseSJ.length === 0 ? (
```

- [ ] **Step 6: Search bar tab "Sudah Terinvoice"**

Ganti:

```jsx
          {invoiceList.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Belum Ada Invoice</p>
```

menjadi:

```jsx
          {invoiceList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Cari nomor invoice atau nomor SJ di dalamnya..."
              />
              {search && (
                <p className="mt-2 text-sm text-gray-600">
                  {searchedInvoices.length} dari {invoiceList.length} invoice cocok
                </p>
              )}
            </div>
          )}

          {invoiceList.length > 0 && searchedInvoices.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Tidak ada invoice yang cocok dengan pencarian.</p>
            </div>
          ) : invoiceList.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Belum Ada Invoice</p>
```

Lalu ganti iterasinya:

```jsx
            invoiceList.map(invoice => {
```

menjadi:

```jsx
            searchedInvoices.map(invoice => {
```

- [ ] **Step 7: Verifikasi build dan test**

```bash
cd apps/bul-monitor && npm run build && npm test
```

Expected: build sukses, seluruh 5 file test lulus.

- [ ] **Step 8: Verifikasi manual**

```bash
cd apps/bul-monitor && npm run dev
```

Di tab Invoicing: (a) tab "Belum Terinvoice", ketik `cikarang` → tabel menyusut, tekan ✕ → 127 SJ kembali; (b) pindah ke tab "Sudah Terinvoice" → kotak pencarian **kosong** (tidak membawa kata kunci tab sebelumnya); (c) ketik `02193` → hanya invoice `SJT/006/06/2026` tampil, membuktikan pencarian bersarang bekerja; (d) ketik `SJT/006` → invoice yang sama tampil; (e) pilih satu invoice eligible → ubah kata kunci → verifikasi seleksi kosong kembali; (f) ketik `zzzz` → muncul "Tidak ada invoice yang cocok dengan pencarian."

- [ ] **Step 9: Commit**

```bash
git add apps/bul-monitor/src/components/InvoiceManagement.jsx
git commit -m "feat(bul-monitor): add search to both invoicing tabs"
```

---

# FASE 5 — Dedup `Modal.jsx` dan Validasi Akhir

**Model: `opus` · Effort: medium**

### Task 8: Hapus duplikasi search di modal "Buat Invoice Baru"

Logika filter yang identik saat ini ditulis dua kali di `Modal.jsx` (baris 644-651 dan 670-677), dan markup search bar ditulis inline. Task ini menggantinya dengan `SearchInput` + `filterBySearch` **tanpa mengubah perilaku**.

**Files:**
- Modify: `apps/bul-monitor/src/components/Modal.jsx:1-3` (import)
- Modify: `apps/bul-monitor/src/components/Modal.jsx:613-690` (search bar + dua blok filter duplikat)

**Interfaces:**
- Consumes: `SearchInput` (Task 2), `filterBySearch` (Task 1).
- Produces: tidak ada yang dikonsumsi task berikutnya.

- [ ] **Step 1: Perbarui import**

Ganti baris 2:

```jsx
import { Package, CheckCircle, XCircle, Search } from 'lucide-react';
```

menjadi:

```jsx
import { Package, CheckCircle } from 'lucide-react';
```

`XCircle` dan `Search` hanya dipakai di blok yang dihapus pada Step 3 — sudah diverifikasi tidak ada pemakaian lain di file ini.

Lalu tambahkan setelah baris import terakhir yang ada di file:

```jsx
import SearchInput from './SearchInput.jsx';
import { filterBySearch } from '../utils/searchFilter.js';

// Konstanta level-modul: referensi array stabil antar-render.
const MODAL_SJ_SEARCH_FIELDS = ['nomorSJ', 'rute', 'material', 'nomorPolisi'];
```

- [ ] **Step 2: Hitung daftar SJ sekali saja**

Sisipkan di dalam komponen, setelah deklarasi `const [searchInvoiceSJ, setSearchInvoiceSJ] = useState('');` (baris 14) — pindahkan bila perlu agar berada setelah `type`, `selectedItem`, dan `suratJalanList` tersedia:

```jsx
  // Dihitung sekali lalu dipakai ulang untuk gerbang empty-state dan iterasi.
  // Sebelumnya rantai filter yang sama ditulis dua kali.
  const sjEligibleTerfilter = filterBySearch(
    suratJalanList.filter(sj => isSJEligibleForInvoice(sj, {
      isEdit: type === 'editInvoice',
      editingInvoiceId: selectedItem?.id,
    })),
    searchInvoiceSJ,
    MODAL_SJ_SEARCH_FIELDS
  );
```

- [ ] **Step 3: Ganti markup search bar inline dengan `SearchInput`**

Ganti blok baris 614-634:

```jsx
                {/* Search Bar */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari Nomor SJ, Rute, Material, atau Nomor Polisi..."
                      value={searchInvoiceSJ}
                      onChange={(e) => setSearchInvoiceSJ(e.target.value)}
                      className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    {searchInvoiceSJ && (
                      <button
                        onClick={() => setSearchInvoiceSJ('')}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
```

menjadi:

```jsx
                {/* Search Bar */}
                <div className="mb-3">
                  <SearchInput
                    value={searchInvoiceSJ}
                    onChange={setSearchInvoiceSJ}
                    placeholder="Cari Nomor SJ, Rute, Material, atau Nomor Polisi..."
                  />
                </div>
```

- [ ] **Step 4: Ganti kedua rantai filter duplikat dengan variabel tunggal**

Ganti blok gerbang empty-state:

```jsx
                  {suratJalanList
                    .filter(sj => isSJEligibleForInvoice(sj, {
                      isEdit: type === 'editInvoice',
                      editingInvoiceId: selectedItem?.id,
                    }))
                    .filter(sj => {
                      if (!searchInvoiceSJ) return true;
                      const search = searchInvoiceSJ.toLowerCase();
                      return (
                        sj.nomorSJ.toLowerCase().includes(search) ||
                        sj.rute.toLowerCase().includes(search) ||
                        sj.material.toLowerCase().includes(search) ||
                        sj.nomorPolisi.toLowerCase().includes(search)
                      );
                    }).length === 0 ? (
```

menjadi:

```jsx
                  {sjEligibleTerfilter.length === 0 ? (
```

Lalu ganti blok iterasi:

```jsx
                      {suratJalanList
                        .filter(sj => isSJEligibleForInvoice(sj, {
                          isEdit: type === 'editInvoice',
                          editingInvoiceId: selectedItem?.id,
                        }))
                        .filter(sj => {
                          if (!searchInvoiceSJ) return true;
                          const search = searchInvoiceSJ.toLowerCase();
                          return (
                            sj.nomorSJ.toLowerCase().includes(search) ||
                            sj.rute.toLowerCase().includes(search) ||
                            sj.material.toLowerCase().includes(search) ||
                            sj.nomorPolisi.toLowerCase().includes(search)
                          );
                        })
                        .map(sj => (
```

menjadi:

```jsx
                      {sjEligibleTerfilter
                        .map(sj => (
```

- [ ] **Step 5: Verifikasi tidak ada sisa duplikasi**

```bash
cd apps/bul-monitor && grep -c "searchInvoiceSJ.toLowerCase()" src/components/Modal.jsx
```

Expected: `0`.

```bash
cd apps/bul-monitor && grep -n "XCircle\|<Search " src/components/Modal.jsx
```

Expected: tidak ada keluaran.

- [ ] **Step 6: Verifikasi build dan test**

```bash
cd apps/bul-monitor && npm run build && npm test
```

Expected: build sukses, seluruh test lulus.

- [ ] **Step 7: Verifikasi manual — ekuivalensi perilaku**

```bash
cd apps/bul-monitor && npm run dev
```

Buka Invoicing → "Buat Invoice Baru". Verifikasi: (a) daftar SJ eligible tampil sama seperti sebelumnya; (b) ketik `citeureup` → daftar menyusut; (c) centang beberapa SJ, lalu ubah kata kunci → **centang yang sudah ada tetap tersimpan** (perilaku lama dipertahankan; `formData.selectedSJIds` sengaja tidak direset di sini karena user memang membangun satu invoice secara bertahap); (d) tekan ✕ → daftar penuh kembali; (e) ketik `zzzz` → muncul "Tidak ada SJ yang cocok dengan pencarian". Tutup modal tanpa menyimpan.

- [ ] **Step 8: Commit**

```bash
git add apps/bul-monitor/src/components/Modal.jsx
git commit -m "refactor(bul-monitor): reuse SearchInput and filterBySearch in invoice modal"
```

---

### Task 9: Validasi akhir dan pull request

**Files:**
- Modify: tidak ada file sumber. Task ini hanya verifikasi dan pelaporan.

**Interfaces:**
- Consumes: seluruh hasil Task 1-8.
- Produces: pull request siap review.

- [ ] **Step 1: Jalankan seluruh test**

```bash
cd apps/bul-monitor && npm test
```

Expected: PASS — 5 file test (`searchFilter`, `invoiceSearch`, `invoiceCsvParser`, `invoiceEligibility`, `invoiceTotals`).

- [ ] **Step 2: Jalankan build produksi**

```bash
cd apps/bul-monitor && npm run build
```

Expected: `built in Xs`, tanpa error.

- [ ] **Step 3: Buktikan tidak ada perubahan di luar scope**

```bash
git diff --stat main...HEAD
```

Expected: tepat 8 file — 4 dibuat (`searchFilter.js`, `searchFilter.test.js`, `useSearchFilter.js`, `SearchInput.jsx`), 2 dibuat (`invoiceSearch.js`, `invoiceSearch.test.js`), 4 dimodifikasi (`App.jsx`, `MasterDataManagement.jsx`, `InvoiceManagement.jsx`, `Modal.jsx`). Tidak boleh ada perubahan pada `package.json`, `vite.config.js`, `integrationService.js`, `firestoreWrites.js`, `invoiceTotals.js`, atau `invoiceEligibility.js`.

- [ ] **Step 4: Konfirmasi larangan financial logic terpenuhi**

```bash
git diff main...HEAD -- apps/bul-monitor/src/utils/invoiceTotals.js apps/bul-monitor/src/utils/invoiceEligibility.js apps/bul-monitor/src/integrationService.js apps/bul-monitor/src/services/firestoreWrites.js
```

Expected: keluaran kosong.

- [ ] **Step 5: Push dan buka pull request**

Gunakan skill `pr` untuk urutan yang aman (branch → push → PR). Badan PR harus memuat: daftar 8 titik search yang ditambahkan, tiga Keputusan Desain di atas beserta alasannya, hasil `npm test` dan `npm run build`, serta catatan bahwa deployment belum dilakukan dan menunggu user.

- [ ] **Step 6: Serahkan perintah deploy kepada user**

Jangan menjalankan sendiri. Sampaikan kepada user:

```bash
cd apps/bul-monitor && npm run build && firebase deploy --only hosting
```

---

## Catatan Self-Review

Diperiksa terhadap Opsi B dan tiga Keputusan Desain:

- **Cakupan.** 8 titik search terpenuhi: Surat Jalan (Task 5), Invoicing 2 tab (Task 7), Master Data 5 sub-tab (Task 3-4). Dedup modal terpenuhi (Task 8).
- **Konsistensi tipe.** `filterBySearch(list, term, fields)` dipakai identik di Task 2, 7, dan 8. `normalizeTerm` dikonsumsi Task 6. `SearchInput.onChange` menerima string di seluruh pemakaian — `setSearchTruck`, `handleSearchSJChange`, `handleSearchChange`, dan `setSearchInvoiceSJ` semuanya berupa `(value: string) => void`.
- **Risiko yang diketahui.** Task 7 Step 4 mengharuskan pemindahan urutan deklarasi di `InvoiceManagement.jsx`; ini ditandai eksplisit karena rawan TDZ error. Task 5 Step 7 menandai batas letak `handleSearchSJChange`.
- **Di luar cakupan yang disengaja.** Tidak ada component test untuk `SearchInput.jsx` — bul-monitor tidak memiliki jsdom maupun testing-library, dan Global Constraints melarang penambahan dependensi. Verifikasi UI dilakukan manual di Step verifikasi tiap task.
