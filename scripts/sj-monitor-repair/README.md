# sj-monitor-repair

Script perbaikan data satu kali untuk `sj-monitor`. Bukan bagian dari aplikasi —
dijalankan manual oleh pemilik data, bukan oleh CI.

## release-orphan-sj.js

Memulihkan Surat Jalan yang masih terkunci `terinvoice` padahal invoice induknya
sudah dibatalkan, sehingga SJ tidak muncul di daftar "Belum Terinvoice" dan tidak
bisa dipilih untuk invoice baru.

Bug penyebabnya sudah ditutup di `apps/sj-monitor/src/services/invoiceSJService.js`,
tetapi dokumen yang terlanjur rusak tetap perlu diperbaiki sekali.

Default target: enam SJ yang terdampak pembatalan invoice `TMP-SI152/2026` —
`22E-04041`, `22E-04235`, `22E-04237`, `22E-04448`, `22E-04450`, `22E-04508`.

### Pengaman

- **Dry run adalah default.** Tanpa `--apply` tidak ada satu pun write.
- SJ yang invoice induknya **masih aktif** akan **ditolak**, bukan dilepas —
  melepasnya berisiko membuat SJ ter-invoice dua kali.
- Hanya menulis field whitelist `sjInvoiceFieldsOnly()` dari `firestore.rules`.
- Tidak pernah menghapus dokumen. Setiap perubahan menulis satu baris
  `history_log` berisi nilai sebelumnya.
- Semua write dalam satu batch — berhasil semua atau tidak sama sekali.

### Cara jalankan

Sekali saja, di folder ini:

```bash
npm install
```

Login dan arahkan ke project produksi:

```bash
gcloud auth application-default login
```

PowerShell:

```powershell
$env:FIREBASE_PROJECT_ID = "surat-jalan-monitor"; $env:REPAIR_ACTOR = "Memen"
```

**Langkah 1 — lihat rencana, tidak menulis apa pun:**

```bash
npm run plan
```

Baca outputnya. Setiap baris berlabel `PERBAIKI`, `TOLAK`, atau `SKIP`.
Lanjutkan hanya kalau daftar `PERBAIKI` sudah sesuai harapan Anda.

**Langkah 2 — jalankan sungguhan:**

```bash
npm run apply
```

**Langkah 3 — verifikasi di aplikasi:** buka halaman Invoice, tab
"Belum Terinvoice". Keenam SJ harus muncul di sana dan bisa dicentang saat
"Buat Invoice Baru".

### Kalau perlu dikembalikan

Script tidak menghapus apa pun. Nilai sebelum perubahan tersimpan di
`history_log` dengan `action: "release_orphan_sj"` — cari berdasarkan
`suratJalanNo`, lalu tulis balik `details.before` ke dokumen SJ terkait.
