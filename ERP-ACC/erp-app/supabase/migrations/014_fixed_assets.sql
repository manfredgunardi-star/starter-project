-- Migration 014: Fixed Assets Module — tables and indexes
-- Tables: asset_categories, assets, depreciation_schedules, asset_disposals
-- RLS, triggers, and RPC functions are in subsequent migrations.

-- Extend journals.source to allow asset transaction types
do $$
declare
  v_constraint_name text;
begin
  select c.conname into v_constraint_name
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'journals'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%auto%manual%';

  if v_constraint_name is not null then
    execute 'alter table journals drop constraint ' || quote_ident(v_constraint_name);
  end if;
end $$;

alter table journals add constraint journals_source_check
  check (source in ('auto', 'manual', 'asset_acquisition', 'asset_depreciation', 'asset_disposal'));

-- ============================================================
-- Table 1: asset_categories
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

-- ============================================================
-- Table 2: assets
-- ============================================================
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
  constraint chk_depreciable_positive check (acquisition_cost > salvage_value),
  constraint chk_disposal_consistency check (
    (status = 'disposed' and disposed_at is not null and disposal_type is not null)
    or (status != 'disposed')
  )
);
create index idx_assets_category on assets(category_id) where is_active;
create index idx_assets_status on assets(status) where is_active;
create index idx_assets_code on assets(code);

-- ============================================================
-- Table 3: depreciation_schedules
-- ============================================================
create table depreciation_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
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

-- ============================================================
-- Table 4: asset_disposals
-- ============================================================
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
  created_by uuid references auth.users(id),
  constraint chk_sale_requires_price check (
    disposal_type != 'sale' or (sale_price is not null and payment_account_id is not null)
  )
);
create index idx_asset_disposals_asset on asset_disposals(asset_id);
create index idx_asset_disposals_date on asset_disposals(disposal_date);

-- ============================================================
-- RLS
-- ============================================================
alter table asset_categories       enable row level security;
alter table assets                 enable row level security;
alter table depreciation_schedules enable row level security;
alter table asset_disposals        enable row level security;

-- asset_categories: standard master data pattern
create policy "auth read asset_categories" on asset_categories
  for select to authenticated using (true);
create policy "staff insert asset_categories" on asset_categories
  for insert to authenticated with check (is_admin_or_staff());
create policy "staff update asset_categories" on asset_categories
  for update to authenticated using (is_admin_or_staff());
create policy "admin delete asset_categories" on asset_categories
  for delete to authenticated using (is_admin());

-- assets: standard master data pattern
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

-- ============================================================
-- Audit triggers (reuse fn_audit_log function from migration 013)
-- ============================================================
create trigger audit_assets_trigger
  after insert or update or delete on assets
  for each row execute function fn_audit_log();

create trigger audit_asset_categories_trigger
  after insert or update or delete on asset_categories
  for each row execute function fn_audit_log();

-- ============================================================
-- RPC: generate_asset_code
-- Returns next code in format '{CATEGORY}-{YYYY}-{NNNN}' (4 digits)
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
