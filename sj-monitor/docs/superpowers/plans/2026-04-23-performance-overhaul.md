# Performance Overhaul — sj-monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buat sj-monitor berjalan cepat di HP Android 4G tanpa mengubah tampilan atau logika bisnis apapun.

**Architecture:** Empat area optimasi independen dikerjakan berurutan: (1) Firestore hanya load data ≤12 bulan terakhir, (2) bundle JS dipecah dan library export di-lazy load, (3) React rendering diberi memoization dan virtualisasi, (4) animasi diberi prefers-reduced-motion.

**Tech Stack:** React 18, Vite 7, Firebase Firestore v10, Framer Motion v12, @tanstack/react-virtual (baru)

---

## File Map

| File | Perubahan |
|------|-----------|
| `src/App.jsx` | Task 1, 2, 10, 11, 12, 13 |
| `vite.config.js` | Task 3 |
| `src/utils/excel.js` | Task 4 |
| `src/components/PayslipExport.jsx` | Task 5 (lazy load, dipindah ke chunk terpisah via Task 9) |
| `src/components/SuratJalanCard.jsx` | Task 11 |
| `src/components/DockNav.jsx` | Task 8 |
| `src/components/TopBar.jsx` | Task 8 |
| `src/components/SectionBanner.jsx` | Task 8 |
| `package.json` | Task 12 (install @tanstack/react-virtual) |

---

## Task 1: Firestore Date Filter — surat_jalan, biaya, invoice, uang_muka, transaksi

**Files:**
- Modify: `src/App.jsx` (sekitar baris 2270–2300, bagian `useEffect` subscriptions)

**Konteks:** Saat ini semua koleksi di-load penuh tanpa filter. `surat_jalan` bisa berisi 24.000 dokumen. Kita batasi ke 12 bulan terakhir (awal bulan 12 bulan lalu) dengan menambahkan `where()` clause pada setiap query.

**Catatan penting:** Field tanggal tiap koleksi berbeda:
- `surat_jalan` → field `tanggalSJ`
- `biaya` → field `tanggal`
- `invoice` → field `tglInvoice`
- `invoices` (legacy) → field `tglInvoice`
- `uang_muka` → field `tanggal`
- `transaksi` → field `tanggal`

- [ ] **Step 1: Buka `src/App.jsx`, cari baris subscription `useEffect`**

Cari baris ~2270 di App.jsx. Pastikan `query` dan `where` sudah diimport dari `firebase/firestore`. Baris 1 App.jsx sudah import `query` dan `where` — tidak perlu tambah import.

- [ ] **Step 2: Tambah helper `getQueryStartISO` sebelum useEffect subscription**

Tambahkan tepat sebelum `useEffect` yang berisi `onSnapshot` (sekitar baris 2268, cari comment `// --- subscriptions ---` atau `const unsubSuratJalan`):

```js
// Helper: awal bulan, 12 bulan lalu — batas bawah default Firestore query
const getQueryStartISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10); // "2025-04-01"
};
```

Letakkan di scope module (di luar fungsi komponen), setelah baris import.

- [ ] **Step 3: Ubah query `surat_jalan`**

Temukan baris ini (sekitar 2297):
```js
const unsubSuratJalan = onSnapshot(collection(db, "surat_jalan"), (snap) => {
```

Ganti dengan:
```js
const qStartISO = getQueryStartISO();
const unsubSuratJalan = onSnapshot(
  query(collection(db, "surat_jalan"), where("tanggalSJ", ">=", qStartISO)),
  (snap) => {
```

- [ ] **Step 4: Ubah query `biaya`**

Temukan baris (sekitar 2302):
```js
const unsubBiaya = onSnapshot(collection(db, "biaya"), (snap) => {
```

Ganti dengan (gunakan `qStartISO` yang sudah didefinisikan di Step 3):
```js
const unsubBiaya = onSnapshot(
  query(collection(db, "biaya"), where("tanggal", ">=", qStartISO)),
  (snap) => {
```

- [ ] **Step 5: Ubah query `invoice` dan `invoices`**

Temukan (sekitar 2348):
```js
const unsubInvoice = onSnapshot(collection(db, "invoice"), (snap) => {
```
Ganti:
```js
const unsubInvoice = onSnapshot(
  query(collection(db, "invoice"), where("tglInvoice", ">=", qStartISO)),
  (snap) => {
```

Temukan (sekitar 2353):
```js
const unsubInvoiceLegacy = onSnapshot(collection(db, "invoices"), (snap) => {
```
Ganti:
```js
const unsubInvoiceLegacy = onSnapshot(
  query(collection(db, "invoices"), where("tglInvoice", ">=", qStartISO)),
  (snap) => {
```

- [ ] **Step 6: Ubah query `uang_muka`**

Temukan (sekitar 2358):
```js
const unsubUangMuka = onSnapshot(collection(db, "uang_muka"), (snap) => {
```
Ganti:
```js
const unsubUangMuka = onSnapshot(
  query(collection(db, "uang_muka"), where("tanggal", ">=", qStartISO)),
  (snap) => {
```

- [ ] **Step 7: Ubah query `transaksi`**

Temukan (sekitar 2387):
```js
const unsubTransaksi = onSnapshot(collection(db, "transaksi"), (snap) => {
```
Ganti:
```js
const unsubTransaksi = onSnapshot(
  query(collection(db, "transaksi"), where("tanggal", ">=", qStartISO)),
  (snap) => {
```

- [ ] **Step 8: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

Expected: Build sukses tanpa error. Jika ada error `index-needed`, pastikan `query` sudah diimport di baris 1.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "perf: add 12-month date filter to firestore subscriptions"
```

---

## Task 2: history_log — Ubah dari Real-time ke On-demand

**Files:**
- Modify: `src/App.jsx`

**Konteks:** `history_log` tidak butuh real-time. Saat ini di-subscribe terus-menerus. Kita ganti dengan `getDocs` yang hanya dipanggil saat user melihat panel history.

- [ ] **Step 1: Temukan dan hapus `unsubHistory`**

Di `src/App.jsx`, temukan (sekitar baris 2372):
```js
const unsubHistory = onSnapshot(collection(db, "history_log"), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  data.sort((a, b) => (new Date(b?.timestamp).getTime() || 0) - (new Date(a?.timestamp).getTime() || 0));
  setHistoryLog(data);
}, (err) => {
  console.warn('[subscription] history_log tidak dapat diakses (role tidak cukup):', err.code);
  setHistoryLog([]);
});
```

Hapus seluruh blok `const unsubHistory = onSnapshot(...)`.

- [ ] **Step 2: Hapus `unsubHistory()` dari cleanup**

Temukan di bagian return useEffect (sekitar baris 2410):
```js
try { unsubHistory(); } catch {}
```
Hapus baris ini.

- [ ] **Step 3: Tambah fungsi `fetchHistoryLog`**

Tambahkan fungsi ini di dalam komponen `SuratJalanMonitor` (di luar useEffect, setelah semua useState):
```js
const fetchHistoryLog = useCallback(async () => {
  try {
    const snap = await getDocs(collection(db, "history_log"));
    const data = snap.docs
      .map((d) => {
        const row = d.data() || {};
        return { ...row, id: row.id || d.id };
      })
      .filter((x) => !x?.deletedAt && x?.isActive !== false);
    data.sort((a, b) => (new Date(b?.timestamp).getTime() || 0) - (new Date(a?.timestamp).getTime() || 0));
    setHistoryLog(data);
  } catch (err) {
    console.warn('[fetch] history_log tidak dapat diakses:', err.code);
    setHistoryLog([]);
  }
}, []);
```

Pastikan `useCallback` sudah diimport dari 'react' (tambahkan ke baris 4 jika belum ada).

- [ ] **Step 4: Panggil `fetchHistoryLog` saat tab history dibuka**

Cari di App.jsx bagian yang menampilkan `historyLog` (cari `historyLog.map` atau panel dengan tab history). Temukan handler `setActiveTab` atau kondisi `activeTab === 'history'` (atau nama tab yang relevan).

Tambahkan `useEffect` untuk trigger fetch saat tab history aktif. Tambahkan setelah `fetchHistoryLog` didefinisikan:
```js
useEffect(() => {
  if (activeTab === 'history' || activeTab === 'log') {
    fetchHistoryLog();
  }
}, [activeTab, fetchHistoryLog]);
```

**Catatan:** Sesuaikan nama tab (`'history'` atau `'log'`) dengan nilai aktual `activeTab` yang digunakan di app. Cari `setActiveTab('history')` atau tombol yang membuka panel log untuk mengetahui nama tab-nya.

- [ ] **Step 5: Verifikasi build dan test manual**

```bash
cd c:/Project/sj-monitor && npm run build
```

Buka app → navigasi ke tab history/log → verifikasi data muncul (walaupun ada jeda ~1 detik saat pertama dibuka).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "perf: convert history_log from realtime listener to on-demand getDocs"
```

---

## Task 3: Vite Bundle Chunk Splitting

**Files:**
- Modify: `vite.config.js`

**Konteks:** Saat ini semua vendor (Firebase ~600KB, framer-motion ~150KB, React ~150KB) dibundle jadi 1 file 1.6MB. Dengan manual chunks, browser bisa cache setiap vendor secara terpisah.

- [ ] **Step 1: Buka `vite.config.js` dan ganti isinya**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
          ],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
})
```

- [ ] **Step 2: Verifikasi build dan cek ukuran chunk**

```bash
cd c:/Project/sj-monitor && npm run build
```

Expected output: Multiple `.js` files di `dist/assets/`:
- `vendor-react-*.js` (~150KB)
- `vendor-firebase-*.js` (~600KB)
- `vendor-motion-*.js` (~150KB)
- `vendor-icons-*.js` (~100KB)
- `index-*.js` (jauh lebih kecil dari sebelumnya ~150-300KB)

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "perf: add vite manual chunk splitting for vendor libraries"
```

---

## Task 4: Lazy Load XLSX di `excel.js`

**Files:**
- Modify: `src/utils/excel.js`

**Konteks:** `excel.js` mengimport `xlsx` secara statis di baris 2, yang berarti ~300KB XLSX selalu dibundle ke main chunk. Kita ubah ke dynamic import di dalam setiap fungsi export.

- [ ] **Step 1: Baca `src/utils/excel.js` untuk memahami semua fungsi yang export**

Pastikan kamu tahu nama semua fungsi yang diexport dari file ini (misal `downloadSJRecapToExcel`, `exportLabaKotorToExcel`).

- [ ] **Step 2: Hapus import statis XLSX di baris 2**

Hapus:
```js
import * as XLSX from 'xlsx';
```

- [ ] **Step 3: Tambah dynamic import di dalam setiap fungsi export**

Setiap fungsi yang menggunakan `XLSX` harus diubah menjadi `async` dan menambahkan dynamic import di awal fungsi. Contoh untuk `downloadSJRecapToExcel`:

```js
// Sebelum
export const downloadSJRecapToExcel = (suratJalanList = [], options = {}) => {
  // ... gunakan XLSX
};

// Sesudah
export const downloadSJRecapToExcel = async (suratJalanList = [], options = {}) => {
  const XLSX = await import('xlsx');
  // ... sisa logika tidak berubah sama sekali
};
```

Lakukan untuk semua fungsi di `excel.js` yang menggunakan `XLSX`.

- [ ] **Step 4: Update caller di `App.jsx` untuk handle Promise**

Cari semua tempat di `App.jsx` yang memanggil fungsi dari `excel.js` (cari `downloadSJRecapToExcel`, `exportLabaKotorToExcel`). Tambahkan `await` dan bungkus dalam async handler jika belum ada.

Contoh:
```js
// Sebelum
const handleExportSJRecap = () => {
  downloadSJRecapToExcel(filteredSuratJalan, options);
};

// Sesudah
const handleExportSJRecap = async () => {
  await downloadSJRecapToExcel(filteredSuratJalan, options);
};
```

- [ ] **Step 5: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

Expected: Build sukses. File `xlsx` tidak lagi muncul di chunk utama (terpisah sebagai lazy chunk).

- [ ] **Step 6: Test manual export**

Jalankan dev server dan klik tombol Export Excel — verifikasi file ter-download dengan benar.

```bash
cd c:/Project/sj-monitor && npm run dev
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/excel.js src/App.jsx
git commit -m "perf: lazy load xlsx in excel.js with dynamic import"
```

---

## Task 5: Lazy Load jsPDF + XLSX di PayslipExport

**Files:**
- Modify: `src/components/PayslipExport.jsx`

**Konteks:** `PayslipExport.jsx` mengimport `xlsx`, `jspdf`, dan `jspdf-autotable` secara statis. File ini dipakai hanya di fitur Payslip. Kita ubah ke dynamic import.

- [ ] **Step 1: Buka `src/components/PayslipExport.jsx`, temukan import di baris 2-4**

```js
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
```

Hapus ketiga baris import ini.

- [ ] **Step 2: Temukan fungsi export di PayslipExport.jsx yang menggunakan library ini**

Cari semua fungsi (kemungkinan handler export PDF atau Excel). Ubah setiap fungsi menjadi `async` dan tambahkan dynamic import.

Untuk jsPDF:
```js
const { default: jsPDF } = await import('jspdf');
await import('jspdf-autotable');
```

Untuk XLSX:
```js
const XLSX = await import('xlsx');
```

- [ ] **Step 3: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

Expected: Build sukses, jspdf tidak muncul di main chunk.

- [ ] **Step 4: Test manual payslip export**

Buka fitur Payslip → klik Export → verifikasi PDF/Excel ter-generate dengan benar.

- [ ] **Step 5: Commit**

```bash
git add src/components/PayslipExport.jsx
git commit -m "perf: lazy load jspdf and xlsx in PayslipExport component"
```

---

## Task 6: React.lazy untuk Pages yang Sudah Terpisah

**Files:**
- Modify: `src/App.jsx`

**Konteks:** `LaporanKasPage`, `LaporanTrukPage`, `PayslipReport`, dan `RitasiBulkUpload` sudah ada di file terpisah tapi diimport secara statis. Kita lazy load mereka — masing-masing hanya didownload saat tab-nya dibuka.

- [ ] **Step 1: Tambah `Suspense` ke React imports di baris 4 App.jsx**

Ubah baris 4:
```js
import React, { useState, useEffect, useRef } from 'react';
```
Menjadi:
```js
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
```

(Sekaligus tambah `useCallback` dan `useMemo` yang akan dipakai di task berikutnya.)

- [ ] **Step 2: Ganti import statis dengan React.lazy**

Di `src/App.jsx`, temukan (sekitar baris 19-22):
```js
import LaporanKasPage from './pages/LaporanKasPage.jsx';
import LaporanTrukPage from './pages/LaporanTrukPage.jsx';
import PayslipReport from './components/PayslipReport.jsx';
import RitasiBulkUpload from './components/RitasiBulkUpload.jsx';
```

Ganti keempat baris ini dengan:
```js
const LaporanKasPage    = React.lazy(() => import('./pages/LaporanKasPage.jsx'));
const LaporanTrukPage   = React.lazy(() => import('./pages/LaporanTrukPage.jsx'));
const PayslipReport     = React.lazy(() => import('./components/PayslipReport.jsx'));
const RitasiBulkUpload  = React.lazy(() => import('./components/RitasiBulkUpload.jsx'));
```

- [ ] **Step 3: Bungkus render lazy components dengan Suspense**

Cari di JSX render setiap komponen di atas. Temukan semua tempat di App.jsx yang merender `<LaporanKasPage`, `<LaporanTrukPage`, `<PayslipReport`, `<RitasiBulkUpload`. Bungkus masing-masing dengan:

```jsx
<Suspense fallback={
  <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
    Memuat...
  </div>
}>
  <LaporanKasPage ... />
</Suspense>
```

Lakukan untuk keempat komponen. Gunakan fallback div yang sama untuk konsistensi.

- [ ] **Step 4: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

Expected: Muncul chunk baru `LaporanKasPage-*.js`, `LaporanTrukPage-*.js`, dll di `dist/assets/`.

- [ ] **Step 5: Test semua tab**

Buka app → navigasi ke Laporan Kas, Laporan Truk, Payslip, dan Ritasi Bulk Upload. Verifikasi setiap tab muncul dengan benar (mungkin ada loading sebentar pertama kali).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "perf: lazy load LaporanKasPage, LaporanTrukPage, PayslipReport, RitasiBulkUpload"
```

---

## Task 7: Framer Motion — Prefers Reduced Motion

**Files:**
- Modify: `src/components/DockNav.jsx`
- Modify: `src/components/TopBar.jsx`
- Modify: `src/components/SectionBanner.jsx`
- Modify: `src/App.jsx` (motion divs di dalam komponen)

**Konteks:** HP Android low/mid-end yang user aktifkan "Reduce Motion" di pengaturan aksesibilitas akan mendapat animasi yang dimatikan secara otomatis, mengurangi beban CPU.

- [ ] **Step 1: Buat helper hook `useReducedMotion` di `src/hooks/useReducedMotion.js`**

Buat file baru:
```js
// src/hooks/useReducedMotion.js
import { useState, useEffect } from 'react';

export function useReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setPrefersReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
```

- [ ] **Step 2: Terapkan di `DockNav.jsx`**

Buka `src/components/DockNav.jsx`. Tambahkan import di baris 1:
```js
import { useReducedMotion } from '../hooks/useReducedMotion.js';
```

Di dalam fungsi `DockNav`, tambahkan di baris pertama:
```js
const prefersReducedMotion = useReducedMotion();
```

Temukan semua object spring (misalnya `entrySpring`, `layoutSpring`, `labelSpring`, `tapSpring`). Ubah menjadi conditional:
```js
const entrySpring  = prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 20, mass: 0.8 };
const layoutSpring = prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 };
const labelSpring  = prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22, mass: 0.6 };
const tapSpring    = prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 28, mass: 0.5 };
```

- [ ] **Step 3: Terapkan di `TopBar.jsx`**

Import dan pakai `useReducedMotion` yang sama. Temukan semua `transition` prop pada `motion.*` elements dan bungkus conditional:
```js
const prefersReducedMotion = useReducedMotion();
const springTransition = prefersReducedMotion
  ? { duration: 0 }
  : { type: "spring", stiffness: 150, damping: 20 };
```

- [ ] **Step 4: Terapkan di `SectionBanner.jsx`**

Sama seperti TopBar — import `useReducedMotion`, buat `springTransition` conditional, apply ke semua `transition` props.

- [ ] **Step 5: Terapkan di `App.jsx`**

Cari semua `motion.div`, `AnimatePresence`, dan spring transition di App.jsx. Tambahkan `useReducedMotion` di awal komponen utama dan bungkus setiap spring config dengan conditional yang sama.

- [ ] **Step 6: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReducedMotion.js src/components/DockNav.jsx src/components/TopBar.jsx src/components/SectionBanner.jsx src/App.jsx
git commit -m "perf: add prefers-reduced-motion support for framer motion animations"
```

---

## Task 8: React.memo pada SuratJalanCard

**Files:**
- Modify: `src/components/SuratJalanCard.jsx`

**Konteks:** `SuratJalanCard` dirender ratusan kali sekaligus. Tanpa memo, setiap state change di parent (misalnya user ketik di search bar) menyebabkan semua kartu re-render. Dengan `React.memo` dan custom comparator, kartu hanya re-render jika data SJ-nya berubah.

- [ ] **Step 1: Buka `src/components/SuratJalanCard.jsx`, tambahkan import React**

Ubah baris 2:
```js
import { useState } from 'react';
```
Menjadi:
```js
import React, { useState } from 'react';
```

- [ ] **Step 2: Bungkus export dengan React.memo**

Temukan baris terakhir file (kemungkinan `export default SuratJalanCard`). Ganti dengan:
```js
export default React.memo(SuratJalanCard, (prev, next) => {
  // Re-render hanya jika ID atau waktu update SJ berubah
  return (
    prev.suratJalan?.id === next.suratJalan?.id &&
    prev.suratJalan?.updatedAt === next.suratJalan?.updatedAt &&
    prev.suratJalan?.status === next.suratJalan?.status
  );
});
```

- [ ] **Step 3: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SuratJalanCard.jsx
git commit -m "perf: add React.memo with custom comparator to SuratJalanCard"
```

---

## Task 9: Install @tanstack/react-virtual

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install dependency**

```bash
cd c:/Project/sj-monitor && npm install @tanstack/react-virtual
```

Expected: `@tanstack/react-virtual` muncul di `dependencies` di `package.json`.

- [ ] **Step 2: Verifikasi install**

```bash
cd c:/Project/sj-monitor && npm ls @tanstack/react-virtual
```

Expected output: `@tanstack/react-virtual@X.X.X`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "perf: add @tanstack/react-virtual for list virtualization"
```

---

## Task 10: useMemo untuk Computed Lists

**Files:**
- Modify: `src/App.jsx`

**Konteks:** Filter dan sort untuk `suratJalanList`, `invoiceList`, `uangMukaList` saat ini dihitung ulang setiap render. Dengan `useMemo`, hasil hanya dihitung ulang saat data atau filter berubah.

- [ ] **Step 1: Temukan computed `filteredSuratJalan` di App.jsx**

Cari pola seperti:
```js
const filteredSJ = suratJalanList.filter(sj => ...).sort(...)
```
atau
```js
suratJalanList.filter(...).map(sj => <SuratJalanCard .../>)
```

Identifikasi semua variabel filter yang relevan (misalnya `filter`, `activeFilter`, `sjRecapStartDate`, `sjRecapEndDate`, dll).

- [ ] **Step 2: Bungkus dengan useMemo**

```js
const filteredSuratJalan = useMemo(() => {
  // Salin logika filter yang sudah ada — tidak ada perubahan logika
  return suratJalanList
    .filter(sj => /* filter conditions yang sudah ada */)
    .sort(/* sort logic yang sudah ada */);
}, [suratJalanList, filter, /* semua state filter yang relevan */]);
```

- [ ] **Step 3: Temukan dan bungkus computed invoice totals**

Cari kalkulasi total invoice (kemungkinan memakai `reduce` atau loop di atas `invoiceList`). Bungkus dengan `useMemo`:
```js
const invoiceTotals = useMemo(() => {
  // Salin logika yang sudah ada
  return invoiceList.reduce((acc, inv) => { /* ... */ }, {});
}, [invoiceList]);
```

- [ ] **Step 4: Lakukan hal yang sama untuk `filteredUangMuka`**

Cari filter `uangMukaList` di App.jsx (kemungkinan ada `searchUM` state). Bungkus dengan `useMemo`.

- [ ] **Step 5: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "perf: wrap filteredSuratJalan, invoiceTotals, filteredUangMuka in useMemo"
```

---

## Task 11: useCallback untuk SuratJalanCard Handlers

**Files:**
- Modify: `src/App.jsx`

**Konteks:** Tanpa `useCallback`, setiap render App.jsx membuat fungsi baru untuk setiap handler (onUpdate, onMarkGagal, onRestore, dll). Ini membuat React.memo di Task 8 tidak efektif karena props fungsinya selalu "baru". `useCallback` memoize fungsi sehingga React.memo benar-benar bekerja.

- [ ] **Step 1: Temukan semua handler yang dikirim ke `<SuratJalanCard>`**

Di App.jsx, cari semua `<SuratJalanCard` dan catat setiap prop fungsi yang dikirim (misalnya `onUpdate`, `onMarkGagal`, `onRestore`, `onEditTerkirim`, `onDeleteBiaya`).

- [ ] **Step 2: Bungkus setiap handler dengan `useCallback`**

Untuk setiap handler, tambahkan `useCallback`. Contoh:
```js
// Sebelum
const handleMarkGagal = (id, alasan) => {
  // ... logika yang sudah ada
};

// Sesudah
const handleMarkGagal = useCallback(async (id, alasan) => {
  // ... logika yang sudah ada persis sama
}, [currentUser, /* semua state/ref yang dipakai di dalam fungsi */]);
```

Ulangi untuk semua handler yang menjadi props SuratJalanCard.

- [ ] **Step 3: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

- [ ] **Step 4: Test manual**

Buka app → buka tab Surat Jalan → coba scroll, klik Edit, klik Mark Gagal. Pastikan semua masih berfungsi.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "perf: wrap SuratJalanCard event handlers in useCallback"
```

---

## Task 12: Virtualisasi List Surat Jalan

**Files:**
- Modify: `src/App.jsx`

**Konteks:** Tanpa virtualisasi, semua kartu SJ di-render ke DOM sekaligus. Dengan `useVirtualizer`, hanya ~10-15 kartu yang terlihat di layar yang ada di DOM — kartu lain tidak dirender sampai di-scroll ke sana. Tampilan dan perilaku identik.

- [ ] **Step 1: Tambah import useVirtualizer di App.jsx**

Di bagian atas `src/App.jsx`, tambahkan:
```js
import { useVirtualizer } from '@tanstack/react-virtual';
```

- [ ] **Step 2: Temukan bagian yang merender list SuratJalanCard**

Cari di App.jsx pola seperti:
```jsx
{filteredSuratJalan.map(sj => (
  <SuratJalanCard key={sj.id} ... />
))}
```

- [ ] **Step 3: Tambah ref untuk scroll container**

Tepat sebelum useVirtualizer, tambahkan ref (bisa di bagian atas komponen bersama useState lainnya):
```js
const sjListParentRef = useRef(null);
```

- [ ] **Step 4: Ganti `.map()` dengan virtualizer**

Ganti pola map di atas dengan:
```jsx
// Tambah virtualizer (letakkan di dalam komponen, setelah filteredSuratJalan tersedia)
const sjVirtualizer = useVirtualizer({
  count: filteredSuratJalan.length,
  getScrollElement: () => sjListParentRef.current,
  estimateSize: () => 130, // estimasi tinggi 1 kartu SuratJalan dalam pixel
  overscan: 5,             // render 5 item extra di luar viewport untuk scroll smooth
});

// Ganti bagian render list:
<div
  ref={sjListParentRef}
  style={{ height: '70vh', overflowY: 'auto' }}
>
  <div style={{ height: `${sjVirtualizer.getTotalSize()}px`, position: 'relative' }}>
    {sjVirtualizer.getVirtualItems().map((virtualItem) => {
      const sj = filteredSuratJalan[virtualItem.index];
      return (
        <div
          key={virtualItem.key}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          <SuratJalanCard
            suratJalan={sj}
            biayaList={biayaList.filter(b => b.suratJalanId === sj.id)}
            totalBiaya={/* kalkulasi yang sudah ada */}
            currentUser={currentUser}
            onUpdate={handleUpdate}
            onMarkGagal={handleMarkGagal}
            onRestore={handleRestore}
            onEditTerkirim={handleEditTerkirim}
            onDeleteBiaya={handleDeleteBiaya}
            formatCurrency={formatCurrency}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
          />
        </div>
      );
    })}
  </div>
</div>
```

**Catatan:** Sesuaikan nama props dengan props aktual yang dikirim ke SuratJalanCard (cek di kode asli).

- [ ] **Step 5: Sesuaikan `estimateSize`**

Buka app di browser → inspect tinggi satu kartu SuratJalanCard dalam pixel (gunakan DevTools). Update `estimateSize` agar akurat. Nilai yang akurat membuat scroll lebih presisi.

- [ ] **Step 6: Verifikasi build**

```bash
cd c:/Project/sj-monitor && npm run build
```

- [ ] **Step 7: Test scroll performa**

Di Chrome DevTools → Performance → Record → scroll list SJ → Stop. Verifikasi tidak ada frame drops (frame time < 16ms).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "perf: virtualize surat jalan list with @tanstack/react-virtual"
```

---

## Verifikasi Akhir

- [ ] **Build bersih:** `cd c:/Project/sj-monitor && npm run build` — harus pass tanpa error atau warning

- [ ] **Bundle size check:** Verifikasi ukuran chunk di `dist/assets/` — main `index-*.js` harus jauh lebih kecil dari 1.6MB sebelumnya

- [ ] **Smoke test manual semua fitur:**
  - Buka app → login → verifikasi data SJ muncul
  - Scroll list SJ → harus smooth
  - Buka tab Invoice, Uang Muka, Keuangan, Master Data, Settings
  - Klik Export Excel (SJ recap) → verifikasi file ter-download
  - Buka Payslip → Export PDF → verifikasi file ter-download
  - Buka Laporan Kas, Laporan Truk → verifikasi data muncul
  - Buka Ritasi Bulk Upload → verifikasi UI muncul
  - Buka tab Log/History → verifikasi data muncul

- [ ] **Final commit jika belum:**

```bash
git add .
git commit -m "perf: complete performance overhaul - firestore filters, lazy loading, memoization, virtualization"
```
