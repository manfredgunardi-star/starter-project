# ERP Pembukuan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design spec:** `docs/superpowers/specs/2026-04-09-erp-pembukuan-design.md` — read this for full context.

**Goal:** Build a single-company ERP/accounting app for service + trading businesses with double-entry auto-journal, inventory with unit conversion & average costing, sales/purchase cycles, cash/bank with reconciliation.

**Architecture:** React SPA communicates directly with Supabase (PostgreSQL + Auth + RLS). All posting operations (invoice, goods receipt/delivery, payment, transfer) use PostgreSQL functions called via `supabase.rpc()` to guarantee ACID transactions. CRUD operations use direct Supabase client calls.

**Tech Stack:** React 18, Vite, Tailwind CSS 3, React Router v6, Lucide React, Supabase (PostgreSQL, Auth, RLS, Realtime), jsPDF, xlsx

---

## Model Tier Guide

Each task is tagged with the recommended model for token-efficient execution:

| Tier | Model | When to use | Cost |
|---|---|---|---|
| 🟢 | **Haiku** | Boilerplate, CRUD pages, form components, styling, simple services, pattern-following | $ |
| 🔵 | **Sonnet** | Business logic, SQL migrations, PostgreSQL functions, auto-journal, posting logic, reports, RLS, integrations | $$ |

**Rule of thumb:** If a task requires understanding accounting rules, data integrity constraints, or multi-table transactions → Sonnet. If a task follows an established pattern with different fields → Haiku.

---

## File Structure

```
erp-app/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── DataTable.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── Toast.jsx
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── ProtectedRoute.jsx
│   │   └── shared/
│   │       ├── LineItemsTable.jsx      # Reusable line items (SO, PO, Invoice)
│   │       └── DocumentHeader.jsx      # Reusable doc header (number, date, status)
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── master/
│   │   │   ├── UnitsPage.jsx
│   │   │   ├── ProductsPage.jsx
│   │   │   ├── CustomersPage.jsx
│   │   │   ├── SuppliersPage.jsx
│   │   │   └── COAPage.jsx
│   │   ├── inventory/
│   │   │   ├── StockPage.jsx
│   │   │   └── StockCardPage.jsx
│   │   ├── sales/
│   │   │   ├── SalesOrdersPage.jsx
│   │   │   ├── SalesOrderFormPage.jsx
│   │   │   ├── GoodsDeliveriesPage.jsx
│   │   │   ├── GoodsDeliveryFormPage.jsx
│   │   │   ├── SalesInvoicesPage.jsx
│   │   │   └── SalesInvoiceFormPage.jsx
│   │   ├── purchase/
│   │   │   ├── PurchaseOrdersPage.jsx
│   │   │   ├── PurchaseOrderFormPage.jsx
│   │   │   ├── GoodsReceiptsPage.jsx
│   │   │   ├── GoodsReceiptFormPage.jsx
│   │   │   ├── PurchaseInvoicesPage.jsx
│   │   │   └── PurchaseInvoiceFormPage.jsx
│   │   ├── cashbank/
│   │   │   ├── AccountsPage.jsx
│   │   │   ├── PaymentsPage.jsx
│   │   │   ├── PaymentFormPage.jsx
│   │   │   ├── TransfersPage.jsx
│   │   │   └── ReconciliationPage.jsx
│   │   ├── accounting/
│   │   │   ├── JournalsPage.jsx
│   │   │   ├── JournalFormPage.jsx
│   │   │   └── LedgerPage.jsx
│   │   ├── reports/
│   │   │   ├── BalanceSheetPage.jsx
│   │   │   ├── IncomeStatementPage.jsx
│   │   │   └── CashFlowPage.jsx
│   │   └── settings/
│   │       └── UsersPage.jsx
│   ├── services/
│   │   ├── masterDataService.js
│   │   ├── inventoryService.js
│   │   ├── salesService.js
│   │   ├── purchaseService.js
│   │   ├── cashBankService.js
│   │   ├── journalService.js
│   │   └── reportService.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useMasterData.js
│   │   ├── useInventory.js
│   │   ├── useSales.js
│   │   ├── usePurchase.js
│   │   ├── useCashBank.js
│   │   ├── useJournals.js
│   │   └── useReports.js
│   ├── utils/
│   │   ├── currency.js
│   │   ├── date.js
│   │   ├── validation.js
│   │   └── exportUtils.js
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── lib/
│   │   └── supabase.js
│   ├── main.jsx
│   └── index.css
├── supabase/
│   ├── migrations/
│   │   ├── 001_profiles.sql
│   │   ├── 002_master_data.sql
│   │   ├── 003_sales_tables.sql
│   │   ├── 004_purchase_tables.sql
│   │   ├── 005_invoice_payment.sql
│   │   ├── 006_inventory.sql
│   │   ├── 007_cashbank_accounting.sql
│   │   ├── 008_audit_logs.sql
│   │   ├── 009_rls_policies.sql
│   │   ├── 010_helper_functions.sql
│   │   ├── 011_posting_functions.sql
│   │   └── 012_report_views.sql
│   └── seed.sql
├── .env.example
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── index.html
```

---

## Phase 1: Project Setup

### Task 1: Scaffold React + Vite project 🟢 Haiku

**Files:**
- Create: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.env.example`
- Create: `src/main.jsx`, `src/index.css`

- [ ] **Step 1: Create project with Vite**

```bash
cd /c/Project && npm create vite@latest erp-app -- --template react
cd erp-app
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js react-router-dom lucide-react jspdf jspdf-autotable xlsx date-fns
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Create `.env.example`**

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Configure Vite with Tailwind**

`vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 5: Set up Tailwind base styles**

`src/index.css`:
```css
@import "tailwindcss";

@layer base {
  body {
    @apply bg-gray-50 text-gray-900 antialiased;
  }
}
```

- [ ] **Step 6: Create Supabase client**

`src/lib/supabase.js`:
```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 7: Minimal main.jsx**

`src/main.jsx`:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/App.jsx`:
```jsx
export default function App() {
  return <div className="p-8"><h1 className="text-2xl font-bold">ERP Pembukuan</h1></div>
}
```

- [ ] **Step 8: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: scaffold React + Vite + Tailwind + Supabase project"
```

---

## Phase 2: Database Schema & Functions

### Task 2: Migration — Profiles & auth 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/001_profiles.sql`

- [ ] **Step 1: Create migration file**

`supabase/migrations/001_profiles.sql`:
```sql
-- Profiles table (linked to Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'staff', 'viewer')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'viewer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper function to get current user's role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Enable RLS
alter table profiles enable row level security;

-- Profiles RLS
create policy "Users can read all active profiles"
  on profiles for select using (is_active = true);

create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

create policy "Admins can manage profiles"
  on profiles for all using (get_my_role() = 'admin');
```

- [ ] **Step 2: Run migration via Supabase Dashboard SQL Editor**

Copy and paste the SQL into the Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_profiles.sql && git commit -m "feat: add profiles migration with auth trigger and RLS"
```

---

### Task 3: Migration — Master data tables 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/002_master_data.sql`

- [ ] **Step 1: Create migration file**

`supabase/migrations/002_master_data.sql`:
```sql
-- Units
create table units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Products
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  base_unit_id uuid not null references units(id),
  buy_price numeric(15,2) not null default 0,
  sell_price numeric(15,2) not null default 0,
  is_taxable boolean not null default false,
  tax_rate numeric(5,2) not null default 11,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unit conversions (per product)
create table unit_conversions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  from_unit_id uuid not null references units(id),
  to_unit_id uuid not null references units(id),
  conversion_factor numeric(15,4) not null check (conversion_factor > 0),
  unique (product_id, from_unit_id, to_unit_id)
);

-- Customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  npwp text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Suppliers
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  npwp text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chart of Accounts (COA)
create table coa (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  parent_id uuid references coa(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_products_category on products(category) where is_active = true;
create index idx_products_sku on products(sku) where is_active = true;
create index idx_coa_type on coa(type) where is_active = true;
create index idx_coa_parent on coa(parent_id);
create index idx_customers_name on customers(name) where is_active = true;
create index idx_suppliers_name on suppliers(name) where is_active = true;

-- Updated_at triggers
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on products
  for each row execute function update_updated_at();
create trigger set_updated_at before update on customers
  for each row execute function update_updated_at();
create trigger set_updated_at before update on suppliers
  for each row execute function update_updated_at();
```

- [ ] **Step 2: Run migration via Supabase Dashboard SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_master_data.sql && git commit -m "feat: add master data tables (units, products, customers, suppliers, COA)"
```

---

### Task 4: Migration — Sales & purchase tables 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/003_sales_tables.sql`
- Create: `supabase/migrations/004_purchase_tables.sql`

- [ ] **Step 1: Create sales tables migration**

`supabase/migrations/003_sales_tables.sql`:
```sql
-- Sales Orders
create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique,
  date date not null,
  customer_id uuid not null references customers(id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'invoiced', 'done')),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Goods Deliveries (pengiriman barang ke customer)
create table goods_deliveries (
  id uuid primary key default gen_random_uuid(),
  gd_number text not null unique,
  date date not null,
  sales_order_id uuid references sales_orders(id),
  customer_id uuid not null references customers(id),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table goods_delivery_items (
  id uuid primary key default gen_random_uuid(),
  goods_delivery_id uuid not null references goods_deliveries(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0)
);

-- Indexes
create index idx_so_customer on sales_orders(customer_id);
create index idx_so_status on sales_orders(status);
create index idx_so_date on sales_orders(date);
create index idx_gd_customer on goods_deliveries(customer_id);
create index idx_gd_so on goods_deliveries(sales_order_id);

create trigger set_updated_at before update on sales_orders
  for each row execute function update_updated_at();
```

- [ ] **Step 2: Create purchase tables migration**

`supabase/migrations/004_purchase_tables.sql`:
```sql
-- Purchase Orders
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  date date not null,
  supplier_id uuid not null references suppliers(id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'received', 'done')),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Goods Receipts (penerimaan barang dari supplier)
create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  gr_number text not null unique,
  date date not null,
  purchase_order_id uuid references purchase_orders(id),
  supplier_id uuid not null references suppliers(id),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0)
);

-- Indexes
create index idx_po_supplier on purchase_orders(supplier_id);
create index idx_po_status on purchase_orders(status);
create index idx_po_date on purchase_orders(date);
create index idx_gr_supplier on goods_receipts(supplier_id);
create index idx_gr_po on goods_receipts(purchase_order_id);

create trigger set_updated_at before update on purchase_orders
  for each row execute function update_updated_at();
```

- [ ] **Step 3: Run both migrations**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_sales_tables.sql supabase/migrations/004_purchase_tables.sql
git commit -m "feat: add sales and purchase tables (SO, PO, goods delivery, goods receipt)"
```

---

### Task 5: Migration — Invoice, payment, inventory, accounting 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/005_invoice_payment.sql`
- Create: `supabase/migrations/006_inventory.sql`
- Create: `supabase/migrations/007_cashbank_accounting.sql`
- Create: `supabase/migrations/008_audit_logs.sql`

- [ ] **Step 1: Create invoice & payment migration**

`supabase/migrations/005_invoice_payment.sql`:
```sql
-- Invoices (sales & purchase share one table)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  date date not null,
  due_date date,
  type text not null check (type in ('sales', 'purchase')),
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  sales_order_id uuid references sales_orders(id),
  purchase_order_id uuid references purchase_orders(id),
  goods_receipt_id uuid references goods_receipts(id),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  amount_paid numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'posted', 'partial', 'paid')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ensure correct party for type
  check (
    (type = 'sales' and customer_id is not null and supplier_id is null) or
    (type = 'purchase' and supplier_id is not null and customer_id is null)
  )
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

create index idx_invoices_type on invoices(type);
create index idx_invoices_status on invoices(status);
create index idx_invoices_customer on invoices(customer_id);
create index idx_invoices_supplier on invoices(supplier_id);
create index idx_invoices_date on invoices(date);

create trigger set_updated_at before update on invoices
  for each row execute function update_updated_at();
```

- [ ] **Step 2: Create inventory migration**

`supabase/migrations/006_inventory.sql`:
```sql
-- Inventory movements (all stock in/out/adjustments)
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  product_id uuid not null references products(id),
  type text not null check (type in ('in', 'out', 'adjustment')),
  quantity_base numeric(15,4) not null,
  unit_id uuid not null references units(id),
  quantity_original numeric(15,4) not null,
  unit_cost numeric(15,2) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- Current stock per product (materialized summary)
create table inventory_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) unique,
  quantity_on_hand numeric(15,4) not null default 0,
  avg_cost numeric(15,2) not null default 0,
  last_updated timestamptz not null default now()
);

create index idx_inv_movements_product on inventory_movements(product_id);
create index idx_inv_movements_ref on inventory_movements(reference_type, reference_id);
create index idx_inv_movements_date on inventory_movements(date);
```

- [ ] **Step 3: Create cash/bank & accounting migration**

`supabase/migrations/007_cashbank_accounting.sql`:
```sql
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

-- Payments
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

-- Journals (double-entry)
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
```

- [ ] **Step 4: Create audit logs migration**

`supabase/migrations/008_audit_logs.sql`:
```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_audit_table_record on audit_logs(table_name, record_id);
create index idx_audit_user on audit_logs(user_id);
create index idx_audit_created on audit_logs(created_at);
```

- [ ] **Step 5: Run all 4 migrations**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_invoice_payment.sql supabase/migrations/006_inventory.sql \
  supabase/migrations/007_cashbank_accounting.sql supabase/migrations/008_audit_logs.sql
git commit -m "feat: add invoice, inventory, cash/bank, accounting, and audit tables"
```

---

### Task 6: Migration — RLS policies 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/009_rls_policies.sql`

- [ ] **Step 1: Create RLS policies**

`supabase/migrations/009_rls_policies.sql`:
```sql
-- Enable RLS on all tables
alter table units enable row level security;
alter table products enable row level security;
alter table unit_conversions enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table coa enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_items enable row level security;
alter table goods_deliveries enable row level security;
alter table goods_delivery_items enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table goods_receipts enable row level security;
alter table goods_receipt_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table inventory_movements enable row level security;
alter table inventory_stock enable row level security;
alter table accounts enable row level security;
alter table journals enable row level security;
alter table journal_items enable row level security;
alter table bank_reconciliations enable row level security;
alter table audit_logs enable row level security;

-- All authenticated users can read
-- Pattern: everyone reads, admin/staff writes, admin deletes

-- Helper: is admin or staff?
create or replace function is_admin_or_staff()
returns boolean as $$
  select get_my_role() in ('admin', 'staff');
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select get_my_role() = 'admin';
$$ language sql security definer stable;

-- MASTER DATA: everyone reads, admin/staff writes, admin deletes
-- (Apply same pattern to: units, products, unit_conversions, customers, suppliers, coa, accounts)

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'units', 'products', 'unit_conversions', 'customers', 'suppliers', 'coa', 'accounts'
  ] loop
    execute format('create policy "Authenticated read %1$s" on %1$s for select to authenticated using (true)', tbl);
    execute format('create policy "Admin/staff insert %1$s" on %1$s for insert to authenticated with check (is_admin_or_staff())', tbl);
    execute format('create policy "Admin/staff update %1$s" on %1$s for update to authenticated using (is_admin_or_staff())', tbl);
    execute format('create policy "Admin delete %1$s" on %1$s for delete to authenticated using (is_admin())', tbl);
  end loop;
end $$;

-- TRANSACTION TABLES: same pattern for SO, PO, invoices, payments, goods_*
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sales_orders', 'sales_order_items',
    'goods_deliveries', 'goods_delivery_items',
    'purchase_orders', 'purchase_order_items',
    'goods_receipts', 'goods_receipt_items',
    'invoices', 'invoice_items',
    'payments',
    'inventory_movements', 'inventory_stock',
    'bank_reconciliations'
  ] loop
    execute format('create policy "Authenticated read %1$s" on %1$s for select to authenticated using (true)', tbl);
    execute format('create policy "Admin/staff insert %1$s" on %1$s for insert to authenticated with check (is_admin_or_staff())', tbl);
    execute format('create policy "Admin/staff update %1$s" on %1$s for update to authenticated using (is_admin_or_staff())', tbl);
    execute format('create policy "Admin delete %1$s" on %1$s for delete to authenticated using (is_admin())', tbl);
  end loop;
end $$;

-- JOURNALS: only admin can create/edit manual journals
create policy "Authenticated read journals" on journals for select to authenticated using (true);
create policy "Auto journals by system" on journals for insert to authenticated with check (
  source = 'auto' or is_admin()
);
create policy "Admin update journals" on journals for update to authenticated using (is_admin());
create policy "Admin delete journals" on journals for delete to authenticated using (is_admin());

create policy "Authenticated read journal_items" on journal_items for select to authenticated using (true);
create policy "Insert journal_items" on journal_items for insert to authenticated with check (true);
create policy "Admin update journal_items" on journal_items for update to authenticated using (is_admin());
create policy "Admin delete journal_items" on journal_items for delete to authenticated using (is_admin());

-- AUDIT LOGS: everyone reads, system writes
create policy "Authenticated read audit_logs" on audit_logs for select to authenticated using (true);
create policy "System insert audit_logs" on audit_logs for insert to authenticated with check (true);
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_rls_policies.sql
git commit -m "feat: add RLS policies for all tables"
```

---

### Task 7: Migration — Helper functions & auto-numbering 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/010_helper_functions.sql`

- [ ] **Step 1: Create helper functions**

`supabase/migrations/010_helper_functions.sql`:
```sql
-- Sequence table for auto-numbering
create table sequences (
  name text primary key,
  last_value bigint not null default 0
);

-- Insert initial sequences
insert into sequences (name, last_value) values
  ('SO', 0), ('PO', 0), ('INV-S', 0), ('INV-P', 0),
  ('PAY', 0), ('JRN', 0), ('GR', 0), ('GD', 0), ('TRF', 0);

-- Generate next number: SO-2026-00001, INV-S-2026-00001, etc.
create or replace function generate_number(p_prefix text)
returns text as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  update sequences set last_value = last_value + 1
    where name = p_prefix
    returning last_value into v_next;

  if v_next is null then
    insert into sequences (name, last_value) values (p_prefix, 1);
    v_next := 1;
  end if;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$$ language plpgsql;

-- Convert quantity from one unit to base unit for a product
create or replace function convert_to_base_unit(
  p_product_id uuid,
  p_from_unit_id uuid,
  p_quantity numeric
)
returns numeric as $$
declare
  v_base_unit_id uuid;
  v_factor numeric;
begin
  select base_unit_id into v_base_unit_id from products where id = p_product_id;

  -- Already in base unit
  if p_from_unit_id = v_base_unit_id then
    return p_quantity;
  end if;

  -- Find conversion factor
  select conversion_factor into v_factor
    from unit_conversions
    where product_id = p_product_id
      and from_unit_id = p_from_unit_id
      and to_unit_id = v_base_unit_id;

  if v_factor is null then
    raise exception 'No unit conversion found for product % from unit % to base unit %',
      p_product_id, p_from_unit_id, v_base_unit_id;
  end if;

  return p_quantity * v_factor;
end;
$$ language plpgsql stable;

-- Validate journal balance (total debit = total credit)
create or replace function validate_journal_balance(p_journal_id uuid)
returns boolean as $$
declare
  v_total_debit numeric;
  v_total_credit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_total_debit, v_total_credit
    from journal_items where journal_id = p_journal_id;

  return v_total_debit = v_total_credit and v_total_debit > 0;
end;
$$ language plpgsql stable;
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_helper_functions.sql
git commit -m "feat: add helper functions (auto-numbering, unit conversion, journal validation)"
```

---

### Task 8: Migration — Posting functions (auto-journal & inventory) 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/011_posting_functions.sql`

This is the most critical migration — all business logic for posting documents.

- [ ] **Step 1: Create posting functions**

`supabase/migrations/011_posting_functions.sql`:
```sql
-- ============================================================
-- INVENTORY: Update stock and avg_cost
-- ============================================================

-- Stock IN (purchase/goods receipt): update avg_cost
create or replace function inventory_stock_in(
  p_product_id uuid,
  p_quantity_base numeric,
  p_unit_cost numeric,
  p_unit_id uuid,
  p_quantity_original numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_date date
)
returns void as $$
declare
  v_current_qty numeric;
  v_current_avg numeric;
  v_new_avg numeric;
begin
  -- Get or create stock record
  insert into inventory_stock (product_id, quantity_on_hand, avg_cost, last_updated)
    values (p_product_id, 0, 0, now())
    on conflict (product_id) do nothing;

  select quantity_on_hand, avg_cost into v_current_qty, v_current_avg
    from inventory_stock where product_id = p_product_id for update;

  -- Calculate new average cost
  if v_current_qty + p_quantity_base > 0 then
    v_new_avg := (v_current_qty * v_current_avg + p_quantity_base * p_unit_cost)
                 / (v_current_qty + p_quantity_base);
  else
    v_new_avg := p_unit_cost;
  end if;

  -- Update stock
  update inventory_stock
    set quantity_on_hand = quantity_on_hand + p_quantity_base,
        avg_cost = v_new_avg,
        last_updated = now()
    where product_id = p_product_id;

  -- Record movement
  insert into inventory_movements (date, product_id, type, quantity_base, unit_id, quantity_original, unit_cost, reference_type, reference_id)
    values (p_date, p_product_id, 'in', p_quantity_base, p_unit_id, p_quantity_original, p_unit_cost, p_reference_type, p_reference_id);
end;
$$ language plpgsql;

-- Stock OUT (sales/goods delivery): use avg_cost for HPP
create or replace function inventory_stock_out(
  p_product_id uuid,
  p_quantity_base numeric,
  p_unit_id uuid,
  p_quantity_original numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_date date
)
returns numeric as $$  -- returns the avg_cost used (for HPP journal)
declare
  v_avg_cost numeric;
begin
  select avg_cost into v_avg_cost
    from inventory_stock where product_id = p_product_id for update;

  if v_avg_cost is null then
    raise exception 'No stock record for product %', p_product_id;
  end if;

  update inventory_stock
    set quantity_on_hand = quantity_on_hand - p_quantity_base,
        last_updated = now()
    where product_id = p_product_id;

  insert into inventory_movements (date, product_id, type, quantity_base, unit_id, quantity_original, unit_cost, reference_type, reference_id)
    values (p_date, p_product_id, 'out', p_quantity_base, p_unit_id, p_quantity_original, v_avg_cost, p_reference_type, p_reference_id);

  return v_avg_cost;
end;
$$ language plpgsql;

-- ============================================================
-- POST GOODS RECEIPT (Penerimaan Barang)
-- Journal: Persediaan (D) / Hutang Barang Diterima (K)
-- ============================================================

create or replace function post_goods_receipt(p_gr_id uuid)
returns uuid as $$  -- returns journal_id
declare
  v_gr record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_hutang_barang uuid;
  v_total numeric := 0;
begin
  select * into v_gr from goods_receipts where id = p_gr_id;
  if v_gr.status != 'draft' then
    raise exception 'Goods receipt already posted';
  end if;

  -- Get COA accounts
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan Barang
  select id into v_coa_hutang_barang from coa where code = '2-11100'; -- Hutang Barang Diterima

  -- Process items: stock in + calculate total
  for v_item in select * from goods_receipt_items where goods_receipt_id = p_gr_id
  loop
    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_item.unit_price,
      v_item.unit_id, v_item.quantity, 'goods_receipt', p_gr_id, v_gr.date
    );
    v_total := v_total + (v_item.quantity_base * v_item.unit_price);
  end loop;

  -- Create journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_gr.date,
      'Penerimaan Barang ' || v_gr.gr_number, 'auto', 'goods_receipt', p_gr_id,
      v_gr.supplier_id, true, v_gr.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_persediaan, v_total, 'Persediaan masuk - ' || v_gr.gr_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_hutang_barang, v_total, 'Hutang barang diterima - ' || v_gr.gr_number);

  -- Update status
  update goods_receipts set status = 'posted' where id = p_gr_id;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST GOODS DELIVERY (Pengiriman Barang — HPP)
-- Journal: HPP (D) / Persediaan (K)
-- ============================================================

create or replace function post_goods_delivery(p_gd_id uuid)
returns uuid as $$
declare
  v_gd record;
  v_item record;
  v_journal_id uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
begin
  select * into v_gd from goods_deliveries where id = p_gd_id;
  if v_gd.status != 'draft' then
    raise exception 'Goods delivery already posted';
  end if;

  select id into v_coa_hpp from coa where code = '5-11000'; -- HPP
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan

  for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
  loop
    v_avg_cost := inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity, 'goods_delivery', p_gd_id, v_gd.date
    );
    v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
  end loop;

  -- Create HPP journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_gd.date,
      'HPP Pengiriman ' || v_gd.gd_number, 'auto', 'goods_delivery', p_gd_id,
      v_gd.customer_id, true, v_gd.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_gd.gd_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_gd.gd_number);

  update goods_deliveries set status = 'posted' where id = p_gd_id;
  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST SALES INVOICE
-- Journal: Piutang (D) / Pendapatan (K) + PPN Keluaran (K)
-- Also: HPP if no prior goods_delivery for this SO
-- ============================================================

create or replace function post_sales_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_hpp_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_pendapatan uuid;
  v_coa_ppn_out uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_has_gd boolean;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
begin
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
  end if;

  select id into v_coa_piutang from coa where code = '1-13000'; -- Piutang Usaha
  select id into v_coa_pendapatan from coa where code = '4-11000'; -- Pendapatan Penjualan
  select id into v_coa_ppn_out from coa where code = '2-12000'; -- PPN Keluaran
  select id into v_coa_hpp from coa where code = '5-11000'; -- HPP
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan

  -- Revenue journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice', p_invoice_id,
      v_inv.customer_id, true, v_inv.created_by);

  -- Debit: Piutang = total
  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_piutang, v_inv.total, 'Piutang - ' || v_inv.invoice_number);

  -- Credit: Pendapatan = subtotal
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_pendapatan, v_inv.subtotal, 'Pendapatan - ' || v_inv.invoice_number);

  -- Credit: PPN Keluaran (if any)
  if v_inv.tax_amount > 0 then
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_ppn_out, v_inv.tax_amount, 'PPN Keluaran - ' || v_inv.invoice_number);
  end if;

  -- Check if goods already delivered via goods_deliveries
  select exists(
    select 1 from goods_deliveries
      where sales_order_id = v_inv.sales_order_id
        and status = 'posted'
  ) into v_has_gd;

  -- If no prior delivery, handle HPP + stock out now
  if not v_has_gd then
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      v_avg_cost := inventory_stock_out(
        v_item.product_id, v_item.quantity_base,
        v_item.unit_id, v_item.quantity, 'sales_invoice', p_invoice_id, v_inv.date
      );
      v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
    end loop;

    if v_total_hpp > 0 then
      v_hpp_journal_id := gen_random_uuid();
      insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
        values (v_hpp_journal_id, generate_number('JRN'), v_inv.date,
          'HPP Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice_hpp', p_invoice_id,
          v_inv.customer_id, true, v_inv.created_by);
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_hpp_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_inv.invoice_number);
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_hpp_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_inv.invoice_number);
    end if;
  end if;

  -- Update invoice status
  update invoices set status = 'posted' where id = p_invoice_id;

  -- Update SO status if linked
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST PURCHASE INVOICE
-- If goods_receipt exists: clear accrual (Hutang Barang Diterima D / Hutang Usaha K)
-- If no goods_receipt: Persediaan (D) + PPN Masukan (D) / Hutang Usaha (K)
-- ============================================================

create or replace function post_purchase_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_ppn_in uuid;
  v_coa_hutang uuid;
  v_coa_hutang_barang uuid;
  v_has_gr boolean;
  v_gr_total numeric := 0;
  v_selisih numeric;
  v_coa_selisih uuid;
begin
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'purchase' then
    raise exception 'Not a purchase invoice';
  end if;

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_ppn_in from coa where code = '1-15000'; -- PPN Masukan
  select id into v_coa_hutang from coa where code = '2-11000'; -- Hutang Usaha
  select id into v_coa_hutang_barang from coa where code = '2-11100'; -- Hutang Barang Diterima
  select id into v_coa_selisih from coa where code = '5-19000'; -- Selisih Harga

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Pembelian ' || v_inv.invoice_number, 'auto', 'purchase_invoice', p_invoice_id,
      v_inv.supplier_id, true, v_inv.created_by);

  -- Check if goods receipt exists
  select exists(
    select 1 from goods_receipts
      where purchase_order_id = v_inv.purchase_order_id
        and status = 'posted'
  ) into v_has_gr;

  if v_has_gr then
    -- Goods already received: clear accrual
    -- Calculate goods receipt total (at PO prices)
    select coalesce(sum(gri.quantity_base * gri.unit_price), 0) into v_gr_total
      from goods_receipt_items gri
      join goods_receipts gr on gri.goods_receipt_id = gr.id
      where gr.purchase_order_id = v_inv.purchase_order_id and gr.status = 'posted';

    -- Debit: Hutang Barang Diterima (clear accrual)
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang_barang, v_gr_total, 'Clear accrual - ' || v_inv.invoice_number);

    -- Credit: Hutang Usaha = invoice total
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);

    -- PPN Masukan if any
    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    -- Handle price difference
    v_selisih := v_inv.subtotal - v_gr_total;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga - ' || v_inv.invoice_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga - ' || v_inv.invoice_number);
    end if;

  else
    -- No goods receipt: stock in now
    for v_item in select ii.*, p.is_taxable from invoice_items ii
      join products p on ii.product_id = p.id
      where ii.invoice_id = p_invoice_id
    loop
      perform inventory_stock_in(
        v_item.product_id, v_item.quantity_base, v_item.unit_price,
        v_item.unit_id, v_item.quantity, 'purchase_invoice', p_invoice_id, v_inv.date
      );
    end loop;

    -- Debit: Persediaan = subtotal
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_persediaan, v_inv.subtotal, 'Persediaan masuk - ' || v_inv.invoice_number);

    -- Debit: PPN Masukan
    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    -- Credit: Hutang Usaha = total
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);
  end if;

  update invoices set status = 'posted' where id = p_invoice_id;

  if v_inv.purchase_order_id is not null then
    update purchase_orders set status = 'done' where id = v_inv.purchase_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST PAYMENT
-- Incoming: Kas/Bank (D) / Piutang (K)
-- Outgoing: Hutang (D) / Kas/Bank (K)
-- ============================================================

create or replace function post_payment(p_payment_id uuid)
returns uuid as $$
declare
  v_pay record;
  v_journal_id uuid;
  v_coa_account uuid;
  v_coa_piutang uuid;
  v_coa_hutang uuid;
begin
  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
    where p.id = p_payment_id;

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang from coa where code = '2-11000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id,
    customer_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_pay.date,
      'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
      v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by);

  if v_pay.type = 'incoming' then
    -- Debit: Kas/Bank
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Terima pembayaran - ' || v_pay.payment_number);
    -- Credit: Piutang
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_pay.amount, 'Pelunasan piutang - ' || v_pay.payment_number);

    -- Update account balance
    update accounts set balance = balance + v_pay.amount where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    -- Debit: Hutang
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pay.amount, 'Pelunasan hutang - ' || v_pay.payment_number);
    -- Credit: Kas/Bank
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Bayar supplier - ' || v_pay.payment_number);

    update accounts set balance = balance - v_pay.amount where id = v_pay.account_id;
  end if;

  -- Update invoice amount_paid and status
  if v_pay.invoice_id is not null then
    update invoices
      set amount_paid = amount_paid + v_pay.amount,
          status = case
            when amount_paid + v_pay.amount >= total then 'paid'
            else 'partial'
          end
      where id = v_pay.invoice_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST TRANSFER KAS/BANK
-- Journal: Kas/Bank Tujuan (D) / Kas/Bank Asal (K)
-- ============================================================

create or replace function post_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_notes text,
  p_user_id uuid
)
returns uuid as $$
declare
  v_journal_id uuid;
  v_from_coa uuid;
  v_to_coa uuid;
  v_number text;
begin
  select coa_id into v_from_coa from accounts where id = p_from_account_id;
  select coa_id into v_to_coa from accounts where id = p_to_account_id;
  v_number := generate_number('TRF');

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date,
      'Transfer ' || v_number || coalesce(' - ' || p_notes, ''),
      'auto', 'transfer', v_journal_id, true, p_user_id);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_to_coa, p_amount, 'Transfer masuk');
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_from_coa, p_amount, 'Transfer keluar');

  update accounts set balance = balance - p_amount where id = p_from_account_id;
  update accounts set balance = balance + p_amount where id = p_to_account_id;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST EXPENSE (Pengeluaran Operasional)
-- Journal: Beban (D) / Kas/Bank (K)
-- ============================================================

create or replace function post_expense(
  p_account_id uuid,
  p_coa_beban_id uuid,
  p_amount numeric,
  p_date date,
  p_description text,
  p_user_id uuid
)
returns uuid as $$
declare
  v_journal_id uuid;
  v_account_coa uuid;
begin
  select coa_id into v_account_coa from accounts where id = p_account_id;

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date,
      coalesce(p_description, 'Pengeluaran operasional'),
      'auto', 'expense', true, p_user_id);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, p_coa_beban_id, p_amount, p_description);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_account_coa, p_amount, 'Kas/Bank keluar');

  update accounts set balance = balance - p_amount where id = p_account_id;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST MANUAL JOURNAL (admin only — validates balance)
-- ============================================================

create or replace function post_manual_journal(p_journal_id uuid)
returns void as $$
begin
  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  update journals set is_posted = true where id = p_journal_id and source = 'manual';
end;
$$ language plpgsql;
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_posting_functions.sql
git commit -m "feat: add posting functions (goods receipt/delivery, invoice, payment, transfer, expense, HPP)"
```

---

### Task 9: Migration — Report views 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/012_report_views.sql`

- [ ] **Step 1: Create report views**

`supabase/migrations/012_report_views.sql`:
```sql
-- Balance per COA account (for balance sheet, income statement)
create or replace function get_account_balances(p_start_date date, p_end_date date)
returns table (
  coa_id uuid,
  code text,
  name text,
  type text,
  normal_balance text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
) as $$
begin
  return query
  select
    c.id as coa_id, c.code, c.name, c.type, c.normal_balance,
    coalesce(sum(ji.debit), 0) as total_debit,
    coalesce(sum(ji.credit), 0) as total_credit,
    case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
    and j.is_posted = true
    and j.date between p_start_date and p_end_date
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$ language plpgsql stable;

-- Ledger (buku besar) per account
create or replace function get_ledger(p_coa_id uuid, p_start_date date, p_end_date date)
returns table (
  journal_date date,
  journal_number text,
  description text,
  debit numeric,
  credit numeric,
  running_balance numeric
) as $$
begin
  return query
  select
    j.date as journal_date,
    j.journal_number,
    coalesce(ji.description, j.description) as description,
    ji.debit,
    ji.credit,
    sum(
      case (select normal_balance from coa where id = p_coa_id)
        when 'debit' then ji.debit - ji.credit
        when 'credit' then ji.credit - ji.debit
      end
    ) over (order by j.date, j.created_at) as running_balance
  from journal_items ji
  join journals j on ji.journal_id = j.id
  where ji.coa_id = p_coa_id
    and j.is_posted = true
    and j.date between p_start_date and p_end_date
  order by j.date, j.created_at;
end;
$$ language plpgsql stable;
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_report_views.sql
git commit -m "feat: add report functions (account balances, ledger)"
```

---

### Task 10: Seed data — Default COA & units 🔵 Sonnet

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create seed file**

`supabase/seed.sql`:
```sql
-- Default units
insert into units (name) values
  ('pcs'), ('dus'), ('kg'), ('gram'), ('liter'), ('ml'),
  ('meter'), ('cm'), ('lusin'), ('rim'), ('set'), ('unit');

-- Default Chart of Accounts (Indonesian standard for trading company)
-- 1-xxxxx: Aset
insert into coa (code, name, type, normal_balance) values
  ('1-00000', 'ASET', 'asset', 'debit'),
  ('1-10000', 'Aset Lancar', 'asset', 'debit'),
  ('1-11000', 'Kas', 'asset', 'debit'),
  ('1-12000', 'Bank', 'asset', 'debit'),
  ('1-13000', 'Piutang Usaha', 'asset', 'debit'),
  ('1-14000', 'Persediaan Barang', 'asset', 'debit'),
  ('1-15000', 'PPN Masukan', 'asset', 'debit'),
  ('1-16000', 'Uang Muka', 'asset', 'debit'),
  ('1-19000', 'Aset Lancar Lainnya', 'asset', 'debit'),
  ('1-20000', 'Aset Tetap', 'asset', 'debit'),
  ('1-21000', 'Peralatan', 'asset', 'debit'),
  ('1-22000', 'Kendaraan', 'asset', 'debit'),
  ('1-29000', 'Akumulasi Penyusutan', 'asset', 'debit');

-- Set parent-child relationships for Aset
update coa set parent_id = (select id from coa where code = '1-00000') where code in ('1-10000', '1-20000');
update coa set parent_id = (select id from coa where code = '1-10000')
  where code in ('1-11000', '1-12000', '1-13000', '1-14000', '1-15000', '1-16000', '1-19000');
update coa set parent_id = (select id from coa where code = '1-20000')
  where code in ('1-21000', '1-22000', '1-29000');

-- 2-xxxxx: Kewajiban
insert into coa (code, name, type, normal_balance) values
  ('2-00000', 'KEWAJIBAN', 'liability', 'credit'),
  ('2-10000', 'Kewajiban Lancar', 'liability', 'credit'),
  ('2-11000', 'Hutang Usaha', 'liability', 'credit'),
  ('2-11100', 'Hutang Barang Diterima', 'liability', 'credit'),
  ('2-12000', 'PPN Keluaran', 'liability', 'credit'),
  ('2-13000', 'Hutang Pajak', 'liability', 'credit'),
  ('2-19000', 'Kewajiban Lancar Lainnya', 'liability', 'credit');

update coa set parent_id = (select id from coa where code = '2-00000') where code = '2-10000';
update coa set parent_id = (select id from coa where code = '2-10000')
  where code in ('2-11000', '2-11100', '2-12000', '2-13000', '2-19000');

-- 3-xxxxx: Modal
insert into coa (code, name, type, normal_balance) values
  ('3-00000', 'MODAL', 'equity', 'credit'),
  ('3-11000', 'Modal Disetor', 'equity', 'credit'),
  ('3-12000', 'Laba Ditahan', 'equity', 'credit'),
  ('3-13000', 'Laba Periode Berjalan', 'equity', 'credit');

update coa set parent_id = (select id from coa where code = '3-00000')
  where code in ('3-11000', '3-12000', '3-13000');

-- 4-xxxxx: Pendapatan
insert into coa (code, name, type, normal_balance) values
  ('4-00000', 'PENDAPATAN', 'revenue', 'credit'),
  ('4-11000', 'Pendapatan Penjualan', 'revenue', 'credit'),
  ('4-12000', 'Pendapatan Jasa', 'revenue', 'credit'),
  ('4-19000', 'Pendapatan Lainnya', 'revenue', 'credit');

update coa set parent_id = (select id from coa where code = '4-00000')
  where code in ('4-11000', '4-12000', '4-19000');

-- 5-xxxxx: Beban
insert into coa (code, name, type, normal_balance) values
  ('5-00000', 'BEBAN', 'expense', 'debit'),
  ('5-11000', 'Harga Pokok Penjualan (HPP)', 'expense', 'debit'),
  ('5-12000', 'Beban Gaji', 'expense', 'debit'),
  ('5-13000', 'Beban Sewa', 'expense', 'debit'),
  ('5-14000', 'Beban Utilitas', 'expense', 'debit'),
  ('5-15000', 'Beban Transport', 'expense', 'debit'),
  ('5-16000', 'Beban Perlengkapan', 'expense', 'debit'),
  ('5-17000', 'Beban Penyusutan', 'expense', 'debit'),
  ('5-18000', 'Beban Administrasi', 'expense', 'debit'),
  ('5-19000', 'Selisih Harga', 'expense', 'debit'),
  ('5-99000', 'Beban Lainnya', 'expense', 'debit');

update coa set parent_id = (select id from coa where code = '5-00000')
  where code like '5-1%' or code like '5-9%';
```

- [ ] **Step 2: Run seed via SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql && git commit -m "feat: add seed data (default units and COA)"
```

---

## Phase 3: Auth & Layout

### Task 11: Auth context & login page 🟢 Haiku

**Files:**
- Create: `src/contexts/AuthContext.jsx`
- Create: `src/hooks/useAuth.js`
- Create: `src/pages/LoginPage.jsx`

- [ ] **Step 1: Create AuthContext**

`src/contexts/AuthContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'
  const canWrite = isAdmin || isStaff
  const canPost = isAdmin

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isAdmin, isStaff, canWrite, canPost }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 2: Create LoginPage**

`src/pages/LoginPage.jsx`:
```jsx
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LogIn } from 'lucide-react'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">ERP Pembukuan</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <LogIn size={18} /> {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.jsx src/pages/LoginPage.jsx
git commit -m "feat: add auth context, login page"
```

---

### Task 12: App layout, sidebar & routing 🟢 Haiku

**Files:**
- Create: `src/components/layout/AppLayout.jsx`
- Create: `src/components/layout/Sidebar.jsx`
- Create: `src/components/layout/ProtectedRoute.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create Sidebar with navigation**

`src/components/layout/Sidebar.jsx` — sidebar with menu groups:
- Master Data: Satuan, Produk, Customer, Supplier, COA
- Inventory: Stok, Kartu Stok
- Penjualan: Sales Order, Pengiriman, Invoice Penjualan
- Pembelian: Purchase Order, Penerimaan, Invoice Pembelian
- Kas & Bank: Akun, Pembayaran, Transfer, Rekonsiliasi
- Pembukuan: Jurnal, Buku Besar
- Laporan: Neraca, Laba Rugi, Arus Kas
- Settings: Users (admin only)

Use Lucide icons. Collapsible menu groups. Active state highlighting via React Router `useLocation`.

- [ ] **Step 2: Create AppLayout**

`src/components/layout/AppLayout.jsx` — Flex layout: sidebar (fixed 256px) + main content area (scrollable). Header bar with user name and sign out button.

- [ ] **Step 3: Create ProtectedRoute**

`src/components/layout/ProtectedRoute.jsx` — wraps routes, redirects to login if not authenticated. Shows loading spinner while checking auth.

- [ ] **Step 4: Wire up App.jsx with routing**

`src/App.jsx` — `BrowserRouter` → `AuthProvider` → `ProtectedRoute` → `AppLayout` with nested `Routes`. Define all route paths matching the sidebar menu. Use `React.lazy` for page components. Start with placeholder pages that just show the page name.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ src/App.jsx
git commit -m "feat: add app layout, sidebar navigation, routing"
```

---

### Task 13: Shared UI components 🟢 Haiku

**Files:**
- Create: `src/components/ui/Button.jsx`
- Create: `src/components/ui/Input.jsx`
- Create: `src/components/ui/Select.jsx`
- Create: `src/components/ui/DataTable.jsx`
- Create: `src/components/ui/Modal.jsx`
- Create: `src/components/ui/ConfirmDialog.jsx`
- Create: `src/components/ui/StatusBadge.jsx`
- Create: `src/components/ui/LoadingSpinner.jsx`
- Create: `src/components/ui/Toast.jsx`

- [ ] **Step 1: Create all UI components**

Build a minimal UI component library using Tailwind:

- **Button** — variants: primary (blue), secondary (gray), danger (red), ghost. Props: `variant`, `size`, `loading`, `disabled`, `onClick`, `children`.
- **Input** — wrapper around `<input>` with label, error message. Props: `label`, `error`, `type`, plus standard input props.
- **Select** — wrapper around `<select>` with label, error, options. Props: `label`, `error`, `options` (array of `{value, label}`), plus standard select props.
- **DataTable** — table component. Props: `columns` (array of `{key, label, render?}`), `data`, `onRowClick?`, `emptyMessage`.
- **Modal** — overlay modal. Props: `isOpen`, `onClose`, `title`, `children`, `size` (sm/md/lg).
- **ConfirmDialog** — extends Modal for confirmations. Props: `isOpen`, `onClose`, `onConfirm`, `title`, `message`, `confirmText`, `variant`.
- **StatusBadge** — colored pill. Props: `status` maps to color (draft=gray, posted=green, partial=yellow, paid=blue, confirmed=blue).
- **LoadingSpinner** — centered spinner with optional message.
- **Toast** — simple toast notification system using React context. `useToast()` hook returns `{ success(msg), error(msg) }`.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add shared UI component library"
```

---

### Task 14: Utility helpers 🟢 Haiku

**Files:**
- Create: `src/utils/currency.js`
- Create: `src/utils/date.js`
- Create: `src/utils/validation.js`

- [ ] **Step 1: Create utility files**

`src/utils/currency.js`:
```js
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount || 0)
}

export function formatNumber(num, decimals = 0) {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num || 0)
}

export function parseCurrency(str) {
  if (typeof str === 'number') return str
  return parseFloat(String(str).replace(/[^0-9.-]/g, '')) || 0
}
```

`src/utils/date.js`:
```js
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'

export function formatDate(date) {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy', { locale: id })
}

export function formatDateInput(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function today() {
  return format(new Date(), 'yyyy-MM-dd')
}
```

`src/utils/validation.js`:
```js
export function required(value, fieldName) {
  if (!value && value !== 0) return `${fieldName} wajib diisi`
  return null
}

export function minValue(value, min, fieldName) {
  if (Number(value) < min) return `${fieldName} minimal ${min}`
  return null
}

export function validateForm(data, rules) {
  const errors = {}
  for (const [field, validators] of Object.entries(rules)) {
    for (const validator of validators) {
      const error = validator(data[field])
      if (error) { errors[field] = error; break }
    }
  }
  return Object.keys(errors).length ? errors : null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/ && git commit -m "feat: add utility helpers (currency, date, validation)"
```

---

## Phase 4: Master Data

### Task 15: Units CRUD — **PATTERN REFERENCE** 🟢 Haiku

This task establishes the CRUD pattern. All subsequent CRUD tasks follow this structure.

**Files:**
- Create: `src/services/masterDataService.js`
- Create: `src/hooks/useMasterData.js`
- Create: `src/pages/master/UnitsPage.jsx`

- [ ] **Step 1: Create service**

`src/services/masterDataService.js`:
```js
import { supabase } from '../lib/supabase'

// ---- UNITS ----
export async function getUnits() {
  const { data, error } = await supabase.from('units').select('*').order('name')
  if (error) throw error
  return data
}

export async function createUnit(unit) {
  const { data, error } = await supabase.from('units').insert(unit).select().single()
  if (error) throw error
  return data
}

export async function updateUnit(id, unit) {
  const { data, error } = await supabase.from('units').update(unit).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteUnit(id) {
  const { error } = await supabase.from('units').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Create hook**

`src/hooks/useMasterData.js`:
```js
import { useState, useEffect, useCallback } from 'react'
import * as svc from '../services/masterDataService'

export function useUnits() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { setUnits(await svc.getUnits()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { units, loading, refetch: fetch }
}
```

- [ ] **Step 3: Create page**

`src/pages/master/UnitsPage.jsx` — standard CRUD page:
1. Page header with title + "Tambah" button (if `canWrite`)
2. DataTable showing units (columns: Nama)
3. Modal with form for add/edit (Input: name)
4. ConfirmDialog for delete
5. Toast on success/error
6. Uses `useUnits()` hook and `masterDataService` functions

- [ ] **Step 4: Add route in App.jsx**

Add `<Route path="/master/units" element={<UnitsPage />} />`.

- [ ] **Step 5: Verify build & manual test**

```bash
npm run build
```

Manual: Open app → Master Data → Satuan → Add/Edit/Delete a unit.

- [ ] **Step 6: Commit**

```bash
git add src/services/masterDataService.js src/hooks/useMasterData.js src/pages/master/UnitsPage.jsx src/App.jsx
git commit -m "feat: add Units CRUD (establishes master data pattern)"
```

---

### Task 16: Products CRUD with unit conversion 🔵 Sonnet

**Files:**
- Modify: `src/services/masterDataService.js` — add product & unit_conversion functions
- Modify: `src/hooks/useMasterData.js` — add `useProducts()`
- Create: `src/pages/master/ProductsPage.jsx`

- [ ] **Step 1: Add product service functions**

Add to `masterDataService.js`:
- `getProducts()` — select with joins: `*, base_unit:units(name), conversions:unit_conversions(*, from_unit:units(name), to_unit:units(name))`
- `createProduct(product)` — insert product, then insert unit_conversions if any
- `updateProduct(id, product)` — update product, upsert unit_conversions
- `softDeleteProduct(id)` — update `is_active: false, deleted_at, deleted_by`
- `getProductConversions(productId)` — list conversions for a product

- [ ] **Step 2: Create ProductsPage**

Fields: SKU, Nama, Kategori, Satuan Dasar (select from units), Harga Beli, Harga Jual, PPN (checkbox), Tarif PPN (%).

Below the main form, a sub-table "Konversi Satuan" where user adds rows:
| Dari Satuan | Ke Satuan (base) | Faktor |
|---|---|---|
| dus | pcs | 12 |

Unit conversion UI logic (Sonnet-tier):
- "Ke Satuan" is always locked to the product's base unit
- "Dari Satuan" is a dropdown of all units except base unit
- Conversion factor must be > 0
- Conversions saved/deleted together with product

- [ ] **Step 3: Verify build & manual test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Products CRUD with unit conversions and PPN toggle"
```

---

### Task 17: Customers CRUD 🟢 Haiku

Follow the Units pattern (Task 15). Fields: Nama, Alamat, Telepon, Email, NPWP.

**Files:**
- Modify: `src/services/masterDataService.js` — add `getCustomers`, `createCustomer`, `updateCustomer`, `softDeleteCustomer`
- Modify: `src/hooks/useMasterData.js` — add `useCustomers()`
- Create: `src/pages/master/CustomersPage.jsx`

Use soft delete: `update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: user.id })`. Filter list by `is_active = true`.

- [ ] Steps: service → hook → page → route → build → commit

```bash
git commit -m "feat: add Customers CRUD"
```

---

### Task 18: Suppliers CRUD 🟢 Haiku

Identical to Customers (Task 17) with table `suppliers`.

**Files:**
- Modify: `src/services/masterDataService.js`
- Modify: `src/hooks/useMasterData.js`
- Create: `src/pages/master/SuppliersPage.jsx`

- [ ] Steps: service → hook → page → route → build → commit

```bash
git commit -m "feat: add Suppliers CRUD"
```

---

### Task 19: COA CRUD with hierarchy 🔵 Sonnet

**Files:**
- Modify: `src/services/masterDataService.js`
- Modify: `src/hooks/useMasterData.js`
- Create: `src/pages/master/COAPage.jsx`

- [ ] **Step 1: Add COA service functions**

- `getCOA()` — select all active, ordered by `code`. Include parent info.
- `createCOA(coa)` — validate code uniqueness. Auto-set `normal_balance` based on `type`: asset/expense = debit, liability/equity/revenue = credit.
- `updateCOA(id, coa)` — cannot change type if journal_items reference this account.
- `softDeleteCOA(id)` — check no journal_items reference this account before deactivating.

- [ ] **Step 2: Create COAPage**

Fields: Kode, Nama, Tipe (dropdown: Aset/Kewajiban/Modal/Pendapatan/Beban), Saldo Normal (auto-filled from type, read-only), Parent (dropdown of existing COA).

Display as **indented tree** based on parent_id hierarchy. Indent child accounts visually.

Sonnet logic:
- Auto-fill `normal_balance` when `type` changes
- Prevent deleting accounts referenced in journals
- Sort display by code (natural string sort)
- Show tree depth via indentation

- [ ] **Step 3: Verify build & manual test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add COA CRUD with hierarchy and auto normal-balance"
```

---

### Task 20: Cash/Bank Accounts CRUD 🟢 Haiku

**Files:**
- Modify: `src/services/masterDataService.js`
- Modify: `src/hooks/useMasterData.js`
- Create: `src/pages/cashbank/AccountsPage.jsx`

Fields: Nama, Tipe (cash/bank dropdown), Akun COA (dropdown filtered to Kas `1-11000` or Bank `1-12000`). Display balance (read-only, managed by posting functions).

- [ ] Steps: service → hook → page → route → build → commit

```bash
git commit -m "feat: add Cash/Bank Accounts CRUD"
```

---

## Phase 5: Inventory

### Task 21: Inventory service & stock page 🔵 Sonnet

**Files:**
- Create: `src/services/inventoryService.js`
- Create: `src/hooks/useInventory.js`
- Create: `src/pages/inventory/StockPage.jsx`

- [ ] **Step 1: Create inventory service**

`src/services/inventoryService.js`:
```js
import { supabase } from '../lib/supabase'

export async function getStock() {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select('*, product:products(name, sku, base_unit:units(name))')
    .order('product(name)')
  if (error) throw error
  return data
}

export async function getStockCard(productId, startDate, endDate) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*, product:products(name), unit:units(name)')
    .eq('product_id', productId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('created_at')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Create StockPage**

Table columns: Produk (name + SKU), Satuan Dasar, Stok On Hand, Harga Rata-rata, Nilai Stok (qty × avg_cost).

Features:
- Search by product name/SKU
- Show total stock value at bottom
- Color-code low stock (< 10) in red

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add inventory stock page"
```

---

### Task 22: Stock card page 🟢 Haiku

**Files:**
- Create: `src/pages/inventory/StockCardPage.jsx`

- [ ] **Step 1: Create StockCardPage**

Select product (dropdown), date range filter. Table shows:
| Tanggal | Keterangan | Ref | Masuk | Keluar | Saldo |

Running balance calculated from movements. Uses `inventoryService.getStockCard()`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add stock card page"
```

---

## Phase 6: Sales Cycle

### Task 23: Shared line items component 🔵 Sonnet

**Files:**
- Create: `src/components/shared/LineItemsTable.jsx`
- Create: `src/components/shared/DocumentHeader.jsx`

- [ ] **Step 1: Create LineItemsTable**

Reusable component for SO, PO, Invoice line items. Props:
- `items` — array of line item objects
- `onItemsChange` — callback when items change
- `products` — product list for dropdown
- `units` — unit list
- `readOnly` — disable editing (for posted documents)
- `showTax` — show tax column

Each row: Product (select) → Unit (select, filtered by product conversions + base unit) → Qty → Unit Price → Tax (auto-calculated if product.is_taxable) → Total.

Sonnet logic:
- When product is selected, auto-fill unit_price (sell_price for sales, buy_price for purchase)
- When unit changes, recalculate quantity_base using conversion factor
- Tax auto-calc: `tax_amount = is_taxable ? subtotal × tax_rate / 100 : 0`
- Show subtotal, total tax, grand total at bottom
- Add/remove rows

- [ ] **Step 2: Create DocumentHeader**

Reusable header: Document number (auto or manual), Date, Status badge, Party (customer/supplier select).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add shared LineItemsTable and DocumentHeader components"
```

---

### Task 24: Sales Order CRUD 🔵 Sonnet

**Files:**
- Create: `src/services/salesService.js`
- Create: `src/hooks/useSales.js`
- Create: `src/pages/sales/SalesOrdersPage.jsx`
- Create: `src/pages/sales/SalesOrderFormPage.jsx`

- [ ] **Step 1: Create sales service**

```js
import { supabase } from '../lib/supabase'

export async function getSalesOrders() {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customer:customers(name)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesOrder(id) {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customer:customers(name), items:sales_order_items(*, product:products(name, sku, is_taxable, tax_rate, sell_price), unit:units(name))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveSalesOrder(so, items) {
  // Generate number for new SO
  if (!so.id) {
    const { data: num } = await supabase.rpc('generate_number', { p_prefix: 'SO' })
    so.so_number = num
  }

  // Calculate totals
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0)
  const tax_amount = items.reduce((sum, i) => sum + (i.tax_amount || 0), 0)

  const soData = { ...so, subtotal, tax_amount, total: subtotal + tax_amount }

  let soId = so.id
  if (soId) {
    await supabase.from('sales_order_items').delete().eq('sales_order_id', soId)
    await supabase.from('sales_orders').update(soData).eq('id', soId)
  } else {
    const { data } = await supabase.from('sales_orders').insert(soData).select().single()
    soId = data.id
  }

  const itemRows = items.map(i => ({ ...i, sales_order_id: soId }))
  await supabase.from('sales_order_items').insert(itemRows)

  return soId
}

export async function confirmSalesOrder(id) {
  await supabase.from('sales_orders').update({ status: 'confirmed' }).eq('id', id)
}
```

- [ ] **Step 2: Create SalesOrdersPage (list)**

Table: No. SO, Tanggal, Customer, Status, Total. Filter by status and date range. Click row → navigate to form page.

- [ ] **Step 3: Create SalesOrderFormPage**

Uses DocumentHeader (customer select, date, SO number) + LineItemsTable (with sell prices).
- Draft: editable
- Confirmed: read-only, show "Buat Invoice" button
- "Simpan" saves as draft, "Konfirmasi" changes status to confirmed

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Sales Order CRUD with line items"
```

---

### Task 25: Goods Delivery with HPP 🔵 Sonnet

**Files:**
- Create: `src/pages/sales/GoodsDeliveriesPage.jsx`
- Create: `src/pages/sales/GoodsDeliveryFormPage.jsx`
- Modify: `src/services/salesService.js` — add goods delivery functions

- [ ] **Step 1: Add service functions**

- `getGoodsDeliveries()` — list with customer name
- `getGoodsDelivery(id)` — with items, product details
- `saveGoodsDelivery(gd, items)` — save draft
- `postGoodsDelivery(id)` — calls `supabase.rpc('post_goods_delivery', { p_gd_id: id })`

- [ ] **Step 2: Create GoodsDeliveriesPage & form**

List page: table with GD number, date, customer, SO ref, status.

Form page:
- Can create from SO (auto-fill items) or standalone
- Customer select, date, optional SO reference
- Line items: Product, Unit, Qty (no prices — this is just a delivery note)
- "Post" button calls `postGoodsDelivery()` — this triggers stock out + HPP journal

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add Goods Delivery with HPP posting"
```

---

### Task 26: Sales Invoice with posting 🔵 Sonnet

**Files:**
- Create: `src/pages/sales/SalesInvoicesPage.jsx`
- Create: `src/pages/sales/SalesInvoiceFormPage.jsx`
- Modify: `src/services/salesService.js`

- [ ] **Step 1: Add invoice service functions**

- `getSalesInvoices()` — filter `type = 'sales'`
- `getSalesInvoice(id)` — with items
- `saveSalesInvoice(invoice, items)` — save draft. Can create from SO (auto-fill) or standalone.
- `postSalesInvoice(id)` — calls `supabase.rpc('post_sales_invoice', { p_invoice_id: id })`

- [ ] **Step 2: Create pages**

List: Invoice number, date, customer, due date, status, total, amount paid.

Form:
- Source: from SO or direct
- Customer, date, due date
- Line items with tax calculation
- "Post" button — creates revenue journal + HPP if no prior goods delivery
- Posted invoice: read-only, show linked journals

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add Sales Invoice with auto-journal posting"
```

---

### Task 27: Customer payment 🔵 Sonnet

**Files:**
- Create: `src/pages/cashbank/PaymentsPage.jsx`
- Create: `src/pages/cashbank/PaymentFormPage.jsx`
- Create: `src/services/cashBankService.js`
- Create: `src/hooks/useCashBank.js`

- [ ] **Step 1: Create cashBankService**

```js
export async function savePayment(payment) {
  if (!payment.id) {
    const { data: num } = await supabase.rpc('generate_number', { p_prefix: 'PAY' })
    payment.payment_number = num
  }
  const { data, error } = await supabase.from('payments').insert(payment).select().single()
  if (error) throw error

  // Auto-post payment (creates journal, updates invoice, updates account balance)
  await supabase.rpc('post_payment', { p_payment_id: data.id })
  return data
}

export async function getPayments(type) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, invoice:invoices(invoice_number), customer:customers(name), supplier:suppliers(name), account:accounts(name)')
    .eq('type', type)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Create PaymentsPage & form**

Filter by type (incoming/outgoing).

Form (incoming):
- Customer select (show outstanding invoices for this customer)
- Invoice select (filtered by customer, status = posted/partial)
- Account (kas/bank select)
- Amount (show remaining balance from invoice)
- Date, notes

On save: payment is auto-posted (journal created, invoice updated, account balance updated).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add customer payment with auto-journal"
```

---

## Phase 7: Purchase Cycle

### Task 28: Purchase Order CRUD 🟢 Haiku

Follows Sales Order pattern (Task 24) but for purchases.

**Files:**
- Create: `src/services/purchaseService.js`
- Create: `src/hooks/usePurchase.js`
- Create: `src/pages/purchase/PurchaseOrdersPage.jsx`
- Create: `src/pages/purchase/PurchaseOrderFormPage.jsx`

Differences from SO: supplier instead of customer, buy_price as default unit_price, uses PO prefix for numbering.

- [ ] Steps: service → hook → list page → form page → route → build → commit

```bash
git commit -m "feat: add Purchase Order CRUD"
```

---

### Task 29: Goods Receipt with inventory 🔵 Sonnet

Follows Goods Delivery pattern (Task 25) but for purchase receiving.

**Files:**
- Create: `src/pages/purchase/GoodsReceiptsPage.jsx`
- Create: `src/pages/purchase/GoodsReceiptFormPage.jsx`
- Modify: `src/services/purchaseService.js`

Key difference: items include `unit_price` (from PO). Posting calls `supabase.rpc('post_goods_receipt', ...)` which updates stock, avg_cost, and creates accrual journal.

- [ ] Steps: service functions → list page → form page (with prices) → post button → commit

```bash
git commit -m "feat: add Goods Receipt with inventory and accrual journal"
```

---

### Task 30: Purchase Invoice with posting 🔵 Sonnet

Follows Sales Invoice (Task 26) but for purchases.

**Files:**
- Create: `src/pages/purchase/PurchaseInvoicesPage.jsx`
- Create: `src/pages/purchase/PurchaseInvoiceFormPage.jsx`
- Modify: `src/services/purchaseService.js`

Posting calls `supabase.rpc('post_purchase_invoice', ...)`. Handles: with prior goods receipt (clear accrual + price difference) and without goods receipt (direct stock in).

- [ ] Steps: service → pages → post logic → commit

```bash
git commit -m "feat: add Purchase Invoice with auto-journal posting"
```

---

### Task 31: Supplier payment 🟢 Haiku

Follows Customer Payment (Task 27) with `type = 'outgoing'`.

**Files:**
- Modify: `src/services/cashBankService.js`
- PaymentsPage and PaymentFormPage already handle both types via filter

Only modification needed: ensure PaymentFormPage toggles between customer/supplier fields based on payment type, and filters invoices accordingly (type = 'purchase', supplier_id match).

- [ ] Steps: update form logic → test → commit

```bash
git commit -m "feat: add supplier payment support"
```

---

## Phase 8: Kas & Bank

### Task 32: Cash/Bank transfers 🔵 Sonnet

**Files:**
- Create: `src/pages/cashbank/TransfersPage.jsx`
- Modify: `src/services/cashBankService.js`

- [ ] **Step 1: Add transfer service**

```js
export async function postTransfer({ fromAccountId, toAccountId, amount, date, notes, userId }) {
  const { data, error } = await supabase.rpc('post_transfer', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_amount: amount,
    p_date: date,
    p_notes: notes,
    p_user_id: userId,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Create TransfersPage**

Form: From account, To account (both dropdowns of active accounts), Amount, Date, Notes. Submit directly posts the transfer (no draft state).

Show transfer history from journals where `reference_type = 'transfer'`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add cash/bank transfer with auto-journal"
```

---

### Task 33: Bank reconciliation 🔵 Sonnet

**Files:**
- Create: `src/pages/cashbank/ReconciliationPage.jsx`
- Modify: `src/services/cashBankService.js`

- [ ] **Step 1: Add reconciliation service**

- `getReconciliations(accountId)` — list by account
- `createReconciliation(data)` — insert with system_balance calculated from account.balance
- `markReconciled(id)` — set is_reconciled = true

- [ ] **Step 2: Create ReconciliationPage**

Select account → show current system balance. Input statement balance (from bank statement). Show difference. If balanced, mark as reconciled.

Display reconciliation history in a table.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add bank reconciliation"
```

---

## Phase 9: Accounting

### Task 34: Manual journal entry (admin only) 🔵 Sonnet

**Files:**
- Create: `src/services/journalService.js`
- Create: `src/hooks/useJournals.js`
- Create: `src/pages/accounting/JournalsPage.jsx`
- Create: `src/pages/accounting/JournalFormPage.jsx`

- [ ] **Step 1: Create journal service**

```js
export async function getJournals(startDate, endDate) {
  const { data, error } = await supabase
    .from('journals')
    .select('*, items:journal_items(*, coa:coa(code, name)), customer:customers(name), supplier:suppliers(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function saveManualJournal(journal, items) {
  if (!journal.id) {
    const { data: num } = await supabase.rpc('generate_number', { p_prefix: 'JRN' })
    journal.journal_number = num
  }

  journal.source = 'manual'
  let journalId = journal.id

  if (journalId) {
    await supabase.from('journal_items').delete().eq('journal_id', journalId)
    await supabase.from('journals').update(journal).eq('id', journalId)
  } else {
    const { data } = await supabase.from('journals').insert(journal).select().single()
    journalId = data.id
  }

  const rows = items.map(i => ({ ...i, journal_id: journalId }))
  await supabase.from('journal_items').insert(rows)
  return journalId
}

export async function postManualJournal(id) {
  const { error } = await supabase.rpc('post_manual_journal', { p_journal_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Create JournalsPage (list)**

Table: Nomor, Tanggal, Deskripsi, Source (auto/manual), Customer/Supplier, Posted. Filter by date range and source.

- [ ] **Step 3: Create JournalFormPage**

Admin-only form:
- Date, Description, Customer (optional), Supplier (optional)
- Journal items table: each row = COA (dropdown), Debit, Credit, Description
- Live validation: show total debit, total credit, difference
- "Post" button enabled only when balanced (debit = credit)
- Posted journals are read-only

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add manual journal entry (admin only)"
```

---

### Task 35: Ledger / Buku Besar 🔵 Sonnet

**Files:**
- Create: `src/services/reportService.js`
- Create: `src/hooks/useReports.js`
- Create: `src/pages/accounting/LedgerPage.jsx`

- [ ] **Step 1: Create report service**

```js
export async function getLedger(coaId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_ledger', {
    p_coa_id: coaId,
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw error
  return data
}

export async function getAccountBalances(startDate, endDate) {
  const { data, error } = await supabase.rpc('get_account_balances', {
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Create LedgerPage**

Select COA account (dropdown) + date range. Display table:
| Tanggal | No. Jurnal | Keterangan | Debit | Credit | Saldo |

Running balance from `get_ledger()` RPC.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add ledger (buku besar) page"
```

---

## Phase 10: Reports

### Task 36: Balance Sheet (Neraca) 🔵 Sonnet

**Files:**
- Create: `src/pages/reports/BalanceSheetPage.jsx`

- [ ] **Step 1: Create BalanceSheetPage**

Uses `getAccountBalances()`. Group by type:

```
ASET
  Aset Lancar
    1-11000 Kas ............. Rp xxx
    1-12000 Bank ............ Rp xxx
    ...
  Total Aset Lancar ......... Rp xxx
  Aset Tetap
    ...
  Total Aset Tetap .......... Rp xxx
TOTAL ASET .................. Rp xxx

KEWAJIBAN
  ...
TOTAL KEWAJIBAN ............. Rp xxx

MODAL
  ...
TOTAL MODAL ................. Rp xxx

TOTAL KEWAJIBAN + MODAL ..... Rp xxx
```

Validate: Total Aset = Total Kewajiban + Modal.

Date range picker at top. Add export buttons (Task 39).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add balance sheet report"
```

---

### Task 37: Income Statement (Laba Rugi) 🔵 Sonnet

**Files:**
- Create: `src/pages/reports/IncomeStatementPage.jsx`

- [ ] **Step 1: Create IncomeStatementPage**

Uses `getAccountBalances()`. Group:

```
PENDAPATAN
  4-11000 Pendapatan Penjualan ..... Rp xxx
  4-12000 Pendapatan Jasa .......... Rp xxx
TOTAL PENDAPATAN ................... Rp xxx

BEBAN
  5-11000 HPP ...................... Rp xxx
  5-12000 Beban Gaji .............. Rp xxx
  ...
TOTAL BEBAN ........................ Rp xxx

LABA (RUGI) BERSIH ................. Rp xxx
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add income statement report"
```

---

### Task 38: Cash Flow Statement (Arus Kas) 🔵 Sonnet

**Files:**
- Create: `src/pages/reports/CashFlowPage.jsx`

- [ ] **Step 1: Create CashFlowPage**

Simple cash flow based on journal movements to/from cash & bank accounts (COA codes `1-11000` and `1-12000`).

Uses ledger data for kas/bank accounts grouped by:
- **Aktivitas Operasi** — payments from customers (incoming), payments to suppliers (outgoing), expenses
- **Aktivitas Investasi** — asset purchases (placeholder for future)
- **Aktivitas Pendanaan** — modal (placeholder for future)

Show opening balance, movements, closing balance.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add cash flow statement report"
```

---

### Task 39: PDF & Excel export 🟢 Haiku

**Files:**
- Create: `src/utils/exportUtils.js`
- Modify: Balance Sheet, Income Statement, Cash Flow pages — add export buttons

- [ ] **Step 1: Create export utility**

`src/utils/exportUtils.js`:
```js
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'

export function exportToPDF({ title, headers, rows, filename }) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(title, 14, 20)
  doc.setFontSize(10)
  doc.text(new Date().toLocaleDateString('id-ID'), 14, 28)

  doc.autoTable({
    startY: 35,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] },
  })

  doc.save(`${filename}.pdf`)
}

export function exportToExcel({ title, headers, rows, filename }) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, title)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
```

- [ ] **Step 2: Add export buttons to report pages**

Each report page gets two buttons: "Export PDF" and "Export Excel". Transform the report data into headers + rows format and call the export functions.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add PDF and Excel export for reports"
```

---

## Phase 11: Polish & Final

### Task 40: Audit log triggers 🔵 Sonnet

**Files:**
- Create: `supabase/migrations/013_audit_triggers.sql`

- [ ] **Step 1: Create audit trigger function**

```sql
create or replace function audit_trigger()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into audit_logs (table_name, record_id, action, new_data, user_id)
      values (TG_TABLE_NAME, new.id, 'create', to_jsonb(new), auth.uid());
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into audit_logs (table_name, record_id, action, old_data, new_data, user_id)
      values (TG_TABLE_NAME, new.id, 'update', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif TG_OP = 'DELETE' then
    insert into audit_logs (table_name, record_id, action, old_data, user_id)
      values (TG_TABLE_NAME, old.id, 'delete', to_jsonb(old), auth.uid());
    return old;
  end if;
end;
$$ language plpgsql security definer;

-- Apply to key tables
create trigger audit_products after insert or update or delete on products
  for each row execute function audit_trigger();
create trigger audit_customers after insert or update or delete on customers
  for each row execute function audit_trigger();
create trigger audit_suppliers after insert or update or delete on suppliers
  for each row execute function audit_trigger();
create trigger audit_invoices after insert or update or delete on invoices
  for each row execute function audit_trigger();
create trigger audit_journals after insert or update or delete on journals
  for each row execute function audit_trigger();
create trigger audit_payments after insert or update or delete on payments
  for each row execute function audit_trigger();
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add audit log triggers for key tables"
```

---

### Task 41: User management page (admin only) 🟢 Haiku

**Files:**
- Create: `src/pages/settings/UsersPage.jsx`

- [ ] **Step 1: Create UsersPage**

Admin-only page. List all profiles. Allow admin to change user roles (admin/staff/viewer) and toggle is_active.

Note: Creating new users must go through Supabase Auth (invite via email or admin API). This page only manages existing user profiles and roles.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add user management page (admin only)"
```

---

### Task 42: Dashboard page 🟢 Haiku

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Create dashboard**

Simple summary cards:
- Total Kas & Bank (sum of account balances)
- Piutang Outstanding (invoices sales where status = posted/partial, sum of total - amount_paid)
- Hutang Outstanding (invoices purchase where status = posted/partial)
- Stok Items (count of active products with stock > 0)

No charts (future roadmap). Just 4 stat cards with Lucide icons.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add dashboard with summary cards"
```

---

### Task 43: Final build verification 🔵 Sonnet

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual smoke test**

Test the following flows end-to-end:
1. Login as admin
2. Create units, products with conversions, customer, supplier, COA accounts, kas/bank accounts
3. Create SO → Goods Delivery (post) → Invoice (post) → Payment
4. Create PO → Goods Receipt (post) → Invoice (post) → Payment
5. Create manual journal → Post
6. Transfer between accounts
7. Check reports: Balance Sheet (aset = kewajiban + modal), Income Statement, Cash Flow
8. Check stock page and stock card
9. Check ledger for an account
10. Export a report to PDF and Excel

- [ ] **Step 3: Final commit**

```bash
git commit -m "chore: final build verification"
```

---

## Task Summary by Model Tier

### 🟢 Haiku Tasks (15 tasks — boilerplate, CRUD, pattern-following)
| # | Task | Phase |
|---|---|---|
| 1 | Scaffold project | 1 |
| 12 | App layout, sidebar, routing | 3 |
| 13 | Shared UI components | 3 |
| 14 | Utility helpers | 3 |
| 15 | Units CRUD (pattern reference) | 4 |
| 17 | Customers CRUD | 4 |
| 18 | Suppliers CRUD | 4 |
| 20 | Cash/Bank Accounts CRUD | 4 |
| 22 | Stock card page | 5 |
| 28 | Purchase Order CRUD | 7 |
| 31 | Supplier payment | 7 |
| 39 | PDF & Excel export | 10 |
| 41 | User management page | 11 |
| 42 | Dashboard page | 11 |

### 🔵 Sonnet Tasks (29 tasks — business logic, SQL, integrations)
| # | Task | Phase |
|---|---|---|
| 2 | Migration: Profiles & auth | 2 |
| 3 | Migration: Master data tables | 2 |
| 4 | Migration: Sales & purchase tables | 2 |
| 5 | Migration: Invoice, payment, inventory, accounting | 2 |
| 6 | Migration: RLS policies | 2 |
| 7 | Migration: Helper functions | 2 |
| 8 | Migration: Posting functions (auto-journal & inventory) | 2 |
| 9 | Migration: Report views | 2 |
| 10 | Seed data: COA & units | 2 |
| 11 | Auth context & login page | 3 |
| 16 | Products CRUD with unit conversion | 4 |
| 19 | COA CRUD with hierarchy | 4 |
| 21 | Inventory service & stock page | 5 |
| 23 | Shared line items component | 6 |
| 24 | Sales Order CRUD | 6 |
| 25 | Goods Delivery with HPP | 6 |
| 26 | Sales Invoice with posting | 6 |
| 27 | Customer payment | 6 |
| 29 | Goods Receipt with inventory | 7 |
| 30 | Purchase Invoice with posting | 7 |
| 32 | Cash/Bank transfers | 8 |
| 33 | Bank reconciliation | 8 |
| 34 | Manual journal entry | 9 |
| 35 | Ledger / Buku Besar | 9 |
| 36 | Balance Sheet | 10 |
| 37 | Income Statement | 10 |
| 38 | Cash Flow Statement | 10 |
| 40 | Audit log triggers | 11 |
| 43 | Final build verification | 11 |

### Token Efficiency Estimate
- **Haiku (14 tasks):** ~30% of total tasks, handles ~45% of code volume (CRUD pages, UI components)
- **Sonnet (29 tasks):** ~70% of total tasks, handles ~55% of code volume (SQL, business logic, integrations)
- **Estimated savings vs all-Sonnet:** ~25-35% token cost reduction
