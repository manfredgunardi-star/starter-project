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

