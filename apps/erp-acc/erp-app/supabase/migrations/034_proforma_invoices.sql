-- ============================================================
-- Migration 034: Proforma Sales Invoices
-- Non-accounting document: no journal entries, no payment tracking
-- ============================================================

-- Tabel header proforma invoice
create table proforma_invoices (
  id              uuid primary key default gen_random_uuid(),
  proforma_number text unique not null,
  date            date not null,
  valid_until     date,
  customer_id     uuid not null references customers(id),
  sales_order_id  uuid references sales_orders(id),
  notes           text,
  subtotal        numeric(15,2) not null default 0,
  tax_total       numeric(15,2) not null default 0,
  total           numeric(15,2) not null default 0,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Tabel item proforma invoice
create table proforma_invoice_items (
  id              uuid primary key default gen_random_uuid(),
  proforma_id     uuid not null references proforma_invoices(id) on delete cascade,
  product_id      uuid not null references products(id),
  unit_id         uuid not null references units(id),
  quantity        numeric(15,4) not null default 0,
  quantity_base   numeric(15,4) not null default 0,
  unit_price      numeric(15,2) not null default 0,
  tax_amount      numeric(15,2) not null default 0,
  total           numeric(15,2) not null default 0
);

-- updated_at trigger
create trigger set_updated_at
  before update on proforma_invoices
  for each row execute function update_updated_at();

-- Indexes
create index idx_proforma_customer on proforma_invoices(customer_id);
create index idx_proforma_date     on proforma_invoices(date);
create index idx_proforma_active   on proforma_invoices(is_active) where is_active = true;

-- RLS
alter table proforma_invoices enable row level security;
alter table proforma_invoice_items enable row level security;

-- proforma_invoices: granular per-operation policies (pattern from migration 009)
create policy "Authenticated read proforma_invoices"
  on proforma_invoices for select to authenticated
  using (true);

create policy "Admin/staff insert proforma_invoices"
  on proforma_invoices for insert to authenticated
  with check (is_admin_or_staff());

create policy "Admin/staff update proforma_invoices"
  on proforma_invoices for update to authenticated
  using (is_admin_or_staff());

create policy "Admin delete proforma_invoices"
  on proforma_invoices for delete to authenticated
  using (is_admin());

-- proforma_invoice_items: granular per-operation policies
create policy "Authenticated read proforma_invoice_items"
  on proforma_invoice_items for select to authenticated
  using (true);

create policy "Admin/staff insert proforma_invoice_items"
  on proforma_invoice_items for insert to authenticated
  with check (is_admin_or_staff());

create policy "Admin/staff update proforma_invoice_items"
  on proforma_invoice_items for update to authenticated
  using (is_admin_or_staff());

create policy "Admin delete proforma_invoice_items"
  on proforma_invoice_items for delete to authenticated
  using (is_admin());

-- RPC: save (upsert) proforma invoice + items atomically
-- generate_number('PFI') menghasilkan format PFI-2026-00001 dst.
create or replace function save_proforma_invoice(
  p_proforma jsonb,
  p_items    jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid := nullif(p_proforma->>'id', '')::uuid;
  v_number text;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  if v_id is null then
    -- INSERT baru
    v_number := generate_number('PFI');
    insert into proforma_invoices (
      proforma_number, date, valid_until,
      customer_id, sales_order_id, notes,
      subtotal, tax_total, total, created_by
    ) values (
      v_number,
      (p_proforma->>'date')::date,
      nullif(p_proforma->>'valid_until', '')::date,
      (p_proforma->>'customer_id')::uuid,
      nullif(p_proforma->>'sales_order_id', '')::uuid,
      nullif(p_proforma->>'notes', ''),
      coalesce((p_proforma->>'subtotal')::numeric, 0),
      coalesce((p_proforma->>'tax_total')::numeric, 0),
      coalesce((p_proforma->>'total')::numeric, 0),
      auth.uid()
    ) returning id into v_id;
  else
    -- UPDATE
    update proforma_invoices set
      date           = (p_proforma->>'date')::date,
      valid_until    = nullif(p_proforma->>'valid_until', '')::date,
      customer_id    = (p_proforma->>'customer_id')::uuid,
      sales_order_id = nullif(p_proforma->>'sales_order_id', '')::uuid,
      notes          = nullif(p_proforma->>'notes', ''),
      subtotal       = coalesce((p_proforma->>'subtotal')::numeric, 0),
      tax_total      = coalesce((p_proforma->>'tax_total')::numeric, 0),
      total          = coalesce((p_proforma->>'total')::numeric, 0),
      updated_at     = now()
    where id = v_id;

    if not found then
      raise exception 'proforma invoice tidak ditemukan (id: %)', v_id;
    end if;

    -- Hapus items lama (akan diinsert ulang)
    delete from proforma_invoice_items where proforma_id = v_id;
  end if;

  -- INSERT items
  insert into proforma_invoice_items (
    proforma_id, product_id, unit_id,
    quantity, quantity_base, unit_price,
    tax_amount, total
  )
  select
    v_id,
    (item->>'product_id')::uuid,
    (item->>'unit_id')::uuid,
    coalesce((item->>'quantity')::numeric, 0),
    coalesce((item->>'quantity_base')::numeric, 0),
    coalesce((item->>'unit_price')::numeric, 0),
    coalesce((item->>'tax_amount')::numeric, 0),
    coalesce((item->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as item;

  return v_id;
end;
$$;

-- RPC: soft-delete proforma invoice
create or replace function cancel_proforma_invoice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  update proforma_invoices
  set is_active = false, updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'proforma invoice tidak ditemukan (id: %)', p_id;
  end if;
end;
$$;
