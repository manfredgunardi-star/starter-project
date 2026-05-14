# Master Data Tier 1 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah 4 tabel master (`product_categories`, `payment_terms`, `tax_codes`, `warehouses`) dengan migrasi backfill default non‑breaking, integrasi dropdown ke form transaksi existing.

**Architecture:** Tambah migrasi SQL `026_master_data_tier1.sql` yang membuat 4 tabel + seed default + backfill FK ke data lama. Buat 4 service file + 4 page CRUD mengikuti pattern `UnitsPage.jsx`. Update form SO/PO/SI/PI/GD/GR/Products untuk render dropdown baru dengan default value otomatis dari backfill.

**Tech Stack:** Supabase Postgres, React 19 + Ant Design 6, Vite, Playwright e2e.

**Spec:** [`apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md`](../specs/2026-05-14-master-data-retur-cancel-closing-design.md) §3

**Total estimasi:** 3-4 hari developer.

---

## File Structure

### New Files
| File | Responsibility | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql` | Schema + seed + RLS + backfill | Claude Opus |
| `apps/erp-acc/erp-app/src/services/productCategoryService.js` | CRUD `product_categories` | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/paymentTermService.js` | CRUD `payment_terms` | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/taxCodeService.js` | CRUD `tax_codes` + COA helper | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/warehouseService.js` | CRUD `warehouses` (with default-flag toggle) | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/master/ProductCategoriesPage.jsx` | List + form modal | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/master/PaymentTermsPage.jsx` | List + form modal | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/master/TaxCodesPage.jsx` | List + form modal + COA selector | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/master/WarehousesPage.jsx` | List + form modal + "Set as default" | Codex (Sonnet) |
| `apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js` | Smoke e2e CRUD 4 page | Codex (Sonnet) |

### Modified Files
| File | Change | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/src/services/masterDataService.js` | Join `product_categories` + `tax_codes` di `getProducts()` | Claude Opus |
| `apps/erp-acc/erp-app/src/pages/master/ProductsPage.jsx` | Tambah dropdown Category + default Tax Code | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx` | Dropdown Payment Term + Warehouse | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Dropdown Payment Term + auto due_date | Claude Opus (financial logic) |
| `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx` | Dropdown Warehouse | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Dropdown Payment Term + Warehouse | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx` | Dropdown Payment Term + auto due_date | Claude Opus (financial logic) |
| `apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx` | Dropdown Warehouse | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/App.jsx` | Routes baru ke 4 master page | Codex (Sonnet) |

---

## Task 1: SQL Migration — Schema, Seed, RLS, Backfill

**Suggested executor:** Claude Opus (schema reasoning + idempotency + multi‑step backfill)

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql`

- [ ] **Step 1: Tulis migration file dengan struktur lengkap**

Buat file `026_master_data_tier1.sql` dengan isi berikut:

```sql
-- ============================================================
-- Migration 026: Master Data Tier 1
-- product_categories, payment_terms, tax_codes, warehouses
-- + backfill default records to existing data (non-breaking)
-- ============================================================

-- 1) PRODUCT CATEGORIES
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references product_categories(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_product_categories_parent on product_categories(parent_id);

-- 2) PAYMENT TERMS
create table payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  net_days int not null default 0 check (net_days >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  discount_days int not null default 0 check (discount_days >= 0),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) TAX CODES
create table tax_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rate numeric(5,2) not null default 0 check (rate >= 0 and rate <= 100),
  is_inclusive boolean not null default false,
  output_account_id uuid references coa(id),
  input_account_id  uuid references coa(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) WAREHOUSES
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Hanya boleh ada 1 warehouse default
create unique index uq_warehouses_one_default on warehouses (is_default) where is_default = true;

-- 5) ALTER existing tables — tambah FK kolom (semua nullable untuk backward compat)
alter table products
  add column category_id uuid references product_categories(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table customers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table suppliers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table sales_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table purchase_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table goods_deliveries  add column warehouse_id uuid references warehouses(id);
alter table goods_receipts    add column warehouse_id uuid references warehouses(id);
alter table invoices          add column payment_term_id uuid references payment_terms(id);

alter table sales_order_items     add column tax_code_id uuid references tax_codes(id);
alter table purchase_order_items  add column tax_code_id uuid references tax_codes(id);
alter table invoice_items         add column tax_code_id uuid references tax_codes(id);

-- 6) SEED default records (idempotent dengan ON CONFLICT)
insert into product_categories (code, name) values ('UNCAT', 'Uncategorized')
  on conflict (code) do nothing;

insert into payment_terms (code, name, net_days) values
  ('CASH','Cash / COD',0),
  ('NET14','Net 14',14),
  ('NET30','Net 30',30),
  ('NET60','Net 60',60)
  on conflict (code) do nothing;

insert into tax_codes (code, name, rate) values
  ('PPN11','PPN 11%',11),
  ('PPN0','PPN 0%',0),
  ('NON','Non-PPN',0)
  on conflict (code) do nothing;

insert into warehouses (code, name, is_default) values ('WH-MAIN','Gudang Utama',true)
  on conflict (code) do nothing;

-- 7) BACKFILL FK ke default record
update products
  set category_id = (select id from product_categories where code='UNCAT')
  where category_id is null;

update products
  set default_tax_code_id = case
    when is_taxable then (select id from tax_codes where code='PPN11')
    else (select id from tax_codes where code='NON')
  end
  where default_tax_code_id is null;

update customers
  set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;

update suppliers
  set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;

update sales_orders
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update purchase_orders
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update goods_deliveries
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update goods_receipts
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

-- 8) RLS POLICIES (read for authenticated, manage for admin/staff)
alter table product_categories enable row level security;
alter table payment_terms      enable row level security;
alter table tax_codes          enable row level security;
alter table warehouses         enable row level security;

create policy "Authenticated can read active product_categories"
  on product_categories for select to authenticated using (is_active = true);
create policy "Admins and staff can manage product_categories"
  on product_categories for all to authenticated using (is_admin_or_staff());

create policy "Authenticated can read active payment_terms"
  on payment_terms for select to authenticated using (is_active = true);
create policy "Admins and staff can manage payment_terms"
  on payment_terms for all to authenticated using (is_admin_or_staff());

create policy "Authenticated can read active tax_codes"
  on tax_codes for select to authenticated using (is_active = true);
create policy "Admins and staff can manage tax_codes"
  on tax_codes for all to authenticated using (is_admin_or_staff());

create policy "Authenticated can read active warehouses"
  on warehouses for select to authenticated using (is_active = true);
create policy "Admins and staff can manage warehouses"
  on warehouses for all to authenticated using (is_admin_or_staff());

-- 9) Trigger updated_at (reuse existing function update_updated_at)
create trigger set_updated_at before update on product_categories
  for each row execute function update_updated_at();
create trigger set_updated_at before update on payment_terms
  for each row execute function update_updated_at();
create trigger set_updated_at before update on tax_codes
  for each row execute function update_updated_at();
create trigger set_updated_at before update on warehouses
  for each row execute function update_updated_at();

-- 10) Indexes untuk lookup form dropdown
create index idx_payment_terms_active on payment_terms(name) where is_active = true;
create index idx_tax_codes_active on tax_codes(code) where is_active = true;
create index idx_warehouses_active on warehouses(name) where is_active = true;
create index idx_product_categories_active on product_categories(name) where is_active = true;
```

- [ ] **Step 2: Apply migrasi ke Supabase development branch**

Run:
```powershell
# Di shell Supabase CLI dari root erp-app
cd apps/erp-acc/erp-app
npx supabase db push
```
Expected: Output `Applying migration 026_master_data_tier1.sql ... done`. Tidak ada error FK violation.

- [ ] **Step 3: Verifikasi schema via SQL**

Jalankan via Supabase SQL editor atau psql:
```sql
-- Cek 4 tabel terbuat
select table_name from information_schema.tables
  where table_name in ('product_categories','payment_terms','tax_codes','warehouses')
  order by table_name;
-- Expected: 4 rows

-- Cek seed data
select code, name from product_categories;  -- 1 row: UNCAT
select code, name, net_days from payment_terms order by net_days;  -- 4 rows
select code, name, rate from tax_codes;  -- 3 rows
select code, name, is_default from warehouses;  -- 1 row, is_default=true

-- Cek backfill: tidak boleh ada row null setelah backfill
select count(*) from products where category_id is null;       -- expected: 0
select count(*) from products where default_tax_code_id is null; -- expected: 0
select count(*) from customers where default_payment_term_id is null;  -- expected: 0
select count(*) from suppliers where default_payment_term_id is null;  -- expected: 0
select count(*) from sales_orders where warehouse_id is null;  -- expected: 0
select count(*) from purchase_orders where warehouse_id is null;  -- expected: 0
select count(*) from goods_deliveries where warehouse_id is null;  -- expected: 0
select count(*) from goods_receipts where warehouse_id is null;  -- expected: 0

-- Cek RLS aktif
select relname, relrowsecurity from pg_class
  where relname in ('product_categories','payment_terms','tax_codes','warehouses');
-- Expected: relrowsecurity = t untuk semua
```

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql
git commit -m "feat(erp-acc): add master data tier 1 schema with backfill defaults"
```

---

## Task 2: Service Layer — productCategoryService.js

**Suggested executor:** Codex (Sonnet) — repetitif, follow existing pattern.

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/productCategoryService.js`

- [ ] **Step 1: Buat service dengan CRUD pattern dari `masterDataService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getProductCategories() {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function createProductCategory(category) {
  const { data, error } = await supabase
    .from('product_categories')
    .insert({ code: category.code, name: category.name, parent_id: category.parent_id || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProductCategory(id, category) {
  const { data, error } = await supabase
    .from('product_categories')
    .update({ code: category.code, name: category.name, parent_id: category.parent_id || null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProductCategory(id) {
  const { error } = await supabase
    .from('product_categories')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Build verify**

Run: `cd apps/erp-acc/erp-app; npm run build`
Expected: Build success, no errors.

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/productCategoryService.js
git commit -m "feat(erp-acc): add productCategoryService"
```

---

## Task 3: Service Layer — paymentTermService.js

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/paymentTermService.js`

- [ ] **Step 1: Buat service**

```js
import { supabase } from '../lib/supabase'

export async function getPaymentTerms() {
  const { data, error } = await supabase
    .from('payment_terms')
    .select('*')
    .eq('is_active', true)
    .order('net_days')
  if (error) throw error
  return data
}

export async function createPaymentTerm(term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .insert({
      code: term.code,
      name: term.name,
      net_days: term.net_days || 0,
      discount_percent: term.discount_percent || 0,
      discount_days: term.discount_days || 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePaymentTerm(id, term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .update({
      code: term.code,
      name: term.name,
      net_days: term.net_days || 0,
      discount_percent: term.discount_percent || 0,
      discount_days: term.discount_days || 0,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePaymentTerm(id) {
  const { error } = await supabase
    .from('payment_terms')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/paymentTermService.js
git commit -m "feat(erp-acc): add paymentTermService"
```

---

## Task 4: Service Layer — taxCodeService.js

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/taxCodeService.js`

- [ ] **Step 1: Buat service dengan COA join**

```js
import { supabase } from '../lib/supabase'

export async function getTaxCodes() {
  const { data, error } = await supabase
    .from('tax_codes')
    .select(`
      *,
      output_account:coa!tax_codes_output_account_id_fkey(id, code, name),
      input_account:coa!tax_codes_input_account_id_fkey(id, code, name)
    `)
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

export async function createTaxCode(tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .insert({
      code: tc.code,
      name: tc.name,
      rate: tc.rate || 0,
      is_inclusive: tc.is_inclusive || false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaxCode(id, tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .update({
      code: tc.code,
      name: tc.name,
      rate: tc.rate || 0,
      is_inclusive: tc.is_inclusive || false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTaxCode(id) {
  const { error } = await supabase
    .from('tax_codes')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/taxCodeService.js
git commit -m "feat(erp-acc): add taxCodeService with COA joins"
```

---

## Task 5: Service Layer — warehouseService.js

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/warehouseService.js`

- [ ] **Step 1: Buat service dengan toggle default warehouse**

```js
import { supabase } from '../lib/supabase'

export async function getWarehouses() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getDefaultWarehouse() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createWarehouse(w) {
  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      code: w.code,
      name: w.name,
      address: w.address || null,
      is_default: w.is_default || false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWarehouse(id, w) {
  const { data, error } = await supabase
    .from('warehouses')
    .update({
      code: w.code,
      name: w.name,
      address: w.address || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Atomic switch: clear all is_default, then set this one. Two-step is OK karena
// unique partial index uq_warehouses_one_default akan reject duplicate is_default=true.
export async function setDefaultWarehouse(id) {
  // Clear current default
  const { error: e1 } = await supabase
    .from('warehouses')
    .update({ is_default: false })
    .eq('is_default', true)
    .neq('id', id)
  if (e1) throw e1
  // Set new default
  const { data, error } = await supabase
    .from('warehouses')
    .update({ is_default: true })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWarehouse(id) {
  // Tidak boleh hapus warehouse default
  const w = await supabase.from('warehouses').select('is_default').eq('id', id).single()
  if (w.data?.is_default) throw new Error('Tidak boleh menghapus gudang default. Set gudang lain sebagai default dulu.')
  const { error } = await supabase
    .from('warehouses')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/warehouseService.js
git commit -m "feat(erp-acc): add warehouseService with default warehouse toggle"
```

---

## Task 6: Page — ProductCategoriesPage.jsx

**Suggested executor:** Codex (Sonnet) — pattern repetitif dari `UnitsPage.jsx`.

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/master/ProductCategoriesPage.jsx`
- Read first as reference: `apps/erp-acc/erp-app/src/pages/master/UnitsPage.jsx`

- [ ] **Step 1: Baca reference page**

Read `UnitsPage.jsx` untuk pattern Ant Design Table + Modal Form.

- [ ] **Step 2: Buat page mengikuti pattern UnitsPage**

```jsx
import { useEffect, useState } from 'react'
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  getProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
} from '../../services/productCategoryService'

export default function ProductCategoriesPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  async function load() {
    setLoading(true)
    try { setRows(await getProductCategories()) }
    catch (e) { message.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); form.resetFields(); setModalOpen(true)
  }
  function openEdit(row) {
    setEditing(row); form.setFieldsValue(row); setModalOpen(true)
  }
  async function onSave() {
    try {
      const v = await form.validateFields()
      if (editing) await updateProductCategory(editing.id, v)
      else await createProductCategory(v)
      message.success('Tersimpan'); setModalOpen(false); load()
    } catch (e) { if (e?.errorFields) return; message.error(e.message) }
  }
  async function onDelete(id) {
    try { await deleteProductCategory(id); message.success('Terhapus'); load() }
    catch (e) { message.error(e.message) }
  }

  return (
    <Card title="Kategori Produk" extra={
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tambah</Button>
    }>
      <Table rowKey="id" loading={loading} dataSource={rows} columns={[
        { title: 'Kode', dataIndex: 'code', width: 120 },
        { title: 'Nama', dataIndex: 'name' },
        { title: 'Parent', dataIndex: 'parent_id', render: (v) => rows.find(r => r.id === v)?.name || '-' },
        { title: 'Aksi', width: 140, render: (_, row) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
            <Popconfirm title="Hapus?" onConfirm={() => onDelete(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        )},
      ]} />
      <Modal open={modalOpen} title={editing ? 'Edit Kategori' : 'Tambah Kategori'}
             onOk={onSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Kode" rules={[{ required: true }]}>
            <Input placeholder="MISAL: BAHAN-BAKU" />
          </Form.Item>
          <Form.Item name="name" label="Nama" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parent_id" label="Parent (opsional)">
            <Select allowClear options={rows.filter(r => r.id !== editing?.id).map(r => ({ value: r.id, label: r.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
```

- [ ] **Step 3: Build verify**

Run: `cd apps/erp-acc/erp-app; npm run build`
Expected: Build success.

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/master/ProductCategoriesPage.jsx
git commit -m "feat(erp-acc): add ProductCategoriesPage CRUD"
```

---

## Task 7: Page — PaymentTermsPage.jsx

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/master/PaymentTermsPage.jsx`

- [ ] **Step 1: Buat page (sama pattern Task 6)**

Field form: `code`, `name`, `net_days` (InputNumber), `discount_percent` (InputNumber), `discount_days` (InputNumber).

Tabel kolom: Kode, Nama, Net Days, Diskon (%), Diskon Hari, Aksi.

Code skeleton (replicate Task 6 pattern, swap fields):
```jsx
import { useEffect, useState } from 'react'
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  getPaymentTerms, createPaymentTerm, updatePaymentTerm, deletePaymentTerm
} from '../../services/paymentTermService'

export default function PaymentTermsPage() {
  // ... same load/openCreate/openEdit/onSave/onDelete pattern as Task 6
  // Form fields:
  //   <Form.Item name="code" label="Kode" rules={[{required:true}]}><Input/></Form.Item>
  //   <Form.Item name="name" label="Nama" rules={[{required:true}]}><Input/></Form.Item>
  //   <Form.Item name="net_days" label="Net Days" rules={[{required:true}]}><InputNumber min={0} /></Form.Item>
  //   <Form.Item name="discount_percent" label="Diskon (%)"><InputNumber min={0} max={100} /></Form.Item>
  //   <Form.Item name="discount_days" label="Diskon Hari"><InputNumber min={0} /></Form.Item>
  // Table columns: Kode, Nama, Net Days, Diskon (%), Diskon Hari, Aksi
}
```

- [ ] **Step 2: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/pages/master/PaymentTermsPage.jsx
git commit -m "feat(erp-acc): add PaymentTermsPage CRUD"
```

---

## Task 8: Page — TaxCodesPage.jsx

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/master/TaxCodesPage.jsx`

- [ ] **Step 1: Buat page dengan COA selector**

Pattern sama Task 6, plus dropdown COA untuk `output_account_id` dan `input_account_id`. Reuse `getCOA()` dari `accountingService.js` (atau dari `masterDataService.js` jika di sana — periksa di repo).

```jsx
import { useEffect, useState } from 'react'
import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, Switch, message, Popconfirm, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { getTaxCodes, createTaxCode, updateTaxCode, deleteTaxCode } from '../../services/taxCodeService'
import { getCOAList } from '../../services/masterDataService'  // verify function name; fallback to getAccounts() jika ada

export default function TaxCodesPage() {
  const [rows, setRows] = useState([])
  const [coa, setCoa] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  async function load() {
    setLoading(true)
    try {
      const [tc, ac] = await Promise.all([getTaxCodes(), getCOAList()])
      setRows(tc); setCoa(ac)
    } catch (e) { message.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // openCreate, openEdit, onSave, onDelete sama Task 6

  return (
    <Card title="Kode Pajak" extra={<Button type="primary" icon={<PlusOutlined/>} onClick={openCreate}>Tambah</Button>}>
      <Table rowKey="id" loading={loading} dataSource={rows} columns={[
        { title: 'Kode', dataIndex: 'code', width: 100 },
        { title: 'Nama', dataIndex: 'name' },
        { title: 'Tarif (%)', dataIndex: 'rate', width: 100 },
        { title: 'Inclusive', dataIndex: 'is_inclusive', width: 100, render: v => v ? 'Ya' : 'Tidak' },
        { title: 'Akun PPN Keluaran', render: (_, r) => r.output_account?.code || '-' },
        { title: 'Akun PPN Masukan',  render: (_, r) => r.input_account?.code  || '-' },
        { title: 'Aksi', width: 140, render: (_, row) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
            <Popconfirm title="Hapus?" onConfirm={() => onDelete(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        )},
      ]} />
      <Modal open={modalOpen} title={editing ? 'Edit Tax Code' : 'Tambah Tax Code'}
             onOk={onSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Kode" rules={[{ required: true }]}><Input/></Form.Item>
          <Form.Item name="name" label="Nama" rules={[{ required: true }]}><Input/></Form.Item>
          <Form.Item name="rate" label="Tarif (%)" rules={[{ required: true }]}><InputNumber min={0} max={100}/></Form.Item>
          <Form.Item name="is_inclusive" label="Harga sudah include PPN?" valuePropName="checked"><Switch/></Form.Item>
          <Form.Item name="output_account_id" label="Akun PPN Keluaran (Sales)">
            <Select allowClear showSearch optionFilterProp="label"
              options={coa.filter(c => c.type==='liability').map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))} />
          </Form.Item>
          <Form.Item name="input_account_id" label="Akun PPN Masukan (Purchase)">
            <Select allowClear showSearch optionFilterProp="label"
              options={coa.filter(c => c.type==='asset').map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
```

> **Catatan untuk implementer:** Verify nama function untuk get COA. Jika `getCOAList` tidak ada, cek di `masterDataService.js` apakah ada `getAccounts()` atau function lain yg return list COA.

- [ ] **Step 2: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/pages/master/TaxCodesPage.jsx
git commit -m "feat(erp-acc): add TaxCodesPage with COA selector"
```

---

## Task 9: Page — WarehousesPage.jsx

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/master/WarehousesPage.jsx`

- [ ] **Step 1: Buat page dengan tombol "Set as Default"**

Pattern sama Task 6, plus button "Jadikan Default" di kolom Aksi yang call `setDefaultWarehouse(id)`.

Field form: `code`, `name`, `address` (TextArea).

Tabel kolom: Kode, Nama, Alamat, Default (Tag/badge), Aksi (Edit, Set Default, Delete).

```jsx
// Skeleton — fill in dengan pattern Task 6
import { setDefaultWarehouse } from '../../services/warehouseService'
// ...
async function onSetDefault(id) {
  try { await setDefaultWarehouse(id); message.success('Gudang default diubah'); load() }
  catch (e) { message.error(e.message) }
}
// Tombol di kolom Aksi:
//   <Button size="small" disabled={row.is_default} onClick={() => onSetDefault(row.id)}>Set Default</Button>
// Tag default:
//   <Tag color={row.is_default ? 'green' : 'default'}>{row.is_default ? 'Default' : '-'}</Tag>
```

- [ ] **Step 2: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/pages/master/WarehousesPage.jsx
git commit -m "feat(erp-acc): add WarehousesPage with default toggle"
```

---

## Task 10: Routes — App.jsx

**Suggested executor:** Codex (Sonnet) — straightforward.

**Files:**
- Modify: `apps/erp-acc/erp-app/src/App.jsx` (add 4 routes + menu items)

- [ ] **Step 1: Cari section routes yang berisi `<Route path="/master/units"...`**

```bash
grep -n "master/units" apps/erp-acc/erp-app/src/App.jsx
```

- [ ] **Step 2: Tambahkan 4 route baru di sebelah route units (mengikuti pattern existing)**

```jsx
<Route path="/master/categories" element={<RoleGuard roles={['admin','staff']}><ProductCategoriesPage/></RoleGuard>} />
<Route path="/master/payment-terms" element={<RoleGuard roles={['admin','staff']}><PaymentTermsPage/></RoleGuard>} />
<Route path="/master/tax-codes" element={<RoleGuard roles={['admin','staff']}><TaxCodesPage/></RoleGuard>} />
<Route path="/master/warehouses" element={<RoleGuard roles={['admin','staff']}><WarehousesPage/></RoleGuard>} />
```

Tambah import:
```jsx
import ProductCategoriesPage from './pages/master/ProductCategoriesPage'
import PaymentTermsPage from './pages/master/PaymentTermsPage'
import TaxCodesPage from './pages/master/TaxCodesPage'
import WarehousesPage from './pages/master/WarehousesPage'
```

- [ ] **Step 3: Tambahkan menu items di sidebar Master**

Cari menu Master sidebar (cek `src/components/layout/`). Tambah 4 item dengan label & icon (Lucide React — pakai `Tag`, `CreditCard`, `Percent`, `Warehouse`).

- [ ] **Step 4: Build verify**
```bash
cd apps/erp-acc/erp-app; npm run build
```

- [ ] **Step 5: Commit**
```bash
git add apps/erp-acc/erp-app/src/App.jsx apps/erp-acc/erp-app/src/components/layout/
git commit -m "feat(erp-acc): wire master data tier 1 pages into routes & menu"
```

---

## Task 11: Update ProductsPage — Add Category + Tax Code Dropdown

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/master/ProductsPage.jsx`

- [ ] **Step 1: Read current ProductsPage**

Identifikasi lokasi form modal create/edit product.

- [ ] **Step 2: Tambah load categories + tax codes**

```jsx
import { getProductCategories } from '../../services/productCategoryService'
import { getTaxCodes } from '../../services/taxCodeService'

const [categories, setCategories] = useState([])
const [taxCodes, setTaxCodes] = useState([])
useEffect(() => {
  Promise.all([getProductCategories(), getTaxCodes()])
    .then(([c, t]) => { setCategories(c); setTaxCodes(t) })
    .catch(e => message.error(e.message))
}, [])
```

- [ ] **Step 3: Tambah Form.Item baru di modal**

Tepat setelah field `name`/`category` lama:
```jsx
<Form.Item name="category_id" label="Kategori (master)">
  <Select allowClear showSearch optionFilterProp="label"
    options={categories.map(c => ({ value: c.id, label: c.name }))} />
</Form.Item>
<Form.Item name="default_tax_code_id" label="Default Tax Code">
  <Select allowClear showSearch optionFilterProp="label"
    options={taxCodes.map(t => ({ value: t.id, label: `${t.code} (${t.rate}%)` }))} />
</Form.Item>
```

- [ ] **Step 4: Tambah kolom di tabel (opsional)**

```jsx
{ title: 'Kategori', dataIndex: ['category','name'], render: (v,r) => v || r.category || '-' },
```

- [ ] **Step 5: Build + smoke test**
```bash
cd apps/erp-acc/erp-app; npm run build
npm run dev
# Buka /master/products, edit produk, cek dropdown muncul dengan default backfill
```

- [ ] **Step 6: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/master/ProductsPage.jsx
git commit -m "feat(erp-acc): add category & tax code dropdowns to ProductsPage"
```

---

## Task 12: Update SalesOrderFormPage — Payment Term + Warehouse

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx`

- [ ] **Step 1: Read & identify form structure**

```bash
grep -n "Form.Item" apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx | head
```

- [ ] **Step 2: Load payment terms + warehouses + default warehouse**

```jsx
import { getPaymentTerms } from '../../services/paymentTermService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'

const [paymentTerms, setPaymentTerms] = useState([])
const [warehouses, setWarehouses] = useState([])

useEffect(() => {
  Promise.all([getPaymentTerms(), getWarehouses()])
    .then(([pt, wh]) => { setPaymentTerms(pt); setWarehouses(wh) })
    .catch(e => message.error(e.message))
}, [])

// Saat form mount untuk SO baru (bukan edit), prefill warehouse dari customer.default_warehouse
// atau global default warehouse:
async function applyDefaults() {
  if (editing?.id) return  // edit mode: jangan timpa value yang sudah disimpan
  const def = await getDefaultWarehouse()
  if (def) form.setFieldValue('warehouse_id', def.id)
}
useEffect(() => { applyDefaults() }, [editing?.id])
```

- [ ] **Step 3: Tambah dua Form.Item di header form**

```jsx
<Form.Item name="payment_term_id" label="Syarat Pembayaran">
  <Select allowClear showSearch optionFilterProp="label"
    options={paymentTerms.map(p => ({ value: p.id, label: `${p.name} (Net ${p.net_days})` }))} />
</Form.Item>
<Form.Item name="warehouse_id" label="Gudang">
  <Select showSearch optionFilterProp="label"
    options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
</Form.Item>
```

- [ ] **Step 4: Pastikan field dikirim saat save**

Cek payload yang dikirim ke `salesService.createSalesOrder` / `updateSalesOrder` — pastikan include `payment_term_id` dan `warehouse_id`. Jika service layer hard-coded, update juga.

- [ ] **Step 5: Build + smoke**
```bash
cd apps/erp-acc/erp-app; npm run build
```

- [ ] **Step 6: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(erp-acc): add payment_term & warehouse selectors to SO form"
```

---

## Task 13: Update PurchaseOrderFormPage — Payment Term + Warehouse

**Suggested executor:** Codex (Sonnet)

Mirror Task 12 untuk `PurchaseOrderFormPage.jsx` dan `purchaseService.js`. Field sama: `payment_term_id`, `warehouse_id`.

- [ ] **Step 1-6:** Identik dengan Task 12, file `PurchaseOrderFormPage.jsx`.

- [ ] **Step 7: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "feat(erp-acc): add payment_term & warehouse selectors to PO form"
```

---

## Task 14: Update SalesInvoiceFormPage — Payment Term + Auto Due Date

**Suggested executor:** Claude Opus — financial logic (auto due_date affects AR ageing).

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`

- [ ] **Step 1: Tambah load + dropdown payment_term (sama pattern Task 12)**

- [ ] **Step 2: Auto-compute due_date saat payment_term di‑select**

```jsx
import dayjs from 'dayjs'

async function onPaymentTermChange(termId) {
  const term = paymentTerms.find(p => p.id === termId)
  if (!term) return
  const date = form.getFieldValue('date')
  if (!date) return
  const due = dayjs(date).add(term.net_days, 'day')
  form.setFieldValue('due_date', due)
}

// Pasang di Select:
//   <Select onChange={onPaymentTermChange} ...>
```

Juga bind ke perubahan `date`: kalau user ganti tanggal, due_date di‑recompute.

- [ ] **Step 3: Build + smoke test**

Buat invoice, pilih "Net 30", date hari ini → due_date harus = hari ini + 30.

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx
git commit -m "feat(erp-acc): add payment_term selector with auto due_date to SI form"
```

---

## Task 15: Update PurchaseInvoiceFormPage — Payment Term + Auto Due Date

**Suggested executor:** Claude Opus — financial logic (AP ageing).

Mirror Task 14 untuk `PurchaseInvoiceFormPage.jsx`.

- [ ] **Step 1-3:** Identik dengan Task 14.
- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx
git commit -m "feat(erp-acc): add payment_term selector with auto due_date to PI form"
```

---

## Task 16: Update GoodsDeliveryFormPage — Warehouse Dropdown

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx`

- [ ] **Step 1: Tambah dropdown warehouse + default load**

Sama pattern Task 12 minus payment_term. Tambah logic: jika `sales_order_id` di‑set, prefill warehouse dari SO yang dipilih (read‑only setelah pilih SO).

```jsx
async function onSOChange(soId) {
  const so = await fetchSalesOrder(soId)  // existing function
  if (so?.warehouse_id) form.setFieldValue('warehouse_id', so.warehouse_id)
}
```

- [ ] **Step 2: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx
git commit -m "feat(erp-acc): add warehouse selector to GD form"
```

---

## Task 17: Update GoodsReceiptFormPage — Warehouse Dropdown

**Suggested executor:** Codex (Sonnet)

Mirror Task 16 untuk `GoodsReceiptFormPage.jsx`.

- [ ] **Step 1-2: Sama Task 16.**
- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx
git commit -m "feat(erp-acc): add warehouse selector to GR form"
```

---

## Task 18: Update masterDataService.getProducts — Join Categories & Tax Codes

**Suggested executor:** Claude Opus — schema join correctness.

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/masterDataService.js` line ~46-60 (function `getProducts()`)

- [ ] **Step 1: Update SELECT untuk join 2 tabel baru**

```js
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      base_unit:units!products_base_unit_id_fkey(id, name),
      category:product_categories(id, code, name),
      default_tax_code:tax_codes(id, code, name, rate)
    `)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Build + smoke**

Buka /master/products → tabel harus tampil category.name (bukan id).

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/services/masterDataService.js
git commit -m "feat(erp-acc): join product_categories & tax_codes in getProducts"
```

---

## Task 19: Playwright Smoke Test — master-data-tier1.spec.js

**Suggested executor:** Codex (Sonnet) — pattern dari spec existing.

**Files:**
- Create: `apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js`
- Read first as reference: pilih file `.spec.js` apapun yang ada di `tests/playwright/` (e.g., AR/AP aging spec) untuk pattern login + storage state.

- [ ] **Step 1: Buat spec untuk CRUD 4 page**

```js
import { test, expect } from '@playwright/test'

test.describe('Master Data Tier 1 — CRUD', () => {

  test('Product Categories: create + edit + delete', async ({ page }) => {
    await page.goto('/master/categories')
    await expect(page.getByText('Kategori Produk')).toBeVisible()
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('TEST-CAT')
    await page.getByLabel('Nama').fill('Test Category')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible()
    await expect(page.getByText('Test Category')).toBeVisible()
    // Edit + Delete optional
  })

  test('Payment Terms: create Net 45', async ({ page }) => {
    await page.goto('/master/payment-terms')
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('NET45')
    await page.getByLabel('Nama').fill('Net 45')
    await page.getByLabel('Net Days').fill('45')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Net 45')).toBeVisible()
  })

  test('Tax Codes: visible default seeds', async ({ page }) => {
    await page.goto('/master/tax-codes')
    await expect(page.getByText('PPN11')).toBeVisible()
    await expect(page.getByText('PPN0')).toBeVisible()
    await expect(page.getByText('NON')).toBeVisible()
  })

  test('Warehouses: default warehouse exists', async ({ page }) => {
    await page.goto('/master/warehouses')
    await expect(page.getByText('Gudang Utama')).toBeVisible()
    await expect(page.getByText('Default')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run test**

```bash
cd apps/erp-acc/erp-app
npx playwright test tests/playwright/master-data-tier1.spec.js
```
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js
git commit -m "test(erp-acc): add master data tier 1 e2e smoke"
```

---

## Task 20: Final Build + Manual Verification

**Suggested executor:** Claude Opus (verification skill).

- [ ] **Step 1: Full build**
```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: Build success, bundle size masih reasonable.

- [ ] **Step 2: Lint**
```bash
npm run lint
```
Expected: 0 errors (warnings OK).

- [ ] **Step 3: Manual smoke checklist**

Open `npm run dev`, verifikasi:
- [ ] Buka /master/categories — list 1 row (Uncategorized), tambah baru OK.
- [ ] Buka /master/payment-terms — 4 rows seed (CASH, NET14, NET30, NET60).
- [ ] Buka /master/tax-codes — 3 rows seed.
- [ ] Buka /master/warehouses — 1 row "Gudang Utama" dengan tag Default.
- [ ] Buka /master/products → edit produk lama → field Kategori = "Uncategorized", default Tax Code terisi.
- [ ] Buka SO baru → dropdown Payment Term + Warehouse muncul dengan default value.
- [ ] Buat SI baru → pilih Net 30 → due_date = date + 30 hari.
- [ ] Posting GD/GR/Invoice tetap jalan tanpa error (regression check).

- [ ] **Step 4: PR ready**

Pastikan semua commit ada di branch saat ini. Buat ringkasan PR description di handover note (untuk Codex/manusia yang merge).

---

## Self-Review Notes

- **Spec coverage:** Task 1 = §3.2 + §3.3, Tasks 2-5 = §3.4, Tasks 6-10 = §3.5, Tasks 11-17 = §3.5 (form integration), Task 18 = §3.4 join, Task 19 = §3.6, Task 20 = build verification.
- **Anti‑patterns:** Tidak menghapus field `products.category` (text), `products.is_taxable`, `products.tax_rate` di phase ini — tetap kompatibel.
- **Dependency catatan:** Task 11-17 boleh paralel setelah Task 1-5 selesai. Task 18 sebaiknya sebelum Task 11.

---

**End of Phase 1 Plan.**
