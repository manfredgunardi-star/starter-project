# Playwright AI ERP Test Agent

Dokumen ini menjelaskan test agent otomatis untuk Mini ERP.

## Tujuan

Agent ini bertindak seperti user ERP dan memvalidasi alur penting yang sudah tersedia:

- Navigasi dashboard, master data, accounting, kas/bank, dan laporan.
- CRUD master data Pelanggan.
- CRUD master data Supplier.
- CRUD master data Produk/Jasa.
- CRUD master data Satuan.
- CRUD master data Kategori Produk.
- CRUD master data Cost Center.
- CRUD form Chart of Accounts.
- Simpan Journal Entry draft dari COA aktif.
- Posting Journal Entry draft.
- Buku Besar dari posted journal.
- Soft delete pelanggan melalui status nonaktif.
- Restore pelanggan dari status nonaktif.
- Validasi debit/kredit jurnal draft.
- Snapshot visual ringan untuk shell iOS ERP.
- Fallback data lokal saat Firebase belum dikonfigurasi.

## Perintah

```bash
npm run test:e2e
```

Mode interaktif:

```bash
npm run test:e2e:ui
```

Mode browser terlihat:

```bash
npm run test:e2e:headed
```

## Cara Kerja

Playwright akan menjalankan Vite secara otomatis di:

```text
http://127.0.0.1:5175
```

Setiap test membersihkan `localStorage` terlebih dahulu supaya data demo kembali ke kondisi awal. Ini membuat test aman dijalankan tanpa Firebase `.env`.

## Skenario Saat Ini

File utama:

```text
tests/e2e/ai-erp-test-agent.spec.js
```

Skenario:

1. Smoke test navigasi utama.
2. Tambah pelanggan.
3. Edit pelanggan.
4. Nonaktifkan pelanggan.
5. Filter pelanggan nonaktif.
6. Restore pelanggan.
7. Pastikan pelanggan kembali aktif.
8. Ulangi lifecycle yang sama untuk Supplier.
9. Jalankan lifecycle Produk/Jasa dengan harga jual dan akun pendapatan.
10. Jalankan lifecycle Satuan.
11. Jalankan lifecycle Kategori Produk.
12. Jalankan lifecycle Cost Center.
13. Jalankan lifecycle COA dengan tipe akun dan saldo normal.
14. Simpan Journal Entry draft dari COA aktif.
15. Posting Journal Entry draft dan pastikan jurnal terkunci.
16. Pastikan posted journal muncul di Buku Besar.
17. Ubah nilai kredit jurnal draft sampai tidak seimbang.
18. Pastikan pesan validasi accounting muncul.
19. Ambil snapshot visual dashboard dan master data.

## Pengembangan Berikutnya

Saat modul baru dibuat, tambahkan skenario agent untuk:

- Produk/Jasa
- Journal entry draft
- Validasi debit dan kredit seimbang
- Posting jurnal
- Kas/bank draft ke posted
