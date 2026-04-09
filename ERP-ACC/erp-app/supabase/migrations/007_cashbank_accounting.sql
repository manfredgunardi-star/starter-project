-- ============================================================
-- Migration 007: Cash/Bank & Accounting
-- ============================================================

-- Cash/Bank accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('cash', 'bank')),
  coa_id uuid not null references coa(id),
  balance numeric(15,2) not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Payments (pembayaran dari/ke customer/supplier)
create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  date date not null,
  type text not null check (type in ('incoming', 'outgoing')),
  invoice_id uuid references invoices(id),
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  account_id uuid not null references accounts(id),
  amount numeric(15,2) not null check (amount > 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Journals (double-entry bookkeeping)
create table journals (
  id uuid primary key default gen_random_uuid(),
  journal_number text not null unique,
  date date not null,
  description text,
  source text not null check (source in ('auto', 'manual')),
  reference_type text,
  reference_id uuid,
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  is_posted boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table journal_items (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references journals(id) on delete cascade,
  coa_id uuid not null references coa(id),
  debit numeric(15,2) not null default 0 check (debit >= 0),
  credit numeric(15,2) not null default 0 check (credit >= 0),
  description text,
  -- Each line must have either debit or credit, not both
  check (debit > 0 or credit > 0),
  check (not (debit > 0 and credit > 0))
);

-- Bank reconciliations
create table bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  date date not null,
  statement_balance numeric(15,2) not null,
  system_balance numeric(15,2) not null,
  is_reconciled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_payments_invoice on payments(invoice_id);
create index idx_payments_type on payments(type);
create index idx_payments_date on payments(date);
create index idx_journals_source on journals(source);
create index idx_journals_ref on journals(reference_type, reference_id);
create index idx_journals_date on journals(date);
create index idx_journal_items_coa on journal_items(coa_id);
