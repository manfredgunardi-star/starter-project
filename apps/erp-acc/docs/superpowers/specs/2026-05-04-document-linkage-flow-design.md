# Design: Document Linkage Flow (PO→GR→PI & SO→GD→SI)

**Date:** 2026-05-04  
**Status:** Approved  
**Approach:** Opsi B — Warning + Guidance (badge unlinked + shortcut buttons) dengan minimal DB change

---

## Problem

GR dapat dibuat tanpa referensi ke PO yang sudah dikonfirmasi. Purchase Invoice dapat dibuat tanpa GR yang sudah diposting. Hal yang sama berlaku di sisi penjualan (GD tanpa SO, SI tanpa GD). Ini menghilangkan kontrol realisasi pemesanan dan mempersulit audit trail.

---

## Target Flow

```
PEMBELIAN:  PO (confirmed) → GR (posted) → PI (posted)
PENJUALAN:  SO (confirmed) → GD (posted) → SI (posted)
```

**Prinsip:** Warning + Guidance — tidak ada blocking. User tetap bisa buat dokumen tanpa referensi, tapi akan terlihat jelas di UI.

---

## Architecture Overview

Tiga lapisan perubahan:

| Lapisan | Perubahan |
|---|---|
| DB | 1 kolom baru: `goods_delivery_id` di tabel `invoices` |
| RPC | Aktifkan `goods_receipt_id` di `save_purchase_invoice` + tambah `goods_delivery_id` di `save_sales_invoice` |
| Frontend | Badge "unlinked" di 4 list pages + tombol shortcut di 4 detail pages |

---

## Section 1: Database Changes

**File:** `erp-app/supabase/migrations/023_document_linkage.sql`

```sql
-- Tambah goods_delivery_id ke invoices (link SI → GD)
ALTER TABLE invoices
  ADD COLUMN goods_delivery_id uuid REFERENCES goods_deliveries(id);

CREATE INDEX idx_invoices_gd ON invoices(goods_delivery_id);

-- Update save_purchase_invoice: aktifkan goods_receipt_id (sudah ada di schema sejak 005)
-- Update save_sales_invoice: tambah goods_delivery_id
-- (lihat Section 2 untuk detail RPC)
```

**Catatan:**
- `goods_receipt_id` di tabel `invoices` sudah ada sejak migration 005 tetapi tidak pernah di-set oleh RPC — tinggal diaktifkan.
- Kolom `goods_delivery_id` nullable → backward compatible, semua record existing tetap valid (NULL).
- Tidak ada data migration.

**Skema FK setelah perubahan:**

```
purchase_orders ←── goods_receipts ←── invoices (type='purchase')
                                    ↑── purchase_order_id (existing)
                                    └── goods_receipt_id  (diaktifkan)

sales_orders    ←── goods_deliveries ←── invoices (type='sales')
                                      ↑── sales_order_id    (existing)
                                      └── goods_delivery_id (BARU)
```

---

## Section 2: RPC Changes

Kedua fungsi di-update dalam migration `023_document_linkage.sql` menggunakan `CREATE OR REPLACE FUNCTION`.

### `save_purchase_invoice`

Tambahkan `goods_receipt_id` ke INSERT dan UPDATE:

```sql
-- INSERT
INSERT INTO invoices (
  id, invoice_number, date, due_date, type, supplier_id,
  purchase_order_id, goods_receipt_id, status, subtotal, tax_amount, total,
  notes, created_by
) VALUES (
  ...,
  nullif(p_invoice->>'purchase_order_id', '')::uuid,
  nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
  ...
);

-- UPDATE
UPDATE invoices SET
  ...,
  purchase_order_id = nullif(p_invoice->>'purchase_order_id', '')::uuid,
  goods_receipt_id  = nullif(p_invoice->>'goods_receipt_id',  '')::uuid
WHERE id = v_inv_id AND status = 'draft' AND type = 'purchase';
```

### `save_sales_invoice`

Tambahkan `goods_delivery_id` ke INSERT dan UPDATE:

```sql
-- INSERT
INSERT INTO invoices (
  id, invoice_number, date, due_date, type, customer_id,
  sales_order_id, goods_delivery_id, status, subtotal, tax_amount, total,
  notes, created_by
) VALUES (
  ...,
  nullif(p_invoice->>'sales_order_id',    '')::uuid,
  nullif(p_invoice->>'goods_delivery_id', '')::uuid,
  ...
);

-- UPDATE
UPDATE invoices SET
  ...,
  sales_order_id    = nullif(p_invoice->>'sales_order_id',    '')::uuid,
  goods_delivery_id = nullif(p_invoice->>'goods_delivery_id', '')::uuid
WHERE id = v_inv_id AND status = 'draft' AND type = 'sales';
```

**Service layer** (`purchaseService.js`, `salesService.js`): tambah field ke object yang dikirim ke RPC.

- `savePurchaseInvoice`: tambah `goods_receipt_id: invoice.goods_receipt_id || null`
- `saveSalesInvoice`: tambah `goods_delivery_id: invoice.goods_delivery_id || null`

**List queries** — perlu expose field baru untuk badge:
- `getPurchaseInvoices`: tambah `goods_receipt_id` ke SELECT
- `getSalesInvoices`: tambah `goods_delivery_id` ke SELECT

---

## Section 3: Frontend Changes

### 3a. Badge "Tidak ter-link" di List Pages

**Komponen:** Ant Design `<Tag color="warning">` dengan teks singkat.

| Halaman | File | Kondisi | Badge |
|---|---|---|---|
| GoodsReceiptsPage | `pages/purchase/GoodsReceiptsPage.jsx` | `purchase_order_id === null` | `Tanpa PO` |
| PurchaseInvoicesPage | `pages/purchase/PurchaseInvoicesPage.jsx` | `goods_receipt_id === null` | `Tanpa GR` |
| GoodsDeliveriesPage | `pages/sales/GoodsDeliveriesPage.jsx` | `sales_order_id === null` | `Tanpa SO` |
| SalesInvoicesPage | `pages/sales/SalesInvoicesPage.jsx` | `goods_delivery_id === null` | `Tanpa GD` |

Badge ditempatkan di kolom nomor dokumen (di samping teks nomor), bukan kolom terpisah, agar tabel tidak terlalu lebar.

### 3b. Tombol Shortcut di Detail Pages

Tombol muncul **hanya** jika status source document sudah tepat dan user memiliki `canWrite`.

| Di halaman | File | Kondisi tampil | Tombol | URL tujuan |
|---|---|---|---|---|
| PurchaseOrderFormPage | `pages/purchase/PurchaseOrderFormPage.jsx` | `status === 'confirmed'` | "Buat GR dari PO ini" | `/purchase/receipts/new?from_po={id}` |
| GoodsReceiptFormPage | `pages/purchase/GoodsReceiptFormPage.jsx` | `status === 'posted'` | "Buat PI dari GR ini" | `/purchase/invoices/new?from_gr={id}` |
| SalesOrderFormPage | `pages/sales/SalesOrderFormPage.jsx` | `status === 'confirmed'` | "Buat GD dari SO ini" | `/sales/deliveries/new?from_so={id}` |
| GoodsDeliveryFormPage | `pages/sales/GoodsDeliveryFormPage.jsx` | `status === 'posted'` | "Buat SI dari GD ini" | `/sales/invoices/new?from_gd={id}` |

### 3c. Auto-populate Logic di Form Penerima

Form penerima membaca query param via `useSearchParams` dan memanggil service untuk load source document, lalu pre-fill state.

| Form | Query param | Service call | Field yang di-pre-fill |
|---|---|---|---|
| GoodsReceiptFormPage | `?from_po` | `getPurchaseOrder(id)` | `supplier_id`, `purchase_order_id`, items (product_id, unit_id, quantity, unit_price) |
| PurchaseInvoiceFormPage | `?from_gr` | `getGoodsReceipt(id)` | `supplier_id`, `purchase_order_id` (dari GR), `goods_receipt_id`, items |
| GoodsDeliveryFormPage | `?from_so` | `getSalesOrder(id)` | `customer_id`, `sales_order_id`, items (product_id, unit_id, quantity) |
| SalesInvoiceFormPage | `?from_gd` | `getGoodsDelivery(id)` | `customer_id`, `sales_order_id` (dari GD), `goods_delivery_id`, items |

**Catatan unit_price untuk SI dari GD:** `goods_delivery_items` tidak menyimpan harga — GD hanya tracking stok. Saat auto-populate SI dari GD, `product_id` dan `unit_id` di-pre-fill; `unit_price` dibiarkan kosong dan akan ter-isi otomatis dari `product.sell_price` oleh logika `LineItemsTable` yang sudah ada (sama seperti saat user memilih produk secara manual).

Auto-populate hanya berjalan saat `isNew === true` (form baru). Jika user membuka form edit existing, query param diabaikan.

---

## Files Changed Summary

| File | Tipe perubahan |
|---|---|
| `erp-app/supabase/migrations/023_document_linkage.sql` | BARU — ALTER TABLE + CREATE OR REPLACE FUNCTION |
| `erp-app/src/services/purchaseService.js` | Edit — `savePurchaseInvoice`, `getPurchaseInvoices` |
| `erp-app/src/services/salesService.js` | Edit — `saveSalesInvoice`, `getSalesInvoices` |
| `erp-app/src/pages/purchase/GoodsReceiptsPage.jsx` | Edit — badge Tanpa PO |
| `erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx` | Edit — badge Tanpa GR |
| `erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Edit — tombol shortcut |
| `erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx` | Edit — tombol shortcut + auto-populate |
| `erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx` | Edit — auto-populate from_gr |
| `erp-app/src/pages/sales/GoodsDeliveriesPage.jsx` | Edit — badge Tanpa SO |
| `erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Edit — badge Tanpa GD |
| `erp-app/src/pages/sales/SalesOrderFormPage.jsx` | Edit — tombol shortcut |
| `erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx` | Edit — tombol shortcut + auto-populate |
| `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Edit — auto-populate from_gd |

**Total: 1 file baru + 12 file diedit**

---

## Out of Scope

- Quantity validation (over-receipt / over-delivery) — scope terpisah
- 3-way matching report — enabled oleh perubahan ini, tapi implementasi terpisah
- Blocking enforcement (hard constraint) — by design tidak diterapkan
