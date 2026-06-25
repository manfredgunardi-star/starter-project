# Ekspor Data Firestore → JSON (Jalur A)

Skrip ini menyalin data dari Firestore (`bul-monitor` & `bul-accounting`) ke file JSON
di komputer Anda, supaya bisa dianalisa Cowork untuk **Opsi 2 – Rekap Operasional Harian**.

> **Aman:** semua skrip di sini **hanya membaca** Firestore. Tidak ada penulisan/penghapusan,
> dan tidak menyentuh aplikasi yang sedang berjalan.

Ada **dua cara**. Karena pembuatan *service account key* diblokir kebijakan organisasi Anda,
**pakai Cara 1 (login biasa)** — tidak butuh key sama sekali.

---

## ✅ Cara 1 — Login biasa (DISARANKAN, tanpa service account key)

Aturan keamanan Firestore Anda mengizinkan baca untuk user yang sudah login, jadi cukup
pakai akun **owner/admin** yang sudah Anda miliki di tiap aplikasi.

### Langkah 1 — Pasang dependency (sekali saja)

Buka terminal di folder ini (`C:\Project\apps\_cowork_export`) lalu:

```bash
npm install
```

### Langkah 2 — Jalankan ekspor

```bash
# Data bul-monitor (Surat Jalan, Invoice, Pelanggan, Transaksi)
npm run export:monitor

# Data bul-accounting (Invoices, Journals, Customers)
npm run export:accounting
```

Anda akan diminta **email & password** akun aplikasi (password tidak tampil saat diketik).

> Tip: untuk bul-monitor pakai akun ber-role **owner** agar koleksi `bul_transaksi` ikut terbaca.
> Untuk bul-accounting, akun terautentikasi apa pun sudah bisa membaca invoices/journals/customers.

Tidak mau diketik tiap kali? Set lewat environment variable sebelum menjalankan:

```bash
# Windows PowerShell
$env:EXPORT_EMAIL="owner@contoh.com"; $env:EXPORT_PASSWORD="rahasia"; npm run export:monitor
```

---

## Cara 2 — Service account / gcloud (opsional, akses admin penuh)

Hanya jika Anda butuh ekspor admin penuh (mengabaikan security rules).

- **2a. Service account key** — unduh dari Firebase Console → Project settings → Service accounts →
  Generate new private key, simpan sebagai `keys/bul-monitor-key.json` /
  `keys/bul-accounting-key.json`, lalu `npm run export:monitor:key`.
  *(Catatan: cara ini sedang diblokir kebijakan org Anda.)*
- **2b. Tanpa key, pakai gcloud:** jalankan `gcloud auth application-default login`
  (akun Anda perlu peran minimal **Cloud Datastore Viewer**), lalu `npm run export:monitor:key`.
  Skrip otomatis memakai kredensial gcloud bila file key tidak ada.

---

## Hasil ekspor

File muncul di folder `exports/`, terpisah per project & tanggal:

```
exports/
  bul-monitor_2026-06-09/
    bul_suratJalan.json
    bul_invoices.json
    bul_pelanggan.json
    bul_transaksi.json
    _summary.json
  bul-accounting_2026-06-09/
    invoices.json
    journals.json
    customers.json
    _summary.json
```

### Ekspor sebagian (lebih cepat)

```bash
node export-client.js --project=monitor --since=2026-06-01
```

`--since` memakai field tanggal `createdAt`. Jika nama field tanggal di data Anda berbeda,
beri tahu saya — tinggal disesuaikan di skrip.

---

## Langkah terakhir — beri tahu saya

Setelah folder `exports/...` terisi, kabari saya. Karena `C:\Project\apps` sudah terhubung,
saya langsung baca JSON-nya dan menyusun draf **Rekap Operasional Harian** (volume Surat Jalan,
nilai & jumlah invoice, aging piutang, pelanggan teratas). Setelah formatnya pas, kita jadwalkan
agar berjalan otomatis tiap pagi.

---

## Masalah umum

| Pesan | Solusi |
|-------|--------|
| `Paket "firebase" belum terpasang` | Jalankan `npm install` dulu. |
| `Login gagal: auth/invalid-credential` | Email/password salah, atau akun tidak ada di project itu. |
| `GAGAL (permission-denied)` pada satu koleksi | Role akun tidak boleh baca koleksi itu (mis. `bul_transaksi` butuh staff/owner). Pakai akun owner. |
| Koleksi `0 dokumen` | Nama koleksi mungkin beda; cek di Firestore Console, lalu sesuaikan daftar di skrip. |
| `Config bul-monitor tidak terbaca` | Pastikan file `..\bul-monitor\.env` ada dan berisi `VITE_FIREBASE_*`. |
