# Sales & Purchase Returns (Credit/Debit Note) — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementasi modul Retur Penjualan (Credit Note) & Retur Pembelian (Debit Note) — wajib link ke invoice asal, partial qty, PPN ikut dibalik, inventory pakai avg cost saat retur, refund manual.

**Architecture:** Migrasi 028 menambah tabel `sales_returns`/`purchase_returns` + items + helper `returnable_qty()`. RPC `post_*_return` otomatis membuat jurnal kontra (reverse revenue/expense + reverse PPN), update inventory pakai avg cost saat itu, simpan credit/debit balance. UI list + form dengan invoice picker + line picker yang validasi qty terhadap `returnable_qty`. Print template Credit Note/Debit Note.

**Tech Stack:** Supabase Postgres (PL/pgSQL), React 19 + Ant Design 6, Vite, Playwright e2e, jsPDF (untuk print).

**Spec:** [`apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md`](../specs/2026-05-14-master-data-retur-cancel-closing-design.md) §5

**Prerequisites:**
- Phase 1 plan applied (untuk `tax_codes` master).
- Phase 2 plan applied (reuse cancel infrastructure + invoice status guards).
- Migration 028 numbering — pastikan tidak konflik dengan migration baru lain di antara 027-028.

**Total estimasi:** 7-10 hari developer.

---

## File Structure

### New Files
| File | Responsibility | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` | Schema + RLS + helper + 4 RPC | Claude Opus |
| `apps/erp-acc/erp-app/src/services/salesReturnService.js` | CRUD + post + cancel | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/purchaseReturnService.js` | CRUD + post + cancel | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx` | List page | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx` | Form: pick invoice → pick lines → enter qty | Claude Opus (UX correctness + qty validation) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx` | List page | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx` | Form mirror | Claude Opus |
| `apps/erp-acc/erp-app/src/components/shared/CreditNotePrintTemplate.jsx` | Print PDF Credit/Debit Note | Codex (Sonnet) |
| `apps/erp-acc/erp-app/tests/playwright/sales-return.spec.js` | E2E sales return | Claude Opus |
| `apps/erp-acc/erp-app/tests/playwright/purchase-return.spec.js` | E2E purchase return | Codex (Sonnet) |

### Modified Files
| File | Change | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/src/App.jsx` | Routes baru | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Tombol "Buat Retur" di detail | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx` | Tombol "Buat Retur" di detail | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/companySettingsService.js` | Field `default_sales_return_account_id`, `default_purchase_return_account_id`, `default_inventory_adjustment_account_id` | Claude Opus |

---

## Task 1: SQL Migration — Schema & Helper Function

**Suggested executor:** Claude Opus

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql`

- [ ] **Step 1: Tulis schema lengkap**

```sql
-- ============================================================
-- Migration 028: Sales & Purchase Returns (Credit/Debit Note)
-- ============================================================

-- 1) SALES RETURNS
create table sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  date date not null,
  customer_id uuid not null references customers(id),
  invoice_id uuid not null references invoices(id),
  warehouse_id uuid references warehouses(id),
  reason text,
  tax_invoice_number text,                          -- Nota Retur Faktur Pajak (manual input)
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  credit_balance numeric(15,2) not null default 0,
  journal_id uuid references journals(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  reversed_journal_id uuid references journals(id)
);
create index idx_sr_invoice on sales_returns(invoice_id);
create index idx_sr_customer on sales_returns(customer_id);
create index idx_sr_date on sales_returns(date);
create index idx_sr_status on sales_returns(status);

create table sales_return_items (
  id uuid primary key default gen_random_uuid(),
  sales_return_id uuid not null references sales_returns(id) on delete cascade,
  invoice_item_id uuid not null references invoice_items(id),
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_code_id uuid references tax_codes(id),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);
create index idx_sri_return on sales_return_items(sales_return_id);
create index idx_sri_invoice_item on sales_return_items(invoice_item_id);

-- 2) PURCHASE RETURNS (mirror)
create table purchase_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  date date not null,
  supplier_id uuid not null references suppliers(id),
  invoice_id uuid not null references invoices(id),
  warehouse_id uuid references warehouses(id),
  reason text,
  tax_invoice_number text,
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  debit_balance numeric(15,2) not null default 0,
  journal_id uuid references journals(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  reversed_journal_id uuid references journals(id)
);
create index idx_pr_invoice on purchase_returns(invoice_id);
create index idx_pr_supplier on purchase_returns(supplier_id);
create index idx_pr_date on purchase_returns(date);
create index idx_pr_status on purchase_returns(status);

create table purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references purchase_returns(id) on delete cascade,
  invoice_item_id uuid not null references invoice_items(id),
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_code_id uuid references tax_codes(id),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);
create index idx_pri_return on purchase_return_items(purchase_return_id);
create index idx_pri_invoice_item on purchase_return_items(invoice_item_id);

-- 3) HELPER: returnable_qty per invoice_item
create or replace function returnable_qty(p_invoice_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select i.quantity_base
       - coalesce((
           select sum(sri.quantity_base)
             from sales_return_items sri
             join sales_returns sr on sr.id = sri.sales_return_id
            where sri.invoice_item_id = p_invoice_item_id
              and sr.status = 'posted'
         ), 0)
       - coalesce((
           select sum(pri.quantity_base)
             from purchase_return_items pri
             join purchase_returns pr on pr.id = pri.purchase_return_id
            where pri.invoice_item_id = p_invoice_item_id
              and pr.status = 'posted'
         ), 0)
    from invoice_items i where i.id = p_invoice_item_id;
$$;

-- 4) RLS
alter table sales_returns         enable row level security;
alter table sales_return_items    enable row level security;
alter table purchase_returns      enable row level security;
alter table purchase_return_items enable row level security;

create policy "Authenticated read sales_returns"
  on sales_returns for select to authenticated using (true);
create policy "Admin/staff manage sales_returns"
  on sales_returns for all to authenticated using (is_admin_or_staff());

create policy "Authenticated read sales_return_items"
  on sales_return_items for select to authenticated using (true);
create policy "Admin/staff manage sales_return_items"
  on sales_return_items for all to authenticated using (is_admin_or_staff());

create policy "Authenticated read purchase_returns"
  on purchase_returns for select to authenticated using (true);
create policy "Admin/staff manage purchase_returns"
  on purchase_returns for all to authenticated using (is_admin_or_staff());

create policy "Authenticated read purchase_return_items"
  on purchase_return_items for select to authenticated using (true);
create policy "Admin/staff manage purchase_return_items"
  on purchase_return_items for all to authenticated using (is_admin_or_staff());

-- 5) Trigger updated_at
create trigger set_updated_at before update on sales_returns
  for each row execute function update_updated_at();
create trigger set_updated_at before update on purchase_returns
  for each row execute function update_updated_at();

-- 6) Bootstrap default COA accounts (jika belum ada)
-- Cek apakah COA "Retur Penjualan" sudah ada; kalau belum, insert dengan parent ke Pendapatan.
-- (Implementer: cek struktur COA existing; ini opsional — bisa juga di task tersendiri)
```

- [ ] **Step 2: Apply migrasi (schema only)**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

- [ ] **Step 3: Verify schema**

```sql
select count(*) from information_schema.tables
  where table_name in ('sales_returns','sales_return_items','purchase_returns','purchase_return_items');
-- Expected: 4

-- Test returnable_qty: pilih 1 invoice_item, expected = quantity_base (belum ada retur)
select id, quantity_base, returnable_qty(id) from invoice_items limit 5;
```

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add sales/purchase returns schema + returnable_qty helper"
```

---

## Task 2: SQL — Bootstrap COA Account Mappings & company_settings extension

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (append SECTION 7)

- [ ] **Step 1: Tambah field di company_settings + seed default COA**

```sql
-- 7) company_settings: tambah account mappings untuk retur
alter table company_settings
  add column default_sales_return_account_id uuid references coa(id),
  add column default_purchase_return_account_id uuid references coa(id),
  add column default_inventory_adjustment_account_id uuid references coa(id);

-- 8) Seed COA untuk retur jika belum ada (idempotent dengan ON CONFLICT)
insert into coa (code, name, type, normal_balance) values
  ('4900', 'Retur Penjualan',  'revenue',  'debit'),  -- kontra revenue: saldo normal DEBIT
  ('5900', 'Retur Pembelian',  'expense',  'credit'), -- kontra expense: saldo normal CREDIT
  ('1490', 'Penyesuaian Persediaan', 'asset', 'debit')
  on conflict (code) do nothing;

-- 9) Set default mapping di company_settings (asumsi 1 row company)
update company_settings set
  default_sales_return_account_id = (select id from coa where code='4900'),
  default_purchase_return_account_id = (select id from coa where code='5900'),
  default_inventory_adjustment_account_id = (select id from coa where code='1490')
  where default_sales_return_account_id is null;
```

- [ ] **Step 2: Verify**

```sql
select default_sales_return_account_id, default_purchase_return_account_id, default_inventory_adjustment_account_id
  from company_settings;
-- Expected: 3 UUIDs
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add return account mappings to company_settings"
```

---

## Task 3: SQL RPC — post_sales_return

**Suggested executor:** Claude Opus — financial logic core, must be jurnal-balanced.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (append SECTION 10)

- [ ] **Step 1: Tulis RPC dengan validasi qty + posting jurnal + inventory in**

```sql
-- 10) post_sales_return — generate journal + inventory in + set credit_balance

create or replace function post_sales_return(p_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ret record;
  v_inv record;
  v_item record;
  v_returnable numeric;
  v_journal_id uuid;
  v_avg_cost numeric;
  v_total_subtotal numeric := 0;
  v_total_tax numeric := 0;
  v_total_cogs numeric := 0;

  -- COA references (dari company_settings)
  v_acct_ar uuid;
  v_acct_return uuid;
  v_acct_ppn_keluaran uuid;
  v_acct_inventory uuid;
  v_acct_cogs uuid;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;

  select * into v_ret from sales_returns where id=p_return_id for update;
  if v_ret is null then raise exception 'Return tidak ditemukan'; end if;
  if v_ret.status <> 'draft' then raise exception 'Return bukan draft'; end if;

  perform _ensure_period_open(v_ret.date);

  -- Ambil invoice asal
  select * into v_inv from invoices where id=v_ret.invoice_id;
  if v_inv.type <> 'sales' then raise exception 'Invoice asal bukan sales'; end if;

  -- Validasi qty per item TIDAK boleh > returnable_qty
  for v_item in select * from sales_return_items where sales_return_id=p_return_id
  loop
    select returnable_qty(v_item.invoice_item_id) into v_returnable;
    if v_item.quantity_base > v_returnable then
      raise exception 'Item % retur % melebihi sisa retur (%)',
        v_item.product_id, v_item.quantity_base, v_returnable;
    end if;
  end loop;

  -- Resolve COA mappings
  select default_sales_return_account_id,
         default_inventory_adjustment_account_id
    into v_acct_return, v_acct_inventory
    from company_settings limit 1;

  -- AR account dari customer
  select ar_account_id into v_acct_ar from customers where id=v_ret.customer_id;
  if v_acct_ar is null then raise exception 'Customer % tidak punya AR account', v_ret.customer_id; end if;

  -- PPN Keluaran: ambil dari tax_code line pertama (atau dari company_settings default)
  select tc.output_account_id into v_acct_ppn_keluaran
    from sales_return_items sri
    left join tax_codes tc on tc.id = sri.tax_code_id
    where sri.sales_return_id = p_return_id and sri.tax_amount > 0
    limit 1;

  -- COGS account: cek company_settings.default_cogs_account_id (existing field; verify)
  select default_cogs_account_id into v_acct_cogs from company_settings limit 1;
  if v_acct_cogs is null then raise exception 'COGS account belum di-set di company_settings'; end if;

  -- Buat journal header
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_journal_id, generate_number('JR'), v_ret.date,
    format('Retur Penjualan %s', v_ret.return_number),
    'sales_return', p_return_id, auth.uid()
  );

  -- Loop: inventory_stock_in + accumulate jurnal
  for v_item in select * from sales_return_items where sales_return_id=p_return_id
  loop
    -- Avg cost SAAT INI (akan jadi cost in)
    select coalesce(avg_cost,0) into v_avg_cost from inventory_stock where product_id=v_item.product_id;

    perform inventory_stock_in(
      v_item.product_id,
      v_item.quantity_base,
      v_avg_cost,
      v_item.unit_id,
      v_item.quantity,
      'sales_return',
      p_return_id,
      v_ret.date
    );

    v_total_cogs := v_total_cogs + (v_avg_cost * v_item.quantity_base);
    v_total_subtotal := v_total_subtotal + (v_item.unit_price * v_item.quantity_base);
    v_total_tax := v_total_tax + v_item.tax_amount;
  end loop;

  -- Jurnal entries (balanced):
  --   DR Persediaan          v_total_cogs
  --   CR HPP                 v_total_cogs
  --   DR Retur Penjualan     v_total_subtotal     (kontra-revenue, saldo normal debit)
  --   DR PPN Keluaran        v_total_tax           (kontra-liability)
  --   CR Piutang Usaha       v_total_subtotal + v_total_tax

  insert into journal_items (journal_id, account_id, debit, credit, description) values
    (v_journal_id, v_acct_inventory,        v_total_cogs, 0, 'Persediaan retur'),
    (v_journal_id, v_acct_cogs,             0, v_total_cogs, 'HPP reverse retur'),
    (v_journal_id, v_acct_return,           v_total_subtotal, 0, 'Retur Penjualan'),
    (v_journal_id, v_acct_ar,               0, v_total_subtotal + v_total_tax, 'AR reverse retur');

  if v_total_tax > 0 and v_acct_ppn_keluaran is not null then
    insert into journal_items (journal_id, account_id, debit, credit, description)
    values (v_journal_id, v_acct_ppn_keluaran, v_total_tax, 0, 'PPN Keluaran reverse');
  end if;

  -- Update header dengan totals + status
  update sales_returns
     set status='posted',
         journal_id=v_journal_id,
         credit_balance = v_total_subtotal + v_total_tax,
         subtotal = v_total_subtotal,
         tax_amount = v_total_tax,
         total = v_total_subtotal + v_total_tax
   where id=p_return_id;

  -- Assert balance (sanity check)
  declare v_dr numeric; v_cr numeric;
  begin
    select sum(debit), sum(credit) into v_dr, v_cr from journal_items where journal_id=v_journal_id;
    if abs(v_dr - v_cr) > 0.01 then
      raise exception 'Jurnal retur tidak balance: DR=% CR=%', v_dr, v_cr;
    end if;
  end;

  return p_return_id;
end $$;
```

> **Catatan implementer:** Pastikan `default_cogs_account_id` field ada di `company_settings` — jika tidak, sub‑task: tambahkan di migration ini juga. Cek `migrations/001_company_settings.sql` atau `024_company_invoice_fields.sql`.

- [ ] **Step 2: Apply + manual smoke**

```sql
-- Pre: pilih SI yang ada inventory items
-- Insert sales_returns + sales_return_items via SQL atau via UI nanti
-- select post_sales_return('<return_id>');
-- Verify: jurnal balanced, inventory_stock bertambah, credit_balance set
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add post_sales_return RPC with PPN reversal & avg-cost inventory in"
```

---

## Task 4: SQL RPC — post_purchase_return

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (append SECTION 11)

- [ ] **Step 1: Tulis RPC mirror dari Task 3 dengan inventory OUT + PPN Masukan**

```sql
create or replace function post_purchase_return(p_return_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_ret record;
  v_inv record;
  v_item record;
  v_returnable numeric;
  v_journal_id uuid;
  v_avg_cost numeric;
  v_total_subtotal numeric := 0;
  v_total_tax numeric := 0;
  v_total_inventory_out numeric := 0;
  v_diff numeric := 0;

  v_acct_ap uuid;
  v_acct_return uuid;
  v_acct_ppn_masukan uuid;
  v_acct_inventory uuid;
  v_acct_adjustment uuid;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  select * into v_ret from purchase_returns where id=p_return_id for update;
  if v_ret is null then raise exception 'Return tidak ditemukan'; end if;
  if v_ret.status <> 'draft' then raise exception 'Return bukan draft'; end if;
  perform _ensure_period_open(v_ret.date);

  select * into v_inv from invoices where id=v_ret.invoice_id;
  if v_inv.type <> 'purchase' then raise exception 'Invoice asal bukan purchase'; end if;

  -- Validasi qty
  for v_item in select * from purchase_return_items where purchase_return_id=p_return_id
  loop
    select returnable_qty(v_item.invoice_item_id) into v_returnable;
    if v_item.quantity_base > v_returnable then
      raise exception 'Item % retur % melebihi sisa retur (%)',
        v_item.product_id, v_item.quantity_base, v_returnable;
    end if;
  end loop;

  select default_purchase_return_account_id,
         default_inventory_adjustment_account_id
    into v_acct_return, v_acct_adjustment
    from company_settings limit 1;

  select ap_account_id into v_acct_ap from suppliers where id=v_ret.supplier_id;
  if v_acct_ap is null then raise exception 'Supplier tidak punya AP account'; end if;

  select tc.input_account_id into v_acct_ppn_masukan
    from purchase_return_items pri
    left join tax_codes tc on tc.id = pri.tax_code_id
    where pri.purchase_return_id = p_return_id and pri.tax_amount > 0
    limit 1;

  -- Inventory account (asumsi default_inventory_adjustment_account_id juga inventory main)
  -- Sebaiknya pakai default_inventory_account_id dari company_settings.
  v_acct_inventory := v_acct_adjustment;  -- TODO: ganti dengan dedicated inventory account jika ada

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_journal_id, generate_number('JR'), v_ret.date,
    format('Retur Pembelian %s', v_ret.return_number),
    'purchase_return', p_return_id, auth.uid()
  );

  for v_item in select * from purchase_return_items where purchase_return_id=p_return_id
  loop
    select coalesce(avg_cost,0) into v_avg_cost from inventory_stock where product_id=v_item.product_id;

    perform inventory_stock_out(
      v_item.product_id,
      v_item.quantity_base,
      v_item.unit_id,
      v_item.quantity,
      'purchase_return',
      p_return_id,
      v_ret.date
    );

    v_total_inventory_out := v_total_inventory_out + (v_avg_cost * v_item.quantity_base);
    v_total_subtotal := v_total_subtotal + (v_item.unit_price * v_item.quantity_base);
    v_total_tax := v_total_tax + v_item.tax_amount;
  end loop;

  -- Selisih: AP berkurang sebesar harga di invoice asal, tapi inventory keluar pakai avg cost saat retur.
  -- Selisih masuk ke akun Penyesuaian Persediaan.
  v_diff := v_total_subtotal - v_total_inventory_out;

  -- Jurnal:
  --   DR Hutang Usaha (AP)        v_total_subtotal + v_total_tax
  --   CR Persediaan               v_total_inventory_out
  --   CR PPN Masukan              v_total_tax
  --   DR/CR Penyesuaian           v_diff (jika positif: DR Adjustment; jika negatif: CR Adjustment)

  insert into journal_items (journal_id, account_id, debit, credit, description) values
    (v_journal_id, v_acct_ap,        v_total_subtotal + v_total_tax, 0, 'AP reverse retur'),
    (v_journal_id, v_acct_inventory, 0, v_total_inventory_out, 'Persediaan retur out');

  if v_total_tax > 0 and v_acct_ppn_masukan is not null then
    insert into journal_items (journal_id, account_id, debit, credit, description)
    values (v_journal_id, v_acct_ppn_masukan, 0, v_total_tax, 'PPN Masukan reverse');
  end if;

  if v_diff > 0 then
    insert into journal_items (journal_id, account_id, debit, credit, description)
    values (v_journal_id, v_acct_adjustment, 0, v_diff, 'Selisih harga retur (saving)');
  elsif v_diff < 0 then
    insert into journal_items (journal_id, account_id, debit, credit, description)
    values (v_journal_id, v_acct_adjustment, -v_diff, 0, 'Selisih harga retur (loss)');
  end if;

  update purchase_returns
     set status='posted',
         journal_id=v_journal_id,
         debit_balance = v_total_subtotal + v_total_tax,
         subtotal = v_total_subtotal,
         tax_amount = v_total_tax,
         total = v_total_subtotal + v_total_tax
   where id=p_return_id;

  -- Sanity assert
  declare v_dr numeric; v_cr numeric;
  begin
    select sum(debit), sum(credit) into v_dr, v_cr from journal_items where journal_id=v_journal_id;
    if abs(v_dr - v_cr) > 0.01 then
      raise exception 'Jurnal retur tidak balance: DR=% CR=%', v_dr, v_cr;
    end if;
  end;

  return p_return_id;
end $$;
```

- [ ] **Step 2: Apply + smoke**

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add post_purchase_return RPC with PPN reversal & inventory out"
```

---

## Task 5: SQL RPC — cancel_sales_return & cancel_purchase_return

**Suggested executor:** Claude Opus — reverse jurnal + inventory reverse.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (append SECTION 12)

- [ ] **Step 1: Tulis RPCs (mirror pattern Task 7 di Phase 2)**

```sql
create or replace function cancel_sales_return(p_return_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ret record;
  v_item record;
  v_orig_journal record;
  v_rev_journal_id uuid;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then
    raise exception 'alasan cancel wajib diisi';
  end if;

  select * into v_ret from sales_returns where id=p_return_id for update;
  if v_ret is null then raise exception 'Return tidak ditemukan'; end if;
  if v_ret.status <> 'posted' then raise exception 'Return bukan posted'; end if;

  perform _ensure_period_open(v_ret.date);

  -- Reverse journal
  select * into v_orig_journal from journals where id=v_ret.journal_id;
  v_rev_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_rev_journal_id, generate_number('JR'), v_ret.date,
    format('REVERSE Retur Penjualan %s — %s', v_ret.return_number, p_reason),
    'sales_return_cancel', p_return_id, auth.uid()
  );
  insert into journal_items (journal_id, account_id, debit, credit, description)
  select v_rev_journal_id, account_id, credit, debit,
         coalesce(description,'') || ' (reverse)'
    from journal_items where journal_id = v_ret.journal_id;

  -- Reverse inventory: stock_out untuk setiap item (kembalikan stock yg sebelumnya masuk via retur)
  for v_item in select * from sales_return_items where sales_return_id=p_return_id
  loop
    perform inventory_stock_out(
      v_item.product_id,
      v_item.quantity_base,
      v_item.unit_id,
      v_item.quantity,
      'sales_return_cancel',
      p_return_id,
      v_ret.date
    );
  end loop;

  update sales_returns
     set status='cancelled',
         credit_balance=0,
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason,
         reversed_journal_id=v_rev_journal_id
   where id=p_return_id;
end $$;

-- Mirror untuk cancel_purchase_return (inventory_stock_in dengan avg_cost saat ini)
create or replace function cancel_purchase_return(p_return_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ret record;
  v_item record;
  v_orig_journal record;
  v_rev_journal_id uuid;
  v_avg_cost numeric;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'alasan wajib'; end if;

  select * into v_ret from purchase_returns where id=p_return_id for update;
  if v_ret is null or v_ret.status <> 'posted' then raise exception 'Return tidak valid'; end if;

  perform _ensure_period_open(v_ret.date);

  select * into v_orig_journal from journals where id=v_ret.journal_id;
  v_rev_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_rev_journal_id, generate_number('JR'), v_ret.date,
    format('REVERSE Retur Pembelian %s — %s', v_ret.return_number, p_reason),
    'purchase_return_cancel', p_return_id, auth.uid()
  );
  insert into journal_items (journal_id, account_id, debit, credit, description)
  select v_rev_journal_id, account_id, credit, debit,
         coalesce(description,'') || ' (reverse)'
    from journal_items where journal_id = v_ret.journal_id;

  for v_item in select * from purchase_return_items where purchase_return_id=p_return_id
  loop
    select coalesce(avg_cost,0) into v_avg_cost from inventory_stock where product_id=v_item.product_id;
    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_avg_cost,
      v_item.unit_id, v_item.quantity,
      'purchase_return_cancel', p_return_id, v_ret.date
    );
  end loop;

  update purchase_returns
     set status='cancelled',
         debit_balance=0,
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason,
         reversed_journal_id=v_rev_journal_id
   where id=p_return_id;
end $$;
```

- [ ] **Step 2: Apply + smoke + commit**
```bash
npx supabase db push
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add cancel_sales_return & cancel_purchase_return RPCs"
```

---

## Task 6: SQL RPC — save_sales_return & save_purchase_return (Draft Save)

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (append SECTION 13)

- [ ] **Step 1: Tulis save RPC pattern dari `save_sales_invoice` (migration 023)**

```sql
create or replace function save_sales_return(p_return jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_ret_id uuid;
  v_number text;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  perform _ensure_period_open((p_return->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + coalesce((v_item->>'quantity_base')::numeric,0)
                              * coalesce((v_item->>'unit_price')::numeric,0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_ret_id := nullif(p_return->>'id','')::uuid;
  if v_ret_id is null then
    v_number := generate_number('CN');
    v_ret_id := gen_random_uuid();
    insert into sales_returns (
      id, return_number, date, customer_id, invoice_id, warehouse_id,
      reason, tax_invoice_number, subtotal, tax_amount, total,
      notes, status, created_by
    ) values (
      v_ret_id, v_number,
      (p_return->>'date')::date,
      (p_return->>'customer_id')::uuid,
      (p_return->>'invoice_id')::uuid,
      nullif(p_return->>'warehouse_id','')::uuid,
      nullif(p_return->>'reason',''),
      nullif(p_return->>'tax_invoice_number',''),
      v_subtotal, v_tax, v_total,
      nullif(p_return->>'notes',''),
      'draft',
      auth.uid()
    );
  else
    update sales_returns
       set date              = (p_return->>'date')::date,
           customer_id       = (p_return->>'customer_id')::uuid,
           invoice_id        = (p_return->>'invoice_id')::uuid,
           warehouse_id      = nullif(p_return->>'warehouse_id','')::uuid,
           reason            = nullif(p_return->>'reason',''),
           tax_invoice_number= nullif(p_return->>'tax_invoice_number',''),
           subtotal=v_subtotal, tax_amount=v_tax, total=v_total,
           notes             = nullif(p_return->>'notes','')
     where id=v_ret_id and status='draft';
    if not found then raise exception 'Return tidak dapat diubah (sudah posted/cancelled atau tidak ditemukan)'; end if;
    delete from sales_return_items where sales_return_id=v_ret_id;
  end if;

  insert into sales_return_items (
    sales_return_id, invoice_item_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_code_id, tax_amount, total
  )
  select v_ret_id,
         (i->>'invoice_item_id')::uuid,
         (i->>'product_id')::uuid,
         (i->>'unit_id')::uuid,
         (i->>'quantity')::numeric,
         coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
         coalesce((i->>'unit_price')::numeric, 0),
         nullif(i->>'tax_code_id','')::uuid,
         coalesce((i->>'tax_amount')::numeric, 0),
         coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_ret_id;
end $$;

-- Mirror untuk save_purchase_return (prefix 'DN', supplier_id bukan customer_id)
```

- [ ] **Step 2: Apply + commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add save_sales_return & save_purchase_return RPCs"
```

---

## Task 7: Service Layer — salesReturnService.js

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/salesReturnService.js`

- [ ] **Step 1: Buat service**

```js
import { supabase } from '../lib/supabase'

export async function getSalesReturns({ status, customerId, dateFrom, dateTo } = {}) {
  let q = supabase
    .from('sales_returns')
    .select(`
      *,
      customer:customers(id, name),
      invoice:invoices(id, invoice_number, date, total)
    `)
    .order('date', { ascending: false })
  if (status) q = q.eq('status', status)
  if (customerId) q = q.eq('customer_id', customerId)
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo) q = q.lte('date', dateTo)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getSalesReturnDetail(id) {
  const { data: header, error: e1 } = await supabase
    .from('sales_returns')
    .select(`
      *,
      customer:customers(id, name, address, npwp),
      invoice:invoices(id, invoice_number, date, total),
      warehouse:warehouses(id, name)
    `)
    .eq('id', id)
    .single()
  if (e1) throw e1
  const { data: items, error: e2 } = await supabase
    .from('sales_return_items')
    .select(`
      *,
      product:products(id, name, sku),
      unit:units(id, name),
      tax_code:tax_codes(id, code, rate),
      invoice_item:invoice_items(id, quantity_base, unit_price)
    `)
    .eq('sales_return_id', id)
  if (e2) throw e2
  return { ...header, items }
}

export async function saveSalesReturn(returnHeader, items) {
  const { data, error } = await supabase.rpc('save_sales_return', {
    p_return: returnHeader, p_items: items
  })
  if (error) throw error
  return data  // returns id
}

export async function postSalesReturn(id) {
  const { error } = await supabase.rpc('post_sales_return', { p_return_id: id })
  if (error) throw error
}

export async function cancelSalesReturn(id, reason) {
  const { error } = await supabase.rpc('cancel_sales_return', { p_return_id: id, p_reason: reason })
  if (error) throw error
}

// Util: ambil items dari invoice tertentu beserta returnable_qty
export async function getReturnableInvoiceItems(invoiceId) {
  const { data, error } = await supabase.rpc('get_returnable_items', { p_invoice_id: invoiceId })
  if (error) {
    // Fallback: query manual
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, product:products(id,name), unit:units(id,name), tax_code:tax_codes(id,code,rate)')
      .eq('invoice_id', invoiceId)
    if (!items) throw error
    // Hitung returnable manual lewat helper SQL
    const result = []
    for (const it of items) {
      const { data: rq } = await supabase.rpc('returnable_qty', { p_invoice_item_id: it.id })
      result.push({ ...it, returnable_qty: rq })
    }
    return result
  }
  return data
}
```

- [ ] **Step 2: (Opsional) tambah RPC `get_returnable_items` untuk efisiensi**

Di migrasi 028:
```sql
create or replace function get_returnable_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, tax_code_id uuid, tax_rate numeric,
  returnable numeric
)
language sql stable security definer set search_path = public
as $$
  select i.id, i.product_id, p.name, i.unit_id, u.name,
         i.quantity_base, i.unit_price, i.tax_code_id, coalesce(tc.rate, 0),
         returnable_qty(i.id)
    from invoice_items i
    join products p on p.id = i.product_id
    join units u on u.id = i.unit_id
    left join tax_codes tc on tc.id = i.tax_code_id
   where i.invoice_id = p_invoice_id;
$$;
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/salesReturnService.js apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql
git commit -m "feat(erp-acc): add salesReturnService + get_returnable_items RPC"
```

---

## Task 8: Service Layer — purchaseReturnService.js

**Suggested executor:** Codex (Sonnet)

Mirror Task 7 untuk `purchaseReturnService.js` (purchase_returns, supplier, post_purchase_return, cancel_purchase_return). Field debit_balance.

- [ ] **Step 1-2:** Identik dengan Task 7, ganti `sales` → `purchase`, `customer` → `supplier`.

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/purchaseReturnService.js
git commit -m "feat(erp-acc): add purchaseReturnService"
```

---

## Task 9: Page — SalesReturnsPage.jsx (List)

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx`

- [ ] **Step 1: Buat list page (pattern dari `SalesInvoicesPage.jsx`)**

```jsx
import { useEffect, useState } from 'react'
import { Card, Table, Button, Tag, DatePicker, Select, Space, message, Popconfirm } from 'antd'
import { useNavigate } from 'react-router-dom'
import { PlusOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons'
import { getSalesReturns, cancelSalesReturn } from '../../services/salesReturnService'
import CancelDocumentModal from '../../components/shared/CancelDocumentModal'

const STATUS_COLOR = { draft: 'default', posted: 'green', cancelled: 'red' }

export default function SalesReturnsPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState()
  const [cancelTarget, setCancelTarget] = useState(null)

  async function load() {
    setLoading(true)
    try { setRows(await getSalesReturns({ status: filterStatus })) }
    catch (e) { message.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filterStatus])

  return (
    <Card title="Retur Penjualan" extra={
      <Space>
        <Select allowClear placeholder="Filter status" style={{width:140}}
          value={filterStatus} onChange={setFilterStatus}
          options={[{value:'draft',label:'Draft'},{value:'posted',label:'Posted'},{value:'cancelled',label:'Cancelled'}]} />
        <Button type="primary" icon={<PlusOutlined/>} onClick={() => nav('/sales/returns/new')}>Buat Retur</Button>
      </Space>
    }>
      <Table rowKey="id" loading={loading} dataSource={rows} columns={[
        { title: 'No. Retur', dataIndex: 'return_number' },
        { title: 'Tanggal', dataIndex: 'date' },
        { title: 'Customer', dataIndex: ['customer','name'] },
        { title: 'Invoice', dataIndex: ['invoice','invoice_number'] },
        { title: 'Total', dataIndex: 'total', align: 'right', render: v => v?.toLocaleString('id-ID') },
        { title: 'Status', dataIndex: 'status', render: s => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
        { title: 'Aksi', render: (_, row) => (
          <Space>
            <Button size="small" icon={<EyeOutlined/>} onClick={() => nav(`/sales/returns/${row.id}`)}>Buka</Button>
            {row.status === 'posted' && (
              <Button size="small" danger onClick={() => setCancelTarget(row)}>Cancel</Button>
            )}
          </Space>
        )},
      ]} />
      <CancelDocumentModal open={!!cancelTarget} onClose={() => setCancelTarget(null)}
        warningText={`Cancel Retur ${cancelTarget?.return_number} akan reverse jurnal & stock.`}
        onConfirm={async (reason) => { await cancelSalesReturn(cancelTarget.id, reason); setCancelTarget(null); load() }}
      />
    </Card>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx
git commit -m "feat(erp-acc): add SalesReturnsPage list view"
```

---

## Task 10: Page — SalesReturnFormPage.jsx (Form, paling kompleks)

**Suggested executor:** Claude Opus — UX correctness + qty validation logic + dependency loading.

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx`

- [ ] **Step 1: Buat form page**

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, DatePicker, Select, Button, Table, InputNumber, message, Space, Alert, Tag } from 'antd'
import dayjs from 'dayjs'
import { getCustomers, getSalesInvoicesByCustomer } from '../../services/salesService'  // verify naming
import { getReturnableInvoiceItems, saveSalesReturn, postSalesReturn, getSalesReturnDetail } from '../../services/salesReturnService'
import { getWarehouses } from '../../services/warehouseService'
import { getTaxCodes } from '../../services/taxCodeService'

export default function SalesReturnFormPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const presetInvoiceId = searchParams.get('invoice_id')

  const [form] = Form.useForm()
  const [customers, setCustomers] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [invoices, setInvoices] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])  // [{ invoice_item_id, qty, ... }]
  const [taxCodes, setTaxCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)

  // Load master data
  useEffect(() => {
    Promise.all([getCustomers(), getWarehouses(), getTaxCodes()])
      .then(([c, w, t]) => { setCustomers(c); setWarehouses(w); setTaxCodes(t) })
      .catch(e => message.error(e.message))
  }, [])

  // Load existing return (edit mode)
  useEffect(() => {
    if (!id || id === 'new') return
    getSalesReturnDetail(id).then(d => {
      setEditing(d)
      form.setFieldsValue({
        date: dayjs(d.date),
        customer_id: d.customer_id,
        invoice_id: d.invoice_id,
        warehouse_id: d.warehouse_id,
        reason: d.reason,
        tax_invoice_number: d.tax_invoice_number,
        notes: d.notes,
      })
      setSelectedItems(d.items.map(it => ({
        invoice_item_id: it.invoice_item_id,
        product_id: it.product_id,
        product_name: it.product?.name,
        unit_id: it.unit_id,
        unit_name: it.unit?.name,
        quantity: it.quantity,
        quantity_base: it.quantity_base,
        unit_price: it.unit_price,
        tax_code_id: it.tax_code_id,
        tax_amount: it.tax_amount,
        total: it.total,
      })))
    })
  }, [id])

  // Saat customer di-select, load invoices customer tsb
  async function onCustomerChange(custId) {
    form.setFieldValue('invoice_id', undefined)
    setReturnableItems([]); setSelectedItems([])
    const inv = await getSalesInvoicesByCustomer(custId, { status: ['posted','partial','paid'] })
    setInvoices(inv)
  }

  // Saat invoice di-select, load returnable items
  async function onInvoiceChange(invId) {
    if (!invId) { setReturnableItems([]); return }
    const items = await getReturnableInvoiceItems(invId)
    setReturnableItems(items.filter(it => Number(it.returnable) > 0))
    setSelectedItems([])
  }

  // Preset jika datang dari "Buat Retur" di SI
  useEffect(() => {
    if (presetInvoiceId && !id) {
      form.setFieldValue('invoice_id', presetInvoiceId)
      // Sebaiknya juga set customer_id; perlu fetch invoice header
      onInvoiceChange(presetInvoiceId)
    }
  }, [presetInvoiceId])

  function addItem(it) {
    if (selectedItems.find(s => s.invoice_item_id === it.invoice_item_id)) return
    const taxRate = it.tax_rate || 0
    setSelectedItems([...selectedItems, {
      invoice_item_id: it.invoice_item_id,
      product_id: it.product_id,
      product_name: it.product_name,
      unit_id: it.unit_id,
      unit_name: it.unit_name,
      quantity: 0,  // user input
      quantity_base: 0,
      unit_price: it.unit_price,
      tax_code_id: it.tax_code_id,
      tax_rate: taxRate,
      tax_amount: 0,
      total: 0,
      returnable: it.returnable,
    }])
  }

  function updateQty(idx, qty) {
    const items = [...selectedItems]
    const it = items[idx]
    if (qty > it.returnable) {
      message.error(`Qty melebihi sisa retur (${it.returnable})`)
      return
    }
    it.quantity = qty
    it.quantity_base = qty   // asumsi same unit; refine untuk multi-unit conversion
    const subtotal = qty * it.unit_price
    it.tax_amount = subtotal * (it.tax_rate / 100)
    it.total = subtotal + it.tax_amount
    setSelectedItems(items)
  }

  function removeItem(idx) {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx))
  }

  const subtotal = selectedItems.reduce((s, it) => s + (it.quantity * it.unit_price), 0)
  const taxTotal = selectedItems.reduce((s, it) => s + it.tax_amount, 0)
  const grandTotal = subtotal + taxTotal

  async function onSaveDraft(post = false) {
    try {
      const v = await form.validateFields()
      if (selectedItems.length === 0) { message.error('Minimal 1 item retur'); return }
      if (selectedItems.some(it => it.quantity <= 0)) { message.error('Qty tiap item harus > 0'); return }

      setLoading(true)
      const header = {
        id: editing?.id || null,
        date: dayjs(v.date).format('YYYY-MM-DD'),
        customer_id: v.customer_id,
        invoice_id: v.invoice_id,
        warehouse_id: v.warehouse_id,
        reason: v.reason,
        tax_invoice_number: v.tax_invoice_number,
        notes: v.notes,
      }
      const items = selectedItems.map(it => ({
        invoice_item_id: it.invoice_item_id,
        product_id: it.product_id,
        unit_id: it.unit_id,
        quantity: it.quantity,
        quantity_base: it.quantity_base,
        unit_price: it.unit_price,
        tax_code_id: it.tax_code_id,
        tax_amount: it.tax_amount,
        total: it.total,
      }))
      const retId = await saveSalesReturn(header, items)
      if (post) {
        await postSalesReturn(retId)
        message.success('Retur berhasil di-posting')
      } else {
        message.success('Draft tersimpan')
      }
      nav('/sales/returns')
    } catch (e) {
      if (e?.errorFields) return
      message.error(e.message)
    } finally { setLoading(false) }
  }

  return (
    <Card title={editing ? `Edit Retur ${editing.return_number}` : 'Retur Penjualan Baru'}>
      <Form form={form} layout="vertical">
        <Space wrap>
          <Form.Item name="date" label="Tanggal" rules={[{required:true}]} initialValue={dayjs()}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="customer_id" label="Customer" rules={[{required:true}]}>
            <Select showSearch optionFilterProp="label" style={{width: 240}}
              onChange={onCustomerChange}
              options={customers.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="invoice_id" label="Invoice Asal" rules={[{required:true}]}>
            <Select showSearch optionFilterProp="label" style={{width: 240}}
              onChange={onInvoiceChange}
              options={invoices.map(i => ({ value: i.id, label: `${i.invoice_number} - ${i.date}` }))} />
          </Form.Item>
          <Form.Item name="warehouse_id" label="Gudang">
            <Select style={{width: 200}} options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
          </Form.Item>
        </Space>

        <Form.Item name="tax_invoice_number" label="No. Nota Retur Faktur Pajak (opsional)">
          <Input placeholder="010.000-25.00000001" />
        </Form.Item>

        <Form.Item name="reason" label="Alasan Retur" rules={[{required:true, min:5}]}>
          <Input.TextArea rows={2} placeholder="Contoh: barang rusak / salah kirim / customer batal" />
        </Form.Item>
      </Form>

      <Card type="inner" title="Pilih Item dari Invoice" size="small" style={{marginTop:12}}>
        {returnableItems.length === 0 && (
          <Alert type="info" message="Pilih invoice asal untuk melihat item yang dapat diretur." />
        )}
        {returnableItems.length > 0 && (
          <Table size="small" rowKey="invoice_item_id" pagination={false}
            dataSource={returnableItems}
            columns={[
              { title: 'Produk', dataIndex: 'product_name' },
              { title: 'Sisa Retur', dataIndex: 'returnable', align: 'right',
                render: v => <Tag color="blue">{Number(v).toLocaleString('id-ID')}</Tag> },
              { title: 'Harga Satuan', dataIndex: 'unit_price', align: 'right',
                render: v => v?.toLocaleString('id-ID') },
              { title: 'Tax Rate (%)', dataIndex: 'tax_rate', align: 'right' },
              { title: 'Aksi', render: (_, r) => (
                <Button size="small" onClick={() => addItem(r)}
                  disabled={selectedItems.find(s => s.invoice_item_id === r.invoice_item_id)}>
                  Tambah
                </Button>
              )},
            ]}
          />
        )}
      </Card>

      <Card type="inner" title="Item Retur" size="small" style={{marginTop:12}}>
        <Table size="small" rowKey={(_,i) => i} pagination={false}
          dataSource={selectedItems}
          columns={[
            { title: 'Produk', dataIndex: 'product_name' },
            { title: 'Sisa Retur', dataIndex: 'returnable', align: 'right' },
            { title: 'Qty Retur', render: (_, r, idx) => (
              <InputNumber min={0.0001} max={r.returnable} step={0.01}
                value={r.quantity}
                onChange={v => updateQty(idx, Number(v) || 0)} />
            )},
            { title: 'Harga', dataIndex: 'unit_price', align: 'right',
              render: v => v?.toLocaleString('id-ID') },
            { title: 'Pajak', dataIndex: 'tax_amount', align: 'right',
              render: v => v?.toLocaleString('id-ID') },
            { title: 'Total', dataIndex: 'total', align: 'right',
              render: v => v?.toLocaleString('id-ID') },
            { title: 'Aksi', render: (_, _r, idx) => (
              <Button size="small" danger onClick={() => removeItem(idx)}>Hapus</Button>
            )},
          ]}
        />
        <div style={{marginTop:12, textAlign:'right'}}>
          <div>Subtotal: <strong>Rp {subtotal.toLocaleString('id-ID')}</strong></div>
          <div>PPN: <strong>Rp {taxTotal.toLocaleString('id-ID')}</strong></div>
          <div>Total: <strong style={{fontSize:18}}>Rp {grandTotal.toLocaleString('id-ID')}</strong></div>
        </div>
      </Card>

      <Space style={{marginTop:16}}>
        <Button onClick={() => nav('/sales/returns')}>Batal</Button>
        <Button onClick={() => onSaveDraft(false)} loading={loading}>Simpan Draft</Button>
        <Button type="primary" onClick={() => onSaveDraft(true)} loading={loading}>Simpan & Posting</Button>
      </Space>
    </Card>
  )
}
```

> **Catatan implementer:** Function `getSalesInvoicesByCustomer` mungkin belum ada di salesService — kalau tidak ada, tambahkan dengan filter `customer_id` + `type='sales'` + `status in [posted, partial, paid]`.

- [ ] **Step 2: Build verify**
```bash
cd apps/erp-acc/erp-app; npm run build
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(erp-acc): add SalesReturnFormPage with returnable_qty validation"
```

---

## Task 11: Pages — PurchaseReturnsPage + PurchaseReturnFormPage

**Suggested executor:** Codex (Sonnet) untuk list page; Claude Opus untuk form page (mirror Task 10).

Mirror Task 9 + Task 10 untuk modul pembelian:
- `PurchaseReturnsPage.jsx` (list)
- `PurchaseReturnFormPage.jsx` (form) — supplier bukan customer, debit_balance bukan credit_balance

- [ ] **Step 1-3:** Identik dengan Task 9-10.

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx
git commit -m "feat(erp-acc): add Purchase Returns list & form pages"
```

---

## Task 12: Routes & Menu — App.jsx

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/App.jsx`

- [ ] **Step 1: Tambah 4 routes**

```jsx
import SalesReturnsPage from './pages/sales/SalesReturnsPage'
import SalesReturnFormPage from './pages/sales/SalesReturnFormPage'
import PurchaseReturnsPage from './pages/purchase/PurchaseReturnsPage'
import PurchaseReturnFormPage from './pages/purchase/PurchaseReturnFormPage'

<Route path="/sales/returns" element={<RoleGuard roles={['admin','staff']}><SalesReturnsPage/></RoleGuard>} />
<Route path="/sales/returns/:id" element={<RoleGuard roles={['admin','staff']}><SalesReturnFormPage/></RoleGuard>} />
<Route path="/purchase/returns" element={<RoleGuard roles={['admin','staff']}><PurchaseReturnsPage/></RoleGuard>} />
<Route path="/purchase/returns/:id" element={<RoleGuard roles={['admin','staff']}><PurchaseReturnFormPage/></RoleGuard>} />
```

Tambah 2 menu item di sidebar Sales & Purchase group.

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/App.jsx apps/erp-acc/erp-app/src/components/layout/
git commit -m "feat(erp-acc): wire return pages into routes & menu"
```

---

## Task 13: SI/PI Detail "Buat Retur" Shortcut

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx` (atau detail page jika ada terpisah)
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx`

- [ ] **Step 1: Tambah tombol "Buat Retur" untuk row status posted/partial/paid**

```jsx
{['posted','partial','paid'].includes(row.status) && (
  <Button size="small" onClick={() =>
    nav(`/sales/returns/new?invoice_id=${row.id}`)
  }>Buat Retur</Button>
)}
```

Mirror untuk purchase.

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx
git commit -m "feat(erp-acc): add Buat Retur shortcut from SI/PI list"
```

---

## Task 14: CreditNotePrintTemplate.jsx

**Suggested executor:** Codex (Sonnet) — pattern dari `InvoicePrintTemplate.jsx`.

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/CreditNotePrintTemplate.jsx`
- Reference: `apps/erp-acc/erp-app/src/components/shared/InvoicePrintTemplate.jsx`

- [ ] **Step 1: Read reference template**

- [ ] **Step 2: Create template dengan props dynamic title (Credit Note vs Debit Note)**

Pattern: render header company info + return info (no, date, customer/supplier, invoice ref, reason) + items table + total. Print via existing PDF flow.

- [ ] **Step 3: Tambah tombol Print di SalesReturnFormPage & PurchaseReturnFormPage**

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/src/components/shared/CreditNotePrintTemplate.jsx apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx
git commit -m "feat(erp-acc): add CreditNote/DebitNote print template"
```

---

## Task 15: Playwright E2E — sales-return.spec.js

**Suggested executor:** Claude Opus — financial assertion (jurnal balanced, stock benar).

**Files:**
- Create: `apps/erp-acc/erp-app/tests/playwright/sales-return.spec.js`

- [ ] **Step 1: Test full flow**

```js
import { test, expect } from '@playwright/test'

test.describe('Sales Return — Credit Note', () => {

  test('partial return reduces stock correctly', async ({ page }) => {
    // Pre: SI posted dengan 100 unit Product X (avg cost = 10000)
    // Buka /sales/returns/new?invoice_id=<si_id>
    // Pilih item, qty = 30
    // Save & Posting
    // Verify message success
    // Verify via SQL: inventory_stock += 30, sales_returns.credit_balance = 30 * unit_price + tax
  })

  test('over-return blocked', async ({ page }) => {
    // Buka return baru, pilih invoice yang sudah pernah diretur 30
    // Coba retur 80 (sisa 70) → expect error "melebihi sisa retur"
  })

  test('cancel return reverses inventory', async ({ page }) => {
    // Posting return 30
    // Klik Cancel → reason → confirm
    // Verify inventory_stock -= 30, credit_balance = 0
  })
})
```

- [ ] **Step 2: Run + commit**
```bash
npx playwright test tests/playwright/sales-return.spec.js
git add apps/erp-acc/erp-app/tests/playwright/sales-return.spec.js
git commit -m "test(erp-acc): add e2e for sales return partial + over-return + cancel"
```

---

## Task 16: Playwright E2E — purchase-return.spec.js

**Suggested executor:** Codex (Sonnet) — mirror Task 15.

**Files:**
- Create: `apps/erp-acc/erp-app/tests/playwright/purchase-return.spec.js`

- [ ] **Step 1-2:** Mirror Task 15 untuk purchase return (DR AP, CR Inventory, CR PPN Masukan).

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/tests/playwright/purchase-return.spec.js
git commit -m "test(erp-acc): add e2e for purchase return"
```

---

## Task 17: Final Build + Manual Verification

**Suggested executor:** Claude Opus — verification skill.

- [ ] **Step 1: Full build + lint**
```bash
cd apps/erp-acc/erp-app
npm run build && npm run lint
```

- [ ] **Step 2: Manual smoke (per spec §5.6 acceptance criteria)**
- [ ] Buat sales return partial → qty tidak boleh > returnable.
- [ ] Posting sales return → jurnal balanced (DR=CR), inventory_stock + qty.
- [ ] Tax muncul di jurnal sebagai DR PPN Keluaran.
- [ ] credit_balance terisi sebesar total.
- [ ] Over-return ditolak.
- [ ] Cancel sales return → reverse jurnal + inventory_stock - qty + credit_balance = 0.
- [ ] Print Credit Note PDF tampil benar.
- [ ] Mirror semua untuk purchase return.
- [ ] Posting GD/GR/Invoice existing tetap jalan (no regression).

- [ ] **Step 3: PR ready, handover note untuk reviewer**

---

## Self-Review Notes

- **Spec coverage:** Task 1 = §5.2 schema, Task 2 = §5.3 COA bootstrap, Tasks 3-4 = §5.3 posting, Task 5 = §5.3 cancel, Task 6 = save draft, Tasks 7-8 = §5.5 service, Tasks 9-13 = §5.5 UI, Task 14 = §5.4 print + tax invoice number, Tasks 15-16 = §5.6 verification.
- **Dependency catatan:** Task 7 mengandalkan RPC `get_returnable_items` yang ditambahkan di Task 7 step 2. Pastikan migration 028 punya function ini sebelum service di-deploy.
- **Risk:** Task 3 & 4 jurnal logic — wajib smoke test asersi `sum(debit) = sum(credit)` di setiap sample. Sanity assert sudah ditanam di RPC.
- **Anti‑pattern dihindari:** Tidak auto-refund cash dari credit_balance. Tidak hard-delete return posted. Tidak biarkan retur > sisa qty (validasi di RPC + UI).

---

**End of Phase 3 Plan.**
