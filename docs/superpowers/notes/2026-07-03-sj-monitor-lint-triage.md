# Triase Lint sj-monitor — Perluasan Cakupan ke Seluruh src/ — 2026-07-03

Konteks: Task 4 rencana `docs/superpowers/plans/2026-07-03-sj-monitor-optimization.md`.
Sebelumnya script `lint` di `apps/sj-monitor/package.json` hanya menjalankan ESLint pada
`src/utils/` dan `src/services/`. `eslint.config.js` sudah menargetkan `src/**/*.{js,jsx}`
sejak awal — hanya script npm yang membatasi cakupannya. Diubah menjadi:

```diff
- "lint": "eslint src/utils/ src/services/",
+ "lint": "eslint src/",
```

Setelah perubahan ini, `npm run lint` pertama kali menghasilkan **62 error** dan
444 warning di seluruh `src/`. Semua error sudah diselesaikan (0 error sekarang).
Warning dibiarkan sesuai instruksi task (rule `react/prop-types` dan `no-unused-vars`
memang dikonfigurasi sebagai `warn`, begitu juga `react-hooks/exhaustive-deps`).

## Ringkasan per Rule (62 error awal)

| Rule | Jumlah | Kategori |
|---|---|---|
| `react/no-unescaped-entities` | 16 | Fixed (mekanis) |
| `no-empty` | 18 | Fixed (mekanis) |
| `react-hooks/set-state-in-effect` | 13 | Disabled + catatan (behavioral) |
| `react-hooks/preserve-manual-memoization` | 6 | Disabled + catatan (false positive React Compiler) |
| `react-hooks/rules-of-hooks` | 7 | Disabled + catatan (behavioral, 1 komponen) |
| `react-hooks/immutability` | 2 | Disabled + catatan (behavioral) |

Catatan: rule-rule `react-hooks/*` di atas berasal dari `eslint-plugin-react-hooks` v7
(`recommended` config sudah di-spread di `eslint.config.js` baris 32 sejak awal —
`...reactHooks.configs.recommended.rules`). Rule ini bukan hal baru yang saya
tambahkan; mereka memang sudah dikonfigurasi sebagai `error`, hanya belum pernah
dijalankan terhadap file-file di luar `src/utils/` dan `src/services/`.

---

## 1. Fixed — Mekanis (zero behavior change)

### `react/no-unescaped-entities` (16 error, 5 file)
Tanda kutip `"` literal di dalam teks JSX diganti dengan entity `&quot;`. Tidak
mengubah teks yang dirender ke layar sama sekali (browser me-render `&quot;`
sebagai `"`).

- `src/App.jsx` baris 3423, 3845 (2 pasang, dalam modal SJ & Invoice)
- `src/components/RitasiBulkUpload.jsx` baris 211–213 (3 pasang)
- `src/components/TarifRuteBulkUpload.jsx` baris 183, 186 (2 pasang)
- `src/pages/InvoicePage.jsx` baris 257 (1 pasang)

### `no-empty` (18 error, 6 file)
Semua adalah blok `catch {}` / `catch (_) {}` kosong pada pola
"unsubscribe Firestore listener, abaikan error saat cleanup". Fix: tambahkan
komentar di dalam blok catch (mis. `/* ignore unsubscribe error */`) — blok
tidak lagi "empty" secara sintaksis, tapi perilaku runtime identik (exception
tetap ditelan, tidak ada re-throw atau logging baru).

- `src/App.jsx` baris ~1797–1802 (6× unsubscribe cleanup di listener utama)
- `src/firestoreService.js` baris 87, 92 (`resolveSuratJalanDocRef`, fallback lookup)
- `src/hooks/useAuth.js` baris 27, 132 (unsubscribe user-doc listener)
- `src/hooks/useMasterData.js` baris 55–59 (5× unsubscribe master data listener)
- `src/hooks/useSettings.js` baris 31, 55, 100 (unsubscribe settings listener +
  catch saat write forceLogout gagal)

**Catatan untuk reviewer:** blok-blok ini menelan error secara diam-diam by design
(cleanup listener saat unmount memang boleh gagal tanpa harus ditangani). Tidak
ada perubahan perilaku, tapi ini pola yang perlu diperhatikan jika suatu saat
debugging race condition — errornya sengaja tidak pernah terlihat di console.

---

## 2. Disabled + Catatan — Behavioral (TIDAK diubah logikanya)

Semua di bawah ini ditandai `eslint-disable-next-line` atau blok
`eslint-disable`/`eslint-enable` dengan alasan tertulis di kode. Tidak ada
logika yang diubah — sesuai instruksi task bahwa perubahan berperilaku harus
di-ask/didokumentasikan, bukan langsung di-refactor.

### `react-hooks/set-state-in-effect` (13 error)
Pola "reset state pagination ke halaman 1 saat filter/search berubah" atau
"sinkronisasi state lokal dari prop/Firestore". Contoh:

```js
useEffect(() => { setSJPage(1); }, [filter, searchNomorSJ, searchTanggal]);
```

Rule ini menganjurkan pola "derived state" (mis. reset via `key` prop) daripada
`setState` langsung di `useEffect`. Mengubahnya berarti restrukturisasi state
management di banyak halaman — berisiko mengubah perilaku render/pagination,
jadi di luar scope task ini (task ini murni mengaktifkan lint, bukan
memperbaiki arsitektur).

File yang terpengaruh:
- `src/App.jsx` baris 1646 (reset `sjPage`), baris 2557 (sync `flConfig` dari
  `forceLogoutConfig` Firestore)
- `src/components/PayslipReport.jsx` baris 27 (`setError` saat akses ditolak)
- `src/components/PayslipTable.jsx` baris 15 (sync `bonusAdjustments` dari prop
  `payslip` — **catatan: field `bonusAdjustment` terkait payslip/gaji, tapi ini
  cuma sinkronisasi state edit-buffer dari prop, bukan kalkulasi finansial**)
- `src/components/SwipeableRow.jsx` baris 69 (`resetDrag()` saat swipe di-disable)
- `src/pages/InvoicePage.jsx` baris 80 (reset `invPage`/`invoicePage`)
- `src/pages/KeuanganPage.jsx` baris 35 (reset `keuPage`)
- `src/pages/MasterDataPage.jsx` baris 38–47 (5 effect, reset pagination per tab)
- `src/pages/UangMukaPage.jsx` baris 42 (reset `umPage`)

**Rekomendasi untuk manusia:** kalau mau benar-benar dibersihkan, pola yang
tepat adalah derive `page` dari `useMemo` yang bereaksi ke filter (atau reset
via `key`), bukan hal darurat — semua ini presentational pagination, bukan
financial logic, jadi aman untuk backlog refactor terpisah.

### `react-hooks/preserve-manual-memoization` (6 error → 2 disable, App.jsx baris 1622 & 1628)
React Compiler (bagian dari `eslint-plugin-react-hooks` v7) menganggap
`setSelectedItem`, `setModalType`, `setShowModal` sebagai "inferred dependency"
yang seharusnyaa ada di array dependency `useCallback(..., [])`. Ini **false
positive** yang dikenal: React menjamin identitas fungsi `setState` dari
`useState` selalu stabil antar-render, jadi `[]` sebagai dependency array sudah
benar dan aman. Tidak ada perubahan perilaku yang diperlukan.

- `handleSJCardUpdate` (App.jsx baris ~1622)
- `handleSJCardEditTerkirim` (App.jsx baris ~1628)

### `react-hooks/rules-of-hooks` (7 error, 1 file: `src/pages/LaporanTrukPage.jsx`)
**Temuan paling signifikan untuk direview manusia.** Komponen ini punya early
`return` (guard `!canViewReport`, baris 15–27) **sebelum** semua pemanggilan
`useState`/`useMemo` di bawahnya (baris 31 dst). Ini pelanggaran nyata Rules of
Hooks: kalau role user berubah dari "tidak boleh akses" ke "boleh akses" di
render yang sama tanpa remount, urutan hook akan berbeda dan React bisa
menyebabkan state korup/crash.

Dalam praktiknya risiko ini kemungkinan rendah karena `currentUser.role`
biasanya tidak berubah tanpa re-mount komponen (ganti halaman/login ulang),
tapi ini tetap bug arsitektural yang sebaiknya diperbaiki dengan memindahkan
semua hook ke atas guard `if (!canViewReport)`. Perbaikan ini murni
restrukturisasi urutan kode (tidak mengubah nilai/logika apa pun), tapi saya
memilih untuk **tidak** melakukannya di task ini karena instruksi task secara
eksplisit melarang menyentuh `react-hooks/rules-of-hooks` — didokumentasikan
di sini untuk direview & diperbaiki di task terpisah.

Ditandai dengan blok `eslint-disable`/`eslint-enable` yang membungkus seluruh
bagian "State Management" & "Data Processing" di file tsb (baris ~29–55).

### `react-hooks/immutability` (2 error)
"Fungsi dipanggil sebelum dideklarasikan" — pola umum di codebase ini: sebuah
`const fn = async () => {...}` dideklarasikan di tengah komponen tapi dipanggil
dari dalam `useEffect(() => { fn(); }, [])` yang **berada di atas** deklarasi
`fn` secara tekstual. Ini aman secara runtime karena `useEffect` callback
dieksekusi setelah render selesai — pada saat itu closure sudah menangkap versi
final dari `fn` (JS variable hoisting + closure semantics). ESLint hanya
menandai ini sebagai *smell* karena tidak bisa memverifikasi urutan eksekusi
secara statis.

- `src/components/PayslipReport.jsx` baris 38 (`loadInitialData()` dipanggil
  dari `useEffect`, dideklarasikan di baris 41)
- `src/hooks/useSettings.js` baris 68 (`executeForcedLogout()` dipanggil dari
  callback interval di dalam `useEffect`, dideklarasikan di baris 93)

**Rekomendasi:** mekanisme "hoist function declaration ke atas" akan
menghilangkan warning ini tanpa mengubah perilaku sama sekali (memindahkan
kode, bukan mengubah logika) — kandidat aman untuk cleanup ringan di masa
depan, tapi di luar scope task ini (instruksi task minta perubahan seminimal
mungkin dan lebih memilih disable+catatan untuk kasus ambigu).

---

## 3. Warning yang Dibiarkan (tidak error, sesuai konfigurasi)

- `react/prop-types` (400 warning) — sudah dikonfigurasi `warn` di
  `eslint.config.js`, task tidak meminta perbaikan.
- `no-unused-vars` (37 warning) — sudah dikonfigurasi `warn` dengan
  `argsIgnorePattern: '^_'`.
- `react-hooks/exhaustive-deps` (7 warning) — bagian dari `recommended` config,
  level default `warn`.
- 4 warning pre-existing di `payslipService.js`, `session.js`,
  `truckReportHelpers.js` (sesuai catatan di task description) — tidak disentuh.

## 4. Validasi

- `npm run lint` → **0 error**, 444 warning.
- `npm test` → 64/64 pass.
- `npm run build` → sukses (33.41s, tidak ada error).

## 5. File yang Diubah

`apps/sj-monitor/package.json`, `src/App.jsx`, `src/firestoreService.js`,
`src/hooks/useAuth.js`, `src/hooks/useMasterData.js`, `src/hooks/useSettings.js`,
`src/components/PayslipReport.jsx`, `src/components/PayslipTable.jsx`,
`src/components/RitasiBulkUpload.jsx`, `src/components/SwipeableRow.jsx`,
`src/components/TarifRuteBulkUpload.jsx`, `src/pages/InvoicePage.jsx`,
`src/pages/KeuanganPage.jsx`, `src/pages/LaporanTrukPage.jsx`,
`src/pages/MasterDataPage.jsx`, `src/pages/UangMukaPage.jsx`.

Tidak ada perubahan pada logika finansial (`hargaPerRute`, `uangMuka`, pajak/PPN/PPh,
total invoice), `firestore.rules`, `firebase-config.js`, atau alur autentikasi di
`useAuth.js` (hanya komentar `eslint-disable`/penjelasan blok catch ditambahkan
di sana, tidak ada baris logika yang berubah).
