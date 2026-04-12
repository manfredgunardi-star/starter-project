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

-- ============================================================
-- RPC: generate_depreciation_schedule
-- Idempotent: deletes existing 'pending' rows, regenerates full schedule.
-- Preserves 'posted' and 'cancelled' rows (raises exception if posted exist).
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
    -- period_date = last day of the i-th month from depreciation_start_date
    v_period_date := (date_trunc('month', v_asset.depreciation_start_date)
                      + make_interval(months => i - 1)
                      + interval '1 month' - interval '1 day')::date;

    -- Last period absorbs rounding remainder
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

  -- Dr asset account (debit = acquisition_cost, credit = 0)
  insert into journal_items (journal_id, coa_id, debit, credit, description)
    values (v_journal_id, v_category.asset_account_id,
            v_asset.acquisition_cost, 0,
            'Perolehan ' || v_asset.code);

  -- Cr cash/bank (debit = 0, credit = amount)
  if v_cash_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'cash_bank_account_id')::uuid,
              0, v_cash_amt, 'Pembayaran tunai/bank');
  end if;

  -- Cr hutang (debit = 0, credit = amount)
  if v_hutang_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'hutang_account_id')::uuid,
              0, v_hutang_amt, 'Hutang pembelian aset');
  end if;

  -- Cr uang muka (debit = 0, credit = amount)
  if v_um_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id,
              (p_payment->>'uang_muka_account_id')::uuid,
              0, v_um_amt, 'Pemakaian uang muka');
  end if;

  return v_journal_id;
end $$;

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

      -- Dr depreciation expense (debit > 0, credit = 0)
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.depreciation_expense_account_id,
                v_row.amount, 0, 'Penyusutan ' || v_row.asset_code);

      -- Cr accumulated depreciation (debit = 0, credit > 0)
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

  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
end $$;

-- ============================================================
-- RPC: execute_asset_disposal
-- 1. Auto-posts pending depreciation up to period before disposal_date
-- 2. Creates disposal journal (sale or writeoff)
-- 3. Inserts asset_disposals row
-- 4. Cancels remaining schedule rows after disposal period
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
  v_prev_period text := to_char(p_disposal_date - interval '1 month', 'YYYY-MM');
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

  -- 1. Auto-post pending depreciation up to month before disposal
  perform post_depreciation_batch(
    '1900-01',
    v_prev_period,
    p_disposal_date,
    'Penyusutan {asset} – {period} (catch-up disposal)'
  );

  -- 2. Snapshot accumulated & book value (after auto-post)
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
    -- Gain or Loss (only insert if non-zero to comply with debit>0 OR credit>0 constraint)
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
    -- Dr accumulated depreciation
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.accumulated_depreciation_account_id, v_accumulated, 0,
              'Eliminasi akum penyusutan');
    -- Dr loss on disposal (only if book_value > 0)
    if v_book_value > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, (select id from coa where code = '5-99100'),
                v_book_value, 0, 'Kerugian penghapusan aset');
    end if;
    -- Cr asset account
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.asset_account_id, 0, v_asset.acquisition_cost,
              'Eliminasi aset');
    v_gain_loss := -v_book_value;
  end if;

  -- 3. Insert asset_disposals record
  insert into asset_disposals (asset_id, disposal_date, disposal_type,
    sale_price, payment_account_id, book_value_at_disposal,
    accumulated_at_disposal, gain_loss, journal_id, notes, created_by)
  values (p_asset_id, p_disposal_date, p_disposal_type,
    p_sale_price, p_payment_account_id, v_book_value,
    v_accumulated, v_gain_loss, v_journal_id, p_notes, auth.uid());

  -- 4. Cancel remaining pending schedules after disposal period
  update depreciation_schedules
    set status = 'cancelled'
    where asset_id = p_asset_id and status = 'pending'
      and period > v_cutoff;

  -- 5. Update asset to disposed
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
