# ERP Pembukuan — Design Spec

**Date:** 2026-04-09
**Status:** Approved

## Overview

Aplikasi pembukuan/ERP single-company untuk bisnis jasa + dagang. Fitur utama: pembukuan double-entry (auto-jurnal), persediaan barang dagang dengan konversi satuan, manajemen customer/supplier, kas & bank dengan rekonsiliasi, siklus penjualan & pembelian.

Dirancang dengan prinsip "mulai sederhana, siap berkembang" — fitur inti dibangun solid, arsitektur mendukung penambahan fitur lanjutan (multi-gudang, batch tracking, dashboard, granular roles, dokumen cetak) tanpa perombakan.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS 3, React Router v6, Lucide React |
| Backend | Supabase (hosted PostgreSQL, Auth, Row Level Security, Realtime) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password), role di tabel `profiles` |
| Export | jsPDF + jspdf-autotable (PDF), xlsx (Excel) |
| Hosting Frontend | Vercel atau Netlify (gratis untuk SPA) |

### Justifikasi Supabase vs Firebase

Data accounting dan inventory bersifat relasional. Double-entry bookkeeping membutuhkan ACID transactions (debit harus selalu = kredit), dan laporan keuangan membutuhkan query agregasi kompleks (JOIN, SUM, GROUP BY). PostgreSQL menangani ini secara native. Supabase memberikan kenyamanan mirip Firebase (hosted, Auth, real-time) tanpa perlu membangun backend custom.

### Pricing (Free Tier)

- 500 MB database storage
- 50.000 MAU (auth)
- Unlimited API requests & realtime connections
- 1 GB file storage, 500K edge function invocations/bulan
- Maks 2 proyek
- **Catatan:** proyek di-pause otomatis setelah 7 hari tidak aktif
- **Upgrade:** Pro plan $25/bulan (8 GB database, tanpa auto-pause)

## Project Structure

```
erp-app/
├── src/
│   ├── components/       # Shared UI components
│   ├── pages/            # Page per modul
│   ├── hooks/            # Custom hooks (useAuth, useInventory, dll)
│   ├── services/         # Supabase client & query functions
│   ├── utils/            # Helpers (currency, date formatting, dll)
│   ├── contexts/         # Auth context, App context
│   ├── lib/
│   │   └── supabase.js   # Supabase client initialization
│   └── main.jsx
├── supabase/
│   ├── migrations/       # SQL migration files
│   ├── functions/        # Edge functions (jika perlu)
│   └── seed.sql          # Data awal (COA default, satuan, dll)
└── package.json
```

## Modul & Fitur

### 1. Master Data

- **Barang/Produk** — nama, SKU, kategori, satuan dasar, harga jual, harga beli, toggle PPN (aktif/nonaktif per item), tax rate
- **Customer** — nama, alamat, telepon, email, NPWP
- **Supplier** — nama, alamat, telepon, email, NPWP
- **Satuan** — daftar satuan (pcs, dus, kg, liter, dll)
- **Konversi Satuan** — konversi per produk (misal: 1 dus = 12 pcs)
- **Chart of Accounts (COA)** — kode, nama, tipe (Aset, Kewajiban, Modal, Pendapatan, Beban), saldo normal (debit/credit), hirarki parent-child

### 2. Inventory (Persediaan)

- Stok masuk otomatis dari penerimaan barang (pembelian)
- Stok keluar otomatis dari pengiriman barang (penjualan)
- Kartu stok — riwayat masuk/keluar per barang
- Konversi satuan — input dalam satuan apapun, stok dihitung dalam satuan dasar
- Stok real-time via `inventory_stock` table
- HPP metode Average (rata-rata tertimbang)
- **Siap berkembang:** multi-gudang, batch/serial tracking, stok opname

### 3. Penjualan

- **Alur lengkap:** Sales Order (SO) → Invoice → Pembayaran
- **Alur singkat:** Invoice langsung (tanpa SO)
- PPN otomatis berdasarkan setting per item barang
- Pembayaran parsial (cicilan)
- Auto-jurnal saat invoice di-post

### 4. Pembelian

- **Alur lengkap:** Purchase Order (PO) → Penerimaan Barang → Invoice Supplier → Pembayaran
- **Alur singkat:** Langsung catat pembelian tanpa PO
- PPN otomatis berdasarkan setting per item
- Pembayaran parsial
- Auto-jurnal saat invoice di-post
- Penerimaan barang terpisah dari invoice (mendukung barang diterima sebelum invoice datang)

### 5. Kas & Bank

- Banyak akun kas/bank (Kas Besar, BCA, Mandiri, dll)
- Penerimaan — terima pembayaran dari customer, setoran, dll
- Pengeluaran — bayar supplier, biaya operasional, dll
- Transfer antar kas/bank
- Rekonsiliasi bank — cocokkan catatan internal dengan mutasi bank
- Setiap transaksi otomatis buat jurnal

### 6. Pembukuan (Accounting)

- **Jurnal Umum** — hanya admin yang bisa buat manual (untuk koreksi, penyesuaian)
- **Auto-jurnal** — semua transaksi penjualan, pembelian, kas/bank otomatis membuat jurnal
- **Buku Besar** — ledger per akun COA
- **Validasi** — total debit harus selalu = total kredit
- Jurnal yang sudah posted immutable — koreksi via jurnal reversal

### 7. Laporan

- Neraca (Balance Sheet)
- Laba Rugi (Income Statement)
- Arus Kas (Cash Flow)
- Export ke PDF dan Excel
- **Siap berkembang:** laporan stok, aging piutang/hutang, laporan penjualan per customer/produk, dashboard grafik

## Database Schema

### Master Data

#### `products`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| sku | text UNIQUE | |
| name | text NOT NULL | |
| category | text | |
| base_unit_id | uuid FK → units | Satuan dasar |
| buy_price | numeric(15,2) | Harga beli default |
| sell_price | numeric(15,2) | Harga jual default |
| is_taxable | boolean DEFAULT false | Toggle PPN per item |
| tax_rate | numeric(5,2) DEFAULT 11 | Tarif PPN (%) |
| is_active | boolean DEFAULT true | Soft delete flag |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `units`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | pcs, dus, kg, liter, dll |

#### `unit_conversions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products | Per produk |
| from_unit_id | uuid FK → units | |
| to_unit_id | uuid FK → units | |
| conversion_factor | numeric(15,4) NOT NULL | misal: 1 dus = 12 pcs → factor = 12 |

#### `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| address | text | |
| phone | text | |
| email | text | |
| npwp | text | |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `suppliers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| address | text | |
| phone | text | |
| email | text | |
| npwp | text | |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `coa` (Chart of Accounts)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text NOT NULL UNIQUE | Kode akun (misal: 1-10000) |
| name | text NOT NULL | |
| type | text NOT NULL | asset, liability, equity, revenue, expense |
| normal_balance | text NOT NULL | debit / credit |
| parent_id | uuid FK → coa (nullable) | Hirarki parent-child |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |

### Transaksi — Penjualan

#### `sales_orders`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| so_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| customer_id | uuid FK → customers | |
| status | text DEFAULT 'draft' | draft, confirmed, invoiced, done |
| subtotal | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `sales_order_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| sales_order_id | uuid FK → sales_orders | |
| product_id | uuid FK → products | |
| unit_id | uuid FK → units | Satuan input |
| quantity | numeric(15,4) | Qty dalam satuan input |
| quantity_base | numeric(15,4) | Qty dikonversi ke satuan dasar |
| unit_price | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |

### Transaksi — Pembelian

#### `purchase_orders`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| po_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| supplier_id | uuid FK → suppliers | |
| status | text DEFAULT 'draft' | draft, confirmed, received, done |
| subtotal | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `purchase_order_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| purchase_order_id | uuid FK → purchase_orders | |
| product_id | uuid FK → products | |
| unit_id | uuid FK → units | |
| quantity | numeric(15,4) | |
| quantity_base | numeric(15,4) | |
| unit_price | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |

#### `goods_receipts` (Penerimaan Barang)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| gr_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| purchase_order_id | uuid FK → purchase_orders (nullable) | |
| supplier_id | uuid FK → suppliers | |
| status | text DEFAULT 'draft' | draft, posted |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |

#### `goods_receipt_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| goods_receipt_id | uuid FK → goods_receipts | |
| product_id | uuid FK → products | |
| unit_id | uuid FK → units | |
| quantity | numeric(15,4) | |
| quantity_base | numeric(15,4) | |
| unit_price | numeric(15,2) | Harga dari PO |

#### `goods_deliveries` (Pengiriman Barang — Penjualan)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| gd_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| sales_order_id | uuid FK → sales_orders (nullable) | |
| customer_id | uuid FK → customers | |
| status | text DEFAULT 'draft' | draft, posted |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |

#### `goods_delivery_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| goods_delivery_id | uuid FK → goods_deliveries | |
| product_id | uuid FK → products | |
| unit_id | uuid FK → units | |
| quantity | numeric(15,4) | |
| quantity_base | numeric(15,4) | |

### Transaksi — Invoice & Pembayaran

#### `invoices`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| invoice_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| due_date | date | |
| type | text NOT NULL | sales / purchase |
| customer_id | uuid FK → customers (nullable) | Untuk invoice sales |
| supplier_id | uuid FK → suppliers (nullable) | Untuk invoice purchase |
| sales_order_id | uuid FK → sales_orders (nullable) | Jika dari SO |
| purchase_order_id | uuid FK → purchase_orders (nullable) | Jika dari PO |
| goods_receipt_id | uuid FK → goods_receipts (nullable) | Jika dari penerimaan barang |
| subtotal | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |
| amount_paid | numeric(15,2) DEFAULT 0 | |
| status | text DEFAULT 'draft' | draft, posted, partial, paid |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `invoice_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| invoice_id | uuid FK → invoices | |
| product_id | uuid FK → products | |
| unit_id | uuid FK → units | |
| quantity | numeric(15,4) | |
| quantity_base | numeric(15,4) | |
| unit_price | numeric(15,2) | |
| tax_amount | numeric(15,2) | |
| total | numeric(15,2) | |

#### `payments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| payment_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| type | text NOT NULL | incoming / outgoing |
| invoice_id | uuid FK → invoices (nullable) | |
| customer_id | uuid FK → customers (nullable) | Untuk pembayaran terkait customer |
| supplier_id | uuid FK → suppliers (nullable) | Untuk pembayaran terkait supplier |
| account_id | uuid FK → accounts | Kas/bank yang dipakai |
| amount | numeric(15,2) NOT NULL | |
| notes | text | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |

### Inventory

#### `inventory_movements`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| date | date NOT NULL | |
| product_id | uuid FK → products | |
| type | text NOT NULL | in / out / adjustment |
| quantity_base | numeric(15,4) | Selalu dalam satuan dasar |
| unit_id | uuid FK → units | Satuan original |
| quantity_original | numeric(15,4) | Qty dalam satuan original |
| unit_cost | numeric(15,2) | Harga per unit saat transaksi |
| reference_type | text | purchase, sale, adjustment, goods_receipt |
| reference_id | uuid | ID dokumen terkait |
| notes | text | |
| created_at | timestamptz | |

#### `inventory_stock`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products UNIQUE | Satu baris per produk |
| quantity_on_hand | numeric(15,4) | Saldo stok dalam satuan dasar |
| avg_cost | numeric(15,2) | Harga rata-rata tertimbang terkini |
| last_updated | timestamptz | |

### Kas/Bank & Accounting

#### `accounts` (Kas/Bank)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | Kas Besar, BCA, Mandiri, dll |
| type | text NOT NULL | cash / bank |
| coa_id | uuid FK → coa | Terhubung ke akun COA |
| balance | numeric(15,2) DEFAULT 0 | Saldo terkini |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |

#### `journals`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| journal_number | text NOT NULL UNIQUE | Auto-generated |
| date | date NOT NULL | |
| description | text | |
| source | text NOT NULL | auto / manual |
| reference_type | text | sales_invoice, purchase_invoice, payment, transfer, goods_receipt, dll |
| reference_id | uuid | ID dokumen terkait |
| customer_id | uuid FK → customers (nullable) | Jurnal terkait customer |
| supplier_id | uuid FK → suppliers (nullable) | Jurnal terkait supplier |
| is_posted | boolean DEFAULT false | |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |

#### `journal_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| journal_id | uuid FK → journals | |
| coa_id | uuid FK → coa | |
| debit | numeric(15,2) DEFAULT 0 | |
| credit | numeric(15,2) DEFAULT 0 | |
| description | text | |

#### `bank_reconciliations`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| date | date NOT NULL | |
| statement_balance | numeric(15,2) | Saldo menurut mutasi bank |
| system_balance | numeric(15,2) | Saldo menurut sistem |
| is_reconciled | boolean DEFAULT false | |
| created_at | timestamptz | |

### Auth & System

#### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK → auth.users | Supabase Auth user ID |
| full_name | text | |
| role | text DEFAULT 'viewer' | admin, staff, viewer |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |

#### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| table_name | text NOT NULL | |
| record_id | uuid NOT NULL | |
| action | text NOT NULL | create, update, delete |
| old_data | jsonb | Data sebelum perubahan |
| new_data | jsonb | Data setelah perubahan |
| user_id | uuid FK → profiles | |
| created_at | timestamptz | |

## Auto-Jurnal Mapping

### 1. Invoice Penjualan (posted)
| Akun | Debit | Credit |
|---|---|---|
| Piutang Usaha | Total (incl. PPN) | |
| Pendapatan Penjualan | | Subtotal |
| PPN Keluaran | | PPN amount |

*Baris PPN hanya muncul jika ada item dengan PPN aktif.*

### 2. Penerimaan Pembayaran dari Customer
| Akun | Debit | Credit |
|---|---|---|
| Kas/Bank (sesuai pilihan) | Jumlah bayar | |
| Piutang Usaha | | Jumlah bayar |

### 3. Invoice Pembelian (posted)
| Akun | Debit | Credit |
|---|---|---|
| Persediaan Barang | Subtotal | |
| PPN Masukan | PPN amount | |
| Hutang Usaha | | Total (incl. PPN) |

### 4. Pembayaran ke Supplier
| Akun | Debit | Credit |
|---|---|---|
| Hutang Usaha | Jumlah bayar | |
| Kas/Bank (sesuai pilihan) | | Jumlah bayar |

### 5. Transfer Kas/Bank
| Akun | Debit | Credit |
|---|---|---|
| Kas/Bank Tujuan | Jumlah | |
| Kas/Bank Asal | | Jumlah |

### 6. Pengeluaran Operasional (Biaya)
| Akun | Debit | Credit |
|---|---|---|
| Akun Beban (sesuai pilihan) | Jumlah | |
| Kas/Bank | | Jumlah |

### 7. HPP — saat invoice penjualan di-post (tanpa goods delivery terpisah)
| Akun | Debit | Credit |
|---|---|---|
| HPP (Beban) | Qty × Harga Rata-rata | |
| Persediaan Barang | | Qty × Harga Rata-rata |

Jurnal ini muncul saat invoice penjualan di-post DAN barang belum dikirim via goods_deliveries sebelumnya. Jika barang sudah dikirim via goods_deliveries (jurnal #9), HPP sudah diakui di sana — jadi tidak double.

HPP dihitung dengan metode Average (rata-rata tertimbang):
```
avg_cost = (stok_lama × avg_lama + qty_beli × harga_beli) / (stok_lama + qty_beli)
```

### 8. Penerimaan Barang belum diinvoice (dari Supplier)
| Akun | Debit | Credit |
|---|---|---|
| Persediaan Barang | Qty × Harga PO | |
| Hutang Barang Diterima | | Qty × Harga PO |

Saat invoice supplier datang:
| Akun | Debit | Credit |
|---|---|---|
| Hutang Barang Diterima | Qty × Harga PO | |
| Hutang Usaha | | Qty × Harga Invoice |
| Selisih Harga (jika ada) | Selisih | |

### 9. Pengiriman Barang belum diinvoice (ke Customer)
| Akun | Debit | Credit |
|---|---|---|
| HPP (Beban) | Qty × Harga Rata-rata | |
| Persediaan Barang | | Qty × Harga Rata-rata |

HPP diakui saat barang dikirim (goods_deliveries di-post), bukan saat invoice dibuat. Pendapatan baru diakui saat invoice di-post.

### 10. Jurnal Umum (Manual — admin only)
Admin input baris debit dan kredit secara manual. Sistem validasi total debit = total kredit sebelum bisa di-post.

## Aturan Bisnis

### Dokumen Status Flow
```
[Draft] → [Posted]
```
- **Draft** — bisa diedit/dihapus, belum ada efek ke jurnal & stok
- **Posted** — auto-jurnal dibuat, stok bergerak, immutable
- Koreksi via **jurnal reversal** (admin only)

### Soft Delete
- Semua tabel master data dan transaksi menggunakan soft delete
- Kolom soft delete: `is_active` (boolean, default true), `deleted_at` (timestamptz, nullable), `deleted_by` (uuid FK → profiles, nullable)
- Kolom ini ada di semua tabel yang memiliki `is_active` pada schema di atas (products, customers, suppliers, coa, accounts, dll)
- Data yang sudah posted tidak bisa di-soft delete — harus reversal dulu

### PPN
- Toggle `is_taxable` per item barang di master data
- `tax_rate` default 11% (bisa diubah per item)
- PPN dihitung otomatis di SO, PO, dan Invoice berdasarkan setting item

## Role-Based Access

| Fitur | Admin | Staff | Viewer |
|---|---|---|---|
| Master Data (CRUD) | Buat/Edit/Hapus | Buat/Edit | Lihat |
| Sales Order & Invoice | Buat/Edit/Post | Buat/Edit | Lihat |
| Purchase Order & Invoice | Buat/Edit/Post | Buat/Edit | Lihat |
| Penerimaan/Pengiriman Barang | Buat/Edit | Buat/Edit | Lihat |
| Kas & Bank | Buat/Edit/Post | Buat/Edit | Lihat |
| Rekonsiliasi Bank | Buat/Edit | — | Lihat |
| Jurnal Umum (Manual) | Buat/Edit/Post | — | — |
| Laporan Keuangan | Lihat/Export | Lihat/Export | Lihat |
| Kelola User & Role | Buat/Edit | — | — |
| Setting (PPN, COA) | Edit | — | Lihat |

Implementasi via Supabase Row Level Security (RLS). Role disimpan di tabel `profiles`.

**Siap berkembang:** role granular per modul (misal: staff penjualan hanya akses modul penjualan).

## Export

- Laporan keuangan (Neraca, Laba Rugi, Arus Kas) ke PDF dan Excel
- **Siap berkembang:** export Invoice, PO, Surat Jalan, Kwitansi

## Future Roadmap (tidak dibangun sekarang, tapi arsitektur siap)

- Multi-gudang & transfer antar gudang
- Batch/serial number tracking
- Expired date tracking
- Stok opname
- Laporan operasional (stok, aging piutang/hutang, penjualan per customer/produk)
- Dashboard grafik (omzet, piutang, hutang, stok rendah)
- Role granular per modul
- Cetak dokumen transaksi (Invoice, PO, Surat Jalan, Kwitansi, Faktur Pajak)
