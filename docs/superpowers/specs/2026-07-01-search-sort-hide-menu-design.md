# Search + Sort per Menu, dan Penyembunyian 3 Menu — Design Spec

- **Tanggal:** 2026-07-01
- **App:** `apps/sj-monitor/`
- **Status:** Draft — menunggu persetujuan user sebelum implementasi
- **Risiko finansial:** Rendah. Search/sort murni tampilan (filter array yang sudah di-load, tanpa
  query Firestore baru). Hide-menu tidak menyentuh kalkulasi `totalUM`/Invoice — hanya menghapus
  entri navigasi, listener dan komputasi Uang Muka tetap jalan.
- **Risiko data:** Sangat rendah dan reversibel. Tidak ada hard delete, tidak ada perubahan schema
  Firestore, tidak ada perubahan `firestore.rules`.

Dokumen ini ditulis dari beberapa sudut pandang — **Architect** (§1–3), **Engineer** (§4, rencana
implementasi & API komponen), **Reviewer** (§5), **Optimizer** (§6), **Security** (§7), dan
**Deploy/Ops** (§8, disesuaikan dengan kenyataan stack: Firebase Hosting statis, bukan
container/Kubernetes).

---

## 1. Masalah & Tujuan

sj-monitor punya ~11 tampilan daftar/tabel data (Surat Jalan, Keuangan, Laporan Kas, Laporan Truk,
Invoice, Uang Muka, Payslip, 4 sub-tab Master Data) tapi:

- Tidak ada satu pun kolom tabel yang bisa diklik untuk sortir.
- Search hanya ada di 1 dari ~10 menu (Uang Muka, `UangMukaPage.jsx:14`), dan setiap menu yang
  menambah search akan menduplikasi logic filter secara manual.
- 3 menu (UM, Laporan Truk, Gaji) jarang dipakai dan sebaiknya tidak lagi tampil di navigasi.
  **Uang Muka sudah dikonfirmasi dihentikan prosesnya** — aman disembunyikan sepenuhnya termasuk
  tombol tambah/hapus data.

**Tujuan:** Search keyword + sort kolom yang konsisten di 6 menu yang tersisa (Surat Jalan,
Keuangan, Laporan Kas, Invoice, Master Data ×4 sub-tab), dan navigasi yang lebih ringkas tanpa 3
menu yang jarang dipakai.

**Non-tujuan (sengaja di luar scope):** mengubah kalkulasi finansial apa pun, mengubah struktur
Firestore/query baru, menghapus kode/komponen UM/Laporan Truk/Payslip (hanya disembunyikan dari
nav, reversibel), multi-column sort, search full-text di semua kolom (hanya field relevan per
menu — lihat §3).

---

## 2. Arsitektur inti

Data di 6 menu ini sudah di-load penuh ke client via `onSnapshot`, dibatasi oleh window tanggal
di level query (`qStartISO`, lihat `App.jsx:1720-1810`). Karena itu **search & sort dikerjakan
100% di client**, tanpa perubahan query Firestore.

Dua hook generik dipakai ulang di semua menu (menghindari 6x logic duplikat):

```
useSearchFilter(list, searchTerm, fields[]) -> filteredList
  // lowercase .includes() match, field-list per menu (lihat §3)

useSortableData(list, initialSort?) -> { sorted, sortConfig, toggleSort(field) }
  // single-column, klik kolom yang sama = toggle asc/desc, klik kolom lain = ganti + reset ke asc
```

Dua komponen UI kecil dipakai ulang untuk konsistensi visual (mengikuti desain "Liquid Glass"
yang sudah ada):

```
<SearchInput value onChange placeholder onClear />
<SortableHeader field label sortConfig onToggle />   // <th> + ikon panah (lucide-react)
```

Lokasi baru: `src/hooks/useSearchFilter.js`, `src/hooks/useSortableData.js`,
`src/components/SearchInput.jsx`, `src/components/SortableHeader.jsx`.

---

## 3. Spesifikasi per Menu

| Menu | Field search | Sort UI | Catatan |
|---|---|---|---|
| Surat Jalan | `nomorSJ`, `supir`, `armada`, `rute`, `status` | Dropdown "Urutkan" (bukan `<th>` — tampilan card, bukan tabel) | Default sort tetap: tanggal terbaru dulu |
| Invoice | `nomorSJ`, `rute` | `<SortableHeader>` per kolom | Field diverifikasi dari `InvoicePage.jsx:94-98` |
| Keuangan / Laporan Kas | `keterangan`, `kategori`/`tipe` | `<SortableHeader>` per kolom | Default sort tetap dipertahankan (saat ini by tanggal, lihat `LaporanKasPage.jsx`) |
| Master Data (Truck/Supir/Rute/Material) | field nama masing-masing sub-tab | `<SortableHeader>` per kolom | Belum ada search sebelumnya — murni tambahan |

**Menu yang disembunyikan (tidak dapat search/sort baru karena hilang dari nav):** Uang Muka,
Laporan Truk, Payslip/Gaji.

---

## 4. Rencana Implementasi (Engineer)

1. `useSearchFilter` + `useSortableData` — pure functions, ditulis TDD (Vitest, ikut pola test
   yang sudah ada di `src/utils/__tests__/` dan `src/services/__tests__/`).
2. `SearchInput` + `SortableHeader` — komponen presentational kecil, props-only, tanpa state
   Firestore. Aksesibilitas dasar: `aria-label` pada search input, `<button>` (bukan `<div
   onClick>`) untuk header sort supaya keyboard-navigable, `aria-sort` di `<th>`.
3. Pasang ke tiap halaman satu per satu (Invoice → Keuangan/Laporan Kas → Master Data → Surat
   Jalan), commit terpisah per halaman supaya gampang di-review dan di-rollback individual.
4. Hide-menu: hapus 3 entri dari `DOCK_ITEMS` (`App.jsx:1902-1911`), tambah guard fallback kalau
   `activeTab` tersimpan adalah salah satu id yang dihapus → redirect ke `'surat-jalan'`.
   Komponen (`UangMukaPage.jsx`, `LaporanTrukPage.jsx`, `PayslipReport.jsx`), listener
   (`unsubUangMuka`, dll.), dan `computeInvoiceTotals(..., uangMukaList)` di `App.jsx:543`
   **tidak disentuh**.
5. Empty state: tiap tabel menampilkan pesan "Tidak ada data yang cocok dengan pencarian" saat
   hasil filter kosong (dibedakan dari empty state "belum ada data sama sekali").
6. Loading state: tidak berubah — mengikuti loading state yang sudah ada per halaman (data sudah
   real-time via `onSnapshot`, tidak ada loading baru yang perlu ditambahkan untuk fitur ini).

**API komponen (contoh pemakaian):**

```jsx
const { sorted, sortConfig, toggleSort } = useSortableData(filteredInvoices);
const filteredInvoices = useSearchFilter(invoiceList, searchTerm, ['nomorSJ', 'rute']);

<SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Cari nomor SJ atau rute..." />
<SortableHeader field="nomorSJ" label="No. SJ" sortConfig={sortConfig} onToggle={toggleSort} />
```

---

## 5. Review Checklist (Reviewer)

- [ ] Tidak ada perubahan pada fungsi dengan `hargaPerRute`, `uangMuka`, `pajak`, `ppn`, `pph`,
      `debit`, `kredit` (guardrail finansial CLAUDE.md).
- [ ] Tidak ada perubahan `firestore.rules`, `useAuth.js`, `LoginPage.jsx`, `firebase-config.js`.
- [ ] `computeInvoiceTotals` dan `uangMukaList` tetap dibaca dengan cara yang sama persis setelah
      menu UM disembunyikan (regression check manual: total invoice sebelum/sesudah harus identik
      untuk data yang sama).
- [ ] Build + lint + `npm test` hijau.
- [ ] `finance-auditor` agent dijalankan sebelum PR dibuka, khusus untuk memverifikasi poin di
      atas tidak meleset.

---

## 6. Optimasi (Optimizer)

- Search & sort adalah operasi `O(n)`/`O(n log n)` di client atas data yang **sudah** di memory —
  tidak ada request tambahan, tidak ada risiko N+1 atau read quota Firestore naik.
- `useMemo` dipakai di dalam kedua hook supaya filter/sort tidak dihitung ulang di setiap render
  yang tidak terkait (mengikuti pola yang sudah dipakai di `UangMukaPage.jsx` — `filteredUM` sudah
  `useMemo`).
- Tidak perlu virtualisasi tambahan — volume data per window tanggal sudah dibatasi oleh query
  existing, dan `Pagination.jsx` yang sudah ada tetap menangani render batasan per halaman.

---

## 7. Keamanan (Security)

- Tidak ada endpoint API baru, tidak ada query Firestore baru → tidak ada permukaan serangan baru
  untuk injection (semua filter adalah string match di array JS di client, bukan query DB).
- Search input dirender sebagai teks biasa (React auto-escape) — tidak ada risiko XSS dari nilai
  yang diketik user.
- Hide-menu bukan kontrol keamanan — role gating (`roles` array per tab) tetap dipertahankan apa
  adanya; ini murni UX (menyembunyikan menu jarang pakai), bukan pembatasan akses baru. Data UM
  tetap terbaca lewat listener Firestore untuk siapa pun yang punya akses sama seperti sebelumnya.
- Tidak ada perubahan auth/role/permission.

---

## 8. Deploy & Ops (disesuaikan dengan stack nyata)

sj-monitor adalah **SPA statis di Firebase Hosting + Firestore** — tidak ada container, tidak ada
Kubernetes, tidak ada server proses yang perlu di-orkestrasi. Rencana deploy mengikuti pola yang
sudah ada di proyek ini:

1. `npm run build` + `npm test` + `npm run lint` — wajib hijau.
2. `npm run smoketest` — build + deploy otomatis ke **staging** (`sj-monitor-staging`), dijalankan
   tanpa perlu diminta (sudah wajib per `CLAUDE.md`).
3. Verifikasi manual di staging: search/sort di 6 menu, 3 menu hilang dari nav, total Invoice
   tidak berubah.
4. Buka PR ke `main` — **direview manusia**, tidak di-merge otomatis oleh Claude.
5. Deploy production **dijalankan oleh user sendiri** (Claude tidak menjalankan `firebase deploy`
   ke default project, sesuai `CLAUDE.md`). Command akan diberikan setelah PR di-merge.

Tidak ada monitoring/logging baru yang perlu ditambahkan — fitur ini tidak menambah dependency
eksternal atau proses background baru.

---

## 9. Keputusan yang Menunggu Persetujuan User

1. Field search per menu di §3 — apakah sudah sesuai, atau ada field lain yang lebih sering
   dicari user (mis. nama pelanggan, jika ada)?
2. Solusi dropdown "Urutkan" untuk Surat Jalan (card-based) — apakah bisa diterima, atau ada
   preferensi lain untuk tampilan card?
3. Urutan pengerjaan per halaman di §4.3 (Invoice → Keuangan/Laporan Kas → Master Data → Surat
   Jalan) — apakah urutan ini sesuai prioritas, atau ada menu yang lebih mendesak duluan?
