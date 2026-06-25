# BUL Automation

Standalone automation worker untuk PT. Bangun Usaha Lancar.

## Tujuan

- Membaca dokumen bulanan dari Google Drive lokal.
- Membuat snapshot Firebase dari query yang dikonfigurasi.
- Merekonsiliasi Surat Jalan, Ritasi, Kwitansi/Invoice, dan transaksi accounting.
- Membuat file siap import dan file review tanpa menulis langsung ke Firebase.

## Setup

1. Jalankan `npm install`.
2. Salin `.env.example` menjadi `.env`.
3. Isi `BUL_DRIVE_ROOT`, credential Firebase, dan credential Gmail jika sudah siap.
4. Isi query Firestore di `config/firebase-queries.json` dan ubah `enabled` menjadi `true`.

## Command

```powershell
npm run dry-run -- --period 04.2026
npm run run -- --period 04.2026
npm run email-sync -- --run-id 2026-05-22
```

## Output

Output final masuk ke:

```text
G:\My Drive\Documents\PT. Bangun Usaha Lancar\Transaksi\mm.yyyy\Automation Output\YYYY-MM-DD\
```

File yang dibuat:

- `weekly_report.xlsx`
- `ready_journal_import.csv`
- `ready_surat_jalan_import.csv`
- `review_required.xlsx`
- `email_summary.txt`
- `firebase_export_*.xlsx` jika query Firebase aktif dan command bukan dry-run.

Jika `BUL_RECIPIENT_EMAIL`, `GMAIL_CLIENT_SECRET`, dan `GMAIL_TOKEN` sudah diisi, command `run` akan mengirim email dengan attachment laporan. Command `dry-run` selalu melewati pengiriman email.

## Prinsip V1

- Prepare only.
- Tidak menulis langsung ke Firebase.
- Tidak membuat dokumen `integration_queue` otomatis.
- Transaksi asing atau mapping konflik masuk review dulu.
