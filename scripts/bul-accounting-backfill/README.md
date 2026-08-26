# Backfill Piutang Bersih Invoice Bridge

Mengoreksi `invoices.amount` dari nilai bruto menjadi piutang bersih setelah
potongan uang jalan, lalu menyimpan nilai bruto ke `amountGross` dan potongannya
ke `totalUJ`.

Seluruh aturan hidup di `apps/bul-accounting/src/utils/invoiceAmountBackfill.js`
dan diuji dengan `npm test` di `apps/bul-accounting`. Script ini hanya lapisan I/O.

## Prasyarat

- Node >= 20
- Application Default Credentials dengan akses tulis ke Firestore project `bul-accounting`
- Tujuh dokumen prasyarat (5 uji coba + 2 duplikat) sudah dibereskan lebih dulu —
  lihat `docs/superpowers/specs/2026-08-24-bul-accounting-ar-net-uang-jalan-design.md` bagian 4

## Dry run (default)

```bash
npm install
FIREBASE_PROJECT_ID=bul-accounting node index.js
```

Menghasilkan dua CSV: daftar invoice yang akan dikoreksi, dan daftar yang dilewati
beserta alasannya. Tidak ada tulisan ke Firestore.

## Eksekusi sungguhan

```bash
FIREBASE_PROJECT_ID=bul-accounting DRY_RUN=false node index.js
```

## Sifat

- **Idempoten** — invoice yang `amountGross`-nya sudah terisi akan dilewati.
- **Aman terhadap pembayaran** — invoice yang sudah punya `totalPaid > 0` atau
  `payments` tidak kosong akan dilewati dan harus diputuskan akuntan secara manual.
- **Tidak menyentuh jurnal** — hanya collection `invoices`.
