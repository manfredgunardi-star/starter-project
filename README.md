# Multi-Company ERP — Logistik Pasir & Batu

Monorepo 4 SPA React independen untuk manajemen operasional perusahaan logistik pasir dan batu. Setiap app adalah entitas perusahaan terpisah dengan database sendiri.

## Aplikasi

| App | Direktori | Deskripsi |
|---|---|---|
| **sj-monitor** | `apps/sj-monitor/` | Surat Jalan Monitor — tracking surat jalan, invoice, pembayaran, laporan kas & truk |
| **bul-monitor** | `apps/bul-monitor/` | BUL Monitor — varian sj-monitor untuk perusahaan BUL, mengirim data ke bul-accounting |
| **bul-accounting** | `apps/bul-accounting/` | Pembukuan Truck BUL — akuntansi penuh: COA, jurnal double-entry, kas/bank, laporan keuangan |
| **erp-acc** | `apps/erp-acc/erp-app/` | ERP ACC — sistem ERP enterprise: pembelian, penjualan, aset tetap, cost center (Supabase + Ant Design) |

> `bul-monitor` dan `bul-accounting` saling terhubung melalui Firestore. Kontrak data exchange ada di `shared/bul-bridge/`.

## Peta & Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | Peta per-app: modul, file kunci, cara menjalankan |
| [`SETUP-NEW-LAPTOP.md`](SETUP-NEW-LAPTOP.md) | Langkah memulihkan workspace dari nol di laptop baru |
| [`CLAUDE.md`](CLAUDE.md) | Panduan untuk Claude Code: konvensi, guardrails, pipeline |

## Cabang & Arsip

- **`main`** — cabang utama, semua app aktif
- **`archive/side-projects-2026-06`** — proyek lama/legacy yang tidak lagi dipakai di main (diarsipkan agar tidak membebani working tree)

## Folder Lokal

- **`_local/`** — gitignored. Berisi keys, secrets, dan file sensitif lainnya. Lihat `_local/SECRETS.md` untuk daftar.
- **`~/.claude/projects/C--Project/memory/`** — auto-memory Claude Code lintas-sesi (tidak ikut repo).
