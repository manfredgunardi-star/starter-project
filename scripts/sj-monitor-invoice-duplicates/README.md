# sj-monitor-invoice-duplicates

Audit **read-only** nomor invoice kembar di Firestore project `surat-jalan-monitor`.

Sampai commit `abff3c4`, `apps/sj-monitor/src/App.jsx` men-dedup daftar invoice
dengan kunci `noInvoice` dan hanya menyimpan satu dokumen per nomor. Karena nomor
invoice di produksi banyak yang placeholder ketik tangan, dua invoice yang
benar-benar berbeda bisa bernomor sama — dan yang kalah tidak pernah dirender di
layar mana pun. Skrip ini menyisir seluruh koleksi untuk menemukan semua
kejadiannya, bukan hanya yang kebetulan dilaporkan user.

## Jalankan

Butuh Application Default Credentials yang bisa **membaca** Firestore project
`surat-jalan-monitor`:

```bash
gcloud auth application-default login     # atau set GOOGLE_APPLICATION_CREDENTIALS
cd scripts/sj-monitor-invoice-duplicates
npm install
FIREBASE_PROJECT_ID=surat-jalan-monitor node index.js
```

Output menampilkan, per nomor kembar: id dokumen, koleksi + doc id, `updatedAt`,
`totalHarga`, jumlah SJ, serta tanda `✗ TERSEMBUNYI` pada dokumen yang selama ini
kalah dedup — itulah yang tidak terlihat user.

## Batasan

- **Tidak pernah menulis.** Tidak ada `set`, `update`, atau `delete` di skrip ini.
  Perbaikan data produksi butuh persetujuan user tersendiri.
- Hanya nomor yang **persis sama** (setelah `trim`) dihitung kembar. Varian ejaan
  seperti `"TMP- SI1157/2026"` vs `"TMP SI1157/2026"` adalah kunci berbeda, jadi
  keduanya tetap tampil di UI dan bukan penyebab invoice hilang.

## Tes

```bash
npm test     # node --test, menguji lib/find-collisions.js tanpa kredensial
```
