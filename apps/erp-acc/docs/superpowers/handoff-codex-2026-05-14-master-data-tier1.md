# Handoff to Codex — ERP-ACC Phase 1: Master Data Tier 1

**Date:** 2026-05-14
**From:** Claude (Opus, sesi brainstorming + writing-plans + Task 1)
**To:** Codex (OpenAI)
**Branch:** `claude/affectionate-poitras-b50616`
**Worktree:** `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`

---

## TL;DR

Phase 1 Task 1 (SQL migration `026_master_data_tier1.sql`) **selesai dan committed**. Migration belum di‑apply ke Supabase. Task 2-19 di Phase 1 plan adalah pekerjaan Codex (mostly service layer + UI pages mengikuti pattern existing). Task 20 (final verification) kembali ke Claude.

---

## Status Saat Ini

### ✅ Selesai oleh Claude
| Item | Path | Commit SHA |
|---|---|---|
| Spec PRD | `apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md` | `d98d20e` |
| Plan Phase 1 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md` | `015820a` (+ update) |
| Plan Phase 2 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-so-po-closing-cancel-plan.md` | `015820a` |
| Plan Phase 3 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-sales-purchase-returns-plan.md` | `015820a` |
| **Phase 1 Task 1** — SQL migration 026 (initial) | `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql` | `c459344` |
| **Phase 1 Task 1** — RLS fix (split per‑action, delete admin‑only) | sama | `3a79dd5` |

### ⏳ Pending sebelum Codex mulai
**Apply migration 026 ke Supabase.** Saya tidak melakukan apply karena tidak punya konteks Supabase project yang aktif. Ini WAJIB dilakukan dulu sebelum Task 2+ (karena service layer akan call tabel yang belum ada).

Cara apply (pilih salah satu — sesuaikan dengan setup Anda):
```bash
# Opsi A: Supabase CLI lokal (jika sudah linked)
cd apps/erp-acc/erp-app
npx supabase db push

# Opsi B: Manual via Supabase Dashboard SQL editor
# Salin isi file 026_master_data_tier1.sql, paste, run.

# Opsi C: Via Supabase MCP (jika tersedia di Codex environment)
# project_id ERP-ACC perlu Anda tahu sendiri
```

Setelah apply, verify dengan SQL berikut:
```sql
-- 4 tabel baru harus ada
select table_name from information_schema.tables
  where table_name in ('product_categories','payment_terms','tax_codes','warehouses');
-- Expected: 4 rows

-- Seed data
select code from product_categories;     -- 1: UNCAT
select code from payment_terms order by net_days;  -- 4: CASH/NET14/NET30/NET60
select code from tax_codes;              -- 3: PPN11/PPN0/NON
select code from warehouses;             -- 1: WH-MAIN

-- Backfill check (semua harus 0)
select count(*) from products       where category_id is null;
select count(*) from products       where default_tax_code_id is null;
select count(*) from customers      where default_payment_term_id is null;
select count(*) from suppliers      where default_payment_term_id is null;
select count(*) from sales_orders   where warehouse_id is null;
select count(*) from purchase_orders where warehouse_id is null;
select count(*) from goods_deliveries where warehouse_id is null;
select count(*) from goods_receipts  where warehouse_id is null;
```

Jika ada count > 0, JANGAN lanjut — laporkan dulu, ada kemungkinan FK target salah atau backfill tidak jalan.

---

## Tugas untuk Codex (Phase 1 Task 2-19)

Plan lengkap ada di `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md`. Setiap task ditandai `**Suggested executor:**`. Berikut yang ditujukan untuk **Codex (Sonnet)**:

| Task | File yang dibuat/diubah | Estimasi |
|---|---|---|
| 2 | `src/services/productCategoryService.js` (CRUD) | ~30 menit |
| 3 | `src/services/paymentTermService.js` (CRUD) | ~30 menit |
| 4 | `src/services/taxCodeService.js` (CRUD + COA join) | ~45 menit |
| 5 | `src/services/warehouseService.js` (CRUD + setDefault) | ~45 menit |
| 6 | `src/pages/master/ProductCategoriesPage.jsx` (List + form modal) | ~1 jam |
| 7 | `src/pages/master/PaymentTermsPage.jsx` | ~1 jam |
| 8 | `src/pages/master/TaxCodesPage.jsx` (with COA selector) | ~1.5 jam |
| 9 | `src/pages/master/WarehousesPage.jsx` (with set default) | ~1 jam |
| 10 | `src/App.jsx` — 4 routes baru + menu items | ~30 menit |
| 11 | `src/pages/master/ProductsPage.jsx` — tambah dropdown Category + Tax Code | ~45 menit |
| 12 | `src/pages/sales/SalesOrderFormPage.jsx` — dropdown Payment Term + Warehouse | ~1 jam |
| 13 | `src/pages/purchase/PurchaseOrderFormPage.jsx` — sama (mirror) | ~1 jam |
| 16 | `src/pages/sales/GoodsDeliveryFormPage.jsx` — dropdown Warehouse | ~45 menit |
| 17 | `src/pages/purchase/GoodsReceiptFormPage.jsx` — sama | ~45 menit |
| 19 | `tests/playwright/master-data-tier1.spec.js` — smoke e2e | ~1 jam |

**Tasks yang TETAP dengan Claude (Opus) — jangan dikerjakan Codex:**
- **Task 14** — `SalesInvoiceFormPage.jsx` (Payment Term + auto due_date) → financial logic
- **Task 15** — `PurchaseInvoiceFormPage.jsx` (Payment Term + auto due_date) → financial logic
- **Task 18** — `masterDataService.getProducts` join (schema correctness)
- **Task 20** — Final build + verification (verification skill)

---

## Constraints & Aturan Penting (WAJIB BACA)

### Dari `apps/erp-acc/CLAUDE.md` (project rules)
1. **Komunikasi dalam Bahasa Indonesia.** Commit message dalam English (`feat:`, `fix:`, `refactor:`).
2. **Tidak boleh deploy production.** Hanya dev/staging.
3. **Always soft delete** untuk business data — gunakan field `is_active`, `deleted_at`, `deleted_by` (sudah ada di tabel master baru).
4. **ASK before changing financial logic** — kalau ragu menyentuh sesuatu yang menghitung uang/pajak/jurnal: STOP dan tanya.
5. **Build wajib pass** — `cd apps/erp-acc/erp-app && npm run build` sebelum klaim selesai.
6. **No new npm packages** untuk Phase 1 — semua reuse existing.

### Pattern yang harus diikuti
- **Service layer:** mirror pattern `src/services/masterDataService.js`. Pakai `supabase.from(...).select/insert/update/delete`.
- **Pages CRUD:** mirror pattern `src/pages/master/UnitsPage.jsx`. Ant Design `<Table>` + `<Modal>` + `<Form>`.
- **Soft delete di service:** `update set is_active=false, deleted_at=now()` (bukan `.delete()`).
- **RoleGuard di routes:** `<RoleGuard roles={['admin','staff']}>...</RoleGuard>` — pattern dari route lain.

### Antipattern yang dihindari
- ❌ Jangan hapus field lama di `products` (`category` text, `is_taxable`, `tax_rate`) di Phase 1 — biarkan untuk backward compat.
- ❌ Jangan implementasi multi‑warehouse logic di Phase 1 — cuma master + default link.
- ❌ Jangan lupakan smoke test setelah edit form transaksi (SO/PO/GD/GR) — regression risk tinggi.

### Catatan dari Code Review Task 1
Task 1 awal punya issue RLS yang sudah diperbaiki di commit `3a79dd5`:
- Initial: `for all to authenticated using (is_admin_or_staff())` → grants staff hard‑delete
- Fixed: split jadi 4 policies (read/insert/update/delete), **delete = `is_admin()` only**
- **Untuk task SQL berikutnya** (Phase 2, Phase 3): pakai pattern split-per-action ini, bukan `for all`. Plan sudah di‑update untuk mencerminkan ini.

---

## Cara Lanjutkan dari Sini

### Opsi 1 — Codex eksekusi Task 2-13, 16-17, 19 berurutan
1. **Apply migration 026** dulu (lihat "Pending" di atas)
2. Buka plan file: `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md`
3. Eksekusi task per task. Setiap task punya:
   - File path eksak
   - Code skeleton
   - Build verify command
   - Commit message
4. Skip Task 14, 15, 18, 20 (assigned ke Claude). Bisa dikerjakan paralel di sesi Claude.
5. Setelah Codex selesai task list‑nya, **handover balik ke Claude** untuk Task 14/15/18/20.

### Opsi 2 — Codex eksekusi terbatas (mis. Task 2-5 service layer dulu)
Lebih bertahap, lebih mudah di‑review per batch. Recommended kalau ini pertama kali Codex pegang project.

### Format laporan setelah Codex selesai
Tolong info balik ke saya / user:
- Commits yang dibuat (SHA + message)
- File yang ditambahkan/diubah
- Build pass atau tidak
- Manual smoke test result (kalau ada)
- Concerns/blockers

---

## Quick Reference

### Repo paths
```
Worktree root:    C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\
ERP app:          apps/erp-acc/erp-app/   (relatif dari worktree root)
Migrations:       apps/erp-acc/erp-app/supabase/migrations/
Services:         apps/erp-acc/erp-app/src/services/
Pages:            apps/erp-acc/erp-app/src/pages/
Components:       apps/erp-acc/erp-app/src/components/
Tests:            apps/erp-acc/erp-app/tests/playwright/
Docs (specs):     apps/erp-acc/docs/superpowers/specs/
Docs (plans):     apps/erp-acc/docs/superpowers/plans/
```

### Build commands
```bash
cd apps/erp-acc/erp-app
npm run build       # Vite build, harus pass
npm run lint        # ESLint, 0 errors
npm run dev         # Dev server local
npx playwright test tests/playwright/master-data-tier1.spec.js   # E2E
```

### Git workflow
```bash
# Selalu di branch claude/affectionate-poitras-b50616 (sudah checked out)
cd C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616
git status
git log --oneline -10
# Commit per task (lihat plan untuk message yang disarankan per task)
```

### Migration history yang relevan
```
002_master_data.sql        — products, customers, suppliers, coa, units, update_updated_at()
003_sales_tables.sql       — sales_orders, sales_order_items, goods_deliveries
004_purchase_tables.sql    — purchase_orders, purchase_order_items, goods_receipts
005_invoice_payment.sql    — invoices, invoice_items
009_rls_policies.sql       — is_admin(), is_admin_or_staff(), get_my_role(), RLS pattern
011_posting_functions.sql  — post_goods_delivery, post_goods_receipt, inventory RPC
016_period_lock_enforcement — _ensure_period_open()
023_document_linkage.sql   — save_sales_invoice, save_purchase_invoice (latest)
026_master_data_tier1.sql  — ⭐ TASK 1 INI (baru committed)
```

---

## Pertanyaan Yang Mungkin Timbul

**Q: Function `getCOAList()` ada di service mana?**
A: Cek `src/services/masterDataService.js` atau `src/services/journalService.js`. Kalau tidak ada, cari yang select `from('coa')`. Kalau benar‑benar tidak ada, tambahkan di `masterDataService.js`.

**Q: Bagaimana kalau dropdown payment term di SI form harus auto‑hitung due_date?**
A: Itu Task 14 — assigned ke Claude, jangan dikerjakan Codex.

**Q: Apakah perlu mock/seed data untuk Playwright e2e?**
A: Cek tests existing di `tests/playwright/` — kemungkinan ada `setup.js` atau auth storage state. Reuse pattern existing.

**Q: Saya menemukan RLS pattern lain di file SQL existing — pakai yang mana?**
A: Untuk file SQL baru di Phase 2/3, **selalu split per‑action** (4 policies per table) dan **delete = is_admin() only**. Plan files sudah updated untuk merefleksikan ini.

**Q: Saya butuh modifikasi plan/spec — boleh?**
A: Boleh, tapi commit terpisah dengan prefix `docs(erp-acc):` dan jelaskan alasannya. Kalau perubahan signifikan (mempengaruhi keputusan brainstorming), STOP dan minta user konfirmasi dulu.

---

## Kontak

Kalau Codex stuck atau menemukan ambiguitas yang belum terjawab di plan/spec, jangan tebak — kembali ke saya (Claude session di branch yang sama) dengan ringkasan:
- Task # mana
- File yang sudah disentuh
- Apa ambiguitasnya
- Opsi-opsi yang dipertimbangkan

Selamat coding! 🚀

— Claude (Opus 4.7)
