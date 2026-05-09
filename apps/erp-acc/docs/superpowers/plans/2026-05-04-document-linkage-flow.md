# Document Linkage Flow (PO→GR→PI & SO→GD→SI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan badge "tidak ter-link" di list pages dan tombol shortcut "Buat dari dokumen sumber" di detail pages, sehingga alur PO→GR→PI dan SO→GD→SI terlihat jelas tanpa memblokir user.

**Architecture:** Tiga lapisan — (1) 1 migrasi DB menambah kolom `goods_delivery_id` di `invoices` dan mengaktifkan `goods_receipt_id` di RPC, (2) service layer JS expose field baru ke frontend, (3) 4 list pages mendapat badge dan 4 detail pages mendapat shortcut button dengan auto-populate logic.

**Tech Stack:** React 18 + Ant Design, Supabase (PostgreSQL + RPC), Vite, React Router v6, Lucide React icons

**Spec:** `ERP-ACC/docs/superpowers/specs/2026-05-04-document-linkage-flow-design.md`

---

## File Map

| File | Aksi |
|---|---|
| `ERP-ACC/erp-app/supabase/migrations/023_document_linkage.sql` | CREATE |
| `ERP-ACC/erp-app/src/services/purchaseService.js` | MODIFY |
| `ERP-ACC/erp-app/src/services/salesService.js` | MODIFY |
| `ERP-ACC/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | MODIFY — shortcut button |
| `ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx` | MODIFY — from_po auto-populate + shortcut button |
| `ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx` | MODIFY — goods_receipt_id state + from_gr auto-populate |
| `ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx` | MODIFY — badge Tanpa PO |
| `ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx` | MODIFY — badge Tanpa GR |
| `ERP-ACC/erp-app/src/pages/sales/SalesOrderFormPage.jsx` | MODIFY — shortcut button |
| `ERP-ACC/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx` | MODIFY — from_so auto-populate + shortcut button |
| `ERP-ACC/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | MODIFY — goods_delivery_id state + from_gd auto-populate |
| `ERP-ACC/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx` | MODIFY — badge Tanpa SO |
| `ERP-ACC/erp-app/src/pages/sales/SalesInvoicesPage.jsx` | MODIFY — badge Tanpa GD |

---

## Task 1: DB Migration 023 — Kolom Baru + RPC Updates

> **Model:** sonnet | **Effort:** high (~20 menit)
>
> Buat file migrasi baru. Tambah kolom `goods_delivery_id` ke tabel `invoices`. Ganti dua RPC function (`save_purchase_invoice`, `save_sales_invoice`) agar menerima dan menyimpan field linkage baru. Tidak ada perubahan pada data existing — semua nullable.

**Files:**
- Create: `ERP-ACC/erp-app/supabase/migrations/023_document_linkage.sql`

- [ ] **Step 1.1 — Buat file migrasi dengan konten lengkap**

```sql
-- ============================================================
-- Migration 023: Document Linkage
-- Adds goods_delivery_id to invoices (link SI→GD).
-- Activates goods_receipt_id in save_purchase_invoice.
-- Adds goods_delivery_id to save_sales_invoice.
-- ============================================================

-- 1. New column: goods_delivery_id on invoices
alter table invoices
  add column goods_delivery_id uuid references goods_deliveries(id);

create index idx_invoices_gd on invoices(goods_delivery_id);

-- 2. save_purchase_invoice: activate goods_receipt_id (column exists since 005, never set)
create or replace function save_purchase_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('PINV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, supplier_id,
      purchase_order_id, goods_receipt_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'purchase',
      (p_invoice->>'supplier_id')::uuid,
      nullif(p_invoice->>'purchase_order_id', '')::uuid,
      nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date              = (p_invoice->>'date')::date,
           due_date          = nullif(p_invoice->>'due_date', '')::date,
           supplier_id       = (p_invoice->>'supplier_id')::uuid,
           purchase_order_id = nullif(p_invoice->>'purchase_order_id', '')::uuid,
           goods_receipt_id  = nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'purchase';
    if not found then
      raise exception 'purchase invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_inv_id;
end $$;

-- 3. save_sales_invoice: add goods_delivery_id field
create or replace function save_sales_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id',    '')::uuid,
      nullif(p_invoice->>'goods_delivery_id', '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date              = (p_invoice->>'date')::date,
           due_date          = nullif(p_invoice->>'due_date', '')::date,
           customer_id       = (p_invoice->>'customer_id')::uuid,
           sales_order_id    = nullif(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id = nullif(p_invoice->>'goods_delivery_id', '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'sales';
    if not found then
      raise exception 'sales invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_inv_id;
end $$;
```

- [ ] **Step 1.2 — Apply migration ke Supabase**

```bash
# Di Supabase Dashboard → SQL Editor, paste dan run isi file 023_document_linkage.sql
# Atau via Supabase CLI:
cd ERP-ACC/erp-app
npx supabase db push
```

Expected: tidak ada error. Pesan sukses.

- [ ] **Step 1.3 — Verifikasi schema**

Di Supabase Dashboard → Table Editor → `invoices`:
- Kolom `goods_delivery_id` (uuid, nullable) harus ada
- Kolom `goods_receipt_id` (uuid, nullable) sudah ada sejak migration 005

- [ ] **Step 1.4 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/supabase/migrations/023_document_linkage.sql
git commit -m "feat(db): add goods_delivery_id to invoices, activate goods_receipt_id in RPC"
```

---

## Task 2: Service Layer — Expose Field Baru di purchaseService dan salesService

> **Model:** haiku | **Effort:** low (~10 menit)
>
> Update 4 fungsi: `getPurchaseInvoices` (tambah `goods_receipt_id` ke SELECT), `savePurchaseInvoice` (kirim `goods_receipt_id` ke RPC), `getSalesInvoices` (tambah `goods_delivery_id` ke SELECT), `saveSalesInvoice` (kirim `goods_delivery_id` ke RPC).

**Files:**
- Modify: `ERP-ACC/erp-app/src/services/purchaseService.js`
- Modify: `ERP-ACC/erp-app/src/services/salesService.js`

- [ ] **Step 2.1 — Update `getPurchaseInvoices` di purchaseService.js**

Ganti baris select dari:
```js
.select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number)')
```
Menjadi:
```js
.select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number), goods_receipt_id')
```

- [ ] **Step 2.2 — Update `savePurchaseInvoice` di purchaseService.js**

Ganti objek `p_invoice` di dalam `supabase.rpc('save_purchase_invoice', {...})` dari:
```js
p_invoice: {
  id:                invoice.id                || null,
  date:              invoice.date,
  due_date:          invoice.due_date          || null,
  supplier_id:       invoice.supplier_id,
  purchase_order_id: invoice.purchase_order_id || null,
  status:            invoice.status            || 'draft',
  notes:             invoice.notes             || null,
},
```
Menjadi:
```js
p_invoice: {
  id:                invoice.id                || null,
  date:              invoice.date,
  due_date:          invoice.due_date          || null,
  supplier_id:       invoice.supplier_id,
  purchase_order_id: invoice.purchase_order_id || null,
  goods_receipt_id:  invoice.goods_receipt_id  || null,
  status:            invoice.status            || 'draft',
  notes:             invoice.notes             || null,
},
```

- [ ] **Step 2.3 — Update `getSalesInvoices` di salesService.js**

Ganti baris select dari:
```js
.select('*, customer:customers(name), sales_order:sales_orders(so_number)')
```
Menjadi:
```js
.select('*, customer:customers(name), sales_order:sales_orders(so_number), goods_delivery_id')
```

- [ ] **Step 2.4 — Update `saveSalesInvoice` di salesService.js**

Ganti objek `p_invoice` di dalam `supabase.rpc('save_sales_invoice', {...})` dari:
```js
p_invoice: {
  id:             invoice.id             || null,
  date:           invoice.date,
  due_date:       invoice.due_date       || null,
  customer_id:    invoice.customer_id,
  sales_order_id: invoice.sales_order_id || null,
  status:         invoice.status         || 'draft',
  notes:          invoice.notes          || null,
},
```
Menjadi:
```js
p_invoice: {
  id:               invoice.id               || null,
  date:             invoice.date,
  due_date:         invoice.due_date         || null,
  customer_id:      invoice.customer_id,
  sales_order_id:   invoice.sales_order_id   || null,
  goods_delivery_id: invoice.goods_delivery_id || null,
  status:           invoice.status           || 'draft',
  notes:            invoice.notes            || null,
},
```

- [ ] **Step 2.5 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 2.6 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/services/purchaseService.js ERP-ACC/erp-app/src/services/salesService.js
git commit -m "feat(service): expose goods_receipt_id and goods_delivery_id in invoice services"
```

---

## Task 3: PO Form → Shortcut "Buat GR" + GR Form → Auto-populate dari PO

> **Model:** sonnet | **Effort:** medium (~20 menit)
>
> Di PurchaseOrderFormPage: tambah tombol "Buat GR dari PO ini" yang muncul jika `po.status === 'confirmed'`. Di GoodsReceiptFormPage: baca query param `?from_po`, load PO, dan pre-fill supplier + purchase_order_id + items.

**Files:**
- Modify: `ERP-ACC/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx`

- [ ] **Step 3.1 — Tambah shortcut button di PurchaseOrderFormPage**

Di baris imports (line 16), tambah `ClipboardList` ke import lucide:
```js
import { ArrowLeft, Save, Check, Printer, FileDown, ClipboardList } from 'lucide-react'
```

Di dalam JSX, cari blok `<Flex justify="flex-end" gap={12}>` (line 156). Tambahkan tombol berikut **sebelum** tombol "Batal":
```jsx
{id && po?.status === 'confirmed' && canWrite && (
  <Button variant="secondary" onClick={() => navigate(`/purchase/receipts/new?from_po=${id}`)}>
    <ClipboardList size={18} /> Buat GR dari PO ini
  </Button>
)}
```

- [ ] **Step 3.2 — Tambah auto-populate dari PO di GoodsReceiptFormPage**

Di baris imports, lakukan dua perubahan:

1. Tambah `useSearchParams` ke import react-router-dom (line 2):
```js
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
```

2. Tambah `getPurchaseOrder` ke import purchaseService (line 7):
```js
import { getGoodsReceipt, saveGoodsReceipt, postGoodsReceipt, getPurchaseOrder } from '../../services/purchaseService'
```

Setelah baris `const isNew = !id || id === 'new'` (line 19), tambah:
```js
const [searchParams] = useSearchParams()
```

Tambahkan `useEffect` baru **setelah** useEffect yang sudah ada (line 36-63), **sebelum** `const readOnly`:
```js
useEffect(() => {
  const fromPoId = searchParams.get('from_po')
  if (!fromPoId || !isNew) return
  getPurchaseOrder(fromPoId)
    .then(po => {
      setHeader(h => ({
        ...h,
        supplier_id: po.supplier_id,
        purchase_order_id: po.id,
      }))
      setItems(
        (po.purchase_order_items || []).map(i => ({
          _key: i.id,
          product_id: i.product_id,
          product_name: i.product?.name,
          unit_id: i.unit_id,
          unit_name: i.unit?.name,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: i.unit_price,
        }))
      )
    })
    .catch(err => toast.error('Gagal load PO: ' + err.message))
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3.3 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3.4 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx \
        ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx
git commit -m "feat(purchase): add shortcut PO→GR and auto-populate GR from PO"
```

---

## Task 4: GR Form → Shortcut "Buat PI" + PI Form → Auto-populate dari GR

> **Model:** sonnet | **Effort:** medium (~20 menit)
>
> Di GoodsReceiptFormPage: tambah tombol "Buat PI dari GR ini" jika `header.status === 'posted'`. Di PurchaseInvoiceFormPage: tambah `goods_receipt_id` ke header state, baca `?from_gr`, load GR, pre-fill semua field.

**Files:**
- Modify: `ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx`

- [ ] **Step 4.1 — Tambah shortcut button di GoodsReceiptFormPage**

Tambah `FileText` ke import lucide (line 12):
```js
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'
```

Di dalam JSX, cari blok `<Space>` yang berisi tombol Simpan dan Post (line 145-156). Tambahkan tombol berikut setelah tombol "Post":
```jsx
{!isNew && header.status === 'posted' && canWrite && (
  <Button variant="secondary" onClick={() => navigate(`/purchase/invoices/new?from_gr=${id}`)}>
    <FileText size={18} /> Buat PI dari GR ini
  </Button>
)}
```

- [ ] **Step 4.2 — Tambah `goods_receipt_id` ke header state di PurchaseInvoiceFormPage**

Cari blok `useState` untuk header (line 29-37). Ubah dari:
```js
const [header, setHeader] = useState({
  invoice_number: '',
  date: today(),
  due_date: '',
  supplier_id: '',
  purchase_order_id: searchParams.get('po') || '',
  status: 'draft',
  notes: '',
})
```
Menjadi:
```js
const [header, setHeader] = useState({
  invoice_number: '',
  date: today(),
  due_date: '',
  supplier_id: '',
  purchase_order_id: searchParams.get('po') || '',
  goods_receipt_id: '',
  status: 'draft',
  notes: '',
})
```

- [ ] **Step 4.3 — Tambah `goods_receipt_id` ke state saat load existing invoice**

Di dalam useEffect load existing (line 42-70), cari setter `setHeader(...)`. Tambah `goods_receipt_id`:
```js
setHeader({
  id: inv.id,
  invoice_number: inv.invoice_number,
  date: inv.date,
  due_date: inv.due_date || '',
  supplier_id: inv.supplier_id,
  purchase_order_id: inv.purchase_order_id || '',
  goods_receipt_id: inv.goods_receipt_id || '',
  status: inv.status,
  notes: inv.notes || '',
  amount_paid: inv.amount_paid,
  total: inv.total,
})
```

- [ ] **Step 4.4 — Tambah auto-populate dari GR**

Tambah `getGoodsReceipt` ke import purchaseService (line 7) yang saat ini adalah:
```js
import { getPurchaseInvoice, savePurchaseInvoice, postPurchaseInvoice } from '../../services/purchaseService'
```
Ganti menjadi:
```js
import { getPurchaseInvoice, savePurchaseInvoice, postPurchaseInvoice, getGoodsReceipt } from '../../services/purchaseService'
```

Tambah `useEffect` baru setelah useEffect load existing (setelah line 70), sebelum `const readOnly`:
```js
useEffect(() => {
  const fromGrId = searchParams.get('from_gr')
  if (!fromGrId || !isNew) return
  getGoodsReceipt(fromGrId)
    .then(gr => {
      setHeader(h => ({
        ...h,
        supplier_id: gr.supplier_id,
        purchase_order_id: gr.purchase_order_id || '',
        goods_receipt_id: gr.id,
      }))
      setItems(
        (gr.items || []).map(i => ({
          _key: i.id,
          product_id: i.product_id,
          unit_id: i.unit_id,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: i.unit_price,
          tax_amount: 0,
          total: 0,
        }))
      )
    })
    .catch(err => toast.error('Gagal load GR: ' + err.message))
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

Juga tambah `getGoodsReceipt` ke export purchaseService.js jika belum ada (sudah ada di service, cukup tambah ke import).

- [ ] **Step 4.5 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 4.6 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx \
        ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx
git commit -m "feat(purchase): add shortcut GR→PI and auto-populate PI from GR"
```

---

## Task 5: SO Form → Shortcut "Buat GD" + GD Form → Auto-populate dari SO

> **Model:** sonnet | **Effort:** medium (~20 menit)
>
> Di SalesOrderFormPage: tambah tombol "Buat GD dari SO ini" di sebelah tombol "Buat Invoice" yang sudah ada. Di GoodsDeliveryFormPage: baca `?from_so`, load SO, pre-fill customer + sales_order_id + items.

**Files:**
- Modify: `ERP-ACC/erp-app/src/pages/sales/SalesOrderFormPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx`

- [ ] **Step 5.1 — Tambah shortcut button di SalesOrderFormPage**

Tambah `Truck` ke import lucide (line 13):
```js
import { ArrowLeft, Save, CheckCircle, Truck } from 'lucide-react'
```

Di dalam JSX, cari blok `<Space>` di baris 117. Cari tombol "Buat Invoice" (line 128-132):
```jsx
{!isNew && header.status === 'confirmed' && canWrite && (
  <Button variant="primary" onClick={() => navigate(`/sales/invoices/new?so=${id}`)}>
    Buat Invoice
  </Button>
)}
```

Tambahkan tombol **sebelum** "Buat Invoice":
```jsx
{!isNew && header.status === 'confirmed' && canWrite && (
  <Button variant="secondary" onClick={() => navigate(`/sales/deliveries/new?from_so=${id}`)}>
    <Truck size={18} /> Buat GD dari SO ini
  </Button>
)}
```

- [ ] **Step 5.2 — Tambah auto-populate dari SO di GoodsDeliveryFormPage**

Tambah `useSearchParams` ke import react-router-dom (line 2):
```js
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
```

Tambah import `getSalesOrder` (line 7):
```js
import { getGoodsDelivery, saveGoodsDelivery, postGoodsDelivery, getSalesOrder } from '../../services/salesService'
```

Setelah baris `const isNew = !id || id === 'new'` (line 19), tambah:
```js
const [searchParams] = useSearchParams()
```

Tambah `useEffect` baru setelah useEffect load existing, sebelum `const readOnly`:
```js
useEffect(() => {
  const fromSoId = searchParams.get('from_so')
  if (!fromSoId || !isNew) return
  getSalesOrder(fromSoId)
    .then(so => {
      setHeader(h => ({
        ...h,
        customer_id: so.customer_id,
        sales_order_id: so.id,
      }))
      setItems(
        (so.items || []).map(i => ({
          _key: i.id,
          product_id: i.product_id,
          product_name: i.product?.name,
          unit_id: i.unit_id,
          unit_name: i.unit?.name,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
        }))
      )
    })
    .catch(err => toast.error('Gagal load SO: ' + err.message))
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5.3 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 5.4 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/pages/sales/SalesOrderFormPage.jsx \
        ERP-ACC/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx
git commit -m "feat(sales): add shortcut SO→GD and auto-populate GD from SO"
```

---

## Task 6: GD Form → Shortcut "Buat SI" + SI Form → Auto-populate dari GD

> **Model:** sonnet | **Effort:** medium (~20 menit)
>
> Di GoodsDeliveryFormPage: tambah tombol "Buat SI dari GD ini" jika `header.status === 'posted'`. Di SalesInvoiceFormPage: tambah `goods_delivery_id` ke header state, baca `?from_gd`, load GD, pre-fill field. GD tidak punya `unit_price`, jadi `unit_price` dikosongkan dan akan diisi otomatis oleh `LineItemsTable` dari `product.sell_price`.

**Files:**
- Modify: `ERP-ACC/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`

- [ ] **Step 6.1 — Tambah shortcut button di GoodsDeliveryFormPage**

Tambah `FileText` ke import lucide (line 12):
```js
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'
```

Di dalam JSX, cari blok `<Space>` yang berisi tombol Simpan dan Post (line 142-154). Tambahkan tombol **setelah** tombol "Post":
```jsx
{!isNew && header.status === 'posted' && canWrite && (
  <Button variant="secondary" onClick={() => navigate(`/sales/invoices/new?from_gd=${id}`)}>
    <FileText size={18} /> Buat SI dari GD ini
  </Button>
)}
```

- [ ] **Step 6.2 — Tambah `goods_delivery_id` ke header state di SalesInvoiceFormPage**

Cari blok `useState` untuk header (line 32-40). Ubah dari:
```js
const [header, setHeader] = useState({
  invoice_number: '',
  date: today(),
  due_date: '',
  customer_id: '',
  sales_order_id: searchParams.get('so') || '',
  status: 'draft',
  notes: '',
})
```
Menjadi:
```js
const [header, setHeader] = useState({
  invoice_number: '',
  date: today(),
  due_date: '',
  customer_id: '',
  sales_order_id: searchParams.get('so') || '',
  goods_delivery_id: '',
  status: 'draft',
  notes: '',
})
```

- [ ] **Step 6.3 — Tambah `goods_delivery_id` saat load existing invoice**

Di dalam `useEffect` load existing (line 43-73), cari setter `setHeader(...)`. Tambah field:
```js
setHeader({
  id: inv.id,
  invoice_number: inv.invoice_number,
  date: inv.date,
  due_date: inv.due_date || '',
  customer_id: inv.customer_id,
  sales_order_id: inv.sales_order_id || '',
  goods_delivery_id: inv.goods_delivery_id || '',
  status: inv.status,
  notes: inv.notes || '',
  amount_paid: inv.amount_paid,
  total: inv.total,
})
```

- [ ] **Step 6.4 — Tambah auto-populate dari GD**

Tambah `getGoodsDelivery` ke import salesService (line 7) yang saat ini adalah:
```js
import { getSalesInvoice, saveSalesInvoice, postSalesInvoice } from '../../services/salesService'
```
Ganti menjadi:
```js
import { getSalesInvoice, saveSalesInvoice, postSalesInvoice, getGoodsDelivery } from '../../services/salesService'
```

Tambah `useEffect` baru setelah useEffect load existing, sebelum `const readOnly`:
```js
useEffect(() => {
  const fromGdId = searchParams.get('from_gd')
  if (!fromGdId || !isNew) return
  getGoodsDelivery(fromGdId)
    .then(gd => {
      setHeader(h => ({
        ...h,
        customer_id: gd.customer_id,
        sales_order_id: gd.sales_order_id || '',
        goods_delivery_id: gd.id,
      }))
      // GD has no unit_price — LineItemsTable will auto-fill from product.sell_price
      setItems(
        (gd.items || []).map(i => ({
          _key: i.id,
          product_id: i.product_id,
          unit_id: i.unit_id,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: '',
          tax_amount: 0,
          total: 0,
        }))
      )
    })
    .catch(err => toast.error('Gagal load GD: ' + err.message))
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 6.5 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 6.6 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx \
        ERP-ACC/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx
git commit -m "feat(sales): add shortcut GD→SI and auto-populate SI from GD"
```

---

## Task 7: Badge "Tanpa PO/GR/SO/GD" di Empat List Pages

> **Model:** haiku | **Effort:** low (~15 menit)
>
> Tambahkan `<Tag color="warning">` di 4 list pages. GR list dan GD list: badge muncul di kolom Ref. PO / Ref. SO menggantikan "—". PI list dan SI list: badge muncul di samping nomor invoice jika field linkage null.

**Files:**
- Modify: `ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx`
- Modify: `ERP-ACC/erp-app/src/pages/sales/SalesInvoicesPage.jsx`

- [ ] **Step 7.1 — Badge "Tanpa PO" di GoodsReceiptsPage**

File sudah import `Tag` dari antd (line 4). Cari sel "Ref. PO" di tbody (line 92-95):
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
  {gr.purchase_order?.po_number || '—'}
</td>
```

Ganti menjadi:
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
  {gr.purchase_order_id
    ? gr.purchase_order?.po_number
    : <Tag color="warning">Tanpa PO</Tag>
  }
</td>
```

- [ ] **Step 7.2 — Badge "Tanpa GR" di PurchaseInvoicesPage**

File sudah import `Tag` dari antd (line 4). Cari sel "No. Invoice" di tbody (line 101):
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
```

Ganti menjadi:
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
  {inv.invoice_number}
  {!inv.goods_receipt_id && (
    <Tag color="warning" style={{ marginLeft: 8 }}>Tanpa GR</Tag>
  )}
</td>
```

- [ ] **Step 7.3 — Badge "Tanpa SO" di GoodsDeliveriesPage**

Tambah `Tag` ke import antd (line 3), dari:
```js
import { Space, Flex, Typography } from 'antd'
```
Menjadi:
```js
import { Space, Flex, Typography, Tag } from 'antd'
```

Cari sel "Ref. SO" di tbody (line 91):
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{d.sales_order?.so_number || '—'}</td>
```

Ganti menjadi:
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
  {d.sales_order_id
    ? d.sales_order?.so_number
    : <Tag color="warning">Tanpa SO</Tag>
  }
</td>
```

- [ ] **Step 7.4 — Badge "Tanpa GD" di SalesInvoicesPage**

Tambah `Tag` ke import antd (line 4), dari:
```js
import { Space, Flex, Typography, Spin } from 'antd'
```
Menjadi:
```js
import { Space, Flex, Typography, Spin, Tag } from 'antd'
```

Cari sel "No. Invoice" di tbody (line 96):
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
```

Ganti menjadi:
```jsx
<td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>
  {inv.invoice_number}
  {!inv.goods_delivery_id && (
    <Tag color="warning" style={{ marginLeft: 8 }}>Tanpa GD</Tag>
  )}
</td>
```

- [ ] **Step 7.5 — Build verify**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 7.6 — Commit**

```bash
cd C:/Project/ERP-ACC
git add ERP-ACC/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx \
        ERP-ACC/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx \
        ERP-ACC/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx \
        ERP-ACC/erp-app/src/pages/sales/SalesInvoicesPage.jsx
git commit -m "feat(ui): add unlinked document warning badges on list pages"
```

---

## Task 8: Smoke Test & Final Build

> **Model:** haiku | **Effort:** low (~10 menit)
>
> Jalankan build final dan lakukan smoke test manual di browser untuk memverifikasi semua fitur berjalan.

**Files:** tidak ada perubahan kode.

- [ ] **Step 8.1 — Final build**

```bash
cd C:/Project/ERP-ACC/ERP-ACC/erp-app
npm run build
```

Expected: exit 0, no errors, output di `dist/`.

- [ ] **Step 8.2 — Smoke test: badge di list pages**

Buka app di browser. Navigasi ke:
1. Pembelian → Penerimaan Barang → pastikan GR tanpa PO menampilkan badge kuning "Tanpa PO"
2. Pembelian → Invoice Pembelian → pastikan PI tanpa GR menampilkan badge kuning "Tanpa GR"
3. Penjualan → Pengiriman Barang → pastikan GD tanpa SO menampilkan badge kuning "Tanpa SO"
4. Penjualan → Invoice Penjualan → pastikan SI tanpa GD menampilkan badge kuning "Tanpa GD"

- [ ] **Step 8.3 — Smoke test: shortcut buttons**

1. Buka sebuah PO dengan status `confirmed` → tombol "Buat GR dari PO ini" harus muncul → klik → form GR baru terbuka, supplier dan items sudah terisi dari PO
2. Buka sebuah GR dengan status `posted` → tombol "Buat PI dari GR ini" harus muncul → klik → form PI baru terbuka, supplier dan items sudah terisi dari GR
3. Buka sebuah SO dengan status `confirmed` → tombol "Buat GD dari SO ini" harus muncul → klik → form GD baru terbuka, customer dan items sudah terisi dari SO
4. Buka sebuah GD dengan status `posted` → tombol "Buat SI dari GD ini" harus muncul → klik → form SI baru terbuka, customer dan items sudah terisi (unit_price diisi otomatis dari sell_price produk)

- [ ] **Step 8.4 — Smoke test: save dengan linkage**

1. Simpan salah satu PI yang dibuat dari shortcut GR → buka kembali record tersebut → verifikasi di Supabase bahwa kolom `goods_receipt_id` terisi
2. Simpan salah satu SI yang dibuat dari shortcut GD → verifikasi di Supabase bahwa kolom `goods_delivery_id` terisi

- [ ] **Step 8.5 — Final commit jika ada perbaikan kecil**

Jika ada bug kecil dari smoke test, fix dan commit:
```bash
git add <file>
git commit -m "fix(linkage): <deskripsi singkat>"
```
