# Pencegahan Double Retur (Sales/Purchase Return vs SI/GD/PI/GR) — Design

**Status:** Approved for planning
**Date:** 2026-07-14
**App:** apps/erp-acc

## Goal

Cegah retur fisik yang sama tercatat lebih dari sekali — baik lewat jalur retur yang link ke invoice maupun jalur "tanpa invoice (retur stok saja)" — untuk Sales Return maupun Purchase Return. Dibuktikan lewat analisis data production (lihat `docs/superpowers/specs/2026-07-14-double-retur-historical-findings.md`) bahwa celah ini sudah menyebabkan retur yang identik ter-posting 2x dan 3x, termasuk kasus dua invoice berbeda yang sama-sama tercatat lunas untuk retur fisik yang sama.

## Context / Existing State

- Modul Retur (`apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql`) sudah punya cap qty yang aman **hanya** untuk retur yang link ke invoice: `sales_returnable_qty(invoice_item_id)` / `purchase_returnable_qty(invoice_item_id)`, dipanggil di `save_sales_return`/`save_purchase_return` (soft check) dan `post_sales_return`/`post_purchase_return` (hard check dengan row lock pada invoice).
- Retur "tanpa invoice" (`invoice_id` kosong) — termasuk yang dibuat lewat tombol pintasan "Buat Retur" di `GoodsDeliveryFormPage.jsx`/`GoodsReceiptFormPage.jsx` (`?from_gd=`/`?from_gr=`) — memakai `LineItemsTable` bebas, **tanpa validasi qty apa pun** terhadap dokumen sumber.
- `invoice_items` **tidak** punya kolom yang menunjuk balik ke `goods_delivery_items`/`goods_receipt_items` — dua jalur retur (invoice-linked vs tanpa-invoice) sepenuhnya independen. Menambah cap terpisah di jalur GD/GR saja **tidak cukup**: barang fisik yang sama tetap bisa lolos diretur dua kali, satu dari tiap jalur (ini persis yang terjadi di data production).
- `products.base_unit_id` ada — semua `quantity_base` di seluruh sistem (invoice_items, goods_delivery_items, goods_receipt_items, sales_return_items, purchase_return_items) sudah dalam satuan dasar produk, jadi agregasi lintas tabel valid tanpa perlu konversi satuan.
- Setiap invoice item sales/purchase yang pernah dicek di data production selalu punya GD/GR dengan qty yang sama atau lebih besar untuk kombinasi customer/supplier+produk yang sama — GD/GR selalu ada sebelum/bersamaan invoice dibuat di alur kerja bisnis ini.

## Approach

Tambahkan **satu ledger gabungan** per (customer/supplier, produk) yang dipakai sebagai validasi tunggal, terlepas dari jalur retur yang dipakai:

```
sisa_retur(party, produk) = GREATEST(total qty pernah dikirim/diterima via GD/GR, total qty pernah diinvoice)
                             − total qty pernah diretur (SEMUA sales_return_items/purchase_return_items posted, lintas jalur)
```

Tidak ada perubahan skema tabel — cukup fungsi SQL baru + validasi tambahan yang disisipkan ke 4 RPC yang sudah ada (`save_sales_return`, `save_purchase_return`, `post_sales_return`, `post_purchase_return`). Validasi existing yang link ke `invoice_item_id` **tidak diubah/dihapus** — ledger baru ini murni tambahan (defense-in-depth kedua).

`GREATEST(GD/GR, invoice)` dipakai (bukan cuma GD/GR) sebagai jaga-jaga data historis yang mungkin punya invoice tanpa GD/GR yang lengkap — supaya retur yang sah tidak keblokir gara-gara data GD/GR yang bolong di masa lalu.

## Data Model

**Tidak ada `ALTER TABLE`.** Migrasi baru murni fungsi: `apps/erp-acc/erp-app/supabase/migrations/042_double_retur_prevention.sql`.

### Fungsi ledger

```sql
sales_return_remaining_qty(p_customer_id uuid, p_product_id uuid) returns numeric
purchase_return_remaining_qty(p_supplier_id uuid, p_product_id uuid) returns numeric
```
Keduanya `security definer`, guard `auth.uid() is null` (pola yang sama dengan migrasi 039), `stable`.

### Fungsi picker (untuk UI jalur "tanpa invoice")

```sql
get_customer_returnable_products(p_customer_id uuid)
  returns table (product_id, product_name, sku, unit_id, unit_name, unit_price, remaining)
get_supplier_returnable_products(p_supplier_id uuid)
  returns table (product_id, product_name, sku, unit_id, unit_name, unit_price, remaining)
```
Hanya mengembalikan produk dengan `remaining > 0` dan yang pernah punya GD/GR untuk party tsb.

## Business Rules & RPC (extend, bukan ganti)

### `save_sales_return` / `save_purchase_return`
Setelah loop existing yang menghitung subtotal/tax/total (dan validasi `invoice_item_id` bila `invoice_id` diisi), tambahkan loop baru: kelompokkan item per `product_id`, jumlahkan `quantity_base`, lalu untuk tiap produk validasi terhadap `sales_return_remaining_qty(customer_id, product_id)` — **berlaku baik `invoice_id` diisi maupun tidak**. Tolak dengan pesan jelas jika melebihi.

### `post_sales_return` / `post_purchase_return`
Setelah blok re-validasi `invoice_item_id` yang sudah ada (di bawah row-lock invoice) dan sebelum blok reversal inventory, tambahkan:
1. Kelompokkan item posted-nya per `product_id`.
2. `pg_advisory_xact_lock(hashtextextended(customer_id::text || ':' || product_id::text, 0))` per produk — serialisasi retur konkuren untuk kombinasi party+produk yang sama, lintas semua jalur (invoice-linked maupun tidak), karena ledgernya adalah agregat lintas tabel (tidak ada satu baris yang bisa di-`FOR UPDATE`).
3. Re-validasi `sales_return_remaining_qty(customer_id, product_id)` setelah lock — tolak jika melebihi.

## UI Changes

- **Jalur "tanpa invoice"**: ganti `LineItemsTable` (input produk bebas) dengan komponen baru `PartyReturnableProductsPicker.jsx` (mirror `InvoiceReturnItemsPicker.jsx`), diisi dari `get_customer_returnable_products`/`get_supplier_returnable_products`. Qty input di-cap client-side ke kolom `remaining`.
- **Jalur "dengan invoice"**: tidak berubah — picker existing tetap dipakai, validasi tambahan berjalan transparan di server.
- **Tombol pintasan "Buat Retur" dari GD/GR**: prefill tetap mengisi qty awal dari GD/GR, tapi form yang di-render sekarang pakai `PartyReturnableProductsPicker` sehingga qty otomatis ter-cap ke `remaining` begitu data picker termuat.

## Error Handling

- Pesan error menyebut produk spesifik dan sisa qty (bukan generik), memudahkan staff mengerti tanpa buka database: `"Sisa retur untuk produk [nama] tinggal X unit, qty yang diminta melebihi itu"`.
- Retur `posted` lama (termasuk yang di temuan historis) tidak disentuh — validasi ini hanya berlaku untuk `save`/`post` baru ke depan.
- `get_customer_returnable_products` mengembalikan list kosong bila party belum pernah menerima kiriman apa pun — UI tampilkan pesan jelas, bukan form kosong.

## Testing Plan

Smoke test manual (SQL, mengikuti pola fitur-fitur retur sebelumnya):
1. GD 100 unit produk X ke customer A → retur tanpa invoice 40 unit → post → `sales_return_remaining_qty` = 60.
2. Retur lagi 60 unit (pas sisa) → post → jadi 0.
3. Retur lagi 1 unit → ditolak di save DAN di post.
4. Replay Kasus 1 temuan historis: retur 40 unit tanpa invoice → retur 40 unit lagi via invoice-linked untuk kombinasi party+produk yang sama → yang kedua **wajib ditolak** (ledger sudah 0).
5. Dua request post bersamaan untuk produk sama mendekati limit → hanya satu berhasil.
6. Mirror langkah 1-5 untuk purchase (GR + supplier).
7. `npm run build` di `apps/erp-acc/erp-app` — wajib pass.

## Out of Scope

- Koreksi data historis (ditangani terpisah, lihat `2026-07-14-double-retur-historical-findings.md`).
- Cancel/reverse retur yang sudah posted (RPC-nya belum ada sama sekali di codebase ini).
- Precision per-dokumen (SO/GD/GR spesifik) — ledger sengaja di level party+produk demi kesederhanaan, bukan per-shipment.
- Approval workflow, multi-warehouse, multi-currency.
