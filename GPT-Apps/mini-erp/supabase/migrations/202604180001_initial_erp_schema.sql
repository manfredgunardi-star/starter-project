-- Mini ERP initial Supabase/PostgreSQL schema draft.
-- Review before applying to a real Supabase project.

create extension if not exists pgcrypto;

create schema if not exists reporting;

do $$
begin
  create type public.member_role as enum ('owner', 'admin', 'accounting', 'staff', 'reader');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.normal_balance as enum ('debit', 'credit');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_status as enum ('draft', 'posted', 'void');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.cash_bank_type as enum ('in', 'out');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.period_lock_status as enum ('locked', 'unlocked');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_accounting_rpc_context()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.accounting_rpc_context', true), '') = 'on';
$$;

create or replace function public.guard_journal_entry_direct_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_accounting_rpc_context() then
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'Posted/void journal entries can only be changed through accounting RPC.';
  end if;

  if old.status is distinct from new.status
    or old.approval_status is distinct from new.approval_status
    or old.approved_at is distinct from new.approved_at
    or old.approved_by is distinct from new.approved_by
    or old.posted_at is distinct from new.posted_at
    or old.posted_by is distinct from new.posted_by
    or old.voided_at is distinct from new.voided_at
    or old.voided_by is distinct from new.voided_by
    or old.void_reason is distinct from new.void_reason
    or old.reversal_entry_id is distinct from new.reversal_entry_id
    or old.reversal_of_entry_id is distinct from new.reversal_of_entry_id then
    raise exception 'Journal approval, posting, void, and reversal fields can only be changed through accounting RPC.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_cash_bank_direct_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_accounting_rpc_context() then
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'Posted/void cash bank transactions can only be changed through accounting RPC.';
  end if;

  if old.status is distinct from new.status
    or old.approval_status is distinct from new.approval_status
    or old.journal_entry_id is distinct from new.journal_entry_id
    or old.reversal_journal_entry_id is distinct from new.reversal_journal_entry_id
    or old.approved_at is distinct from new.approved_at
    or old.approved_by is distinct from new.approved_by
    or old.posted_at is distinct from new.posted_at
    or old.posted_by is distinct from new.posted_by
    or old.voided_at is distinct from new.voided_at
    or old.voided_by is distinct from new.voided_by
    or old.void_reason is distinct from new.void_reason then
    raise exception 'Cash bank approval, posting, void, and reversal fields can only be changed through accounting RPC.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_journal_line_direct_change()
returns trigger
language plpgsql
as $$
declare
  parent_status public.document_status;
begin
  if public.is_accounting_rpc_context() then
    return new;
  end if;

  select je.status
    into parent_status
  from public.journal_entries je
  where je.id = coalesce(new.journal_entry_id, old.journal_entry_id)
    and je.company_id = coalesce(new.company_id, old.company_id);

  if parent_status is null then
    raise exception 'Journal entry parent was not found for this line.';
  end if;

  if parent_status <> 'draft' then
    raise exception 'Posted/void journal lines can only be changed through accounting RPC.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_company_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.company_id is distinct from new.company_id then
    raise exception 'company_id cannot be changed after a row is created.';
  end if;

  return new;
end;
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tax_number text,
  address text,
  phone text,
  email text,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  email text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.member_role not null default 'reader',
  extra_permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  primary key (company_id, user_id)
);

create table if not exists public.business_partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  partner_type text not null check (partner_type in ('customer', 'supplier', 'both')),
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  symbol text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  account_type public.account_type not null,
  normal_balance public.normal_balance not null,
  parent_account_id uuid,
  is_cash_bank boolean not null default false,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id),
  constraint fk_accounts_parent_company
    foreign key (company_id, parent_account_id)
    references public.accounts(company_id, id)
    on delete restrict
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  product_type text not null default 'service' check (product_type in ('product', 'service')),
  unit_id uuid,
  category_id uuid,
  sale_price numeric(18, 2) not null default 0 check (sale_price >= 0),
  revenue_account_id uuid,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id),
  constraint fk_products_unit_company
    foreign key (company_id, unit_id)
    references public.units(company_id, id)
    on delete restrict,
  constraint fk_products_category_company
    foreign key (company_id, category_id)
    references public.product_categories(company_id, id)
    on delete restrict,
  constraint fk_products_revenue_account_company
    foreign key (company_id, revenue_account_id)
    references public.accounts(company_id, id)
    on delete restrict
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (company_id, code),
  unique (company_id, id)
);

create table if not exists public.accounting_period_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  period_start date not null,
  status public.period_lock_status not null default 'locked',
  note text,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id),
  unlocked_at timestamptz,
  unlocked_by uuid references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (company_id, period_start),
  unique (company_id, id),
  check (period_start = date_trunc('month', period_start)::date)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  journal_number text not null,
  journal_date date not null,
  description text not null,
  status public.document_status not null default 'draft',
  approval_status public.approval_status not null default 'pending',
  source_type text,
  source_id uuid,
  total_debit numeric(18, 2) not null default 0 check (total_debit >= 0),
  total_credit numeric(18, 2) not null default 0 check (total_credit >= 0),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  reversal_entry_id uuid,
  reversal_of_entry_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (company_id, journal_number),
  unique (company_id, id),
  constraint fk_journal_reversal_entry_company
    foreign key (company_id, reversal_entry_id)
    references public.journal_entries(company_id, id)
    on delete restrict,
  constraint fk_journal_reversal_of_company
    foreign key (company_id, reversal_of_entry_id)
    references public.journal_entries(company_id, id)
    on delete restrict,
  check (status <> 'posted' or approval_status = 'approved'),
  check (status <> 'posted' or total_debit = total_credit)
);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  journal_entry_id uuid not null,
  line_position integer not null default 1 check (line_position > 0),
  account_id uuid not null,
  cost_center_id uuid,
  description text,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (journal_entry_id, line_position),
  unique (company_id, id),
  constraint fk_journal_lines_entry_company
    foreign key (company_id, journal_entry_id)
    references public.journal_entries(company_id, id)
    on delete restrict,
  constraint fk_journal_lines_account_company
    foreign key (company_id, account_id)
    references public.accounts(company_id, id)
    on delete restrict,
  constraint fk_journal_lines_cost_center_company
    foreign key (company_id, cost_center_id)
    references public.cost_centers(company_id, id)
    on delete restrict
);

create table if not exists public.cash_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  transaction_number text not null,
  transaction_date date not null,
  transaction_type public.cash_bank_type not null,
  description text not null,
  amount numeric(18, 2) not null check (amount > 0),
  cash_account_id uuid not null,
  counter_account_id uuid not null,
  cost_center_id uuid,
  status public.document_status not null default 'draft',
  approval_status public.approval_status not null default 'pending',
  journal_entry_id uuid,
  reversal_journal_entry_id uuid,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (company_id, transaction_number),
  unique (company_id, id),
  constraint fk_cash_bank_cash_account_company
    foreign key (company_id, cash_account_id)
    references public.accounts(company_id, id)
    on delete restrict,
  constraint fk_cash_bank_counter_account_company
    foreign key (company_id, counter_account_id)
    references public.accounts(company_id, id)
    on delete restrict,
  constraint fk_cash_bank_cost_center_company
    foreign key (company_id, cost_center_id)
    references public.cost_centers(company_id, id)
    on delete restrict,
  constraint fk_cash_bank_journal_company
    foreign key (company_id, journal_entry_id)
    references public.journal_entries(company_id, id)
    on delete restrict,
  constraint fk_cash_bank_reversal_journal_company
    foreign key (company_id, reversal_journal_entry_id)
    references public.journal_entries(company_id, id)
    on delete restrict,
  check (cash_account_id <> counter_account_id),
  check (status <> 'posted' or approval_status = 'approved')
);

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_table text not null,
  document_id uuid not null,
  action text not null check (action in ('submit', 'approve', 'reject', 'post', 'void')),
  note text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  action text not null,
  collection_name text not null,
  document_id text,
  actor_id uuid references public.profiles(id),
  actor_name text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_members_user on public.company_members (user_id, is_active);
create index if not exists idx_business_partners_company_type on public.business_partners (company_id, partner_type, is_active);
create index if not exists idx_accounts_company_code on public.accounts (company_id, code);
create index if not exists idx_journal_entries_company_date on public.journal_entries (company_id, journal_date desc);
create index if not exists idx_journal_entries_company_status on public.journal_entries (company_id, status, approval_status);
create index if not exists idx_journal_lines_company_account on public.journal_entry_lines (company_id, account_id);
create index if not exists idx_cash_bank_company_date on public.cash_bank_transactions (company_id, transaction_date desc);
create index if not exists idx_audit_logs_company_created on public.audit_logs (company_id, created_at desc);

drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_company_members on public.company_members;
create trigger set_updated_at_company_members before update on public.company_members
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_business_partners on public.business_partners;
create trigger set_updated_at_business_partners before update on public.business_partners
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_units on public.units;
create trigger set_updated_at_units before update on public.units
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_product_categories on public.product_categories;
create trigger set_updated_at_product_categories before update on public.product_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_products on public.products;
create trigger set_updated_at_products before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_cost_centers on public.cost_centers;
create trigger set_updated_at_cost_centers before update on public.cost_centers
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_accounts on public.accounts;
create trigger set_updated_at_accounts before update on public.accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_accounting_period_locks on public.accounting_period_locks;
create trigger set_updated_at_accounting_period_locks before update on public.accounting_period_locks
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_journal_entries on public.journal_entries;
create trigger set_updated_at_journal_entries before update on public.journal_entries
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_cash_bank_transactions on public.cash_bank_transactions;
create trigger set_updated_at_cash_bank_transactions before update on public.cash_bank_transactions
for each row execute function public.set_updated_at();

drop trigger if exists guard_journal_entry_direct_update on public.journal_entries;
create trigger guard_journal_entry_direct_update before update on public.journal_entries
for each row execute function public.guard_journal_entry_direct_update();

drop trigger if exists guard_cash_bank_direct_update on public.cash_bank_transactions;
create trigger guard_cash_bank_direct_update before update on public.cash_bank_transactions
for each row execute function public.guard_cash_bank_direct_update();

drop trigger if exists guard_journal_line_direct_update on public.journal_entry_lines;
create trigger guard_journal_line_direct_update before update on public.journal_entry_lines
for each row execute function public.guard_journal_line_direct_change();

drop trigger if exists guard_company_members_company_id on public.company_members;
create trigger guard_company_members_company_id before update on public.company_members
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_business_partners_company_id on public.business_partners;
create trigger guard_business_partners_company_id before update on public.business_partners
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_units_company_id on public.units;
create trigger guard_units_company_id before update on public.units
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_product_categories_company_id on public.product_categories;
create trigger guard_product_categories_company_id before update on public.product_categories
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_products_company_id on public.products;
create trigger guard_products_company_id before update on public.products
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_cost_centers_company_id on public.cost_centers;
create trigger guard_cost_centers_company_id before update on public.cost_centers
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_accounts_company_id on public.accounts;
create trigger guard_accounts_company_id before update on public.accounts
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_accounting_period_locks_company_id on public.accounting_period_locks;
create trigger guard_accounting_period_locks_company_id before update on public.accounting_period_locks
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_journal_entries_company_id on public.journal_entries;
create trigger guard_journal_entries_company_id before update on public.journal_entries
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_journal_entry_lines_company_id on public.journal_entry_lines;
create trigger guard_journal_entry_lines_company_id before update on public.journal_entry_lines
for each row execute function public.guard_company_id_immutable();

drop trigger if exists guard_cash_bank_transactions_company_id on public.cash_bank_transactions;
create trigger guard_cash_bank_transactions_company_id before update on public.cash_bank_transactions
for each row execute function public.guard_company_id_immutable();

create or replace function public.has_company_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.is_active = true
      and cm.deleted_at is null
  );
$$;

create or replace function public.has_company_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.is_active = true
      and cm.deleted_at is null
      and (
        cm.role = 'owner'
        or p_permission = any(cm.extra_permissions)
        or (cm.role = 'admin' and p_permission in (
          'dashboard:read', 'masterdata:read', 'masterdata:write', 'masterdata:delete',
          'accounting:read', 'accounting:write', 'accounting:approve',
          'reports:read', 'settings:manage', 'users:manage'
        ))
        or (cm.role = 'accounting' and p_permission in (
          'dashboard:read', 'masterdata:read', 'accounting:read', 'accounting:write',
          'accounting:approve', 'accounting:post', 'reports:read'
        ))
        or (cm.role = 'staff' and p_permission in (
          'dashboard:read', 'masterdata:read', 'masterdata:write'
        ))
        or (cm.role = 'reader' and p_permission in (
          'dashboard:read', 'masterdata:read', 'accounting:read', 'reports:read'
        ))
      )
  );
$$;

create or replace function public.is_draft_journal(p_company_id uuid, p_journal_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.journal_entries je
    where je.company_id = p_company_id
      and je.id = p_journal_entry_id
      and je.status = 'draft'
  );
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;
alter table public.business_partners enable row level security;
alter table public.units enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.cost_centers enable row level security;
alter table public.accounts enable row level security;
alter table public.accounting_period_locks enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.cash_bank_transactions enable row level security;
alter table public.approval_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
for select using (id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "companies member read" on public.companies;
create policy "companies member read" on public.companies
for select using (public.has_company_access(id));

drop policy if exists "company members member read" on public.company_members;
create policy "company members member read" on public.company_members
for select using (public.has_company_access(company_id));

drop policy if exists "company members admin write" on public.company_members;
drop policy if exists "company members admin insert" on public.company_members;
create policy "company members admin insert" on public.company_members
for insert with check (public.has_company_permission(company_id, 'users:manage'));

drop policy if exists "company members admin update" on public.company_members;
create policy "company members admin update" on public.company_members
for update using (public.has_company_permission(company_id, 'users:manage'))
with check (public.has_company_permission(company_id, 'users:manage'));

drop policy if exists "masterdata member read partners" on public.business_partners;
create policy "masterdata member read partners" on public.business_partners
for select using (public.has_company_permission(company_id, 'masterdata:read'));

drop policy if exists "masterdata member write partners" on public.business_partners;
drop policy if exists "masterdata member insert partners" on public.business_partners;
create policy "masterdata member insert partners" on public.business_partners
for insert with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member update partners" on public.business_partners;
create policy "masterdata member update partners" on public.business_partners
for update using (public.has_company_permission(company_id, 'masterdata:write'))
with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member read units" on public.units;
create policy "masterdata member read units" on public.units
for select using (public.has_company_permission(company_id, 'masterdata:read'));

drop policy if exists "masterdata member write units" on public.units;
drop policy if exists "masterdata member insert units" on public.units;
create policy "masterdata member insert units" on public.units
for insert with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member update units" on public.units;
create policy "masterdata member update units" on public.units
for update using (public.has_company_permission(company_id, 'masterdata:write'))
with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member read product categories" on public.product_categories;
create policy "masterdata member read product categories" on public.product_categories
for select using (public.has_company_permission(company_id, 'masterdata:read'));

drop policy if exists "masterdata member write product categories" on public.product_categories;
drop policy if exists "masterdata member insert product categories" on public.product_categories;
create policy "masterdata member insert product categories" on public.product_categories
for insert with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member update product categories" on public.product_categories;
create policy "masterdata member update product categories" on public.product_categories
for update using (public.has_company_permission(company_id, 'masterdata:write'))
with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member read products" on public.products;
create policy "masterdata member read products" on public.products
for select using (public.has_company_permission(company_id, 'masterdata:read'));

drop policy if exists "masterdata member write products" on public.products;
drop policy if exists "masterdata member insert products" on public.products;
create policy "masterdata member insert products" on public.products
for insert with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member update products" on public.products;
create policy "masterdata member update products" on public.products
for update using (public.has_company_permission(company_id, 'masterdata:write'))
with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member read cost centers" on public.cost_centers;
create policy "masterdata member read cost centers" on public.cost_centers
for select using (public.has_company_permission(company_id, 'masterdata:read'));

drop policy if exists "masterdata member write cost centers" on public.cost_centers;
drop policy if exists "masterdata member insert cost centers" on public.cost_centers;
create policy "masterdata member insert cost centers" on public.cost_centers
for insert with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "masterdata member update cost centers" on public.cost_centers;
create policy "masterdata member update cost centers" on public.cost_centers
for update using (public.has_company_permission(company_id, 'masterdata:write'))
with check (public.has_company_permission(company_id, 'masterdata:write'));

drop policy if exists "accounting read accounts" on public.accounts;
create policy "accounting read accounts" on public.accounts
for select using (
  public.has_company_permission(company_id, 'accounting:read')
  or public.has_company_permission(company_id, 'masterdata:read')
);

drop policy if exists "accounting write accounts" on public.accounts;
drop policy if exists "accounting insert accounts" on public.accounts;
create policy "accounting insert accounts" on public.accounts
for insert with check (public.has_company_permission(company_id, 'accounting:write'));

drop policy if exists "accounting update accounts" on public.accounts;
create policy "accounting update accounts" on public.accounts
for update using (public.has_company_permission(company_id, 'accounting:write'))
with check (public.has_company_permission(company_id, 'accounting:write'));

drop policy if exists "accounting read journals" on public.journal_entries;
create policy "accounting read journals" on public.journal_entries
for select using (public.has_company_permission(company_id, 'accounting:read'));

drop policy if exists "accounting write journals" on public.journal_entries;
drop policy if exists "accounting insert draft journals" on public.journal_entries;
create policy "accounting insert draft journals" on public.journal_entries
for insert with check (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
  and approval_status = 'pending'
);

drop policy if exists "accounting update draft journals" on public.journal_entries;
create policy "accounting update draft journals" on public.journal_entries
for update using (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
)
with check (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
);

drop policy if exists "accounting read journal lines" on public.journal_entry_lines;
create policy "accounting read journal lines" on public.journal_entry_lines
for select using (public.has_company_permission(company_id, 'accounting:read'));

drop policy if exists "accounting write journal lines" on public.journal_entry_lines;
drop policy if exists "accounting insert draft journal lines" on public.journal_entry_lines;
create policy "accounting insert draft journal lines" on public.journal_entry_lines
for insert with check (
  public.has_company_permission(company_id, 'accounting:write')
  and public.is_draft_journal(company_id, journal_entry_id)
);

drop policy if exists "accounting update draft journal lines" on public.journal_entry_lines;
create policy "accounting update draft journal lines" on public.journal_entry_lines
for update using (
  public.has_company_permission(company_id, 'accounting:write')
  and public.is_draft_journal(company_id, journal_entry_id)
)
with check (
  public.has_company_permission(company_id, 'accounting:write')
  and public.is_draft_journal(company_id, journal_entry_id)
);

drop policy if exists "accounting read cash bank" on public.cash_bank_transactions;
create policy "accounting read cash bank" on public.cash_bank_transactions
for select using (public.has_company_permission(company_id, 'accounting:read'));

drop policy if exists "accounting write cash bank" on public.cash_bank_transactions;
drop policy if exists "accounting insert draft cash bank" on public.cash_bank_transactions;
create policy "accounting insert draft cash bank" on public.cash_bank_transactions
for insert with check (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
  and approval_status = 'pending'
);

drop policy if exists "accounting update draft cash bank" on public.cash_bank_transactions;
create policy "accounting update draft cash bank" on public.cash_bank_transactions
for update using (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
)
with check (
  public.has_company_permission(company_id, 'accounting:write')
  and status = 'draft'
);

drop policy if exists "settings read locks" on public.accounting_period_locks;
create policy "settings read locks" on public.accounting_period_locks
for select using (public.has_company_permission(company_id, 'accounting:read'));

drop policy if exists "settings write locks" on public.accounting_period_locks;
drop policy if exists "settings insert locks" on public.accounting_period_locks;
drop policy if exists "settings update locks" on public.accounting_period_locks;

drop policy if exists "approval events read" on public.approval_events;
create policy "approval events read" on public.approval_events
for select using (public.has_company_permission(company_id, 'accounting:read'));

drop policy if exists "approval events write" on public.approval_events;

drop policy if exists "audit logs read" on public.audit_logs;
create policy "audit logs read" on public.audit_logs
for select using (public.has_company_permission(company_id, 'settings:manage'));

drop policy if exists "audit logs insert" on public.audit_logs;

create or replace view reporting.vw_journal_lines
with (security_invoker = true) as
select
  je.company_id,
  je.id as journal_entry_id,
  je.journal_number,
  je.journal_date,
  je.description as journal_description,
  je.status,
  je.approval_status,
  jel.id as journal_line_id,
  jel.line_position,
  a.id as account_id,
  a.code as account_code,
  a.name as account_name,
  a.account_type,
  a.normal_balance,
  cc.id as cost_center_id,
  cc.code as cost_center_code,
  cc.name as cost_center_name,
  jel.description as line_description,
  jel.debit,
  jel.credit,
  (jel.debit - jel.credit) as signed_amount,
  je.created_at,
  je.posted_at
from public.journal_entries je
join public.journal_entry_lines jel on jel.journal_entry_id = je.id
join public.accounts a on a.id = jel.account_id
left join public.cost_centers cc on cc.id = jel.cost_center_id
where je.status = 'posted'
  and je.is_active = true;

create or replace view reporting.vw_buku_besar
with (security_invoker = true) as
select
  v.*,
  sum(
    case
      when v.normal_balance = 'debit' then v.debit - v.credit
      else v.credit - v.debit
    end
  ) over (
    partition by v.company_id, v.account_id
    order by v.journal_date, v.journal_number, v.line_position, v.journal_line_id
    rows between unbounded preceding and current row
  ) as running_balance
from reporting.vw_journal_lines v;

create or replace view reporting.vw_trial_balance
with (security_invoker = true) as
select
  company_id,
  account_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  sum(debit) as total_debit,
  sum(credit) as total_credit,
  greatest(sum(debit - credit), 0) as debit_balance,
  greatest(sum(credit - debit), 0) as credit_balance
from reporting.vw_journal_lines
group by company_id, account_id, account_code, account_name, account_type, normal_balance;

create or replace view reporting.vw_profit_loss
with (security_invoker = true) as
select
  company_id,
  account_id,
  account_code,
  account_name,
  account_type,
  case
    when account_type = 'revenue' then sum(credit - debit)
    when account_type = 'expense' then sum(debit - credit)
    else 0
  end as amount
from reporting.vw_journal_lines
where account_type in ('revenue', 'expense')
group by company_id, account_id, account_code, account_name, account_type;

create or replace view reporting.vw_balance_sheet
with (security_invoker = true) as
select
  company_id,
  account_id,
  account_code,
  account_name,
  account_type,
  case
    when account_type = 'asset' then sum(debit - credit)
    when account_type in ('liability', 'equity') then sum(credit - debit)
    else 0
  end as amount
from reporting.vw_journal_lines
where account_type in ('asset', 'liability', 'equity')
group by company_id, account_id, account_code, account_name, account_type;

grant usage on schema reporting to authenticated;
grant select on all tables in schema reporting to authenticated;
