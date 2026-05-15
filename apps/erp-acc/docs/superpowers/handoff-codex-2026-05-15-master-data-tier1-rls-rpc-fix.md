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
