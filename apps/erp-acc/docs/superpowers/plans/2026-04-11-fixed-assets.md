# Fixed Assets Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan modul Aset Tetap lengkap ke ERP-ACC: register aset, auto-journal perolehan, auto-generate jadwal penyusutan, bulk posting penyusutan, disposal (sale & writeoff), 5 laporan, dan bulk import Excel.

**Architecture:** Migration `014_fixed_assets.sql` menambah 4 tabel (`asset_categories`, `assets`, `depreciation_schedules`, `asset_disposals`) plus RLS + audit trigger + 5 RPC `security definer`. Services layer React memanggil tabel langsung untuk read/CRUD master dan memanggil RPC untuk operasi yang menulis jurnal (acquisition, depreciation batch, disposal). UI terletak di `src/pages/assets/` sebagai folder fitur tersendiri.

**Tech Stack:** Supabase PostgreSQL (migrations + RPC), React 18 + Vite, Tailwind CSS, Lucide React icons, `jspdf-autotable` (PDF), `xlsx` (Excel).

**Project has no test framework** (per CLAUDE.md). Validation dilakukan manual via browser + SQL verification query di Supabase Studio. Tiap task yang mengubah UI WAJIB di-verify dengan `npm run build` sebelum commit.

**Reference spec:** [`docs/superpowers/specs/2026-04-11-fixed-assets-design.md`](../specs/2026-04-11-fixed-assets-design.md)

**Prerequisites:**
- Migration 001–013 sudah diapply dan seed.sql awal sudah ter-load.
- User testing punya role `admin` atau `staff` di tabel `profiles`.
- Supabase Studio dapat diakses untuk SQL smoke verification.

**Model Tier Guide:**
- 🟢 **Haiku**: CRUD pages, form components, styling, simple services, report pages boilerplate
- 🔵 **Sonnet**: SQL migrations, PostgreSQL RPC, business logic services, auto-journal, complex form state, debugging

---

## File Structure

| File | Jenis | Tanggung jawab |
|---|---|---|
| `erp-app/supabase/migrations/014_fixed_assets.sql` | Create | 4 tabel, RLS, audit triggers, 5 RPC functions |
| `erp-app/supabase/seed.sql` | Modify | Tambah COA baru (3 aset, 5 akum, 5 beban, 2 gain/loss) + seed 5 `asset_categories` |
| `erp-app/src/services/assetCategoryService.js` | Create | CRUD kategori aset |
| `erp-app/src/services/assetService.js` | Create | CRUD aset + orchestrate acquisition + schedule generation |
| `erp-app/src/services/depreciationService.js` | Create | Preview & bulk post penyusutan per periode |
| `erp-app/src/services/assetDisposalService.js` | Create | Preview & execute disposal |
| `erp-app/src/pages/assets/AssetCategoriesPage.jsx` | Create | Master kategori |
| `erp-app/src/pages/assets/AssetsPage.jsx` | Create | List aset dengan filter |
| `erp-app/src/pages/assets/AssetFormPage.jsx` | Create | Create & edit aset |
| `erp-app/src/pages/assets/AssetDetailPage.jsx` | Create | Kartu Aset (schedule + riwayat + audit) |
| `erp-app/src/pages/assets/DepreciationRunPage.jsx` | Create | Bulk post penyusutan per periode |
| `erp-app/src/pages/assets/AssetDisposalFormPage.jsx` | Create | Form disposal (sale/writeoff) |
| `erp-app/src/pages/assets/AssetBulkImportPage.jsx` | Create | Upload Excel bulk import |
| `erp-app/src/components/assets/AssetCategoryFormModal.jsx` | Create | Modal CRUD kategori |
| `erp-app/src/components/assets/AssetPaymentFields.jsx` | Create | Sub-form mode pembayaran |
| `erp-app/src/components/assets/DepreciationPreviewTable.jsx` | Create | Preview bulk penyusutan |
| `erp-app/src/components/assets/DepreciationScheduleTable.jsx` | Create | Tabel schedule aset |
| `erp-app/src/components/assets/DisposalPreviewCard.jsx` | Create | Preview disposal |
| `erp-app/src/pages/reports/AssetsListReportPage.jsx` | Create | Laporan 1 |
| `erp-app/src/pages/reports/DepreciationPeriodReportPage.jsx` | Create | Laporan 3 |
| `erp-app/src/pages/reports/AssetDisposalsReportPage.jsx` | Create | Laporan 4 |
| `erp-app/src/pages/reports/AssetsSummaryReportPage.jsx` | Create | Laporan 5 |
| `erp-app/src/App.jsx` | Modify | Tambah 12 routes baru |
| `erp-app/src/components/layout/Sidebar.jsx` (atau ekuivalen) | Modify | Tambah section "Aset Tetap" + 4 menu laporan |
| `erp-app/src/pages/reports/BalanceSheetPage.jsx` | Verify | Pastikan breakdown per kategori muncul otomatis setelah COA expand |

---

## Phase 1 — Database Foundation

### Task 1: Create migration 014 — tables & indexes 🔵 Sonnet

**Files:**
- Create: `erp-app/supabase/migrations/014_fixed_assets.sql`

**Catatan:** Tulis header migration dan 4 `create table` statement + index. Belum isi RLS atau RPC (task berikutnya di file yang sama).

- [ ] **Step 1: Tulis header + tabel `asset_categories`**

```sql
-- ============================================================
-- Migration 014: Fixed Assets Module
-- Tables: asset_categories, assets, depreciation_schedules, asset_disposals
-- ============================================================

create table asset_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_useful_life_months int not null check (default_useful_life_months > 0),
  asset_account_id uuid not null references coa(id),
  accumulated_depreciation_account_id uuid not null references coa(id),
  depreciation_expense_account_id uuid not null references coa(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);
create index idx_asset_categories_code on asset_categories(code) where is_active;
```

- [ ] **Step 2: Tulis tabel `assets`**

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category_id uuid not null references asset_categories(id),
  acquisition_date date not null,
  acquisition_cost numeric(18,2) not null check (acquisition_cost > 0),
  salvage_value numeric(18,2) not null default 0 check (salvage_value >= 0),
  useful_life_months int not null check (useful_life_months > 0),
  depreciation_method text not null default 'straight_line'
    check (depreciation_method in ('straight_line')),
  depreciation_start_date date not null,
  location text,
  description text,
  acquisition_journal_id uuid references journals(id),
  payment_method text not null
    check (payment_method in ('cash_bank', 'hutang', 'uang_muka', 'mixed')),
  supplier_id uuid references suppliers(id),
  status text not null default 'active'
    check (status in ('active', 'disposed', 'fully_depreciated')),
  disposed_at date,
  disposal_type text check (disposal_type in ('sale', 'writeoff')),
  disposal_journal_id uuid references journals(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint chk_depreciable_positive check (acquisition_cost > salvage_value)
);
create index idx_assets_category on assets(category_id) where is_active;
create index idx_assets_status on assets(status) where is_active;
create index idx_assets_code on assets(code);
```

- [ ] **Step 3: Tulis tabel `depreciation_schedules`**

```sql
create table depreciation_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  period text not null,
  period_date date not null,
  sequence_no int not null check (sequence_no > 0),
  amount numeric(18,2) not null check (amount >= 0),
  accumulated_amount numeric(18,2) not null,
  book_value_end numeric(18,2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'cancelled')),
  journal_id uuid references journals(id),
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  unique (asset_id, period)
);
create index idx_depreciation_schedules_asset on depreciation_schedules(asset_id);
create index idx_depreciation_schedules_period on depreciation_schedules(period);
create index idx_depreciation_schedules_status on depreciation_schedules(status);
```

- [ ] **Step 4: Tulis tabel `asset_disposals`**

```sql
create table asset_disposals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  disposal_date date not null,
  disposal_type text not null check (disposal_type in ('sale', 'writeoff')),
  sale_price numeric(18,2),
  payment_account_id uuid references coa(id),
  book_value_at_disposal numeric(18,2) not null,
  accumulated_at_disposal numeric(18,2) not null,
  gain_loss numeric(18,2) not null,
  journal_id uuid not null references journals(id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_asset_disposals_asset on asset_disposals(asset_id);
create index idx_asset_disposals_date on asset_disposals(disposal_date);
```

- [ ] **Step 5: Verifikasi syntax — tidak apply dulu**

```bash
cd c:/Project/ERP-ACC/erp-app
grep -c "create table" supabase/migrations/014_fixed_assets.sql
```
Expected: `4`

- [ ] **Step 6: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add migration 014 tables for fixed assets module"
```

---

### Task 2: Migration 014 — RLS policies & audit triggers 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

- [ ] **Step 1: Tambah enable RLS + policies di bawah definisi tabel**

```sql
-- ============================================================
-- RLS
-- ============================================================
alter table asset_categories       enable row level security;
alter table assets                 enable row level security;
alter table depreciation_schedules enable row level security;
alter table asset_disposals        enable row level security;

-- asset_categories: standard master pattern
create policy "auth read asset_categories" on asset_categories
  for select to authenticated using (true);
create policy "staff insert asset_categories" on asset_categories
  for insert to authenticated with check (is_admin_or_staff());
create policy "staff update asset_categories" on asset_categories
  for update to authenticated using (is_admin_or_staff());
create policy "admin delete asset_categories" on asset_categories
  for delete to authenticated using (is_admin());

-- assets: standard master pattern
create policy "auth read assets" on assets
  for select to authenticated using (true);
create policy "staff insert assets" on assets
  for insert to authenticated with check (is_admin_or_staff());
create policy "staff update assets" on assets
  for update to authenticated using (is_admin_or_staff());
create policy "admin delete assets" on assets
  for delete to authenticated using (is_admin());

-- depreciation_schedules & asset_disposals: RPC-only write
-- (no insert/update policy exposed to client; RPC with security definer handles writes)
create policy "auth read depreciation_schedules" on depreciation_schedules
  for select to authenticated using (true);
create policy "auth read asset_disposals" on asset_disposals
  for select to authenticated using (true);
```

- [ ] **Step 2: Tambah audit triggers**

```sql
-- ============================================================
-- Audit triggers (reuse existing audit_log_trigger function)
-- ============================================================
create trigger audit_assets_trigger
  after insert or update or delete on assets
  for each row execute function audit_log_trigger();

create trigger audit_asset_categories_trigger
  after insert or update or delete on asset_categories
  for each row execute function audit_log_trigger();
```

- [ ] **Step 3: Verifikasi `audit_log_trigger` function sudah ada di migrasi sebelumnya**

```bash
grep -l "audit_log_trigger" erp-app/supabase/migrations/013_audit_triggers.sql
```
Expected: file ada → function sudah terdefinisi.

Jika tidak ada, buka `013_audit_triggers.sql` dan copy definisi helper supaya tasknya self-contained. Kalau nama function beda, adjust.

- [ ] **Step 4: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add RLS policies and audit triggers for fixed assets"
```

---

### Task 3: Update seed.sql — COA baru + 5 kategori 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/seed.sql`

- [ ] **Step 1: Tambah 3 akun aset baru setelah baris `('1-22000', 'Kendaraan', ...)`**

Edit `seed.sql`, temukan blok insert COA aset dan tambahkan:

```sql
  ('1-23000', 'Mesin', 'asset', 'debit'),
  ('1-24000', 'Bangunan', 'asset', 'debit'),
  ('1-25000', 'Inventaris Kantor', 'asset', 'debit'),
```

- [ ] **Step 2: Tambah 5 akun akumulasi penyusutan per kategori**

Setelah baris `('1-29000', 'Akumulasi Penyusutan', 'asset', 'debit');`, tambahkan statement insert baru:

```sql
insert into coa (code, name, type, normal_balance) values
  ('1-29100', 'Akum. Penyusutan Peralatan', 'asset', 'debit'),
  ('1-29200', 'Akum. Penyusutan Kendaraan', 'asset', 'debit'),
  ('1-29300', 'Akum. Penyusutan Mesin', 'asset', 'debit'),
  ('1-29400', 'Akum. Penyusutan Bangunan', 'asset', 'debit'),
  ('1-29500', 'Akum. Penyusutan Inventaris Kantor', 'asset', 'debit');
```

- [ ] **Step 3: Update parent_id untuk akun baru**

Cari blok `update coa set parent_id = (select id from coa where code = '1-20000')` dan update agar include semua anak baru:

```sql
update coa set parent_id = (select id from coa where code = '1-20000')
  where code in ('1-21000', '1-22000', '1-23000', '1-24000', '1-25000', '1-29000');

update coa set parent_id = (select id from coa where code = '1-29000')
  where code in ('1-29100', '1-29200', '1-29300', '1-29400', '1-29500');
```

- [ ] **Step 4: Tambah 5 akun beban penyusutan per kategori**

Setelah baris `('5-17000', 'Beban Penyusutan', 'expense', 'debit'),` tambahkan statement insert baru:

```sql
insert into coa (code, name, type, normal_balance) values
  ('5-17100', 'Beban Penyusutan Peralatan', 'expense', 'debit'),
  ('5-17200', 'Beban Penyusutan Kendaraan', 'expense', 'debit'),
  ('5-17300', 'Beban Penyusutan Mesin', 'expense', 'debit'),
  ('5-17400', 'Beban Penyusutan Bangunan', 'expense', 'debit'),
  ('5-17500', 'Beban Penyusutan Inventaris Kantor', 'expense', 'debit');

update coa set parent_id = (select id from coa where code = '5-17000')
  where code in ('5-17100', '5-17200', '5-17300', '5-17400', '5-17500');
```

- [ ] **Step 5: Tambah akun Gain/Loss on Disposal**

```sql
insert into coa (code, name, type, normal_balance) values
  ('4-19100', 'Keuntungan Penjualan Aset Tetap', 'revenue', 'credit'),
  ('5-99100', 'Kerugian Pelepasan Aset Tetap', 'expense', 'debit');

update coa set parent_id = (select id from coa where code = '4-19000')
  where code = '4-19100';
update coa set parent_id = (select id from coa where code = '5-99000')
  where code = '5-99100';
```

- [ ] **Step 6: Tambah seed `asset_categories` di akhir file**

```sql
-- ============================================================
-- Seed asset categories
-- ============================================================
insert into asset_categories (code, name, default_useful_life_months,
  asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id) values
  ('EQP', 'Peralatan', 48,
    (select id from coa where code = '1-21000'),
    (select id from coa where code = '1-29100'),
    (select id from coa where code = '5-17100')),
  ('VHC', 'Kendaraan', 96,
    (select id from coa where code = '1-22000'),
    (select id from coa where code = '1-29200'),
    (select id from coa where code = '5-17200')),
  ('MCH', 'Mesin', 96,
    (select id from coa where code = '1-23000'),
    (select id from coa where code = '1-29300'),
    (select id from coa where code = '5-17300')),
  ('BLD', 'Bangunan', 240,
    (select id from coa where code = '1-24000'),
    (select id from coa where code = '1-29400'),
    (select id from coa where code = '5-17400')),
  ('OFI', 'Inventaris Kantor', 48,
    (select id from coa where code = '1-25000'),
    (select id from coa where code = '1-29500'),
    (select id from coa where code = '5-17500'));
```

- [ ] **Step 7: Commit (belum apply ke Supabase)**

```bash
git add erp-app/supabase/seed.sql
git commit -m "feat(assets): seed new COA accounts and 5 asset categories"
```

---

## Phase 2 — RPC Functions

Semua RPC ditulis di `erp-app/supabase/migrations/014_fixed_assets.sql` (append ke file yang sama).

### Task 4: RPC `generate_asset_code` 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

- [ ] **Step 1: Append RPC definition**

```sql
-- ============================================================
-- RPC: generate_asset_code
-- Returns next code in format '{CATEGORY}-{YYYY}-{NNNN}'
-- ============================================================
create or replace function generate_asset_code(p_category_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := p_category_code || '-' || v_year || '-';
  v_next_num int;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select coalesce(max(cast(substring(code from length(v_prefix) + 1) as int)), 0) + 1
    into v_next_num
    from assets
    where code like v_prefix || '%';

  return v_prefix || lpad(v_next_num::text, 4, '0');
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add generate_asset_code RPC"
```

---

### Task 5: RPC `generate_depreciation_schedule` 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

- [ ] **Step 1: Append RPC definition**

```sql
-- ============================================================
-- RPC: generate_depreciation_schedule
-- Idempotent: deletes existing 'pending' rows, regenerates full schedule.
-- Preserves 'posted' and 'cancelled' rows.
-- Formula: straight-line, last month absorbs rounding.
-- ============================================================
create or replace function generate_depreciation_schedule(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_total_depreciable numeric(18,2);
  v_monthly numeric(18,2);
  v_accumulated numeric(18,2) := 0;
  v_book_value numeric(18,2);
  v_period_date date;
  v_amount numeric(18,2);
  i int;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select * into v_asset from assets where id = p_asset_id;
  if v_asset is null then
    raise exception 'asset % not found', p_asset_id;
  end if;

  -- Block if any 'posted' row exists — caller must handle reverse first
  if exists (select 1 from depreciation_schedules
             where asset_id = p_asset_id and status = 'posted') then
    raise exception 'cannot regenerate: posted rows exist for asset %', p_asset_id;
  end if;

  delete from depreciation_schedules
    where asset_id = p_asset_id and status in ('pending', 'cancelled');

  v_total_depreciable := v_asset.acquisition_cost - v_asset.salvage_value;
  v_monthly := round(v_total_depreciable / v_asset.useful_life_months, 2);
  v_book_value := v_asset.acquisition_cost;

  for i in 1..v_asset.useful_life_months loop
    v_period_date := (date_trunc('month', v_asset.depreciation_start_date)
                      + make_interval(months => i - 1)
                      + interval '1 month' - interval '1 day')::date;

    if i = v_asset.useful_life_months then
      v_amount := v_total_depreciable - (v_monthly * (v_asset.useful_life_months - 1));
    else
      v_amount := v_monthly;
    end if;

    v_accumulated := v_accumulated + v_amount;
    v_book_value := v_asset.acquisition_cost - v_accumulated;

    insert into depreciation_schedules
      (asset_id, period, period_date, sequence_no, amount,
       accumulated_amount, book_value_end, status)
    values
      (p_asset_id, to_char(v_period_date, 'YYYY-MM'), v_period_date, i, v_amount,
       v_accumulated, v_book_value, 'pending');
  end loop;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add generate_depreciation_schedule RPC"
```

---

### Task 6: RPC `create_asset_acquisition_journal` 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

**Catatan:** Input `p_payment` adalah JSONB dengan shape:
```json
{
  "method": "cash_bank" | "hutang" | "uang_muka" | "mixed",
  "cash_bank_account_id": "uuid|null",
  "cash_bank_amount": number,
  "supplier_id": "uuid|null",
  "hutang_account_id": "uuid|null",
  "hutang_amount": number,
  "uang_muka_account_id": "uuid|null",
  "uang_muka_amount": number
}
```

- [ ] **Step 1: Append RPC definition**

```sql
-- ============================================================
-- RPC: create_asset_acquisition_journal
-- Creates balanced journal for asset acquisition. Returns journal_id.
-- ============================================================
create or replace function create_asset_acquisition_journal(
  p_asset_id uuid,
  p_payment jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_cash_amt numeric := coalesce((p_payment->>'cash_bank_amount')::numeric, 0);
  v_hutang_amt numeric := coalesce((p_payment->>'hutang_amount')::numeric, 0);
  v_um_amt numeric := coalesce((p_payment->>'uang_muka_amount')::numeric, 0);
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select * into v_asset from assets where id = p_asset_id;
  if v_asset is null then raise exception 'asset not found'; end if;

  select * into v_category from asset_categories where id = v_asset.category_id;

  if abs((v_cash_amt + v_hutang_amt + v_um_amt) - v_asset.acquisition_cost) > 0.01 then
    raise exception 'payment sum (%) does not match acquisition_cost (%)',
      (v_cash_amt + v_hutang_amt + v_um_amt), v_asset.acquisition_cost;
  end if;

  v_journal_number := generate_number('JRN');

  insert into journals (journal_number, date, description, source, is_posted, created_by)
    values (v_journal_number, v_asset.acquisition_date,
            'Perolehan ' || v_asset.name || ' (' || v_asset.code || ')',
            'asset_acquisition', true, auth.uid())
    returning id into v_journal_id;

  -- Dr asset account
  insert into journal_items (journal_id, coa_id, debit, credit, description)
    values (v_journal_id, v_category.asset_account_id,
            v_asset.acquisition_cost, 0,
            'Perolehan ' || v_asset.code);

  if v_cash_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'cash_bank_account_id')::uuid,
              0, v_cash_amt, 'Pembayaran tunai');
  end if;

  if v_hutang_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'hutang_account_id')::uuid,
              0, v_hutang_amt, 'Hutang pembelian aset');
  end if;

  if v_um_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'uang_muka_account_id')::uuid,
              0, v_um_amt, 'Pemakaian uang muka');
  end if;

  return v_journal_id;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add create_asset_acquisition_journal RPC"
```

---

### Task 7: RPC `post_depreciation_batch` 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

- [ ] **Step 1: Append RPC definition**

```sql
-- ============================================================
-- RPC: post_depreciation_batch
-- Posts all pending schedules in [p_period_from .. p_period_to].
-- Creates one journal per (asset, period). Idempotent via status check.
-- Returns JSON summary: { posted, skipped, errors }.
-- ============================================================
create or replace function post_depreciation_batch(
  p_period_from text,
  p_period_to text,
  p_posting_date date,
  p_description_template text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_posted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_desc text;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  for v_row in
    select ds.*, a.name as asset_name, a.code as asset_code, a.category_id
    from depreciation_schedules ds
    join assets a on a.id = ds.asset_id
    where ds.period between p_period_from and p_period_to
      and ds.status = 'pending'
      and a.status = 'active'
      and a.is_active = true
    order by ds.period, a.code
  loop
    begin
      select * into v_category from asset_categories where id = v_row.category_id;

      v_journal_number := generate_number('JRN');
      v_desc := replace(
        replace(p_description_template, '{asset}', v_row.asset_name),
        '{period}', v_row.period
      );

      insert into journals (journal_number, date, description, source, is_posted, created_by)
        values (v_journal_number, p_posting_date, v_desc,
                'asset_depreciation', true, auth.uid())
        returning id into v_journal_id;

      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.depreciation_expense_account_id,
                v_row.amount, 0, 'Penyusutan ' || v_row.asset_code);

      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.accumulated_depreciation_account_id,
                0, v_row.amount, 'Akum penyusutan ' || v_row.asset_code);

      update depreciation_schedules
        set status = 'posted', journal_id = v_journal_id,
            posted_at = now(), posted_by = auth.uid()
        where id = v_row.id;

      -- Auto-update asset status to fully_depreciated if this was last row
      if v_row.sequence_no = (select useful_life_months from assets where id = v_row.asset_id) then
        update assets set status = 'fully_depreciated'
          where id = v_row.asset_id and status = 'active';
      end if;

      v_posted := v_posted + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'asset_id', v_row.asset_id, 'period', v_row.period, 'error', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- Audit log (one entry per batch)
  insert into audit_logs (table_name, action, record_id, new_data, user_id)
    values ('depreciation_schedules', 'batch_post', null,
            jsonb_build_object('period_from', p_period_from, 'period_to', p_period_to,
                               'posted', v_posted, 'skipped', v_skipped),
            auth.uid());

  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add post_depreciation_batch RPC"
```

---

### Task 8: RPC `execute_asset_disposal` 🔵 Sonnet

**Files:**
- Modify: `erp-app/supabase/migrations/014_fixed_assets.sql`

- [ ] **Step 1: Append RPC definition**

```sql
-- ============================================================
-- RPC: execute_asset_disposal
-- 1. Auto-posts pending depreciation up to period before disposal_date
-- 2. Creates disposal journal (sale or writeoff)
-- 3. Inserts asset_disposals row
-- 4. Cancels remaining schedule rows after disposal_date
-- 5. Updates asset status to 'disposed'
-- Returns: disposal journal_id
-- ============================================================
create or replace function execute_asset_disposal(
  p_asset_id uuid,
  p_disposal_date date,
  p_disposal_type text,
  p_sale_price numeric,
  p_payment_account_id uuid,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_accumulated numeric(18,2);
  v_book_value numeric(18,2);
  v_gain_loss numeric(18,2);
  v_cutoff text := to_char(p_disposal_date, 'YYYY-MM');
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  if p_disposal_type not in ('sale', 'writeoff') then
    raise exception 'invalid disposal_type';
  end if;

  select * into v_asset from assets where id = p_asset_id for update;
  if v_asset is null then raise exception 'asset not found'; end if;
  if v_asset.status = 'disposed' then raise exception 'asset already disposed'; end if;

  select * into v_category from asset_categories where id = v_asset.category_id;

  -- 1. Auto-post schedules with period_date < disposal_date
  perform post_depreciation_batch(
    '1900-01',
    to_char(p_disposal_date - interval '1 month', 'YYYY-MM'),
    p_disposal_date,
    'Penyusutan {asset} — {period} (auto-catch-up disposal)'
  );

  -- 2. Snapshot accumulated & book value
  select coalesce(sum(amount), 0) into v_accumulated
    from depreciation_schedules
    where asset_id = p_asset_id and status = 'posted';
  v_book_value := v_asset.acquisition_cost - v_accumulated;
  v_gain_loss := coalesce(p_sale_price, 0) - v_book_value;

  v_journal_number := generate_number('JRN');

  insert into journals (journal_number, date, description, source, is_posted, created_by)
    values (v_journal_number, p_disposal_date,
            case p_disposal_type
              when 'sale' then 'Penjualan aset ' || v_asset.code
              else 'Penghapusan aset ' || v_asset.code end,
            'asset_disposal', true, auth.uid())
    returning id into v_journal_id;

  if p_disposal_type = 'sale' then
    -- Dr cash/bank
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, p_payment_account_id, p_sale_price, 0,
              'Penerimaan penjualan ' || v_asset.code);
    -- Dr accumulated depreciation
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.accumulated_depreciation_account_id, v_accumulated, 0,
              'Eliminasi akum penyusutan');
    -- Cr asset account
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.asset_account_id, 0, v_asset.acquisition_cost,
              'Eliminasi aset');
    -- Gain or Loss
    if v_gain_loss > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id,
                (select id from coa where code = '4-19100'),
                0, v_gain_loss, 'Keuntungan penjualan aset');
    elsif v_gain_loss < 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id,
                (select id from coa where code = '5-99100'),
                -v_gain_loss, 0, 'Kerugian penjualan aset');
    end if;
  else
    -- writeoff
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.accumulated_depreciation_account_id, v_accumulated, 0,
              'Eliminasi akum penyusutan');
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, (select id from coa where code = '5-99100'),
              v_book_value, 0, 'Kerugian penghapusan aset');
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.asset_account_id, 0, v_asset.acquisition_cost,
              'Eliminasi aset');
    v_gain_loss := -v_book_value;
  end if;

  -- 3. Insert asset_disposals
  insert into asset_disposals (asset_id, disposal_date, disposal_type,
    sale_price, payment_account_id, book_value_at_disposal,
    accumulated_at_disposal, gain_loss, journal_id, notes, created_by)
  values (p_asset_id, p_disposal_date, p_disposal_type,
    p_sale_price, p_payment_account_id, v_book_value,
    v_accumulated, v_gain_loss, v_journal_id, p_notes, auth.uid());

  -- 4. Cancel remaining pending schedules
  update depreciation_schedules
    set status = 'cancelled'
    where asset_id = p_asset_id and status = 'pending'
      and period > v_cutoff;

  -- 5. Update asset
  update assets
    set status = 'disposed',
        disposed_at = p_disposal_date,
        disposal_type = p_disposal_type,
        disposal_journal_id = v_journal_id,
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_asset_id;

  return v_journal_id;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add erp-app/supabase/migrations/014_fixed_assets.sql
git commit -m "feat(assets): add execute_asset_disposal RPC"
```

---

### Task 9: Apply migration + seed to Supabase + SQL smoke 🔵 Sonnet

**Files:** no code — apply & verify only

- [ ] **Step 1: Apply migration via Supabase Studio SQL Editor**

Paste isi `014_fixed_assets.sql` ke SQL Editor → Run. Verify no errors.

- [ ] **Step 2: Apply seed deltas**

Copy DELTA dari `seed.sql` (hanya bagian baru task 3) ke SQL Editor → Run.

- [ ] **Step 3: Verify tabel ada**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('asset_categories', 'assets', 'depreciation_schedules', 'asset_disposals');
```
Expected: 4 rows.

- [ ] **Step 4: Verify seed kategori**

```sql
select code, name, default_useful_life_months from asset_categories order by code;
```
Expected: 5 rows (BLD, EQP, MCH, OFI, VHC).

- [ ] **Step 5: Smoke RPC `generate_asset_code`**

```sql
select generate_asset_code('EQP');
```
Expected: `'EQP-2026-0001'`

- [ ] **Step 6: Commit nothing — this task is apply+verify only**

---

## Phase 3 — Services Layer

### Task 10: `assetCategoryService.js` 🟢 Haiku

**Files:**
- Create: `erp-app/src/services/assetCategoryService.js`

- [ ] **Step 1: Buat file dengan CRUD operations**

```js
import { supabase } from '../lib/supabase'

export async function listCategories() {
  const { data, error } = await supabase
    .from('asset_categories')
    .select(`
      id, code, name, default_useful_life_months,
      asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
      asset_account:coa!asset_categories_asset_account_id_fkey(code, name),
      accumulated_account:coa!asset_categories_accumulated_depreciation_account_id_fkey(code, name),
      expense_account:coa!asset_categories_depreciation_expense_account_id_fkey(code, name)
    `)
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

export async function getCategory(id) {
  const { data, error } = await supabase
    .from('asset_categories')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createCategory(input) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('asset_categories')
    .insert({ ...input, created_by: user?.id })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateCategory(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('is_active', true)
  if (count > 0 && ('asset_account_id' in patch
      || 'accumulated_depreciation_account_id' in patch
      || 'depreciation_expense_account_id' in patch)) {
    throw new Error('Kategori sudah dipakai aset aktif — akun tidak bisa diubah')
  }
  const { error } = await supabase
    .from('asset_categories')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id })
    .eq('id', id)
  if (error) throw error
}

export async function softDeleteCategory(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('is_active', true)
  if (count > 0) throw new Error('Kategori masih dipakai aset aktif')
  const { error } = await supabase
    .from('asset_categories')
    .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: user?.id })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Build & commit**

```bash
cd erp-app && npm run build
```
Expected: success.

```bash
git add erp-app/src/services/assetCategoryService.js
git commit -m "feat(assets): add assetCategoryService"
```

---

### Task 11: `assetService.js` 🔵 Sonnet

**Files:**
- Create: `erp-app/src/services/assetService.js`

**Catatan:** Service ini orchestrate insert asset + RPC generate_asset_code + RPC create_asset_acquisition_journal + RPC generate_depreciation_schedule dalam urutan aman.

- [ ] **Step 1: Tulis list/get/helper**

```js
import { supabase } from '../lib/supabase'

function startOfNextMonth(dateStr) {
  const d = new Date(dateStr)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
}

export async function listAssets({ categoryId, status = 'all', q } = {}) {
  let query = supabase
    .from('assets')
    .select(`
      id, code, name, acquisition_date, acquisition_cost, salvage_value,
      useful_life_months, status, category_id,
      category:asset_categories(code, name)
    `)
    .eq('is_active', true)
    .order('code')
  if (categoryId) query = query.eq('category_id', categoryId)
  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAsset(id) {
  const { data, error } = await supabase
    .from('assets')
    .select(`
      *,
      category:asset_categories(*),
      acquisition_journal:journals!assets_acquisition_journal_id_fkey(id, journal_number, date),
      disposal_journal:journals!assets_disposal_journal_id_fkey(id, journal_number, date)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getAssetWithSchedule(id) {
  const asset = await getAsset(id)
  const { data: schedule, error } = await supabase
    .from('depreciation_schedules')
    .select('*')
    .eq('asset_id', id)
    .order('sequence_no')
  if (error) throw error
  return { ...asset, schedule }
}
```

- [ ] **Step 2: Tulis createAsset**

Append ke file yang sama:

```js
export async function createAsset(input) {
  const { data: { user } } = await supabase.auth.getUser()
  const {
    name, category_id, acquisition_date, acquisition_cost, salvage_value = 0,
    useful_life_months, location, description, payment,
  } = input

  // Validation
  const sum = (payment.cash_bank_amount || 0) + (payment.hutang_amount || 0) + (payment.uang_muka_amount || 0)
  if (Math.abs(sum - acquisition_cost) > 0.01) {
    throw new Error(`Total pembayaran (${sum}) tidak sama dengan harga perolehan (${acquisition_cost})`)
  }
  if (acquisition_cost <= salvage_value) {
    throw new Error('Harga perolehan harus lebih besar dari nilai residu')
  }

  // 1. Get category code for asset code generation
  const { data: category, error: catErr } = await supabase
    .from('asset_categories').select('code').eq('id', category_id).single()
  if (catErr) throw catErr

  // 2. Generate code
  const { data: code, error: codeErr } = await supabase
    .rpc('generate_asset_code', { p_category_code: category.code })
  if (codeErr) throw codeErr

  // 3. Insert asset
  const { data: asset, error: insErr } = await supabase
    .from('assets')
    .insert({
      code, name, category_id, acquisition_date, acquisition_cost, salvage_value,
      useful_life_months, location, description,
      depreciation_start_date: startOfNextMonth(acquisition_date),
      payment_method: payment.method,
      supplier_id: payment.supplier_id ?? null,
      created_by: user?.id,
    })
    .select('id')
    .single()
  if (insErr) throw insErr

  // 4. Create acquisition journal
  const { data: journalId, error: jErr } = await supabase
    .rpc('create_asset_acquisition_journal', {
      p_asset_id: asset.id,
      p_payment: payment,
    })
  if (jErr) {
    // Rollback: soft-delete asset
    await supabase.from('assets').update({ is_active: false }).eq('id', asset.id)
    throw jErr
  }

  // 5. Link journal to asset
  await supabase.from('assets').update({ acquisition_journal_id: journalId }).eq('id', asset.id)

  // 6. Generate schedule
  const { error: schedErr } = await supabase
    .rpc('generate_depreciation_schedule', { p_asset_id: asset.id })
  if (schedErr) throw schedErr

  return asset.id
}
```

- [ ] **Step 3: Tulis updateAsset + softDeleteAsset**

```js
const FINANCIAL_FIELDS = [
  'acquisition_cost', 'acquisition_date', 'useful_life_months',
  'salvage_value', 'depreciation_method', 'category_id',
]

export async function updateAsset(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()

  const { count: postedCount } = await supabase
    .from('depreciation_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('status', 'posted')

  const touchedFinancial = FINANCIAL_FIELDS.some(f => f in patch)
  if (touchedFinancial && postedCount > 0) {
    throw new Error('Field finansial terkunci — sudah ada jurnal penyusutan terposting')
  }

  const { error } = await supabase
    .from('assets')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id })
    .eq('id', id)
  if (error) throw error

  if (touchedFinancial) {
    const { error: schedErr } = await supabase
      .rpc('generate_depreciation_schedule', { p_asset_id: id })
    if (schedErr) throw schedErr
  }
}

export async function softDeleteAsset(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { count } = await supabase
    .from('depreciation_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('status', 'posted')
  if (count > 0) throw new Error('Aset sudah punya jurnal terposting — gunakan Disposal')
  const { error } = await supabase
    .from('assets')
    .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: user?.id })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/services/assetService.js
git commit -m "feat(assets): add assetService with createAsset orchestration"
```

---

### Task 12: `depreciationService.js` 🔵 Sonnet

**Files:**
- Create: `erp-app/src/services/depreciationService.js`

- [ ] **Step 1: Tulis preview & post functions**

```js
import { supabase } from '../lib/supabase'

export async function previewPeriod({ period_from, period_to }) {
  const { data, error } = await supabase
    .from('depreciation_schedules')
    .select(`
      id, asset_id, period, amount, status,
      asset:assets(code, name, status, category:asset_categories(code, name))
    `)
    .gte('period', period_from)
    .lte('period', period_to)
    .eq('status', 'pending')
    .order('period')
    .order('asset_id')
  if (error) throw error

  // Group by asset
  const byAsset = new Map()
  for (const row of data) {
    if (row.asset.status !== 'active') continue
    const key = row.asset_id
    if (!byAsset.has(key)) {
      byAsset.set(key, { asset: row.asset, rows: [], total: 0 })
    }
    const bucket = byAsset.get(key)
    bucket.rows.push(row)
    bucket.total += Number(row.amount)
  }
  return Array.from(byAsset.values())
}

export async function postPeriod({ period_from, period_to, posting_date, description_template }) {
  const { data, error } = await supabase
    .rpc('post_depreciation_batch', {
      p_period_from: period_from,
      p_period_to: period_to,
      p_posting_date: posting_date,
      p_description_template: description_template || 'Penyusutan {asset} — {period}',
    })
  if (error) throw error
  return data  // { posted, skipped, errors }
}

export async function getScheduleForAsset(assetId) {
  const { data, error } = await supabase
    .from('depreciation_schedules')
    .select('*, journal:journals(id, journal_number, date)')
    .eq('asset_id', assetId)
    .order('sequence_no')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/services/depreciationService.js
git commit -m "feat(assets): add depreciationService (preview/post/getSchedule)"
```

---

### Task 13: `assetDisposalService.js` 🔵 Sonnet

**Files:**
- Create: `erp-app/src/services/assetDisposalService.js`

- [ ] **Step 1: Tulis preview & execute**

```js
import { supabase } from '../lib/supabase'

export async function previewDisposal({ asset_id, disposal_date, disposal_type, sale_price = 0 }) {
  const { data: asset, error: aErr } = await supabase
    .from('assets')
    .select('acquisition_cost, salvage_value, status, code, name')
    .eq('id', asset_id).single()
  if (aErr) throw aErr

  const cutoff = new Date(disposal_date)
  cutoff.setDate(0) // last day of previous month
  const cutoffPeriod = cutoff.toISOString().slice(0, 7)

  const { data: pending } = await supabase
    .from('depreciation_schedules')
    .select('period, amount')
    .eq('asset_id', asset_id)
    .eq('status', 'pending')
    .lte('period', cutoffPeriod)
    .order('period')

  const { data: postedAgg } = await supabase
    .from('depreciation_schedules')
    .select('amount.sum()')
    .eq('asset_id', asset_id)
    .eq('status', 'posted')
    .single()
  const postedSum = Number(postedAgg?.sum || 0)
  const pendingSum = (pending || []).reduce((s, r) => s + Number(r.amount), 0)
  const accumulated = postedSum + pendingSum
  const bookValue = Number(asset.acquisition_cost) - accumulated
  const gainLoss = disposal_type === 'sale' ? (Number(sale_price) - bookValue) : -bookValue

  return {
    asset,
    catchUpPeriods: pending || [],
    catchUpTotal: pendingSum,
    accumulated,
    bookValue,
    gainLoss,
  }
}

export async function executeDisposal({ asset_id, disposal_date, disposal_type,
                                         sale_price, payment_account_id, notes }) {
  const { data, error } = await supabase.rpc('execute_asset_disposal', {
    p_asset_id: asset_id,
    p_disposal_date: disposal_date,
    p_disposal_type: disposal_type,
    p_sale_price: sale_price ?? null,
    p_payment_account_id: payment_account_id ?? null,
    p_notes: notes ?? null,
  })
  if (error) throw error
  return data  // journal_id
}
```

- [ ] **Step 2: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/services/assetDisposalService.js
git commit -m "feat(assets): add assetDisposalService"
```

---

## Phase 4 — Master UI

### Task 14: `AssetCategoriesPage` + modal 🟢 Haiku

**Files:**
- Create: `erp-app/src/components/assets/AssetCategoryFormModal.jsx`
- Create: `erp-app/src/pages/assets/AssetCategoriesPage.jsx`

**Reference pattern:** `src/pages/master/UnitsPage.jsx` (table + modal CRUD).

- [ ] **Step 1: Buat `AssetCategoryFormModal.jsx`**

Komponen modal controlled dengan props `open`, `onClose`, `onSaved`, `editData`. Form fields:
- `code` (text, required, 3 chars uppercase)
- `name` (text, required)
- `default_useful_life_months` (number, min 1)
- `asset_account_id` (select dari `coa` where code like '1-2____')
- `accumulated_depreciation_account_id` (select dari `coa` where code like '1-29___')
- `depreciation_expense_account_id` (select dari `coa` where code like '5-17___')

Gunakan helper form dari `components/shared/` yang ada di codebase. Submit panggil `createCategory` atau `updateCategory` dari service. Load daftar COA via `supabase.from('coa').select('id, code, name')`.

- [ ] **Step 2: Buat `AssetCategoriesPage.jsx`**

State: `categories`, `loading`, `modalOpen`, `editData`. On mount: `listCategories()`. Render table dengan kolom: Code, Name, Default Umur, Akun Aset, Akun Akum, Akun Beban, Actions (Edit, Delete). Tombol "+ Tambah Kategori" di header buka modal. Delete confirm → `softDeleteCategory`.

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/components/assets/AssetCategoryFormModal.jsx erp-app/src/pages/assets/AssetCategoriesPage.jsx
git commit -m "feat(assets): add asset categories page and form modal"
```

---

### Task 15: `AssetsPage` list + filter 🟢 Haiku

**Files:**
- Create: `erp-app/src/pages/assets/AssetsPage.jsx`

**Reference pattern:** `src/pages/sales/SalesOrdersPage.jsx` untuk pattern filter + list dengan empty state.

- [ ] **Step 1: Buat skeleton halaman**

State: `assets`, `loading`, `filters: { categoryId: '', status: 'all', q: '' }`, `categories`. Effect: load `listCategories()` & `listAssets(filters)` tiap filter berubah.

- [ ] **Step 2: Render header + filter bar + table**

Header: judul "Aset Tetap", tombol (`+ Tambah Aset` → `/assets/new`, `Bulk Import` → `/assets/bulk-import`, `Post Penyusutan` → `/assets/depreciation`).

Filter bar: select kategori (opsi: "Semua Kategori" + listCategories), select status (Semua/Active/Disposed/Fully Depreciated), search input.

Table kolom: Kode, Nama, Kategori, Tgl Perolehan, Harga Perolehan (currency), Status badge, Actions (View, Edit, Dispose).

Row click → navigate `/assets/{id}`.

Empty state jika list kosong: tampilkan ilustrasi + CTA "Tambah Aset Pertama".

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/assets/AssetsPage.jsx
git commit -m "feat(assets): add assets list page with filters"
```

---

### Task 16: `AssetPaymentFields` component 🟢 Haiku

**Files:**
- Create: `erp-app/src/components/assets/AssetPaymentFields.jsx`

- [ ] **Step 1: Tulis komponen controlled**

Props: `value` (payment object), `onChange`, `totalAmount` (harga perolehan untuk validasi). Internal state tidak perlu — fully controlled.

Render:
1. Radio group: `cash_bank` / `hutang` / `uang_muka` / `mixed`
2. Fields kondisional berdasar `value.method`:
   - cash_bank: 1 dropdown akun kas/bank (query `coa where code like '1-11%' or code like '1-12%'`), amount auto = totalAmount (disabled)
   - hutang: 1 dropdown supplier + amount auto = totalAmount
   - uang_muka: 1 dropdown akun uang muka (`1-16___`) + optional supplier + amount auto = totalAmount
   - mixed: semua 3 section muncul, user isi amount masing-masing, tampilkan running sum + indicator merah/hijau vs totalAmount
3. Emit updated payment object via `onChange`

Validation helper: `isPaymentValid(payment, totalAmount)` → boolean.

- [ ] **Step 2: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/components/assets/AssetPaymentFields.jsx
git commit -m "feat(assets): add AssetPaymentFields component"
```

---

### Task 17: `AssetFormPage` create & edit 🔵 Sonnet

**Files:**
- Create: `erp-app/src/pages/assets/AssetFormPage.jsx`

**Catatan:** Handle mode dari `useParams().id` — jika ada → edit, jika tidak → create. Untuk edit, field finansial dikunci kalau ada schedule posted.

- [ ] **Step 1: Tulis skeleton + state**

```jsx
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { createAsset, getAsset, updateAsset } from '../../services/assetService'
import { listCategories } from '../../services/assetCategoryService'
import { getScheduleForAsset } from '../../services/depreciationService'
import AssetPaymentFields from '../../components/assets/AssetPaymentFields'

export default function AssetFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({
    name: '', category_id: '', acquisition_date: '',
    acquisition_cost: '', salvage_value: '0', useful_life_months: '',
    location: '', description: '',
    payment: { method: 'cash_bank', cash_bank_account_id: '', cash_bank_amount: 0,
               supplier_id: null, hutang_account_id: null, hutang_amount: 0,
               uang_muka_account_id: null, uang_muka_amount: 0 },
  })
  const [hasPosted, setHasPosted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { listCategories().then(setCategories) }, [])

  useEffect(() => {
    if (!isEdit) return
    getAsset(id).then(asset => {
      setForm(prev => ({ ...prev, ...asset, payment: prev.payment /* not editable */ }))
    })
    getScheduleForAsset(id).then(s => {
      setHasPosted(s.some(r => r.status === 'posted'))
    })
  }, [id, isEdit])
  // ...
}
```

- [ ] **Step 2: Tulis section Informasi Aset + Keuangan**

Section "Informasi Aset": inputs `name`, select `category_id` (on change → auto-set `useful_life_months` dari default kategori), `location`, `description`.

Section "Keuangan": `acquisition_date` (date), `acquisition_cost` (currency), `salvage_value` (currency), `useful_life_months` (number), `depreciation_start_date` (read-only, computed = awal bulan berikutnya dari `acquisition_date`).

Pada edit mode, jika `hasPosted === true`, tandai field finansial `disabled` dengan `title="Terkunci — sudah ada jurnal penyusutan terposting"`.

- [ ] **Step 3: Section Pembayaran + Preview + Submit**

Section "Pembayaran": render `<AssetPaymentFields value={form.payment} onChange={p => setForm(f => ({...f, payment: p}))} totalAmount={Number(form.acquisition_cost)} />`. Hide section ini di edit mode (acquisition journal tidak boleh diubah).

Section "Preview Penyusutan" (read-only, hitung di client):
- Per bulan: `(cost - salvage) / life`
- Per tahun: `monthly * 12`
- Total bulan: `life`
- Berakhir: `depreciation_start_date + life bulan`

Submit handler:
```js
async function handleSubmit(e) {
  e.preventDefault()
  setSaving(true); setError('')
  try {
    if (isEdit) {
      await updateAsset(id, {
        name: form.name, location: form.location, description: form.description,
        ...(hasPosted ? {} : {
          acquisition_cost: Number(form.acquisition_cost),
          salvage_value: Number(form.salvage_value),
          useful_life_months: Number(form.useful_life_months),
          acquisition_date: form.acquisition_date,
          category_id: form.category_id,
        }),
      })
      navigate(`/assets/${id}`)
    } else {
      const newId = await createAsset({
        ...form,
        acquisition_cost: Number(form.acquisition_cost),
        salvage_value: Number(form.salvage_value),
        useful_life_months: Number(form.useful_life_months),
      })
      navigate(`/assets/${newId}`)
    }
  } catch (err) {
    setError(err.message)
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 4: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/assets/AssetFormPage.jsx
git commit -m "feat(assets): add asset form page (create + edit with field locking)"
```

---

## Phase 5 — Operations UI

### Task 18: `DepreciationScheduleTable` component 🟢 Haiku

**Files:**
- Create: `erp-app/src/components/assets/DepreciationScheduleTable.jsx`

- [ ] **Step 1: Tulis komponen table**

Props: `schedule` (array dari `getScheduleForAsset`). Render kolom: `Seq #`, `Period`, `Amount`, `Accumulated`, `Book Value End`, `Status` (badge: pending=grey, posted=green, cancelled=red), `Journal` (link ke `/accounting/journals/{journal_id}` jika ada).

Row clickable jika `status === 'posted'` dan `journal_id` ada → navigate ke jurnal.

- [ ] **Step 2: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/components/assets/DepreciationScheduleTable.jsx
git commit -m "feat(assets): add DepreciationScheduleTable component"
```

---

### Task 19: `AssetDetailPage` (Kartu Aset) 🟢 Haiku

**Files:**
- Create: `erp-app/src/pages/assets/AssetDetailPage.jsx`

- [ ] **Step 1: Load data + header**

On mount: `getAssetWithSchedule(id)`. Render header: nama + kode, badge status, info grid (kategori, tgl perolehan, harga, umur, residu, lokasi, deskripsi). Sidebar kanan: "Nilai Buku Saat Ini" (hitung dari posted schedule sum). Tombol: `Edit`, `Dispose` (disable jika `status === 'disposed'`).

- [ ] **Step 2: 3 tabs**

Tabs:
1. **Schedule Penyusutan** — render `<DepreciationScheduleTable schedule={asset.schedule} />`
2. **Riwayat Jurnal** — query `journals` where id in `[acquisition_journal_id, disposal_journal_id, ...schedule.map(s => s.journal_id)]`. Render list compact dengan journal_number, date, source badge, description.
3. **Audit Log** — query `audit_logs` where `table_name='assets' and record_id=id`. Render timeline.

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/assets/AssetDetailPage.jsx
git commit -m "feat(assets): add asset detail page (kartu aset) with 3 tabs"
```

---

### Task 20: `DepreciationRunPage` 3-step workflow 🔵 Sonnet

**Files:**
- Create: `erp-app/src/components/assets/DepreciationPreviewTable.jsx`
- Create: `erp-app/src/pages/assets/DepreciationRunPage.jsx`

- [ ] **Step 1: `DepreciationPreviewTable.jsx`**

Props: `preview` (output dari `previewPeriod`). Render table grouped per period → per asset, dengan total per period dan grand total. Format currency.

- [ ] **Step 2: `DepreciationRunPage.jsx` — 3 state steps**

```jsx
const [step, setStep] = useState('select')  // 'select' | 'preview' | 'result'
const [form, setForm] = useState({
  period_from: '', period_to: '', posting_date: '',
  description_template: 'Penyusutan {asset} — {period}',
})
const [preview, setPreview] = useState([])
const [result, setResult] = useState(null)
```

**Step 'select'**: form period_from, period_to (YYYY-MM pickers), posting_date (akhir bulan terakhir default), description template. Button "Preview" → panggil `previewPeriod(form)` → setPreview + setStep('preview').

**Step 'preview'**: render `<DepreciationPreviewTable preview={preview} />`. Buttons: "Kembali" (setStep('select')), "Confirm & Post" (panggil `postPeriod(form)` → setResult → setStep('result')).

**Step 'result'**: tampilkan summary card: `✓ {posted} journal terposting`, `⊘ {skipped} dilewati`, errors list jika ada. Button "Kembali ke Daftar Aset" → navigate `/assets`.

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/components/assets/DepreciationPreviewTable.jsx erp-app/src/pages/assets/DepreciationRunPage.jsx
git commit -m "feat(assets): add depreciation run page with 3-step workflow"
```

---

### Task 21: `DisposalPreviewCard` + `AssetDisposalFormPage` 🔵 Sonnet

**Files:**
- Create: `erp-app/src/components/assets/DisposalPreviewCard.jsx`
- Create: `erp-app/src/pages/assets/AssetDisposalFormPage.jsx`

- [ ] **Step 1: `DisposalPreviewCard.jsx`**

Props: `preview` (output dari `previewDisposal`). Render card dengan sections:
- "Catch-up Penyusutan": "{N} bulan akan diposting sebelum disposal (total Rp X)"
- "Nilai Buku saat Disposal": Rp X
- "Gain/Loss": badge hijau (+) atau merah (-)

- [ ] **Step 2: `AssetDisposalFormPage.jsx`**

```jsx
const { id } = useParams()
const [asset, setAsset] = useState(null)
const [form, setForm] = useState({
  disposal_date: '', disposal_type: 'sale',
  sale_price: '', payment_account_id: '', notes: '',
})
const [preview, setPreview] = useState(null)
const [cashBankAccounts, setCashBankAccounts] = useState([])

useEffect(() => { getAsset(id).then(setAsset) }, [id])
useEffect(() => {
  supabase.from('coa').select('id, code, name')
    .or('code.like.1-11%,code.like.1-12%').then(r => setCashBankAccounts(r.data))
}, [])

async function handlePreview() {
  const p = await previewDisposal({
    asset_id: id,
    disposal_date: form.disposal_date,
    disposal_type: form.disposal_type,
    sale_price: Number(form.sale_price) || 0,
  })
  setPreview(p)
}

async function handleConfirm() {
  await executeDisposal({
    asset_id: id,
    disposal_date: form.disposal_date,
    disposal_type: form.disposal_type,
    sale_price: form.disposal_type === 'sale' ? Number(form.sale_price) : null,
    payment_account_id: form.disposal_type === 'sale' ? form.payment_account_id : null,
    notes: form.notes,
  })
  navigate(`/assets/${id}`)
}
```

Render: header info aset, form fields (tanggal, radio tipe, conditional sale_price & payment_account), button Preview → tampilkan `<DisposalPreviewCard preview={preview} />`, button Konfirmasi (disabled jika belum preview).

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/components/assets/DisposalPreviewCard.jsx erp-app/src/pages/assets/AssetDisposalFormPage.jsx
git commit -m "feat(assets): add asset disposal form with preview"
```

---

### Task 22: `AssetBulkImportPage` Excel upload 🔵 Sonnet

**Files:**
- Create: `erp-app/src/pages/assets/AssetBulkImportPage.jsx`

**Reference pattern:** `sj-monitor/src/RitasiBulkUpload.jsx` untuk flow upload → parse → preview → import.

- [ ] **Step 1: Tulis template download + parse**

```jsx
import * as XLSX from 'xlsx'
import { createAsset } from '../../services/assetService'
import { listCategories } from '../../services/assetCategoryService'

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'category_code', 'acquisition_date', 'acquisition_cost',
     'salvage_value', 'useful_life_months', 'location', 'description'],
    ['Contoh Laptop', 'EQP', '2026-01-15', '15000000', '0', '48', 'Kantor Pusat', ''],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Assets')
  XLSX.writeFile(wb, 'asset-import-template.xlsx')
}
```

- [ ] **Step 2: Parse + validate preview**

On file upload, parse via `XLSX.utils.sheet_to_json()`. Validate each row:
- `category_code` exists in categories
- `acquisition_cost > 0`
- `useful_life_months > 0`
- `salvage_value < acquisition_cost`
- required fields non-empty

Build preview array: `{ row, valid, errors[], rowNum }`.

- [ ] **Step 3: Default payment selector + import**

Di header preview, tambah 1 dropdown "Bayar dari akun kas/bank:" (list akun 1-11/1-12) — applied to all rows as `payment.method='cash_bank'`.

Button "Import Semua yang Valid" → loop valid rows, `await createAsset({...row, payment: {...}})`, track success/fail, progress bar.

Summary: `{success_count} berhasil, {failed_count} gagal` + error list.

- [ ] **Step 4: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/assets/AssetBulkImportPage.jsx
git commit -m "feat(assets): add bulk import page with Excel template"
```

---

## Phase 6 — Reports & Navigation

### Task 23: 4 laporan pages 🟢 Haiku

**Files:**
- Create: `erp-app/src/pages/reports/AssetsListReportPage.jsx`
- Create: `erp-app/src/pages/reports/DepreciationPeriodReportPage.jsx`
- Create: `erp-app/src/pages/reports/AssetDisposalsReportPage.jsx`
- Create: `erp-app/src/pages/reports/AssetsSummaryReportPage.jsx`

**Reference pattern:** existing report pages seperti `BalanceSheetPage.jsx`. Pola: filter bar → table → 2 button export PDF & Excel.

- [ ] **Step 1: `AssetsListReportPage.jsx`**

Filter: `cut_off_date`, `category_id`, `status`. Query: `assets` + left join `asset_categories` + left join `depreciation_schedules` (aggregate accumulated ≤ cutoff). Kolom: Kode, Nama, Kategori, Tgl Perolehan, Harga, Akum s/d Cutoff, Nilai Buku. Export PDF (jspdf-autotable) + Excel (xlsx).

- [ ] **Step 2: `DepreciationPeriodReportPage.jsx`**

Filter: `period_from`, `period_to`, `category_id`. Query `depreciation_schedules` where `status='posted' and period between ...`. Group by period + category. Kolom: Periode, Kategori, Jumlah Aset, Total Penyusutan.

- [ ] **Step 3: `AssetDisposalsReportPage.jsx`**

Filter: `date_from`, `date_to`, `disposal_type`. Query `asset_disposals` + join `assets`. Kolom: Tgl, Kode, Nama, Tipe, Harga Jual, Nilai Buku, Gain/Loss.

- [ ] **Step 4: `AssetsSummaryReportPage.jsx`**

Filter: `cut_off_date`. Group by kategori, sum harga perolehan, sum akumulasi s/d cutoff, hitung nilai buku. Kolom: Kategori, Jumlah Aset, Total Harga, Total Akum, Total Nilai Buku.

- [ ] **Step 5: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/reports/AssetsListReportPage.jsx erp-app/src/pages/reports/DepreciationPeriodReportPage.jsx erp-app/src/pages/reports/AssetDisposalsReportPage.jsx erp-app/src/pages/reports/AssetsSummaryReportPage.jsx
git commit -m "feat(assets): add 4 fixed assets report pages"
```

---

### Task 24: Routing + Sidebar navigation 🟢 Haiku

**Files:**
- Modify: `erp-app/src/App.jsx`
- Modify: `erp-app/src/components/layout/Sidebar.jsx` (atau file navigasi ekuivalen)

- [ ] **Step 1: Tambah 12 routes di `App.jsx`**

Lokasi: di dalam block `<Routes>` protected, setelah route accounting terakhir:

```jsx
import AssetCategoriesPage from './pages/assets/AssetCategoriesPage'
import AssetsPage from './pages/assets/AssetsPage'
import AssetFormPage from './pages/assets/AssetFormPage'
import AssetDetailPage from './pages/assets/AssetDetailPage'
import AssetDisposalFormPage from './pages/assets/AssetDisposalFormPage'
import AssetBulkImportPage from './pages/assets/AssetBulkImportPage'
import DepreciationRunPage from './pages/assets/DepreciationRunPage'
import AssetsListReportPage from './pages/reports/AssetsListReportPage'
import DepreciationPeriodReportPage from './pages/reports/DepreciationPeriodReportPage'
import AssetDisposalsReportPage from './pages/reports/AssetDisposalsReportPage'
import AssetsSummaryReportPage from './pages/reports/AssetsSummaryReportPage'

// di dalam Routes:
<Route path="assets/categories" element={<AssetCategoriesPage />} />
<Route path="assets" element={<AssetsPage />} />
<Route path="assets/new" element={<AssetFormPage />} />
<Route path="assets/:id" element={<AssetDetailPage />} />
<Route path="assets/:id/edit" element={<AssetFormPage />} />
<Route path="assets/:id/dispose" element={<AssetDisposalFormPage />} />
<Route path="assets/bulk-import" element={<AssetBulkImportPage />} />
<Route path="assets/depreciation" element={<DepreciationRunPage />} />
<Route path="reports/assets-list" element={<AssetsListReportPage />} />
<Route path="reports/depreciation-period" element={<DepreciationPeriodReportPage />} />
<Route path="reports/asset-disposals" element={<AssetDisposalsReportPage />} />
<Route path="reports/assets-summary" element={<AssetsSummaryReportPage />} />
```

- [ ] **Step 2: Tambah menu di Sidebar**

Buka file sidebar (kemungkinan `components/layout/Sidebar.jsx` — cari dulu dengan `grep -l "master/units" src/components`). Tambah section baru "Aset Tetap":
- Daftar Aset → `/assets`
- Kategori Aset → `/assets/categories`
- Post Penyusutan → `/assets/depreciation`
- Import Aset → `/assets/bulk-import`

Di section Laporan, tambah 4 menu baru:
- Daftar Aset Tetap → `/reports/assets-list`
- Penyusutan per Periode → `/reports/depreciation-period`
- Disposal Aset → `/reports/asset-disposals`
- Summary Aset per Kategori → `/reports/assets-summary`

- [ ] **Step 3: Build & commit**

```bash
cd erp-app && npm run build
git add erp-app/src/App.jsx erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(assets): wire routing and sidebar navigation for fixed assets"
```

---

### Task 25: Verify `BalanceSheetPage` breakdown 🔵 Sonnet

**Files:**
- Verify/Modify: `erp-app/src/pages/reports/BalanceSheetPage.jsx`

- [ ] **Step 1: Buka Balance Sheet di browser**

```bash
cd erp-app && npm run dev
```

Navigate ke Neraca. Verifikasi section "Aset Tetap" menampilkan:
- Peralatan, Kendaraan, Mesin, Bangunan, Inventaris Kantor (dengan total masing-masing dari posted journals)
- Akum. Penyusutan per kategori
- Total aset tetap bersih

- [ ] **Step 2: Jika breakdown tidak muncul otomatis**

Baca code `BalanceSheetPage.jsx`. Jika laporan hard-code nama akun, update untuk include akun baru. Jika laporan generated dari COA hierarchy via `parent_id`, seharusnya otomatis muncul — tidak perlu patch.

- [ ] **Step 3: Commit patch (jika ada)**

```bash
cd erp-app && npm run build
git add erp-app/src/pages/reports/BalanceSheetPage.jsx
git commit -m "fix(reports): include fixed asset category breakdown in balance sheet"
```

---

## Phase 7 — Validation

### Task 26: Jalankan 14 smoke test scenarios 🔵 Sonnet

**Files:** no code — manual testing

- [ ] **Step 1: Jalankan dev server**

```bash
cd erp-app && npm run dev
```

- [ ] **Step 2: Eksekusi 14 skenario dari spec §7.2**

Ikuti tabel di [`spec §7.2`](../specs/2026-04-11-fixed-assets-design.md#72-smoke-test-scenarios). Tandai pass/fail per skenario. Issue di-log sebagai TODO untuk fix di step berikutnya.

- [ ] **Step 3: SQL verification — journal balance integrity**

Di Supabase Studio:
```sql
select journal_id, sum(debit), sum(credit), sum(debit) - sum(credit) as diff
from journal_items
where journal_id in (select id from journals where source like 'asset_%')
group by journal_id
having sum(debit) <> sum(credit);
```
Expected: **0 rows**. Jika ada, investigasi RPC yang salah.

- [ ] **Step 4: SQL verification — schedule math**

```sql
select a.code, a.acquisition_cost, a.salvage_value,
       sum(ds.amount) as total_sched,
       (a.acquisition_cost - a.salvage_value) as expected,
       abs(sum(ds.amount) - (a.acquisition_cost - a.salvage_value)) as diff
from assets a
join depreciation_schedules ds on ds.asset_id = a.id
where ds.status != 'cancelled'
group by a.id
having abs(sum(ds.amount) - (a.acquisition_cost - a.salvage_value)) > 0.01;
```
Expected: **0 rows**.

- [ ] **Step 5: Fix & commit issue temuan**

Jika ada bug dari smoke test:
- Fix di file yang relevan
- Build lagi (`npm run build`)
- Commit per fix dengan `fix(assets): ...`

---

### Task 27: Final build verification & wrap-up 🟢 Haiku

**Files:** no code

- [ ] **Step 1: Clean build**

```bash
cd erp-app && rm -rf dist && npm run build
```
Expected: success tanpa error/warning kritis.

- [ ] **Step 2: Check git log**

```bash
git log --oneline main..HEAD
```
Expected: ~25-28 commits, semua ber-prefix `feat(assets)` atau `fix(assets)`.

- [ ] **Step 3: Update memory progress**

Update file memory `project_erp_acc_fixed_assets_brainstorm.md` — tandai task selesai, catat branch/commit hash.

- [ ] **Step 4: Report completion**

Tampilkan summary ke user: jumlah file dibuat, commits, smoke test results, branch siap untuk review/merge.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ §2 Data Model — Task 1 (tables + indexes)
- ✅ §3 COA modifications — Task 3 (seed.sql)
- ✅ §4 Services Layer — Tasks 10-13
- ✅ §4.6 Auto-journal logic — Tasks 6, 7, 8 (acquisition, depreciation batch, disposal RPCs)
- ✅ §4.9 Edge cases — enforced di RPC & service (checked in Task 5, 7, 11)
- ✅ §5 Pages & Routing — Tasks 14-22, 24
- ✅ §5.4 Reports — Task 23
- ✅ §5.5 BalanceSheet verification — Task 25
- ✅ §6 RLS + audit + RPC security — Tasks 2, 4-8 (security definer + is_admin_or_staff check)
- ✅ §7.2 Smoke tests — Task 26
- ✅ §7.3 Implementation order — urutan tasks matches

**Type consistency check:**
- RPC names consistent: `generate_asset_code`, `generate_depreciation_schedule`, `create_asset_acquisition_journal`, `post_depreciation_batch`, `execute_asset_disposal` — used same in SQL (T4-T8) and services (T11-T13).
- Service function names: `listAssets`, `getAsset`, `createAsset`, `updateAsset`, `softDeleteAsset` consistent between T11 and UI (T15, T17).
- Payment object shape consistent between T6 (RPC) and T11 (service) and T16 (UI component).
- Schedule status values `pending|posted|cancelled` consistent across T1, T5, T7, T8, T12.

**No placeholders found.**
