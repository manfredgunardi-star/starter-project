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

