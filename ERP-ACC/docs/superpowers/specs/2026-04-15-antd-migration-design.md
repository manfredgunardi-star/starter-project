# Ant Design Migration — Design Spec

**Date:** 2026-04-15
**Project:** ERP-ACC (erp-app)
**Status:** Design approved, ready for implementation plan

## Context

Current UI stack: React 18 + Vite + **Tailwind CSS 4** (`@tailwindcss/vite`) + 10 custom components in `src/components/ui/` + Lucide React icons. ~9,600 LOC across 30+ page components. Bundle main chunk 1.6MB. No pagination. Native `<input type="date">` in 17 files.

Motivasi migrasi: konsistensi desain profesional tanpa styling manual.

## Locked Decisions (from brainstorm)

1. **Motivasi:** Konsistensi desain.
2. **Scope:** Full migration — semua komponen ke Ant Design.
3. **Tailwind:** Hapus sepenuhnya.
4. **Timeline:** Big bang — satu PR landing, tidak ada mixed UI di production.
5. **Theme:** Default AntD (biru `#1677ff`), tidak override token.
6. **Strategi:** **Component-first (wrapper layer)** — ganti isi `src/components/ui/` jadi wrapper AntD, page code tidak berubah.
7. **Form pattern:** Pertahankan pattern lama (manual state + validation). Tidak adopsi `<Form>` AntD.
8. **Icons:** Lucide tetap, tidak switch ke `@ant-design/icons`.
9. **Locale:** `id_ID`.

## Architecture

### Wrapper Layer

Semua file di `src/components/ui/` di-rewrite sebagai wrapper tipis di atas komponen AntD, mempertahankan API lama (nama prop, signature callback) supaya page code tidak berubah.

| File lama | Komponen AntD | Catatan |
|---|---|---|
| `Button.jsx` | `Button` | map `variant` → `type`, `size` tetap |
| `Input.jsx` | `Input` / `InputNumber` | switch internal berdasarkan `type` |
| `Select.jsx` | `Select` | map `options` prop ke children/options |
| `DataTable.jsx` | `Table` | pagination default aktif (`pageSize: 20`) |
| `Modal.jsx` | `Modal` | pertahankan `open`, `onClose`, children |
| `ConfirmDialog.jsx` | `Modal.confirm()` | ganti implementasi ke imperative API |
| `StatusBadge.jsx` | `Tag` | map color variants |
| `LoadingSpinner.jsx` | `Spin` | wrapper one-liner |
| `Toast.jsx` / `ToastContext.jsx` | `App.useApp().message` | expose hook `useToast()` dengan API lama |

Tambahan baru:

| File baru | Komponen AntD | Alasan |
|---|---|---|
| `DateInput.jsx` | `DatePicker` | ganti 17 instance `<input type="date">`; I/O tetap string ISO `YYYY-MM-DD` |

### Root Setup

`src/main.jsx` dibungkus:

```jsx
<ConfigProvider locale={idID}>
  <AntdApp>
    <App />
  </AntdApp>
</ConfigProvider>
```

`<AntdApp>` diperlukan supaya `Modal.confirm()` dan `message` API bekerja dalam context React tree.

### Tailwind Removal

Dilakukan per-halaman setelah wrapper siap:

- Layout primitif (`flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`) → `<Space>`, `<Row>/<Col>`, `<Flex>` AntD.
- Warna/typography utility → hapus, ikut theme default AntD.
- Edge case utility tanpa padanan → `style={{}}` inline atau CSS module kecil.

Terakhir: copot `@tailwindcss/vite` dari `vite.config.js`, hapus `tailwind.config.*`, bersihkan `index.css`.

## Data Flow

Tidak ada perubahan data flow. Props wrapper = props lama, sehingga page component, services (`firestoreService.js`, `assetService.js`, dll), dan state management tetap utuh.

**DateInput I/O:**
- Input ke wrapper: string `YYYY-MM-DD` (sama seperti `<input type="date">`).
- Output dari wrapper (via `onChange`): string `YYYY-MM-DD`.
- Internal: konversi ke/dari `dayjs` untuk AntD `DatePicker`.

## Error Handling

- **ConfirmDialog → `Modal.confirm()`:** pastikan caller tidak relying on React tree mount state; imperative API dipanggil dari event handler.
- **Toast hook:** jika wrapper dipanggil di luar `<AntdApp>`, tampilkan `console.warn` dan no-op (tidak throw) supaya tidak crash production.
- **DataTable pagination:** kalau parent mengontrol pagination via props lama, wrapper harus mendeteksi dan switch ke controlled mode AntD Table.

## Bundle Size

Target: main chunk < 3MB (dari 1.6MB saat ini). Mitigasi jika melebihi:

1. Aktifkan tree-shaking (AntD v5 default sudah tree-shake ES modules).
2. Manual chunk splitting di `vite.config.js` untuk `antd`.
3. Lazy-load halaman berat (Laporan, AsetPage) dengan `React.lazy()`.

## Verification Plan

1. **Build:** `cd erp-app && npm run build` harus pass tanpa error/warning baru.
2. **Smoke test manual per modul:**
   - COA list + add/edit
   - Jurnal: form debit/kredit balance, posting
   - Kas/Bank: transaksi in/out
   - Penjualan, Biaya: form + list
   - Aset: form create, depreciation preview + post, disposal preview + execute
   - Laporan: Neraca, Laba Rugi, Buku Besar (tabel besar + export Excel/PDF)
   - Auth: login, role-guarded pages, RoleGuard loading state
3. **Visual check:** tidak ada halaman putih, layout tidak rusak, modal/toast/confirm bekerja.
4. **Bundle size check:** `npm run build` output < 3MB main chunk.

## Out of Scope

- Adopsi `<Form>` AntD untuk validasi built-in.
- Switch icon dari Lucide ke `@ant-design/icons`.
- Override theme token (custom warna, radius, dll).
- Dark mode.
- Refactor `App.jsx` monolith.

## Migration Execution Order (preview — detail di implementation plan)

1. Install `antd` + `dayjs`, setup `ConfigProvider` + `AntdApp` di `main.jsx`.
2. Rewrite wrapper components satu-per-satu di `src/components/ui/` (build harus tetap pass tiap step).
3. Buat `DateInput.jsx`, ganti 17 instance `<input type="date">`.
4. Sweep Tailwind utility classes per-halaman.
5. Copot Tailwind dari build config.
6. Smoke test full + bundle size verification.
