# Design: Library Komponen UI sj-monitor (Liquid Glass)

**Tanggal:** 2026-07-04
**Status:** Disetujui user. **Eksekusi DITUNDA sampai rencana optimasi selesai**
(`docs/superpowers/plans/2026-07-03-sj-monitor-optimization.md` Fase B–C) — menghindari
konflik file dengan ekstraksi komponen Fase C.
**Pendekatan:** A — primitif custom murni, nol dependensi baru.

## 1. Tujuan

Mengkodifikasi aturan desain permanen Liquid Glass (`apps/sj-monitor/CLAUDE.md`) dari
teks-yang-harus-diingat menjadi library komponen reusable yang production-ready:
konsisten, aksesibel, responsive, dengan loading/empty/error state kelas satu, API
terdokumentasi, dan contoh pemakaian hidup.

**Non-goals:**
- Migrasi halaman existing ke library (proyek terpisah, keputusan terpisah).
- Menyentuh logika bisnis, Firestore, auth, atau routing produksi.
- Storybook / dependensi tooling baru.

## 2. Struktur

```
apps/sj-monitor/src/components/ui/
├── tokens.js        # satu-satunya sumber aturan LG: kelas glass (blur ≥20px,
│                    # border putih 0.5px, shadow dalam), radius (2xl/3xl),
│                    # spring presets ({150,20}/{200,25}/{100,20}), focus-ring,
│                    # touch-target min 44px
├── cn.js            # helper gabung className
├── Button.jsx  Card.jsx  TextField.jsx  SelectField.jsx  Dialog.jsx
├── Badge.jsx  Spinner.jsx  Skeleton.jsx  EmptyState.jsx  Alert.jsx
└── index.js         # barrel export
```

Sepuluh primitif (YAGNI — cukup untuk menyusun pola UI yang ada). `Dialog` dinamai
demikian agar tidak bentrok `components/Modal.jsx` hasil Fase C1.

## 3. Konvensi API

- JSX + JSDoc `@param` (bukan TSX; konsisten repo). PropTypes tidak dipakai.
- Props seragam: Button `variant` (primary/secondary/ghost/danger), `size` (sm/md/lg),
  `loading` (spinner + disabled otomatis), `disabled`; field `label`/`error`/`hint`
  dengan auto-wiring `id` + `aria-describedby` + `aria-invalid`.
- Semua komponen interaktif `forwardRef`; semua menerima `className` (merge via `cn`)
  dan meneruskan `...rest` ke elemen root.
- State kelas satu: `Skeleton` (placeholder list/card), `EmptyState` (ikon+judul+
  deskripsi+aksi opsional), `Alert` (info/success/error/warning), `Spinner` (ukuran).
- Semua animasi memakai spring preset `tokens.js` dan menghormati `useReducedMotion`
  (hook existing `src/hooks/useReducedMotion.js`).

## 4. Aksesibilitas & Responsive

- `Dialog`: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; focus-trap
  manual via hook baru `useFocusTrap` (Tab/Shift+Tab berputar di dalam); Escape
  menutup; fokus kembali ke elemen pemicu saat tutup; backdrop klik menutup
  (bisa dimatikan via prop).
- `SelectField`: keyboard penuh (ArrowUp/Down, Enter, Escape, ketik-untuk-cari),
  `aria-expanded`/`role="listbox"`/`aria-activedescendant`.
- Focus ring terlihat (`focus-visible:ring-2`) pada SEMUA elemen interaktif —
  didefinisikan sekali di `tokens.js`.
- Touch target ≥ 44×44px; layout mobile-first (viewport utama user = HP).
- Kontras: teks di atas permukaan glass diuji terhadap latar gelap `#0f172a`.

## 5. Pengujian

Vitest + Testing Library per komponen di `src/components/ui/__tests__/`, mengikuti
pola environment test existing repo. Yang diuji: render semua varian & state, kontrak
a11y (role/label/keyboard: Dialog trap+Escape, SelectField arrows), wiring
`aria-describedby` saat `error`, `loading` men-disable Button. Bukan snapshot-only.

## 6. Dokumentasi & Galeri

- `docs/ui/<Komponen>.md` per komponen: tabel props (nama, tipe, default, wajib?),
  contoh kode minimal + contoh state (loading/empty/error), panduan kapan dipakai.
- Galeri `/ui-lab`: route React.lazy yang HANYA didaftarkan saat `import.meta.env.DEV`
  (tidak masuk bundle produksi — diverifikasi saat build). Menampilkan semua komponen
  × semua varian × semua state, jadi alat uji visual + dokumentasi hidup.

## 7. Kriteria Sukses

- 10 komponen + tokens + cn + index, semua test pass, lint 0 error, build produksi
  tidak memuat `/ui-lab` (cek isi chunk).
- Setiap aturan LG di CLAUDE.md terwakili di `tokens.js` (blur, border, shadow,
  radius, spring, pill nav tidak termasuk — itu layout, bukan primitif).
- Dokumen MD lengkap untuk 10 komponen; galeri menampilkan semuanya.
- Nol dependensi baru di package.json; nol perubahan pada halaman/logic existing.

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Focus-trap / listbox a11y salah (titik tersulit pendekatan custom) | Test keyboard eksplisit; jika saat implementasi terbukti rapuh, eskalasi ke user dengan opsi hybrid Radix (keputusan baru, bukan diam-diam) |
| Library dibangun tapi tak terpakai (shelf-ware) | Galeri /ui-lab jadi bukti hidup; proyek migrasi halaman diusulkan terpisah setelah library stabil |
| Konflik dengan refactor Fase C | Eksekusi ditunda sampai optimasi selesai; file ui/ semuanya baru (tidak menyentuh file yang direfactor) |
