# Design Spec: Invoice Penjualan Redesign

**Tanggal:** 2026-05-04  
**Status:** Approved  
**Referensi:** Format Invoice LMJ (PT Loka Manggala Jaya — Proforma Invoice)

---

## Problem Statement

Template invoice penjualan saat ini terlalu sederhana: header abu-abu biasa, tabel dengan header terang, tidak ada terbilang, tidak ada area tanda tangan, dan tidak ada info rekening bank. Hasil cetaknya tidak terlihat profesional untuk dokumen B2B.

---

## Goal

Redesign `InvoicePrintTemplate.jsx` menjadi tampilan profesional yang:
- Mengikuti struktur layout PDF referensi LMJ
- Menggunakan aksen biru profesional (`#1D4ED8`) sebagai pengganti merah LMJ
- Menambahkan section Terbilang (jumlah dalam kata-kata Rupiah)
- Menambahkan area tanda tangan dan info rekening bank di footer
- Tetap graceful jika field company baru belum diisi

---

## Scope

### In Scope
- Redesign `InvoicePrintTemplate.jsx` dan `InvoicePrintTemplate.css`
- Buat utility `src/utils/terbilang.js`
- Tambah 5 field baru di tabel `companies` via SQL migration
- Update form Company Settings (`CompanySettingsPage` atau ekuivalen) untuk input field baru
- Kolom Pajak **dihilangkan** dari tabel item (PPN tetap di totals section)

### Out of Scope
- Perubahan pada logika jurnal atau posting invoice
- Perubahan skema tabel `invoices` atau `invoice_items`
- Fitur preview real-time di form invoice

---

## Layout & Struktur (6 Zona)

```
┌─────────────────────────────────────────────────────────────┐
│ ZONA 1 — HEADER                                             │
│ [LOGO kiri]  Nama Perusahaan        INVOICE PENJUALAN       │
│              Alamat, Kota           (judul besar, bold)     │
│              Telp · Email · NPWP                            │
│                                     No. INV/2026/001        │
│                                     Tanggal: 01 Mei 2026    │
│                                     Jatuh Tempo: 30 Mei     │
│                                     Term: 30 Hari           │
├─ garis biru (#1D4ED8, 2px) ─────────────────────────────────┤
│ ZONA 2 — BILL TO                                            │
│ ┌──────────────────────────────────┐                        │
│ │ DITAGIHKAN KEPADA (label biru)   │                        │
│ │ Nama Customer (bold, 13px)       │                        │
│ │ Alamat customer (abu-abu, 11px)  │                        │
│ └──────────────────────────────────┘                        │
├─────────────────────────────────────────────────────────────┤
│ ZONA 3 — TABEL ITEM                                         │
│ Header: bg #1E293B, teks putih, padding 8px                 │
│ Kolom: No | Deskripsi | Qty | Satuan | Harga Satuan | Jumlah│
│ Row: border #E5E7EB, alternating bg #F9FAFB                 │
├─────────────────────────────────────────────────────────────┤
│ ZONA 4 — TOTALS (right-aligned, lebar 260px)                │
│   Subtotal          Rp xx.xxx.xxx                           │
│   PPN 11%           Rp xx.xxx.xxx   (hanya jika taxTotal>0) │
│ ┌─────────────────────────────────┐                         │
│ │ Grand Total    Rp xx.xxx.xxx    │  bg biru, teks putih    │
│ └─────────────────────────────────┘                         │
├─────────────────────────────────────────────────────────────┤
│ ZONA 5 — TERBILANG                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ TERBILANG (label biru, uppercase)                       │ │
│ │ Tiga Puluh Tiga Juta ... Rupiah (bold, 12px)            │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ZONA 6 — FOOTER (2 kolom)                                   │
│ [KIRI]                          [KANAN]                     │
│ Catatan Pembayaran (bold)       Hormat kami,                │
│ • baris dari field notes                                     │
│   (jika kosong, tidak tampil)                               │
│                                 ____________________        │
│ Transfer ke:                    [signer_name] (bold)        │
│ [bank_name] – [account_number]  [signer_title]              │
│ a.n. [account_name]                                         │
│ (seluruh blok bank hidden jika field kosong)                │
├─ garis tipis (#E5E7EB, 1px) ────────────────────────────────┤
│ [footer disclaimer — company.footer_text, 9px, #9CA3AF]    │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Style

| Elemen | Nilai |
|---|---|
| Font | Arial, Helvetica, sans-serif |
| Accent biru | `#1D4ED8` |
| Table header bg | `#1E293B` (slate-900), teks `#FFFFFF` |
| Grand Total row bg | `#1D4ED8`, teks `#FFFFFF`, font-weight bold |
| Alternating row bg | `#F9FAFB` (setiap baris genap) |
| Border tabel | `1px solid #E5E7EB` |
| Border box (Bill To, Terbilang) | `1px solid #D1D5DB`, border-radius 4px |
| Label section (DITAGIHKAN, TERBILANG) | `#1D4ED8`, uppercase, font-size 10px, font-weight 600 |
| Teks body | `#111827`, font-size 12px |
| Teks sekunder | `#6B7280`, font-size 11px |
| Divider bawah header | `2px solid #1D4ED8` |

---

## Field Baru — Tabel `companies`

SQL migration baru (migration 024, setelah `023_document_linkage.sql`):

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_title text;
```

Semua field nullable. Jika kosong, zona bank dan tanda tangan tidak dirender (hidden gracefully).

### UI Company Settings

Tambah section baru "**Informasi Invoice**" di form Company Settings dengan field:
- Nama Bank (text input)
- Nomor Rekening (text input)
- Nama Pemilik Rekening (text input)
- Nama Penanda Tangan (text input)
- Jabatan Penanda Tangan (text input)

---

## Utility: `terbilang.js`

**Path:** `src/utils/terbilang.js`  
**Signature:** `export function terbilang(angka: number): string`

Aturan:
- Input: bilangan bulat positif (grand total dalam Rupiah, tanpa desimal)
- Output: string kata-kata Rupiah Indonesia, kapital di awal kata
- Rentang: 0 sampai 999.999.999.999 (ratusan milyar, cukup untuk konteks bisnis)
- Contoh: `terbilang(1831500000)` → `"Satu Milyar Delapan Ratus Tiga Puluh Satu Juta Lima Ratus Ribu Rupiah"`
- Edge case: `terbilang(0)` → `"Nol Rupiah"`

---

## File yang Berubah

| File | Perubahan |
|---|---|
| `src/components/shared/InvoicePrintTemplate.jsx` | Rewrite template sesuai 6 zona |
| `src/components/shared/InvoicePrintTemplate.css` | Rewrite style (warna, table, box) |
| `src/utils/terbilang.js` | File baru — utility konversi angka ke kata |
| `erp-app/supabase/migrations/024_companies_invoice_fields.sql` | Migration 5 field baru |
| `erp-app/src/pages/settings/CompanySettingsPage.jsx` | Tambah section "Informasi Invoice" |

---

## Behavior & Edge Cases

| Kondisi | Perilaku |
|---|---|
| `company.logo_url` kosong | Logo tidak dirender, company name tetap di kiri |
| `company.bank_name` kosong | Seluruh blok "Transfer ke" tidak tampil |
| `company.signer_name` kosong | Seluruh blok tanda tangan tidak tampil |
| `invoice.due_date` tidak diisi | Baris "Jatuh Tempo" tidak tampil |
| `invoice.notes` kosong | Section "Catatan Pembayaran" tidak tampil |
| `taxTotal === 0` | Baris PPN tidak tampil di totals |
| Invoice multi-item | Semua item tampil di tabel, terbilang dihitung dari `invoice.total` |
| Status badge | Dihapus dari template (info status ada di daftar invoice, bukan di dokumen cetak) |

---

## Tidak Berubah

- Props `InvoicePrintTemplate`: tetap `{ invoice, company }` — tidak ada breaking change
- Hook `usePrintInvoice.js` — tidak perlu diubah
- Logika hitung subtotal, taxTotal, grandTotal di dalam component — tetap sama
- Semua field di tabel `invoices` dan `invoice_items`
