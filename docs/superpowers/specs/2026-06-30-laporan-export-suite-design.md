# Laporan & Export Suite — Design Spec

- **Tanggal:** 2026-06-30
- **App:** `apps/bul-accounting/`
- **Status:** Approved design → siap masuk implementation plan
- **Scope arah:** Laporan & Export (utama), Penguatan teknis (menyatu), Integrasi/pajak (ditunda — fondasi disiapkan)
- **Risiko finansial:** Rendah — read-only, memakai ulang `generate*Data()` tanpa mengubah formula uang.

Dokumen ini ditulis dari empat sudut pandang: **Architect** (§1–4), **Engineer** (§5 rencana
implementasi & API komponen), **Reviewer** (§7), **Optimizer** (§8), plus **Security** (§9) dan
**DevOps** (§10).

---

## 1. Masalah & Tujuan

Modul Laporan (`src/pages/LaporanPage.jsx`) punya 6 laporan, tetapi:

| # | Laporan | Periode | Export sekarang |
|---|---------|---------|-----------------|
| 1 | Neraca | per-tanggal | Excel + PDF (bespoke) |
| 2 | Laba Rugi | rentang | Excel + PDF (bespoke) |
| 3 | Arus Kas | rentang | ❌ |
| 4 | Saldo Akun (Neraca Saldo) | rentang | ❌ |
| 5 | Buku Besar | rentang + akun | ❌ |
| 6 | GL per Armada | rentang | ❌ |

Masalah: (a) 4 dari 6 laporan tak bisa di-export; (b) export yang ada berupa 6 fungsi bespoke yang
menduplikasi logika di `src/utils/exportUtils.js`; (c) tidak ada "Download Semua Laporan"; (d)
`bul-accounting` belum punya satu pun test otomatis.

**Tujuan:** Satu arsitektur export terpadu, export untuk semua laporan, fitur **Download Semua
Laporan** (Excel multi-sheet **dan** PDF gabungan), serta test untuk logika uang.

**Non-tujuan (sengaja ditunda, jaga kesederhanaan):** penjadwalan/email otomatis, ZIP per-file,
laporan pajak (e-Faktur/SPT — Opsi C menyusul di atas fondasi ini), grafik di laporan.

---

## 2. Arsitektur inti — `ReportModel`

Semua laporan dinormalkan ke satu bentuk data; renderer yang sama mengubahnya ke Excel/PDF. Ini
menghapus 6 fungsi export bespoke.

```
ReportModel {
  id: string,                 // 'neraca' | 'labarugi' | ...
  title: string,              // 'LAPORAN NERACA'
  periodLabel: string,        // 'Per 30/06/2026' | 'Periode 01/06–30/06/2026'
  columns: [{ key, label, align: 'left'|'right', isCurrency: bool }],
  rows: [{
    type: 'heading' | 'detail' | 'subtotal' | 'total' | 'spacer',
    cells: { [columnKey]: string | number }
  }]
}
```

- **Laporan statement** (Neraca/Laba Rugi/Arus Kas) = tabel 2 kolom (`label`, `amount`); `row.type`
  menentukan gaya (heading tebal, subtotal, total berwarna).
- **Laporan tabel** (Saldo Akun/Buku Besar/GL Armada) = N kolom; satu sheet, dikelompokkan per
  sub-header (akun/armada) memakai `row.type: 'heading'`.

Satu model, dua wujud. Renderer membaca `row.type` untuk styling — pola yang sudah dipakai kode PDF
Neraca saat ini.

---

## 3. Berkas (file)

| Aksi | File | Tanggung jawab |
|------|------|----------------|
| **Baru** | `src/utils/reportDataset.js` | `loadReportDataset({startDate,endDate})` → fetch jurnal **1×** + akun + armada → objek dataset |
| **Baru** | `src/utils/reportModel.js` | `buildNeraca / buildLabaRugi / buildArusKas / buildSaldoAkun / buildBukuBesar / buildGLArmada (dataset, opts)` → `ReportModel`; `buildAllReports(dataset, opts)` → `ReportModel[]` |
| **Baru** | `src/utils/reportRenderers.js` | `renderToExcelSheet(model)`, `renderToPdfSection(doc, model, startY)`, `exportReportToExcel(model)`, `exportReportToPdf(model)`, `exportAllToExcel(models)`, `exportAllToPdf(models)` |
| **Baru** | `src/components/ReportToolbar.jsx` | Toolbar reusable: periode + tombol Generate + Excel/PDF (dipakai tiap tab) |
| **Baru** | `src/components/DownloadAllPanel.jsx` | Panel "Download Semua": rentang periode + format (Excel/PDF) + progress |
| **Ubah** | `src/pages/LaporanPage.jsx` | Pasang `ReportToolbar` di 6 tab + `DownloadAllPanel` di header |
| **Ubah** | `src/utils/accounting.js` | `generate*Data` terima param opsional `journals` (backward-compatible, **formula tak disentuh**) |
| **Ubah** | `src/utils/exportUtils.js` | Fungsi bespoke lama dirutekan ulang ke renderer baru, lalu dihapus setelah migrasi |
| **Baru** | `vitest.config.js` + `src/test/setup.js` + `src/utils/__tests__/*.test.js` | Test money-logic + mapping + renderer smoke |
| **Ubah** | `package.json` | devDeps `vitest`, `@testing-library/*`, `jsdom`; script `"test": "vitest run"` |

---

## 4. Alur data (Download Semua)

```
User pilih rentang periode → klik "Download Semua (Excel/PDF)"
  → loadReportDataset({startDate, endDate})     // 1× baca Firestore (jurnal+akun+armada)
  → buildAllReports(dataset, {startDate, endDate})  // pure, tanpa baca ulang → ReportModel[]
  → exportAllToExcel(models)  ATAU  exportAllToPdf(models)
```

**Harmonisasi periode:** Download-Semua memakai satu rentang `startDate–endDate`. Neraca memakai
`endDate` (saldo per tanggal akhir); 5 laporan lain memakai rentang penuh. Buku Besar & GL Armada di
mode bulk = semua akun/armada, dikelompokkan per sub-header dalam satu sheet (bukan 1 sheet/akun).

**Kenapa fetch 1×:** menghindari 6× baca Firestore redundan (risiko skalabilitas saat data
bertahun-tahun). Lihat §8.

---

## 5. Production UI — arsitektur komponen & API

### 5.1 `ReportToolbar` (reusable)

```jsx
<ReportToolbar
  periodMode="range" | "asOf"      // 'asOf' utk Neraca
  startDate, endDate, onStartDate, onEndDate
  onGenerate
  loading={bool}
  canExport={bool}                 // true setelah data ter-generate
  onExportExcel, onExportPdf
  extraControls={<select.../>}     // mis. pemilih akun di Buku Besar
/>
```

- **Aksesibilitas:** tiap input `<label htmlFor>`; tombol punya `aria-label`; ikon spinner
  `aria-hidden` + `aria-busy` saat loading; fokus terlihat (`focus:ring`); urutan tab logis.
- **Responsive:** `flex flex-wrap gap-3` (pola `card` yang sudah ada) → turun ke kolom di mobile.
- **States:** `loading` (spinner + tombol disabled), `canExport=false` (tombol export hidden).

### 5.2 `DownloadAllPanel`

```jsx
<DownloadAllPanel defaultStart={...} defaultEnd={...} />
```

- Rentang periode + dua tombol: **Download Excel**, **Download PDF**.
- **States wajib:** `idle` → `loading` (progress "Menyiapkan 6 laporan…" + `aria-live="polite"`) →
  `success` (toast) / `error` (pesan + tombol coba lagi).
- **Empty state:** bila periode tak punya jurnal → tetap unduh file dengan sheet/section berisi
  baris "Tidak ada data" (tidak gagal diam-diam).
- **Edge cases:** `endDate < startDate` → validasi inline; klik ganda → tombol disabled saat
  loading; dataset besar → progress per laporan.

### 5.3 Reusable cell helper

`SectionRow`, `Tab`, dll. yang sekarang ter-duplikasi di tiap tab `LaporanPage` dirapikan menjadi
komponen kecil bersama bila menyederhanakan — tanpa mengubah tampilan.

### 5.4 Contoh penggunaan (per tab)

```jsx
const [data, setData] = useState(null)
const model = data ? buildNeraca(data, { endDate }) : null
<ReportToolbar periodMode="asOf" endDate={endDate} onEndDate={setEndDate}
  onGenerate={load} loading={loading} canExport={!!model}
  onExportExcel={() => exportReportToExcel(model)}
  onExportPdf={() => exportReportToPdf(model)} />
```

---

## 6. Testing

`bul-accounting` belum punya Vitest → tambah `vitest` + `jsdom` + config + script `npm test`.

- **Money-logic (prioritas, characterization test dulu):** seed jurnal contoh → assert Neraca
  balance (`totalAset === totalKewajiban + totalEkuitas`), debit = kredit, angka Laba Rugi & Arus Kas
  sesuai snapshot. Test ini ditulis **sebelum** menyentuh `accounting.js` (lihat §9 guardrail).
- **Mapping:** `buildNeraca(dataset)` menghasilkan jumlah baris/total benar; `row.type` tepat.
- **Renderer smoke:** `renderToExcelSheet(model)` & `exportAllToExcel` tidak error; jumlah baris cocok.
- **Sanitasi (security):** sel diawali `= + - @` ter-escape (lihat §9).

---

## 7. Reviewer — checklist & risiko

- **Tidak ada perubahan formula uang.** Builder hanya memetakan output `generate*Data()`. Diff di
  `accounting.js` terbatas pada penambahan param opsional `journals` — wajib di-review baris per baris.
- **Backward compatibility:** `generate*Data(start, end)` tanpa `journals` harus tetap bekerja (default fetch sendiri).
- **Tidak ada regresi tampilan:** tabel tab tidak berubah; hanya tombol export ditambah.
- **Konsistensi angka:** angka di layar == angka di file (uji manual + test mapping).
- **Penghapusan kode bespoke** `exportUtils.js` dilakukan **setelah** renderer baru terbukti, agar bisa di-rollback.

## 8. Optimizer — performa

- **Fetch 1× per Download-Semua** (vs 6× sekarang bila tiap generator fetch sendiri) → pengurangan
  baca Firestore ~6×.
- **`generate*Data` terima `journals` ter-injeksi** → tab individual tetap boleh fetch sendiri, tapi
  Download-Semua berbagi satu dataset.
- **Lazy-load lib berat:** `xlsx`, `jspdf`, `jspdf-autotable` di-`import()` dinamis di dalam fungsi
  export → keluar dari initial bundle (hemat ratusan KB di first load). Ini juga selaras best practice
  SPA.
- **Generate model bersifat pure & sinkron** → tidak ada I/O saat membangun 6 model.
- **Query ter-scope tanggal** (sudah ada di `getJournals`) → batasi volume.

---

## 9. Security — audit (Security Engineer)

Fitur ini **read-only, client-side**; tidak menulis Firestore, tidak mengubah `firestore.rules`,
tidak menambah endpoint/secret. Permukaan serangan kecil, namun ada temuan konkret:

| ID | Temuan | Severity | Skenario | Perbaikan |
|----|--------|----------|----------|-----------|
| S1 | **Formula/CSV injection** pada export Excel (CWE-1236) | **High** | Keterangan jurnal / nama akun diisi `=HYPERLINK(...)`, `=cmd|...`, `+`, `-`, `@`. Saat file dibuka di Excel, formula dieksekusi → exfiltrasi/penipuan. | `escapeCell()`: prefiks `'` pada sel teks yang diawali `= + - @ \t \r`. Terapkan di `renderToExcelSheet`. Uji di §6. |
| S2 | **Otorisasi data laporan** | Medium | Role rendah (`reader`) memakai Download-Semua untuk eksfiltrasi massal data finansial. | Verifikasi route `/laporan` ter-gate role di `App.jsx`/router; Download-Semua tidak menambah hak baca apa pun di luar yang sudah diizinkan rules. Dokumentasikan role yang boleh. |
| S3 | **Kebocoran data di nama file** | Low | Nama file memuat data sensitif. | Nama file cukup `Laporan_Keuangan_<start>_<end>.xlsx`. |
| S4 | Firebase web config publik | Info | (by design) keamanan ada di Firestore rules, bukan di config. | Tidak ada aksi; pastikan rules tetap utuh. |

**Catatan auth/API:** tidak ada API kustom; semua via Firebase SDK dengan konteks auth user. Tidak
ada secret baru. `ensureAuthed()` tetap berlaku untuk operasi read.

**Rekomendasi siap-produksi:** S1 wajib diperbaiki sebelum rilis (blocker). S2 diverifikasi. S3/S4
catatan.

---

## 10. DevOps — deployment, CI, monitoring (realistis untuk SPA Firebase)

> Docker/Kubernetes **tidak dipakai**: ini SPA statis (`firebase.json` → `public: dist`, SPA
> rewrite). Backend = Firebase terkelola. Containerisasi tak memberi manfaat.

### 10.1 Build & deploy
- Build: `cd apps/bul-accounting && npm run build` → output `dist/` (harus lolos tanpa error).
- Deploy hosting: `firebase deploy --only hosting` (oleh user; Claude tidak deploy production).
- Rules **tidak** di-deploy oleh fitur ini (tidak berubah).

### 10.2 CI (GitHub Actions — selaras pola repo yang ada di `.github/workflows/`)
Pipeline ringan untuk PR yang menyentuh `apps/bul-accounting/**`:
1. `npm ci`
2. `npm test` (Vitest — gate baru)
3. `npm run build` (gate)
- **Tanpa** auto-deploy, **tanpa** push ke `main` (selaras batas pipeline di CLAUDE.md).

### 10.3 Monitoring/logging & reliabilitas
- Export berjalan di browser → tak ada server log. Andalkan `try/catch` + pesan error UI; opsional
  kirim error ke konsol untuk dukungan.
- Reliabilitas: idempoten (download bisa diulang), tanpa efek samping data → downtime N/A.
- Scaling: beban di sisi klien; query Firestore ter-scope tanggal membatasi volume.

### 10.4 Checklist rilis produksi
- [ ] `npm test` hijau (termasuk test sanitasi S1)
- [ ] `npm run build` lolos tanpa error
- [ ] S1 (escapeCell) terpasang & teruji
- [ ] S2 (gating role `/laporan`) terverifikasi
- [ ] Uji manual: tiap laporan Excel+PDF, angka layar == file
- [ ] Uji Download-Semua: Excel multi-sheet (6 sheet) + PDF gabungan, periode kosong & periode normal
- [ ] Bundle size dicek (lazy-load lib export aktif)
- [ ] User melakukan `firebase deploy --only hosting`

---

## 11. Rencana implementasi (fase — detail via writing-plans)

1. **Fondasi test** — pasang Vitest; tulis characterization test money-logic (RED→GREEN safety net).
2. **ReportModel + builders** — `reportModel.js` memetakan output `generate*Data()` (formula tak disentuh).
3. **Renderers + sanitasi S1** — `reportRenderers.js` (Excel/PDF, single + all), `escapeCell`.
4. **Data layer** — `reportDataset.js` + param `journals` opsional di `generate*Data`.
5. **UI** — `ReportToolbar`, `DownloadAllPanel`, integrasi `LaporanPage` (6 tab + header).
6. **Migrasi & bersih-bersih** — rutekan/hapus fungsi bespoke `exportUtils.js`.
7. **Optimasi** — lazy-load lib export; verifikasi fetch 1×.
8. **Validasi** — checklist §10.4.
```
