# Performance Overhaul — sj-monitor
**Date:** 2026-04-23
**Status:** Approved

---

## Context

sj-monitor adalah React SPA yang diakses mayoritas user via HP Android di jaringan 4G. App saat ini mengalami kelambatan di semua aspek: loading awal, scrolling, dan filter/search. Penyebabnya adalah kombinasi dari bundle JS yang besar (1.6MB), Firestore yang load 24.000+ dokumen tanpa filter, tidak ada memoization, dan semua komponen re-render setiap ada perubahan state. Tujuan overhaul ini adalah mempercepat app secara signifikan **tanpa mengubah tampilan atau alur kerja user sama sekali**.

---

## Scope

Empat area optimasi independen, dikerjakan secara berurutan:

1. Firestore Data Layer
2. Bundle Size & Code Splitting
3. React Rendering Performance
4. Framer Motion (mobile)

---

## Section 1 — Firestore Data Layer

### Tujuan
Kurangi jumlah dokumen yang di-load dari ~24.000 ke ~500-1.000 (hanya 2 bulan terakhir).

### Perubahan

**Default date filter pada 5 koleksi besar:**
Tambahkan `where("tanggal", ">=", duaBulanLalu)` di query `onSnapshot` untuk:
- `surat_jalan`
- `invoice` dan `invoices` (legacy)
- `uang_muka`
- `biaya`
- `transaksi`

Nilai `duaBulanLalu` dihitung sekali saat komponen mount: `startOfMonth(subMonths(new Date(), 1))` — awal bulan lalu. Gunakan date manipulation sederhana tanpa library tambahan.

UI filter periode yang sudah ada di app tetap berfungsi normal. Saat user memilih periode lebih lama, query di-update dengan range tanggal yang sesuai.

**history_log — ubah ke on-demand:**
Hapus `onSnapshot` untuk `history_log`. Ganti dengan `getDocs` yang dipanggil hanya saat user membuka panel history (lazy fetch). Ini menghapus 1 real-time listener dan mengurangi reads secara signifikan.

**Master data — tidak berubah:**
`trucks`, `supir`, `rute`, `material` tetap load semua karena jumlahnya kecil dan dibutuhkan di semua tab.

### File yang diubah
- [src/App.jsx](../../src/App.jsx) — 8 `onSnapshot` calls (lines ~2297–2387)
- [src/hooks/useMasterData.js](../../src/hooks/useMasterData.js) — tidak berubah

### Estimasi impact
Loading awal: ~15 detik → ~2-3 detik

---

## Section 2 — Bundle Size & Code Splitting

### Tujuan
Turunkan ukuran JS yang harus didownload saat pertama kali buka app dari 1.6MB ke ~400KB.

### Perubahan

**Lazy load jspdf + xlsx:**
Ubah semua import statis menjadi dynamic import dalam fungsi export handler:

```js
// Sebelum
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'

// Sesudah — hanya didownload saat user klik Export
async function handleExportPDF() {
  const { jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  // ... logika export tetap sama
}

async function handleExportExcel() {
  const XLSX = await import('xlsx')
  // ... logika export tetap sama
}
```

Jeda ~1 detik saat pertama kali klik Export (download library ~700KB). Setelahnya cached oleh browser.

**Vite manual chunk splitting** di `vite.config.js`:

```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        'vendor-motion': ['framer-motion'],
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
      }
    }
  }
}
```

Chunks vendor di-cache browser secara terpisah — update code app tidak invalidate cache Firebase/React.

**React.lazy untuk tab jarang dibuka:**
Ekstrak komponen besar ke file terpisah, lalu lazy load:

```jsx
const SettingsManagement = React.lazy(() => import('./components/SettingsManagement'))
const MasterDataManagement = React.lazy(() => import('./components/MasterDataManagement'))
const UsersManagement = React.lazy(() => import('./components/UsersManagement'))
const KeuanganManagement = React.lazy(() => import('./components/KeuanganManagement'))
```

Wrapped dengan `<Suspense fallback={<LoadingSpinner />}>` — spinner menggunakan design yang sudah ada di app.

### File yang diubah
- [vite.config.js](../../vite.config.js) — tambah manualChunks
- [src/App.jsx](../../src/App.jsx) — ubah import statis ke dynamic, tambah React.lazy
- [src/utils/excel.js](../../src/utils/excel.js) — ekstrak logika XLSX ke util
- Komponen baru: `src/components/SettingsManagement.jsx`, `src/components/MasterDataManagement.jsx`, `src/components/UsersManagement.jsx`, `src/components/KeuanganManagement.jsx` (ekstrak dari App.jsx)

### Estimasi impact
Bundle awal: 1.6MB → ~400KB. Kunjungan berikutnya lebih cepat karena vendor chunks di-cache.

---

## Section 3 — React Rendering Performance

### Tujuan
Hilangkan re-render yang tidak perlu agar UI responsif saat scroll, klik, dan filter.

### Perubahan

**React.memo pada SuratJalanCard:**

```jsx
export default React.memo(SuratJalanCard, (prevProps, nextProps) => {
  return prevProps.sj.id === nextProps.sj.id &&
         prevProps.sj.updatedAt === nextProps.sj.updatedAt
})
```

Custom comparator — hanya re-render jika ID atau waktu update berubah.

**useCallback untuk semua handlers yang dikirim ke SuratJalanCard:**

```jsx
const handleEdit = useCallback((sj) => { /* ... */ }, [/* deps */])
const handleMarkGagal = useCallback((id) => { /* ... */ }, [/* deps */])
// dst untuk semua handler
```

Tanpa useCallback, React.memo tidak efektif karena props fungsi selalu baru setiap render.

**useMemo untuk computed/filtered lists:**

```jsx
const filteredSuratJalan = useMemo(() =>
  allSuratJalan
    .filter(sj => /* filter conditions */)
    .sort(/* sort logic */),
  [allSuratJalan, filterPeriode, filterStatus, filterSupir, searchQuery]
)

const invoiceTotals = useMemo(() =>
  calculateInvoiceTotals(invoiceList),
  [invoiceList]
)
```

Identifikasi semua computed values di App.jsx yang saat ini dihitung inline dan bungkus dengan useMemo.

**Virtualisasi list SuratJalan:**
Install `@tanstack/react-virtual` (~10KB). Hanya render kartu yang terlihat di viewport.

```jsx
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: filteredSuratJalan.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 120, // estimasi tinggi 1 kartu SuratJalan
})
```

Styling dan tampilan kartu tidak berubah. SuratJalanCard yang sudah ada dipakai langsung.

### File yang diubah
- [src/components/SuratJalanCard.jsx](../../src/components/SuratJalanCard.jsx) — tambah React.memo
- [src/App.jsx](../../src/App.jsx) — tambah useCallback, useMemo, virtualizer setup

### Dependensi baru
- `@tanstack/react-virtual` — tambahkan ke package.json

### Estimasi impact
UI lag saat scroll: ~300ms → hampir instan. RAM usage turun ~60%.

---

## Section 4 — Framer Motion (Mobile)

### Tujuan
Cegah animasi spring physics membebani HP Android mid/low-end.

### Perubahan

Tambahkan deteksi `prefers-reduced-motion` di level app dan kirim sebagai prop/context ke komponen animasi:

```jsx
// Di App.jsx atau main.jsx
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Di komponen yang pakai motion
const transition = prefersReducedMotion
  ? { duration: 0 }
  : { type: "spring", stiffness: 150, damping: 20 }
```

User yang tidak mengaktifkan Reduce Motion di HP tidak melihat perubahan. User yang mengaktifkannya (biasanya di HP lama atau karena aksesibilitas) mendapat UI tanpa animasi yang lebih ringan.

### File yang diubah
- [src/components/DockNav.jsx](../../src/components/DockNav.jsx)
- [src/components/TopBar.jsx](../../src/components/TopBar.jsx)
- [src/components/SectionBanner.jsx](../../src/components/SectionBanner.jsx)
- [src/App.jsx](../../src/App.jsx) — motion divs

---

## Urutan Implementasi

Dikerjakan berurutan karena Section 2 (ekstrak komponen dari App.jsx) adalah prasyarat Section 3.

1. **Section 1** — Firestore date filter (paling impactful, paling aman, tidak ada dependencies)
2. **Section 4** — Framer Motion (kecil, bisa dikerjakan kapan saja)
3. **Section 2** — Bundle splitting + ekstrak komponen dari App.jsx
4. **Section 3** — Memoization + virtualisasi (setelah komponen terekstrak)

---

## Verifikasi

Setelah setiap section selesai:

1. `npm run build` — harus pass tanpa error
2. Buka app di Chrome DevTools → Network → throttle ke "Fast 4G" → ukur waktu loading
3. Buka app → scroll list SJ → pastikan smooth
4. Klik Export PDF dan Export Excel — pastikan file ter-download dengan benar
5. Buka semua tab (Keuangan, Master Data, Settings, Users) — pastikan data muncul
6. Filter periode ke bulan lebih lama — pastikan data historis tetap bisa diakses

Ukuran bundle setelah build dapat dicek dengan:
```bash
cd sj-monitor && npx vite-bundle-visualizer
```

---

## Constraints

- Tidak ada perubahan visual apapun
- Tidak ada perubahan pada logika bisnis (invoice, SJ, uang muka)
- Tidak ada perubahan pada Firestore security rules
- Tidak ada breaking change pada data schema
- Hanya 1 dependensi baru: `@tanstack/react-virtual`
