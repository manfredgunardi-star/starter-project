# Rekap Operasional Harian Otomatis — Panduan Deploy (Opsi B: Cloud Functions)

Rekap dibuat di server Google **tiap pagi 07:00 WIB**, lalu disimpan ke Firestore
`bul_reports/{tanggal}` dan dikirim via email. Berjalan **independen dari laptop** —
laptop boleh mati atau diganti, rekap tetap terbit.

## Cara kerja singkat
- Membaca **bul-monitor** lewat Admin SDK (akses bawaan project, **tanpa service account key**).
- Membaca **bul-accounting** lewat akun **bridge** (email/password) yang sudah Anda pakai untuk integrasi.
- Tidak menulis apa pun ke data operasional; hanya membuat dokumen di koleksi baru `bul_reports`.

---

## Prasyarat (sekali saja)
1. **Paket Blaze** pada project `bul-monitor` (scheduled function butuh ini). Beban sekecil ini biayanya praktis nol.
2. **Node.js 18** dan **Firebase CLI**: `npm install -g firebase-tools`, lalu `firebase login`.

## Langkah 1 — Pasang dependency
```bash
cd C:\Project\apps\bul-monitor\functions
npm install
```

## Langkah 2 — Isi konfigurasi
```bash
copy .env.example .env      # Windows (atau cp di shell lain)
```
Buka `.env`, isi:
- `BRIDGE_EMAIL` & `BRIDGE_PASSWORD` — ambil dari `bul-monitor\.env`
  (`VITE_ACCOUNTING_BRIDGE_EMAIL` / `VITE_ACCOUNTING_BRIDGE_PASSWORD`).
- `RECAP_EMAIL_TO` — email penerima (boleh beberapa, pisah koma).
- SMTP — untuk Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`,
  `SMTP_USER=email-anda`, `SMTP_PASS=APP PASSWORD` (bukan password biasa — buat di
  Google Account → Security → App passwords; perlu 2FA aktif), `SMTP_FROM=email-anda`.

> Email opsional. Jika SMTP dikosongkan, rekap tetap tersimpan di Firestore `bul_reports`.

> `.env` sudah masuk `.gitignore` agar rahasia tidak ter-commit.

## Langkah 3 — Deploy
Dari **root project** `bul-monitor`:
```bash
cd C:\Project\apps\bul-monitor
firebase deploy --only functions:rekapHarianScheduled,functions:rekapHarianTest
```
CLI akan meminta mengaktifkan API Cloud Scheduler/Pub/Sub bila belum — setujui.
Function lain yang sudah ada (`setUserRole`, dll) tidak terpengaruh.

## Langkah 4 — Uji tanpa menunggu jadwal
Setelah deploy, CLI mencetak URL untuk `rekapHarianTest`. Buka di browser:
```
https://<region>-bul-monitor.cloudfunctions.net/rekapHarianTest?date=2026-02-18
```
(Memakai tanggal contoh yang ada datanya. Tanpa `?date=`, default = kemarin.)
Harusnya membalas `{"ok":true,...}`. Lalu cek:
- Firestore → koleksi `bul_reports` → dokumen `2026-02-18` (berisi `summary` + `html`).
- Email penerima (bila SMTP diisi).

## Langkah 5 — Verifikasi jadwal
Google Cloud Console → **Cloud Scheduler**: ada job `firebase-schedule-rekapHarianScheduled...`
terjadwal `0 7 * * *` zona `Asia/Jakarta`. Anda bisa klik **Run now** untuk uji.

## Langkah 6 — Amankan endpoint uji (disarankan)
`rekapHarianTest` adalah HTTP publik untuk pengujian. Setelah yakin jalan, hapus exposnya:
buka `functions/index.js`, hapus baris `exports.rekapHarianTest = ...`, lalu:
```bash
firebase deploy --only functions
```

---

## Mengubah jadwal / penerima
Edit `.env` (`RECAP_CRON`, `RECAP_EMAIL_TO`) lalu deploy ulang `--only functions:rekapHarianScheduled`.

## Melihat hasil dari perangkat mana pun
- **Email** tiap pagi, atau
- Firestore `bul_reports/{tanggal}` (bisa ditampilkan di aplikasi nanti bila diinginkan).

## Ketahanan
- **Laptop mati:** tidak masalah — berjalan di server Google.
- **Ganti laptop:** tidak ada yang perlu dipindah; cukup buka email/Firestore.

## Troubleshooting
| Gejala | Solusi |
|--------|--------|
| Deploy menolak (billing) | Aktifkan paket Blaze di Firebase Console. |
| Piutang kosong di rekap | `BRIDGE_EMAIL/PASSWORD` salah, atau akun bridge tidak bisa login ke accounting. |
| Email tidak terkirim | Cek SMTP; untuk Gmail wajib App Password + 2FA. Lihat log: `firebase functions:log`. |
| Rekap "kemarin" kosong | Wajar bila belum ada transaksi hari itu; uji dengan `?date=` bertanggal ada data. |
