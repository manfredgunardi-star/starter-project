

=== erp-acc\docs\superpowers\handoff-codex-2026-05-14-master-data-tier1.md ===
# Handoff to Codex â€” ERP-ACC Phase 1: Master Data Tier 1

**Date:** 2026-05-14
**From:** Claude (Opus, sesi brainstorming + writing-plans + Task 1)
**To:** Codex (OpenAI)
**Branch:** `claude/affectionate-poitras-b50616`
**Worktree:** `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`

---

## TL;DR

Phase 1 Task 1 (SQL migration `026_master_data_tier1.sql`) **selesai dan committed**. Migration belum diâ€‘apply ke Supabase. Task 2-19 di Phase 1 plan adalah pekerjaan Codex (mostly service layer + UI pages mengikuti pattern existing). Task 20 (final verification) kembali ke Claude.

---

## Status Saat Ini

### âœ… Selesai oleh Claude
| Item | Path | Commit SHA |
|---|---|---|
| Spec PRD | `apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md` | `d98d20e` |
| Plan Phase 1 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md` | `015820a` (+ update) |
| Plan Phase 2 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-so-po-closing-cancel-plan.md` | `015820a` |
| Plan Phase 3 | `apps/erp-acc/docs/superpowers/plans/2026-05-14-sales-purchase-returns-plan.md` | `015820a` |
| **Phase 1 Task 1** â€” SQL migration 026 (initial) | `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql` | `c459344` |
| **Phase 1 Task 1** â€” RLS fix (split perâ€‘action, delete adminâ€‘only) | sama | `3a79dd5` |

### â³ Pending sebelum Codex mulai
**Apply migration 026 ke Supabase.** Saya tidak melakukan apply karena tidak punya konteks Supabase project yang aktif. Ini WAJIB dilakukan dulu sebelum Task 2+ (karena service layer akan call tabel yang belum ada).

Cara apply (pilih salah satu â€” sesuaikan dengan setup Anda):
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

Jika ada count > 0, JANGAN lanjut â€” laporkan dulu, ada kemungkinan FK target salah atau backfill tidak jalan.

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
| 10 | `src/App.jsx` â€” 4 routes baru + menu items | ~30 menit |
| 11 | `src/pages/master/ProductsPage.jsx` â€” tambah dropdown Category + Tax Code | ~45 menit |
| 12 | `src/pages/sales/SalesOrderFormPage.jsx` â€” dropdown Payment Term + Warehouse | ~1 jam |
| 13 | `src/pages/purchase/PurchaseOrderFormPage.jsx` â€” sama (mirror) | ~1 jam |
| 16 | `src/pages/sales/GoodsDeliveryFormPage.jsx` â€” dropdown Warehouse | ~45 menit |
| 17 | `src/pages/purchase/GoodsReceiptFormPage.jsx` â€” sama | ~45 menit |
| 19 | `tests/playwright/master-data-tier1.spec.js` â€” smoke e2e | ~1 jam |

**Tasks yang TETAP dengan Claude (Opus) â€” jangan dikerjakan Codex:**
- **Task 14** â€” `SalesInvoiceFormPage.jsx` (Payment Term + auto due_date) â†’ financial logic
- **Task 15** â€” `PurchaseInvoiceFormPage.jsx` (Payment Term + auto due_date) â†’ financial logic
- **Task 18** â€” `masterDataService.getProducts` join (schema correctness)
- **Task 20** â€” Final build + verification (verification skill)

---

## Constraints & Aturan Penting (WAJIB BACA)

### Dari `apps/erp-acc/CLAUDE.md` (project rules)
1. **Komunikasi dalam Bahasa Indonesia.** Commit message dalam English (`feat:`, `fix:`, `refactor:`).
2. **Tidak boleh deploy production.** Hanya dev/staging.
3. **Always soft delete** untuk business data â€” gunakan field `is_active`, `deleted_at`, `deleted_by` (sudah ada di tabel master baru).
4. **ASK before changing financial logic** â€” kalau ragu menyentuh sesuatu yang menghitung uang/pajak/jurnal: STOP dan tanya.
5. **Build wajib pass** â€” `cd apps/erp-acc/erp-app && npm run build` sebelum klaim selesai.
6. **No new npm packages** untuk Phase 1 â€” semua reuse existing.

### Pattern yang harus diikuti
- **Service layer:** mirror pattern `src/services/masterDataService.js`. Pakai `supabase.from(...).select/insert/update/delete`.
- **Pages CRUD:** mirror pattern `src/pages/master/UnitsPage.jsx`. Ant Design `<Table>` + `<Modal>` + `<Form>`.
- **Soft delete di service:** `update set is_active=false, deleted_at=now()` (bukan `.delete()`).
- **RoleGuard di routes:** `<RoleGuard roles={['admin','staff']}>...</RoleGuard>` â€” pattern dari route lain.

### Antipattern yang dihindari
- âŒ Jangan hapus field lama di `products` (`category` text, `is_taxable`, `tax_rate`) di Phase 1 â€” biarkan untuk backward compat.
- âŒ Jangan implementasi multiâ€‘warehouse logic di Phase 1 â€” cuma master + default link.
- âŒ Jangan lupakan smoke test setelah edit form transaksi (SO/PO/GD/GR) â€” regression risk tinggi.

### Catatan dari Code Review Task 1
Task 1 awal punya issue RLS yang sudah diperbaiki di commit `3a79dd5`:
- Initial: `for all to authenticated using (is_admin_or_staff())` â†’ grants staff hardâ€‘delete
- Fixed: split jadi 4 policies (read/insert/update/delete), **delete = `is_admin()` only**
- **Untuk task SQL berikutnya** (Phase 2, Phase 3): pakai pattern split-per-action ini, bukan `for all`. Plan sudah diâ€‘update untuk mencerminkan ini.

---

## Cara Lanjutkan dari Sini

### Opsi 1 â€” Codex eksekusi Task 2-13, 16-17, 19 berurutan
1. **Apply migration 026** dulu (lihat "Pending" di atas)
2. Buka plan file: `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md`
3. Eksekusi task per task. Setiap task punya:
   - File path eksak
   - Code skeleton
   - Build verify command
   - Commit message
4. Skip Task 14, 15, 18, 20 (assigned ke Claude). Bisa dikerjakan paralel di sesi Claude.
5. Setelah Codex selesai task listâ€‘nya, **handover balik ke Claude** untuk Task 14/15/18/20.

### Opsi 2 â€” Codex eksekusi terbatas (mis. Task 2-5 service layer dulu)
Lebih bertahap, lebih mudah diâ€‘review per batch. Recommended kalau ini pertama kali Codex pegang project.

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
002_master_data.sql        â€” products, customers, suppliers, coa, units, update_updated_at()
003_sales_tables.sql       â€” sales_orders, sales_order_items, goods_deliveries
004_purchase_tables.sql    â€” purchase_orders, purchase_order_items, goods_receipts
005_invoice_payment.sql    â€” invoices, invoice_items
009_rls_policies.sql       â€” is_admin(), is_admin_or_staff(), get_my_role(), RLS pattern
011_posting_functions.sql  â€” post_goods_delivery, post_goods_receipt, inventory RPC
016_period_lock_enforcement â€” _ensure_period_open()
023_document_linkage.sql   â€” save_sales_invoice, save_purchase_invoice (latest)
026_master_data_tier1.sql  â€” â­ TASK 1 INI (baru committed)
```

---

## Pertanyaan Yang Mungkin Timbul

**Q: Function `getCOAList()` ada di service mana?**
A: Cek `src/services/masterDataService.js` atau `src/services/journalService.js`. Kalau tidak ada, cari yang select `from('coa')`. Kalau benarâ€‘benar tidak ada, tambahkan di `masterDataService.js`.

**Q: Bagaimana kalau dropdown payment term di SI form harus autoâ€‘hitung due_date?**
A: Itu Task 14 â€” assigned ke Claude, jangan dikerjakan Codex.

**Q: Apakah perlu mock/seed data untuk Playwright e2e?**
A: Cek tests existing di `tests/playwright/` â€” kemungkinan ada `setup.js` atau auth storage state. Reuse pattern existing.

**Q: Saya menemukan RLS pattern lain di file SQL existing â€” pakai yang mana?**
A: Untuk file SQL baru di Phase 2/3, **selalu split perâ€‘action** (4 policies per table) dan **delete = is_admin() only**. Plan files sudah updated untuk merefleksikan ini.

**Q: Saya butuh modifikasi plan/spec â€” boleh?**
A: Boleh, tapi commit terpisah dengan prefix `docs(erp-acc):` dan jelaskan alasannya. Kalau perubahan signifikan (mempengaruhi keputusan brainstorming), STOP dan minta user konfirmasi dulu.

---

## Kontak

Kalau Codex stuck atau menemukan ambiguitas yang belum terjawab di plan/spec, jangan tebak â€” kembali ke saya (Claude session di branch yang sama) dengan ringkasan:
- Task # mana
- File yang sudah disentuh
- Apa ambiguitasnya
- Opsi-opsi yang dipertimbangkan

Selamat coding! ðŸš€

â€” Claude (Opus 4.7)


=== erp-acc\docs\superpowers\handoff-claude-2026-05-14-master-data-task18.md ===
# Handoff to Claude Opus - ERP-ACC Phase 1 Task 18

Date: 2026-05-14
From: Codex
To: Claude Opus
Branch: `claude/affectionate-poitras-b50616`
Worktree: `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`
Plan: `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md`

## Status

Codex completed Phase 1 Task 2-10 only.

Completed:
- Task 2: `productCategoryService.js`
- Task 3: `paymentTermService.js`
- Task 4: `taxCodeService.js`
- Task 5: `warehouseService.js`
- Task 6: `ProductCategoriesPage.jsx`
- Task 7: `PaymentTermsPage.jsx`
- Task 8: `TaxCodesPage.jsx`
- Task 9: `WarehousesPage.jsx`
- Task 10: routes in `App.jsx` and menu items in `Sidebar.jsx`

Not completed by Codex:
- Task 11-13, 16-17, 19
- Task 14-15 financial due-date work
- Task 18 `masterDataService.getProducts()` join
- Task 20 final verification

Task 18 remains untouched. `apps/erp-acc/erp-app/src/services/masterDataService.js` is not modified in the current Codex diff.

## Files Changed by Codex

New service files:
- `apps/erp-acc/erp-app/src/services/productCategoryService.js`
- `apps/erp-acc/erp-app/src/services/paymentTermService.js`
- `apps/erp-acc/erp-app/src/services/taxCodeService.js`
- `apps/erp-acc/erp-app/src/services/warehouseService.js`

New page files:
- `apps/erp-acc/erp-app/src/pages/master/ProductCategoriesPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/PaymentTermsPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/TaxCodesPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/WarehousesPage.jsx`

Modified existing files:
- `apps/erp-acc/erp-app/src/App.jsx`
- `apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx`

Routes now added:
- `/master/categories`
- `/master/payment-terms`
- `/master/tax-codes`
- `/master/warehouses`

## Verification Run by Codex

From `apps/erp-acc/erp-app`:
- `npm run build` - pass
- Targeted ESLint on changed files - pass
- `git diff --check` - pass

Build has the existing Vite large chunk warning. No new package was added.

Runtime CRUD was not smoke-tested against Supabase because migration 026 is still reported as not applied to the active Supabase project.

## Review Notes

Subagent reviews were used:
- Task 2-5 service spec review: approved.
- Task 2-5 code quality review: initial issues fixed, final approved.
- Task 6-9 page spec review: approved.
- Task 6-9 code quality review: issues fixed.
- Final Task 2-10 review: route mismatch fixed from `/master/product-categories` to `/master/categories`.

Important implementation details:
- Soft delete service functions now set `is_active=false`, `deleted_at`, and `deleted_by`.
- Soft delete is blocked when active/transactional references exist.
- `warehouseService.setDefaultWarehouse()` validates target active warehouse before clearing previous default.
- UI mutation handlers have defensive `canWrite` guards in addition to hidden buttons.
- `Sidebar.jsx` removed an unused `useNavigate` import because the file is now part of targeted lint scope.

## Task 18 for Claude Opus

Task 18 target:
- File: `apps/erp-acc/erp-app/src/services/masterDataService.js`
- Function: `getProducts()`

Current baseline select:

```js
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      base_unit:units!products_base_unit_id_fkey(id, name),
      conversions:unit_conversions(
        id,
        from_unit_id,
        to_unit_id,
        conversion_factor,
        from_unit:units!unit_conversions_from_unit_id_fkey(id, name),
        to_unit:units!unit_conversions_to_unit_id_fkey(id, name)
      )
    `)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}
```

Expected Task 18 change:
- Add join for product category:
  - `category_ref:product_categories!products_category_id_fkey(id, code, name)`
- Add join for default tax code:
  - `default_tax_code:tax_codes!products_default_tax_code_id_fkey(id, code, name, rate, is_inclusive)`
- Keep existing `base_unit` and `conversions` joins.
- Keep backward compatibility with old `products.category`, `products.is_taxable`, and `products.tax_rate`.
- Do not remove legacy fields in Phase 1.

Suggested final shape:

```js
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category_ref:product_categories!products_category_id_fkey(id, code, name),
      default_tax_code:tax_codes!products_default_tax_code_id_fkey(id, code, name, rate, is_inclusive),
      base_unit:units!products_base_unit_id_fkey(id, name),
      conversions:unit_conversions(
        id,
        from_unit_id,
        to_unit_id,
        conversion_factor,
        from_unit:units!unit_conversions_from_unit_id_fkey(id, name),
        to_unit:units!unit_conversions_to_unit_id_fkey(id, name)
      )
    `)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}
```

## Suggested Verification for Task 18

After editing:

```bash
cd apps/erp-acc/erp-app
npm run build
npx eslint src/services/masterDataService.js src/pages/master/ProductsPage.jsx
```

If migration 026 has been applied:

```sql
select
  p.id,
  p.name,
  p.category_id,
  pc.code as category_code,
  p.default_tax_code_id,
  tc.code as tax_code,
  tc.rate
from products p
left join product_categories pc on pc.id = p.category_id
left join tax_codes tc on tc.id = p.default_tax_code_id
where p.is_active = true
limit 10;
```

Expected:
- Existing products have `category_id` from the `UNCAT` backfill.
- Existing products have `default_tax_code_id` from `PPN11` or `NON`.
- The app build passes.

## Caution

Do not change pricing, tax posting, invoice posting, journal logic, or product money formulas as part of Task 18. This task should only enrich the product read query for UI display/defaulting.



=== erp-acc\docs\superpowers\handoff-codex-2026-05-15-master-data-tasks-16-17-19.md ===
# Handoff to Codex â€” ERP-ACC Phase 1: Tasks 16, 17, 19

**Date:** 2026-05-15
**From:** Claude (Sonnet, session after task 13 handoff)
**To:** Codex (OpenAI)
**Branch:** `claude/affectionate-poitras-b50616`
**Worktree:** `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`

---

## TL;DR

Claude selesaikan Tasks 14, 15, 18, 20. Tersisa untuk Codex: **Task 16** (GoodsDeliveryFormPage â€” warehouse dropdown), **Task 17** (GoodsReceiptFormPage â€” warehouse dropdown, mirror Task 16), **Task 19** (Playwright e2e smoke test).

**Semua file Codex sebelumnya (Tasks 2-13) belum di-stage/commit.** Sebelum mulai, commit dulu atau koordinasikan staging dengan session sebelumnya.

---

## Status Branch Saat Ini

### Commits di Branch (git log --oneline -10)
```
5ba01ec feat(erp-acc): add payment_term selector with auto due_date to PI form   â† Claude Task 15
bb8c73d feat(erp-acc): add payment_term selector with auto due_date to SI form   â† Claude Task 14
42aee54 feat(erp-acc): join product_categories & tax_codes in getProducts         â† Claude Task 18
0089fed docs(erp-acc): update plan RLS blueprint + add Codex handoff for Phase 1
3a79dd5 fix(erp-acc): split master tier 1 RLS into per-action policies, restrict delete to admin
c459344 feat(erp-acc): add master data tier 1 schema with backfill defaults       â† SQL Migration 026
```

### Unstaged Changes (Codex Tasks 2-13, belum di-commit)
File-file berikut diubah oleh Codex sesi sebelumnya tapi **belum di-stage**:
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/pages/master/ProductsPage.jsx`
- `src/pages/sales/SalesOrderFormPage.jsx`
- `src/pages/purchase/PurchaseOrderFormPage.jsx`
- `src/services/masterDataService.js`
- `src/services/salesService.js`
- `src/services/purchaseService.js`

Dan file-file **baru (untracked)**:
- `src/services/productCategoryService.js`
- `src/services/paymentTermService.js`
- `src/services/taxCodeService.js`
- `src/services/warehouseService.js`
- `src/pages/master/ProductCategoriesPage.jsx`
- `src/pages/master/PaymentTermsPage.jsx`
- `src/pages/master/TaxCodesPage.jsx`
- `src/pages/master/WarehousesPage.jsx`
- `apps/erp-acc/docs/superpowers/handoff-claude-2026-05-14-master-data-task18.md`

**Langkah wajib sebelum Task 16-17-19:** Stage dan commit semua perubahan Tasks 2-13 terlebih dahulu (atau pastikan worktree bersih dari konflik).

---

## Selesai oleh Claude (Referensi)

### Task 18 â€” `masterDataService.getProducts()` (commit `42aee54`)
`getProducts()` sekarang join dua tabel baru:
```js
.select(`
  *,
  base_unit:units!products_base_unit_id_fkey(id, name),
  conversions:unit_conversions(...),
  category_ref:product_categories!products_category_id_fkey(id, code, name),
  default_tax_code:tax_codes!products_default_tax_code_id_fkey(id, code, name, rate, is_inclusive)
`)
```

### Task 14 â€” `SalesInvoiceFormPage.jsx` (commit `bb8c73d`)
- Tambah `paymentTerms` state, dropdown "Syarat Pembayaran"
- Auto-compute `due_date = invoice.date + payment_term.net_days` via `dayjs`
- `saveSalesInvoice` di `salesService.js` sekarang post-RPC update `invoices.payment_term_id`

### Task 15 â€” `PurchaseInvoiceFormPage.jsx` (commit `5ba01ec`)
Mirror persis Task 14 untuk AP invoice.

### Task 20 â€” Verification
- Build: âœ… `npm run build` pass (exit 0)
- Lint (5 files changed): 0 errors, 4 warnings (acceptable â€” pre-existing pattern)

---

## Tugas Codex: Task 16, 17, 19

---

## Task 16: Update GoodsDeliveryFormPage â€” Warehouse Dropdown

**File yang diubah:**
1. `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx`
2. `apps/erp-acc/erp-app/src/services/salesService.js`

### State file saat ini

**GoodsDeliveryFormPage.jsx** â€” current imports:
```js
import { Space, Flex, Typography, Alert } from 'antd'
// TIDAK ada Select â€” harus ditambah
import { getGoodsDelivery, saveGoodsDelivery, postGoodsDelivery, getSalesOrder } from '../../services/salesService'
```

**Header state saat ini:**
```js
const [header, setHeader] = useState({
  gd_number: '',
  date: today(),
  customer_id: '',
  sales_order_id: '',
  status: 'draft',
  notes: '',
})
```

**saveGoodsDelivery di salesService.js** â€” RPC payload saat ini:
```js
export async function saveGoodsDelivery(gd, items) {
  const { data, error } = await supabase.rpc('save_goods_delivery', {
    p_gd: {
      id:             gd.id             || null,
      date:           gd.date,
      customer_id:    gd.customer_id,
      sales_order_id: gd.sales_order_id || null,
      status:         gd.status         || 'draft',
      notes:          gd.notes          || null,
    },
    // ...
  })
  if (error) throw error
  return data  // returns gd id
}
```

### Perubahan yang diperlukan

**A. GoodsDeliveryFormPage.jsx:**

1. Tambah `Select as AntdSelect` ke antd import:
   ```js
   import { Space, Flex, Typography, Alert, Select as AntdSelect } from 'antd'
   ```

2. Tambah import warehouse service:
   ```js
   import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
   ```

3. Tambah state `warehouses`:
   ```js
   const [warehouses, setWarehouses] = useState([])
   ```

4. Tambah `warehouse_id: ''` ke header initial state:
   ```js
   const [header, setHeader] = useState({
     gd_number: '',
     date: today(),
     customer_id: '',
     sales_order_id: '',
     warehouse_id: '',   // â† tambah ini
     status: 'draft',
     notes: '',
   })
   ```

5. Load warehouses + default pada mount. Untuk GD baru, prefill default warehouse:
   ```js
   useEffect(() => {
     Promise.all([getWarehouses(), getDefaultWarehouse()])
       .then(([whs, def]) => {
         setWarehouses(whs)
         if (isNew && def) setHeader(h => ({ ...h, warehouse_id: def.id }))
       })
       .catch(err => toast.error('Gagal load gudang: ' + err.message))
   }, [])
   ```

6. Dalam useEffect load existing GD (`if (!isNew) { getGoodsDelivery(id)... }`), tambah field ke setHeader:
   ```js
   warehouse_id: gd.warehouse_id || '',
   ```

7. Dalam useEffect load-dari-SO (`from_so` query param), tambah prefill warehouse dari SO:
   ```js
   setHeader(h => ({
     ...h,
     customer_id: so.customer_id,
     sales_order_id: so.id,
     warehouse_id: so.warehouse_id || h.warehouse_id, // inherit dari SO jika ada
   }))
   ```

8. Tambah warehouse Select UI â€” letakkan **setelah DocumentHeader dan sebelum items section**:
   ```jsx
   <Card size="small">
     <Row gutter={16}>
       <Col xs={24} md={10}>
         <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Gudang</div>
         <AntdSelect
           showSearch
           optionFilterProp="label"
           style={{ width: '100%' }}
           placeholder="Pilih gudang..."
           value={header.warehouse_id || undefined}
           onChange={v => setHeader(h => ({ ...h, warehouse_id: v || '' }))}
           disabled={readOnly}
           options={warehouses.map(w => ({ value: w.id, label: w.name }))}
         />
       </Col>
     </Row>
   </Card>
   ```
   Note: `Card`, `Row`, `Col` belum diimport di file ini â€” **harus tambah ke antd import**.
   Ubah import antd menjadi:
   ```js
   import { Space, Flex, Typography, Alert, Select as AntdSelect, Card, Row, Col } from 'antd'
   ```

**B. salesService.js â€” saveGoodsDelivery:**

Sama dengan pola SO/PO/SI/PI â€” post-RPC direct update untuk `warehouse_id`:
```js
export async function saveGoodsDelivery(gd, items) {
  const { data, error } = await supabase.rpc('save_goods_delivery', {
    p_gd: {
      id:             gd.id             || null,
      date:           gd.date,
      customer_id:    gd.customer_id,
      sales_order_id: gd.sales_order_id || null,
      status:         gd.status         || 'draft',
      notes:          gd.notes          || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
    })),
  })
  if (error) throw error

  // Persist warehouse_id â€” not handled by save_goods_delivery RPC
  if (gd.warehouse_id) {
    const { error: whErr } = await supabase
      .from('goods_deliveries')
      .update({ warehouse_id: gd.warehouse_id })
      .eq('id', data)
    if (whErr) throw whErr
  }

  return data
}
```

### Build + Commit

```bash
# Dari apps/erp-acc/erp-app
npm run build   # wajib pass

# Dari worktree root
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx
git add apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(erp-acc): add warehouse selector to GD form"
```

---

## Task 17: Update GoodsReceiptFormPage â€” Warehouse Dropdown

**File yang diubah:**
1. `apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx`
2. `apps/erp-acc/erp-app/src/services/purchaseService.js`

### State file saat ini

**GoodsReceiptFormPage.jsx** â€” current imports (identik strukturnya dengan GoodsDeliveryFormPage):
```js
import { Space, Flex, Typography, Alert } from 'antd'
// TIDAK ada Select, Card, Row, Col â€” harus ditambah
import { getGoodsReceipt, saveGoodsReceipt, postGoodsReceipt, getPurchaseOrder } from '../../services/purchaseService'
```

**Header state saat ini:**
```js
const [header, setHeader] = useState({
  gr_number: '',
  date: today(),
  supplier_id: '',
  purchase_order_id: '',
  status: 'draft',
  notes: '',
})
```

**saveGoodsReceipt di purchaseService.js** â€” RPC payload saat ini:
```js
export async function saveGoodsReceipt(gr, items) {
  const { data, error } = await supabase.rpc('save_goods_receipt', {
    p_gr: {
      id:                gr.id                || null,
      date:              gr.date,
      supplier_id:       gr.supplier_id,
      purchase_order_id: gr.purchase_order_id || null,
      status:            gr.status            || 'draft',
      notes:             gr.notes             || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
    })),
  })
  if (error) throw error
  return data  // returns gr id
}
```

### Perubahan yang diperlukan

**Identik dengan Task 16**, adaptasi untuk GR/PO:

1. Antd import â€” tambah `Select as AntdSelect, Card, Row, Col`
2. Import `getWarehouses, getDefaultWarehouse` dari `warehouseService`
3. State `warehouses`, tambah `warehouse_id: ''` ke header
4. Load warehouses + prefill default untuk GR baru
5. Load existing GR: tambah `warehouse_id: gr.warehouse_id || ''`
6. Load dari PO (`from_po` query param): prefill `warehouse_id: po.warehouse_id || h.warehouse_id`
7. UI Card dengan warehouse Select (identik Task 16)
8. `saveGoodsReceipt` di `purchaseService.js`: post-RPC update `goods_receipts.warehouse_id`

```js
// Tambahan di purchaseService.saveGoodsReceipt setelah `if (error) throw error`:
if (gr.warehouse_id) {
  const { error: whErr } = await supabase
    .from('goods_receipts')
    .update({ warehouse_id: gr.warehouse_id })
    .eq('id', data)
  if (whErr) throw whErr
}
```

### Build + Commit

```bash
npm run build

git add apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx
git add apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "feat(erp-acc): add warehouse selector to GR form"
```

---

## Task 19: Playwright Smoke Test â€” master-data-tier1.spec.js

**File yang dibuat:**
- `apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js`

### Pattern dari spec existing

Baca `tests/ar-ap-aging.spec.js` untuk referensi auth pattern:
- Gunakan `test.use({ storageState: 'tests/.auth.json' })` untuk auth
- Env vars via `process.env.VITE_SUPABASE_URL`, `process.env.TEST_EMAIL`, dll. (dari `.env.test`)

**Catatan penting:** ESLint project ini melaporkan `'process' is not defined` di test files â€” ini **pre-existing issue** di seluruh test suite (bukan error baru yang Anda perkenalkan). Abaikan, atau tambah eslint-disable-line jika diperlukan.

### Spec yang harus dibuat

```js
// tests/playwright/master-data-tier1.spec.js
import { test, expect } from '@playwright/test'

test.describe('Master Data Tier 1 â€” CRUD Smoke', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test('Product Categories: halaman load + seed row ada', async ({ page }) => {
    await page.goto('/master/categories')
    await expect(page.getByText('Kategori Produk')).toBeVisible()
    await expect(page.getByText('Uncategorized')).toBeVisible()
  })

  test('Product Categories: create baru', async ({ page }) => {
    await page.goto('/master/categories')
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('E2E-CAT')
    await page.getByLabel('Nama').fill('E2E Test Category')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible()
    await expect(page.getByText('E2E Test Category')).toBeVisible()
  })

  test('Payment Terms: halaman load + 4 seed rows ada', async ({ page }) => {
    await page.goto('/master/payment-terms')
    await expect(page.getByText('CASH')).toBeVisible()
    await expect(page.getByText('NET14')).toBeVisible()
    await expect(page.getByText('NET30')).toBeVisible()
    await expect(page.getByText('NET60')).toBeVisible()
  })

  test('Payment Terms: create Net 45', async ({ page }) => {
    await page.goto('/master/payment-terms')
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('NET45')
    await page.getByLabel('Nama').fill('Net 45')
    // InputNumber Net Days
    await page.getByLabel('Net Days').fill('45')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible()
    await expect(page.getByText('Net 45')).toBeVisible()
  })

  test('Tax Codes: 3 seed rows ada (PPN11, PPN0, NON)', async ({ page }) => {
    await page.goto('/master/tax-codes')
    await expect(page.getByText('PPN11')).toBeVisible()
    await expect(page.getByText('PPN0')).toBeVisible()
    await expect(page.getByText('NON')).toBeVisible()
  })

  test('Warehouses: default warehouse ada + badge Default terlihat', async ({ page }) => {
    await page.goto('/master/warehouses')
    await expect(page.getByText('Gudang Utama')).toBeVisible()
    await expect(page.getByText('Default')).toBeVisible()
  })

})
```

**Catatan label selector:** Sesuaikan `page.getByLabel(...)` dengan label Ant Design Form yang diimplementasi Codex. Jika label tidak match, gunakan `page.getByPlaceholder(...)` atau `page.locator('input').nth(n)`.

### Run & Commit

```bash
# Dari apps/erp-acc/erp-app â€” pastikan dev server running di port yang sesuai playwright.config.js
npx playwright test tests/playwright/master-data-tier1.spec.js --reporter=list
```

Jika auth storage state belum ada (`tests/.auth.json` tidak exist), cek `tests/` apakah ada script setup auth, atau buat manual auth sesuai pattern spec lain di repo.

```bash
git add apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js
git commit -m "test(erp-acc): add master data tier 1 e2e smoke"
```

---

## Constraints & Aturan (Reminder)

1. **Bahasa Indonesia** untuk komunikasi, **English** untuk commit messages.
2. **Tidak boleh deploy production** â€” hanya dev/staging.
3. **Always soft delete** â€” sudah diimplementasi di services (Tasks 2-5). Jangan ubah.
4. **ASK before changing financial logic** â€” posting GD/GR menyentuh inventory + jurnal HPP. Jangan ubah logic posting.
5. **Build wajib pass** â€” `npm run build` sebelum klaim selesai.
6. **No new npm packages** â€” reuse existing.
7. **Jangan commit Tasks 2-13** yang belum di-commit dari sesi sebelumnya tanpa memahami isinya â€” cek dulu dengan `git diff` dan `git status`.

---

## Pattern yang Dipakai Claude (Referensi untuk Task 16-17)

Berikut pattern tepat yang dipakai Claude untuk Task 14/15 â€” Task 16/17 harus mirip:

### State + Load pattern (dari SalesInvoiceFormPage.jsx yang sudah commit)
```js
const [warehouses, setWarehouses] = useState([])

// di initial header state:
warehouse_id: '',

// useEffect mount:
useEffect(() => {
  Promise.all([getWarehouses(), getDefaultWarehouse()])
    .then(([whs, def]) => {
      setWarehouses(whs)
      if (isNew && def) setHeader(h => ({ ...h, warehouse_id: def.id }))
    })
    .catch(err => toast.error('Gagal load gudang: ' + err.message))
}, [])

// di load existing document:
warehouse_id: gd.warehouse_id || '',
```

### UI pattern (dari SalesInvoiceFormPage.jsx â€” payment term selector)
```jsx
<Card size="small">
  <Row gutter={16}>
    <Col xs={24} md={10}>
      <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Gudang</div>
      <AntdSelect
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        placeholder="Pilih gudang..."
        value={header.warehouse_id || undefined}
        onChange={v => setHeader(h => ({ ...h, warehouse_id: v || '' }))}
        disabled={readOnly}
        options={warehouses.map(w => ({ value: w.id, label: w.name }))}
      />
    </Col>
  </Row>
</Card>
```

### Service post-RPC pattern (dari salesService.js / purchaseService.js yang sudah commit)
```js
// Setelah RPC call + if (error) throw error:
if (gd.warehouse_id) {
  const { error: whErr } = await supabase
    .from('goods_deliveries')   // atau 'goods_receipts'
    .update({ warehouse_id: gd.warehouse_id })
    .eq('id', data)
  if (whErr) throw whErr
}
return data
```

---

## Quick Reference

### Paths
```
Worktree root:    C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\
ERP app:          apps/erp-acc/erp-app/   (relatif dari worktree root)
Services:         apps/erp-acc/erp-app/src/services/
Pages (sales):    apps/erp-acc/erp-app/src/pages/sales/
Pages (purchase): apps/erp-acc/erp-app/src/pages/purchase/
Tests:            apps/erp-acc/erp-app/tests/playwright/
```

### Build & lint commands
```bash
cd apps/erp-acc/erp-app
npm run build                                              # wajib pass
npx eslint src/pages/sales/GoodsDeliveryFormPage.jsx \
           src/services/salesService.js \
           src/pages/purchase/GoodsReceiptFormPage.jsx \
           src/services/purchaseService.js                 # 0 errors
npx playwright test tests/playwright/master-data-tier1.spec.js --reporter=list
```

### warehouseService.js yang sudah ada (Task 5, Codex sesi sebelumnya)
Functions yang bisa digunakan:
- `getWarehouses()` â€” semua warehouse aktif
- `getDefaultWarehouse()` â€” warehouse default (nullable, pakai `.maybeSingle()`)
- `setDefaultWarehouse(id)` â€” toggle default
- `deleteWarehouse(id)` â€” soft delete (blok jika default)

### Catatan lint
Full project lint: 44 pre-existing errors di file yang tidak disentuh Phase 1 (playwright.config.js, test files existing, asset pages, ToastContext, AuthContext, currency.js). Ini bukan dari pekerjaan Phase 1. Targeted lint ke file yang Anda ubah harus 0 errors.

---

## Laporan Setelah Codex Selesai

Tolong informasikan kembali ke Claude / user:
- Commits yang dibuat (SHA + message)
- File yang ditambahkan/diubah
- Build pass / tidak
- Playwright test results (berapa pass)
- Concerns/blockers

Setelah Tasks 16-17-19 selesai, **Phase 1 Plan selesai seluruhnya**. Siap untuk PR ke `main`.

---

â€” Claude (Sonnet 4.6, 2026-05-15)


=== erp-acc\docs\superpowers\handoff-codex-2026-05-15-master-data-tier1-rls-rpc-fix.md ===
# Handoff Codex: Master Data Tier 1 RLS/RPC Soft Delete Fix

Tanggal: 2026-05-15
Branch/worktree: `claude/affectionate-poitras-b50616`
Repo worktree: `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616`
App root: `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\apps\erp-acc\erp-app`

## Status Singkat

User sudah menjalankan migration 027, lalu mencoba hapus data test di:

- Master Data > Kategori Produk
- Master Data > Syarat Pembayaran
- Master Data > Kode Pajak
- Master Data > Gudang non-default

Setelah migration 027, hapus masih gagal dengan error:

```text
new row violates row-level security policy for table "<table_name>"
```

Root cause terakhir: aplikasi masih melakukan soft delete via direct client update `is_active = false`. Pada kombinasi RLS active-row visibility + PostgREST update, row baru yang menjadi inactive tetap ditolak oleh policy. Fix yang berhasil adalah memindahkan soft delete ke RPC `security definer`.

User sudah menjalankan migration 028 yang diberikan di chat, refresh app, lalu mengonfirmasi:

```text
Sempurna! Sekarang sudah berhasil.
```

## Commit Relevan

```text
12fb35c fix: route tier 1 master soft deletes through RPCs
aaf8105 feat: complete master data tier 1 delivery and receipt tasks
1cd3e27 feat(erp-acc): complete master data tier 1 codex tasks 2-13
a8eee6a docs(erp-acc): add Codex handoff for Phase 1 tasks 16-17-19
```

## Perubahan Terakhir

### Migration 028

File:

```text
apps/erp-acc/erp-app/supabase/migrations/028_master_data_tier1_soft_delete_rpcs.sql
```

Isi utama:

- `soft_delete_product_category(p_id uuid)`
- `soft_delete_payment_term(p_id uuid)`
- `soft_delete_tax_code(p_id uuid)`
- `soft_delete_warehouse(p_id uuid)`
- Semua function memakai:
  - `language plpgsql`
  - `security definer`
  - `set search_path = public`
  - guard `if not is_admin_or_staff() then raise exception 'permission denied';`
  - reference checks sebelum update
  - update `is_active = false`, `deleted_at = now()`, `deleted_by = auth.uid()`
  - `grant execute ... to authenticated`

Catatan: user tidak melihat file ini karena Explorer membuka checkout utama:

```text
C:\Project\apps\erp-acc\erp-app\supabase\migrations
```

Sedangkan file dibuat di worktree Claude:

```text
C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\apps\erp-acc\erp-app\supabase\migrations
```

Jika Claude perlu sinkronisasi ke checkout utama, pastikan branch/worktree merge/copy dilakukan secara sadar.

### Service Layer

Empat service master data sekarang memanggil RPC, bukan direct update:

```text
apps/erp-acc/erp-app/src/services/productCategoryService.js
apps/erp-acc/erp-app/src/services/paymentTermService.js
apps/erp-acc/erp-app/src/services/taxCodeService.js
apps/erp-acc/erp-app/src/services/warehouseService.js
```

Mapping:

```js
deleteProductCategory(id) -> supabase.rpc('soft_delete_product_category', { p_id: id })
deletePaymentTerm(id)     -> supabase.rpc('soft_delete_payment_term', { p_id: id })
deleteTaxCode(id)         -> supabase.rpc('soft_delete_tax_code', { p_id: id })
deleteWarehouse(id)       -> supabase.rpc('soft_delete_warehouse', { p_id: id })
```

## Verifikasi

Codex menjalankan:

```bash
npx eslint src/services/productCategoryService.js src/services/paymentTermService.js src/services/taxCodeService.js src/services/warehouseService.js
npm run build
```

Hasil:

- ESLint pass.
- Build pass.
- Manual user test setelah migration 028: hapus berhasil.

## Perhatian Untuk Claude

1. Jangan revert migration 028 atau service RPC delete.
2. Jangan kembali ke direct update `is_active=false` dari browser untuk 4 tabel Tier 1.
3. Kalau perlu merapikan migration history, migration 027 boleh dianggap sebagai intermediate policy attempt; migration 028 adalah fix operasional yang berhasil.
4. Kalau branch akan digabung ke checkout utama, pastikan file migration 028 ikut terbawa. Screenshot user menunjukkan checkout utama belum punya `026/027/028` karena Explorer sedang di `C:\Project\apps\erp-acc\erp-app`, bukan worktree Claude.
5. Masih ada record test `PW-*` yang sebelumnya gagal dihapus. Setelah migration 028 dan app terbaru aktif, user sudah bisa menghapusnya dari UI.

## Next Recommended Check

Untuk analisa Claude berikutnya:

1. Confirm branch contains commits through `12fb35c`.
2. Confirm `supabase/migrations/028_master_data_tier1_soft_delete_rpcs.sql` exists in the target checkout before asking user to apply or deploy.
3. Run `npm run build` from `apps/erp-acc/erp-app`.
4. If doing Playwright, rerun:

```bash
npx playwright test tests/master-data-tier1.spec.js --reporter=line
```

Playwright needs valid `.env` / `.env.test` from the active checkout or process env.


=== erp-acc\docs\superpowers\handoff-claude-2026-05-15-master-data-after-task13.md ===
# Handoff to Claude Opus - ERP-ACC Phase 1 After Codex Task 2-13

Date: 2026-05-15
From: Codex
To: Claude Opus
Branch: `claude/affectionate-poitras-b50616`
Worktree: `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`
Plan: `apps/erp-acc/docs/superpowers/plans/2026-05-14-master-data-tier1-plan.md`

## Current Status

Migration 026 has been applied by the user in Supabase and quick SQL checks passed:
- 4 tables exist: `product_categories`, `payment_terms`, `tax_codes`, `warehouses`
- seed data exists
- backfill null-count checks are all `0`
- RLS is active on all 4 new tables

Codex completed Phase 1 Task 2-13.

Completed by Codex:
- Task 2: `productCategoryService.js`
- Task 3: `paymentTermService.js`
- Task 4: `taxCodeService.js`
- Task 5: `warehouseService.js`
- Task 6: `ProductCategoriesPage.jsx`
- Task 7: `PaymentTermsPage.jsx`
- Task 8: `TaxCodesPage.jsx`
- Task 9: `WarehousesPage.jsx`
- Task 10: master routes/menu
- Task 11: ProductsPage category/tax-code dropdowns + save support
- Task 12: SalesOrderFormPage payment term + warehouse selectors
- Task 13: PurchaseOrderFormPage payment term + warehouse selectors

Still assigned to Claude Opus:
- Task 14: `SalesInvoiceFormPage.jsx` payment term + auto `due_date`
- Task 15: `PurchaseInvoiceFormPage.jsx` payment term + auto `due_date`
- Task 18: `masterDataService.getProducts()` join correctness
- Task 20: final build + manual verification

Codex did not commit or stage changes.

## Files Changed by Codex

New files:
- `apps/erp-acc/erp-app/src/services/productCategoryService.js`
- `apps/erp-acc/erp-app/src/services/paymentTermService.js`
- `apps/erp-acc/erp-app/src/services/taxCodeService.js`
- `apps/erp-acc/erp-app/src/services/warehouseService.js`
- `apps/erp-acc/erp-app/src/pages/master/ProductCategoriesPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/PaymentTermsPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/TaxCodesPage.jsx`
- `apps/erp-acc/erp-app/src/pages/master/WarehousesPage.jsx`
- `apps/erp-acc/docs/superpowers/handoff-claude-2026-05-14-master-data-task18.md`
- `apps/erp-acc/docs/superpowers/handoff-claude-2026-05-15-master-data-after-task13.md`

Modified files:
- `apps/erp-acc/erp-app/src/App.jsx`
- `apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx`
- `apps/erp-acc/erp-app/src/pages/master/ProductsPage.jsx`
- `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx`
- `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx`
- `apps/erp-acc/erp-app/src/services/masterDataService.js`
- `apps/erp-acc/erp-app/src/services/salesService.js`
- `apps/erp-acc/erp-app/src/services/purchaseService.js`

## Implementation Notes

### Task 2-5 Services

Services use Supabase direct CRUD with soft delete:
- `is_active=false`
- `deleted_at`
- `deleted_by`

Soft delete blocks referenced records where practical:
- product category blocks child categories and active products
- payment term blocks customers, suppliers, SO, PO, invoices
- tax code blocks products, customers, suppliers, SO items, PO items, invoice items
- warehouse blocks SO, PO, GD, GR

`warehouseService.setDefaultWarehouse()` validates the target active warehouse before clearing the current default.

### Task 6-10 Pages + Routes

Routes/menu added:
- `/master/categories`
- `/master/payment-terms`
- `/master/tax-codes`
- `/master/warehouses`

Mutation handlers have defensive `canWrite` guards in addition to hidden buttons.

### Task 11 Products

`ProductsPage.jsx` now:
- loads `getProductCategories()` and `getTaxCodes()`
- keeps legacy text `category`
- adds `category_id`
- adds `default_tax_code_id`
- displays master labels from loaded master lists when `getProducts()` has not yet joined category/tax objects
- keeps `is_taxable` and `tax_rate` behavior unchanged

`masterDataService.js` now persists these fields in create/update:
- `category_id`
- `default_tax_code_id`

Important: `getProducts()` was not modified. Task 18 remains for Claude.

### Task 12-13 SO/PO

SO and PO forms now load:
- `getPaymentTerms()`
- `getWarehouses()`
- `getDefaultWarehouse()` for new documents only

Header selectors added:
- `payment_term_id`
- `warehouse_id`

Existing documents populate both fields from the header row.

Because migration 018 `save_sales_order` and `save_purchase_order` RPCs do not read the new FK keys yet, the frontend services include keys in `p_so`/`p_po` for forward compatibility, then do a post-RPC direct update:
- `salesService.saveSalesOrder()` updates `sales_orders.payment_term_id` and `sales_orders.warehouse_id`
- `purchaseService.savePurchaseOrder()` updates `purchase_orders.payment_term_id` and `purchase_orders.warehouse_id`

This keeps the existing atomic RPC for header/items, while persisting the new nullable FK fields without adding a migration from Codex.

## Verification Run by Codex

From `apps/erp-acc/erp-app`:

```bash
npx eslint src/services/productCategoryService.js src/services/paymentTermService.js src/services/taxCodeService.js src/services/warehouseService.js src/pages/master/ProductCategoriesPage.jsx src/pages/master/PaymentTermsPage.jsx src/pages/master/TaxCodesPage.jsx src/pages/master/WarehousesPage.jsx src/App.jsx src/components/layout/Sidebar.jsx src/pages/master/ProductsPage.jsx src/services/masterDataService.js src/pages/sales/SalesOrderFormPage.jsx src/services/salesService.js src/pages/purchase/PurchaseOrderFormPage.jsx src/services/purchaseService.js
npm run build
git diff --check
```

Results:
- targeted ESLint: pass
- build: pass
- diff check: pass, only CRLF warnings on touched files

Build still shows existing Vite large chunk warning. No new npm package was added.

## Reviews

Subagent-driven development was used with review gates.

Important review fixes already addressed:
- service soft delete now blocks referenced master records
- warehouse default switch validates target first
- mutation handlers have `canWrite` guard
- category route corrected to `/master/categories`
- `ProductsPage` state update no longer calls `setConversions()` inside `setFormData()` updater
- tax-rate fallback was reverted to legacy behavior after review, to avoid unapproved tax behavior change
- SO/PO hook lint warnings fixed with stable toast refs

## Remaining Claude Tasks

### Task 14 - SalesInvoiceFormPage

Add payment term selector and auto-compute `due_date` from invoice date + `payment_terms.net_days`.

Guardrails:
- This affects AR aging, so keep under Claude Opus.
- Preserve existing invoice posting/save behavior.
- Ensure `payment_term_id` is persisted to `invoices`. The existing `save_sales_invoice` RPC likely does not read this new field; verify current RPC body first and choose the safest fix.

### Task 15 - PurchaseInvoiceFormPage

Mirror Task 14 for AP invoice due date.

Guardrails:
- This affects AP aging, so keep under Claude Opus.
- Ensure `payment_term_id` persists to `invoices`.

### Task 18 - masterDataService.getProducts

Current `getProducts()` is still baseline and not joined to the new master tables.

Expected join:

```js
category_ref:product_categories!products_category_id_fkey(id, code, name),
default_tax_code:tax_codes!products_default_tax_code_id_fkey(id, code, name, rate, is_inclusive),
```

Keep:
- `base_unit`
- `conversions`
- legacy `category`, `is_taxable`, `tax_rate`

Do not remove legacy fields in Phase 1.

### Task 20 - Final Verification

Suggested:
- Run full build.
- Run targeted lint again.
- Manually smoke:
  - Master categories/payment terms/tax codes/warehouses list pages load.
  - Product edit shows category + tax code dropdowns and persists IDs.
  - New SO defaults warehouse and saves payment term/warehouse.
  - New PO defaults warehouse and saves payment term/warehouse.
  - SI/PI due date recompute after Claude Task 14-15.
  - Confirm no posting/journal regressions.

## Residual Risk / Suggested Follow-up

Existing `createProduct()` / `updateProduct()` still save product and conversions non-atomically:
- create product succeeds but conversion insert can fail after product is created
- update product succeeds, old conversions are deleted, then new conversion insert can fail

This was pre-existing behavior. Codex did not add a new RPC/migration because Phase 1 Task 11 only asked for dropdown integration. Consider a later hardening task to move product + unit conversion save into a Supabase RPC transaction.



=== sj-monitor\docs\superpowers\handoff-2026-05-12-ui-simplification-perf.md ===
# Handoff: UI Simplification & Performance

Date: 2026-05-12
Repo root: `C:\Project`
Project: `C:\Project\apps\sj-monitor`
Branch: `codex/sj-ui-simplification-perf`

## Current State

Implementation plan executed from:
`C:\Project\apps\sj-monitor\.claude\worktrees\sweet-bardeen-4f6be2\docs\superpowers\plans\2026-05-11-ui-simplification-perf.md`

Completed commits on branch:

- `12128ee` feat(sj-monitor): add reusable Pagination component
- `e669943` feat(sj-monitor): add useScrollDirection hook for mobile auto-hide
- `2a290e8` feat(sj-monitor): auto-hide DockNav on mobile scroll-down
- `16a840a` refactor(sj-monitor): extract KeuanganManagement to lazy page + add pagination
- `8935275` refactor(sj-monitor): extract InvoiceManagement to lazy page + add pagination
- `77c3c8d` refactor(sj-monitor): extract UangMukaManagement to lazy page + add pagination
- `0252c3c` refactor(sj-monitor): extract MasterDataManagement to lazy page + add pagination
- `cba0a5d` refactor(sj-monitor): replace SJ virtualizer with Pagination component
- `75791a2` refactor(sj-monitor): cleanup unused imports and add spinner for lazy page loads
- `c861823` chore(sj-monitor): tidy UI simplification whitespace
- `50f6e94` fix(sj-monitor): clamp pagination state and reset DockNav on desktop resize

## What Changed

- Added shared pagination in `apps/sj-monitor/src/components/Pagination.jsx`.
- Added mobile scroll-direction hook in `apps/sj-monitor/src/hooks/useScrollDirection.js`.
- Updated `apps/sj-monitor/src/components/DockNav.jsx` to auto-hide on mobile scroll down and restore on desktop resize.
- Extracted these inline `App.jsx` components into lazy pages:
  - `apps/sj-monitor/src/pages/KeuanganPage.jsx`
  - `apps/sj-monitor/src/pages/InvoicePage.jsx`
  - `apps/sj-monitor/src/pages/UangMukaPage.jsx`
  - `apps/sj-monitor/src/pages/MasterDataPage.jsx`
- Replaced SJ list virtualizer with the shared pagination component.
- Added `PageLoader` Suspense spinner in `App.jsx` and `@keyframes spin` in `index.css`.
- Added page clamping so lists do not go blank if data shrinks while user is on a later page.

## Validation Already Run

From `C:\Project\apps\sj-monitor`:

- `npm run build` passed.
- `npm test` passed: 3 test files, 14 tests.
- `npm run lint` exited 0 with existing warnings only:
  - `src/services/payslipService.js`: unused `query`, `where`
  - `src/utils/session.js`: unused `_`
  - `src/utils/truckReportHelpers.js`: unused `e`
- Browser smoke test opened `http://127.0.0.1:5173/` and loaded the login page with 0 console errors.

## Review Notes

Final subagent review initially found:

- Pagination could show an empty list when data shrank on a later page.
- DockNav could remain hidden after resizing from mobile to desktop.

Both were fixed in commit `50f6e94`.

No changes were made to:

- `firestore.rules`
- Firebase config
- Auth/login flow
- Firestore schema
- Invoice pricing formulas
- Uang Muka allocation/calculation logic

## Workspace Notes

Working tree still contains unrelated/untracked existing files under:

- `apps/sj-monitor/.claude/worktrees/*`
- `apps/sj-monitor/.playwright-mcp/*`
- `apps/sj-monitor/.superpowers/brainstorm/*`

These were not touched as part of the implementation.

## Suggested Resume Steps

1. Start from `C:\Project` on branch `codex/sj-ui-simplification-perf`.
2. Re-run quick validation:
   - `cd apps/sj-monitor`
   - `npm run build`
   - `npm test`
   - `npm run lint`
3. If credentials are available, manually verify authenticated tabs:
   - SJ list pagination and filter reset.
   - Keuangan filter/PT pagination.
   - Invoice belum-terinvoice and invoice list pagination.
   - Uang Muka search reset.
   - Master Data Truck/Supir/Rute/Material pagination.
   - Mobile DockNav hide/reveal behavior.
   - Desktop DockNav remains visible.
4. If manual verification passes, decide whether to push branch or open PR.

## Resume Notes: 2026-05-12

Validation re-run from `C:\Project\apps\sj-monitor`:

- `npm run build` passed.
- `npm test` passed: 3 test files, 14 tests.
- `npm run lint` exited 0 with the same existing warnings listed above.
- `git diff --check -- apps/sj-monitor` passed.

Browser smoke:

- Dev server started at `http://127.0.0.1:5173/`.
- Browser loaded the app and reached the authenticated dashboard using the existing local browser session.
- Console showed repeated React warnings: `Maximum update depth exceeded` in `SuratJalanMonitor`.
- The warning points around existing `useSettings`/dashboard state flow and not to the extracted lazy pages directly. The implementation branch did not change `useSettings`, Firestore rules, auth, Firebase config, or the uang jalan reconcile logic. Treat this as a separate runtime investigation unless the next session decides to include it.

Next practical decision:

- If this warning is acceptable as pre-existing baseline, continue with authenticated tab QA and then push/open PR.
- If zero console warnings are required, investigate the `SuratJalanMonitor` update-depth warning before push/PR. Be careful: likely candidates are force-logout/settings or uang jalan reconcile behavior, so ask before changing money-related reconciliation logic.

