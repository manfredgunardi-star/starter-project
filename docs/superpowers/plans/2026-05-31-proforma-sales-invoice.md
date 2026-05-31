# Proforma Sales Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah fitur Proforma Sales Invoice — dokumen pra-invoice yang dapat dicetak/diunduh sebagai PDF dengan watermark diagonal "PROFORMA" dan label "Berlaku Hingga" (tanpa posting akuntansi, tanpa status badge Draft/Unpaid/Paid).

**Architecture:** Proforma invoice adalah entitas tersendiri (tabel `proforma_invoices` + `proforma_invoice_items` di Supabase) yang tidak terhubung ke jurnal akuntansi. Print menggunakan komponen React terpisah (`ProformaInvoicePrintTemplate`) yang menurunkan semua class CSS dari `InvoicePrintTemplate.css` dan menambahkan watermark. PDF menggunakan `proformaRenderer.js` yang memodifikasi `invoiceRenderer.js` (judul berbeda, tidak ada status badge, watermark diagonal, aksen biru bukan merah).

**Tech Stack:** React 18 + Vite, Supabase (PostgreSQL + RPC), jsPDF + jspdf-autotable, Ant Design, react-router-dom

---

## Execution Order & Model Assignments

| Task | File(s) | Agent | Alasan |
|------|---------|-------|--------|
| 1 | `034_proforma_invoices.sql` | **Claude Sonnet** | SQL patterns kompleks, naming conventions harus cocok |
| 2 | `proformaService.js` | **Claude Haiku** | Copy pattern dari salesService.js, straightforward |
| ——— | **↓ CODEX HANDOFF ↓** | — | Tasks 1-2 harus selesai dulu (SQL + service tersedia) |
| 3 | `ProformaInvoicePrintTemplate.jsx` + `.css` | **Codex GPT 5.5** | React + CSS generation heavy |
| 4 | `proformaRenderer.js` | **Codex GPT 5.5** | Copy-modify file panjang |
| 5 | `usePrintProformaInvoice.js` | **Codex GPT 5.4** | Copy pattern dari usePrintInvoice.js, ringan |
| 6 | `ProformaInvoicesPage.jsx` | **Codex GPT 5.4** | Copy-modify SalesInvoicesPage.jsx |
| 7 | `ProformaInvoiceFormPage.jsx` | **Codex GPT 5.5** | Form kompleks, banyak state |
| ——— | **↓ CLAUDE LANJUT ↓** | — | — |
| 8 | `App.jsx` + `Sidebar.jsx` | **Claude Haiku** | Small edits |
| 9 | `SalesOrderFormPage.jsx` | **Claude Haiku** | Tambah satu tombol shortcut |
| 10 | Build verification | **Claude Haiku** | `npm run build` |

> **Catatan Eksekusi:** Claude (Sonnet) mengerjakan Task 1–2 **terlebih dahulu** sebelum handoff ke Codex. Setelah Task 7 selesai, Claude (Haiku) lanjut mengerjakan Task 8–10.

---

## File Structure

**New files:**
```
apps/erp-acc/erp-app/supabase/migrations/034_proforma_invoices.sql
apps/erp-acc/erp-app/src/services/proformaService.js
apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.jsx
apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.css
apps/erp-acc/erp-app/src/utils/pdfRenderers/proformaRenderer.js
apps/erp-acc/erp-app/src/hooks/usePrintProformaInvoice.js
apps/erp-acc/erp-app/src/pages/sales/ProformaInvoicesPage.jsx
apps/erp-acc/erp-app/src/pages/sales/ProformaInvoiceFormPage.jsx
```

**Modified files:**
```
apps/erp-acc/erp-app/src/App.jsx                              (lazy imports + routes + print root div)
apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx        (tambah menu item)
apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx   (tambah shortcut button)
```

---

## Task 1: SQL Migration 034 — Proforma Invoices

**Agent: Claude Sonnet**
**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/034_proforma_invoices.sql`
- Apply via Supabase MCP tool: `mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__apply_migration`

- [ ] **Step 1.1: Buat file migration**

```sql
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
  subtotal        numeric(18,2) not null default 0,
  tax_total       numeric(18,2) not null default 0,
  total           numeric(18,2) not null default 0,
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
  quantity        numeric(18,4) not null default 0,
  quantity_base   numeric(18,4) not null default 0,
  unit_price      numeric(18,2) not null default 0,
  tax_amount      numeric(18,2) not null default 0,
  total           numeric(18,2) not null default 0
);

-- RLS
alter table proforma_invoices enable row level security;
alter table proforma_invoice_items enable row level security;

create policy "auth users full access on proforma_invoices"
  on proforma_invoices for all to authenticated
  using (true) with check (true);

create policy "auth users full access on proforma_invoice_items"
  on proforma_invoice_items for all to authenticated
  using (true) with check (true);

-- RPC: save (upsert) proforma invoice + items atomically
-- generate_number('PFI') menghasilkan format PFI-2026-00001 dst.
create or replace function save_proforma_invoice(
  p_proforma jsonb,
  p_items    jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_id     uuid := nullif(p_proforma->>'id', '')::uuid;
  v_number text;
begin
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
language plpgsql security definer as $$
begin
  update proforma_invoices
  set is_active = false, updated_at = now()
  where id = p_id;
end;
$$;
```

- [ ] **Step 1.2: Apply migration ke Supabase**

Gunakan Supabase MCP tool `apply_migration`. Project ID untuk ERP-ACC ada di environment variable `VITE_SUPABASE_URL` (lihat `.env` di `apps/erp-acc/erp-app/`).

```
name: "034_proforma_invoices"
query: <isi SQL dari step 1.1>
```

- [ ] **Step 1.3: Verifikasi tabel tersedia**

```
execute_sql: SELECT table_name FROM information_schema.tables WHERE table_name IN ('proforma_invoices','proforma_invoice_items') AND table_schema = 'public';
```

Expected: 2 rows (`proforma_invoices` dan `proforma_invoice_items`).

- [ ] **Step 1.4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/034_proforma_invoices.sql
git commit -m "feat(erp-acc): add proforma_invoices tables and RPC (migration 034)"
```

---

## Task 2: Proforma Service

**Agent: Claude Haiku**
**Files:**
- Create: `apps/erp-acc/erp-app/src/services/proformaService.js`

Pattern: identik dengan `salesService.js` untuk fungsi invoice. Supabase client diimport dari `'../lib/supabase'`.

- [ ] **Step 2.1: Buat proformaService.js**

```js
import { supabase } from '../lib/supabase'

export async function getProformaInvoices() {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number)')
    .eq('is_active', true)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getProformaInvoice(id) {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select(`
      *,
      customer:customers(id, name, address, phone, email, npwp),
      sales_order:sales_orders(id, so_number),
      items:proforma_invoice_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, sell_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveProformaInvoice(proforma, items) {
  const { data, error } = await supabase.rpc('save_proforma_invoice', {
    p_proforma: {
      id:             proforma.id || null,
      date:           proforma.date,
      valid_until:    proforma.valid_until || null,
      customer_id:    proforma.customer_id,
      sales_order_id: proforma.sales_order_id || null,
      notes:          proforma.notes || null,
      subtotal:       proforma.subtotal || 0,
      tax_total:      proforma.tax_total || 0,
      total:          proforma.total || 0,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price) || 0,
      tax_amount:    Number(i.tax_amount) || 0,
      total:         Number(i.total) || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function cancelProformaInvoice(id) {
  const { error } = await supabase.rpc('cancel_proforma_invoice', { p_id: id })
  if (error) throw error
}
```

- [ ] **Step 2.2: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/proformaService.js
git commit -m "feat(erp-acc): add proformaService CRUD functions"
```

---

## ═══ CODEX HANDOFF — Mulai dari Task 3 ═══

> Setelah Task 1 & 2 selesai (SQL applied ke Supabase, `proformaService.js` tersedia), gunakan prompt berikut untuk handoff ke Codex.

### Codex Context Prompt (baca sebelum mengerjakan Task 3-7)

```
You are implementing the Proforma Sales Invoice feature for an ERP system.
Working directory: apps/erp-acc/erp-app/

Tech stack: React 18, Vite, Ant Design, Supabase, jsPDF + jspdf-autotable, react-router-dom.

Existing reference files you MUST read before starting each task:
- src/components/shared/InvoicePrintTemplate.jsx
- src/components/shared/InvoicePrintTemplate.css
- src/utils/pdfRenderers/invoiceRenderer.js
- src/utils/pdfRenderers/shared.js
- src/hooks/usePrintInvoice.js
- src/pages/sales/SalesInvoicesPage.jsx
- src/pages/sales/SalesInvoiceFormPage.jsx

Already completed (DO NOT re-do these):
- supabase/migrations/034_proforma_invoices.sql — applied to DB
- src/services/proformaService.js — created with getProformaInvoices, getProformaInvoice, saveProformaInvoice, cancelProformaInvoice

Proforma design spec (Option B — Watermark):
- Title: "Proforma Invoice Penjualan" (not "Invoice Penjualan")
- Diagonal watermark "PROFORMA" — light blue, barely visible (rgba(29,78,216,0.06) for CSS / setTextColor(228,234,252) for jsPDF)
- "Berlaku Hingga" date field replacing "Jatuh Tempo" / "Due Date"
- NO status badge (no Draft/Unpaid/Paid label)
- Accent color: BLUE (#1D4ED8 / COLOR.blue) — same as existing InvoicePrintTemplate
- Everything else identical to existing invoice format

Document number format: PFI-2026-00001 (auto-generated by DB via generate_number('PFI'))

Follow the EXACT same code patterns as the reference files. Do not add features not listed. Commit after each task.
```

---

## Task 3: Proforma Invoice Print Template (React + CSS)

**Agent: Codex GPT 5.5**
**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.jsx`
- Create: `apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.css`

### Codex Task 3 Prompt

```
Task: Create ProformaInvoicePrintTemplate.jsx and ProformaInvoicePrintTemplate.css

Read these files first:
- src/components/shared/InvoicePrintTemplate.jsx
- src/components/shared/InvoicePrintTemplate.css

Create ProformaInvoicePrintTemplate.jsx:
- Props: { proforma, company } (proforma instead of invoice)
- Identical structure to InvoicePrintTemplate.jsx EXCEPT:
  1. Import './ProformaInvoicePrintTemplate.css' instead of './InvoicePrintTemplate.css'
  2. Add <div className="proforma-watermark">PROFORMA</div> as the FIRST child inside .inv-template
  3. Title text: "Proforma Invoice Penjualan" (hardcoded, not from props)
  4. Show proforma.proforma_number instead of invoice.invoice_number
  5. Show proforma.valid_until with label "Berlaku Hingga:" instead of due_date "Jatuh Tempo:"
  6. Notes label: "Catatan" (not "Catatan Pembayaran")
  7. All references to invoice.xxx → proforma.xxx

Create ProformaInvoicePrintTemplate.css:
- Start with: @import './InvoicePrintTemplate.css';
- Override .inv-template to add position: relative; overflow: hidden;
- Add @media print block for #proforma-invoice-print-root (same as InvoicePrintTemplate.css but different ID)
- Add .proforma-watermark class:
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-35deg);
  font-size: 76px; font-weight: 900;
  color: rgba(29, 78, 216, 0.06);
  letter-spacing: 6px; pointer-events: none; user-select: none;
  z-index: 0; white-space: nowrap; font-family: Arial, Helvetica, sans-serif;
- Add: .inv-template > *:not(.proforma-watermark) { position: relative; z-index: 1; }
- Add .inv-valid-until { color: #b45309; font-weight: 600; }

Commit: git commit -m "feat(erp-acc): add ProformaInvoicePrintTemplate with watermark"
```

- [ ] **Step 3.1: Read InvoicePrintTemplate.jsx dan InvoicePrintTemplate.css**
- [ ] **Step 3.2: Buat ProformaInvoicePrintTemplate.jsx**

Complete content (write EXACTLY this, modifying from InvoicePrintTemplate.jsx pattern):

```jsx
import './ProformaInvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { terbilang } from '../../utils/terbilang'

export default function ProformaInvoicePrintTemplate({ proforma, company }) {
  const subtotal = proforma.items.reduce(
    (acc, item) => acc + (item.total - (item.tax_amount || 0)), 0
  )
  const taxTotal = proforma.items.reduce(
    (acc, item) => acc + (item.tax_amount || 0), 0
  )
  const grandTotal = proforma.total || 0

  return (
    <div className="inv-template">
      <div className="proforma-watermark">PROFORMA</div>

      {/* Zone 1: Header */}
      <div className="inv-header">
        <div className="inv-header-left">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt="Logo"
              className="inv-logo"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <div>
            <p className="inv-company-name">{company?.name || 'Nama Perusahaan'}</p>
            {company?.address && <p className="inv-company-detail">{company.address}</p>}
            {company?.phone && <p className="inv-company-detail">Telp: {company.phone}</p>}
            {company?.email && <p className="inv-company-detail">Email: {company.email}</p>}
            {company?.npwp && <p className="inv-company-detail">NPWP: {company.npwp}</p>}
          </div>
        </div>
        <div className="inv-header-right">
          <p className="inv-title">Proforma Invoice Penjualan</p>
          <p className="inv-number">{proforma.proforma_number}</p>
          <p className="inv-meta-row">Tanggal: {formatDate(proforma.date)}</p>
          {proforma.valid_until && (
            <p className="inv-meta-row inv-valid-until">
              Berlaku Hingga: {formatDate(proforma.valid_until)}
            </p>
          )}
        </div>
      </div>
      <div className="inv-divider" />

      {/* Zone 2: Bill To */}
      <div className="inv-bill-to-section">
        <div className="inv-bill-to-box">
          <p className="inv-section-label">Ditagihkan Kepada</p>
          <p className="inv-customer-name">{proforma.customer?.name || '—'}</p>
        </div>
      </div>

      {/* Zone 3: Table */}
      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Deskripsi</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 130, textAlign: 'right' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {proforma.items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="inv-text-center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="inv-text-center">{item.quantity}</td>
              <td className="inv-text-center">{item.unit?.name || '—'}</td>
              <td className="inv-text-right">{formatCurrency(item.unit_price)}</td>
              <td className="inv-text-right">
                {formatCurrency(item.total - (item.tax_amount || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Zone 4: Totals */}
      <div className="inv-totals">
        <table className="inv-totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
            {taxTotal > 0 && (
              <tr>
                <td>PPN</td>
                <td>{formatCurrency(taxTotal)}</td>
              </tr>
            )}
            <tr className="inv-grand-total">
              <td>Grand Total</td>
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Zone 5: Terbilang */}
      <div className="inv-terbilang-box">
        <p className="inv-section-label">Terbilang</p>
        <p className="inv-terbilang-text">{terbilang(Math.round(grandTotal))}</p>
      </div>

      {/* Zone 6: Footer */}
      <div className="inv-footer">
        <div className="inv-footer-left">
          {proforma.notes && (
            <div>
              <p className="inv-notes-label">Catatan</p>
              <p className="inv-notes-text">{proforma.notes}</p>
            </div>
          )}
          {company?.bank_name && (
            <div style={{ marginTop: proforma.notes ? 12 : 0 }}>
              <p className="inv-bank-label">Transfer ke:</p>
              <p className="inv-bank-detail">
                {company.bank_name}
                {company.bank_account_number ? ` – ${company.bank_account_number}` : ''}
              </p>
              {company.bank_account_name && (
                <p className="inv-bank-detail">a.n. {company.bank_account_name}</p>
              )}
            </div>
          )}
        </div>
        {company?.signer_name && (
          <div className="inv-signature">
            <p>Hormat kami,</p>
            <p className="inv-signer-name">{company.signer_name}</p>
            {company.signer_title && (
              <p className="inv-signer-title">{company.signer_title}</p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
```

- [ ] **Step 3.3: Buat ProformaInvoicePrintTemplate.css**

```css
@import './InvoicePrintTemplate.css';

/* ── Override: enable watermark positioning ── */
.inv-template {
  position: relative;
  overflow: hidden;
}

/* ── Print: use proforma-specific container ── */
@media print {
  body > * { display: none !important; }
  #proforma-invoice-print-root {
    display: block !important;
    position: static !important;
    top: auto !important;
    left: auto !important;
    width: auto !important;
  }
  @page { size: A4 portrait; margin: 20mm; }
}

/* ── Watermark diagonal ── */
.proforma-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-35deg);
  font-size: 76px;
  font-weight: 900;
  color: rgba(29, 78, 216, 0.06);
  letter-spacing: 6px;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  white-space: nowrap;
  font-family: Arial, Helvetica, sans-serif;
}

/* ── Ensure all content zones render above watermark ── */
.inv-template > *:not(.proforma-watermark) {
  position: relative;
  z-index: 1;
}

/* ── "Berlaku Hingga" styling ── */
.inv-valid-until {
  color: #b45309;
  font-weight: 600;
}
```

- [ ] **Step 3.4: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.jsx apps/erp-acc/erp-app/src/components/shared/ProformaInvoicePrintTemplate.css
git commit -m "feat(erp-acc): add ProformaInvoicePrintTemplate with diagonal watermark"
```

---

## Task 4: Proforma PDF Renderer

**Agent: Codex GPT 5.5**
**Files:**
- Create: `apps/erp-acc/erp-app/src/utils/pdfRenderers/proformaRenderer.js`

### Codex Task 4 Prompt

```
Task: Create proformaRenderer.js — PDF renderer for Proforma Sales Invoice

Read these files first:
- src/utils/pdfRenderers/invoiceRenderer.js  (base to copy from)
- src/utils/pdfRenderers/shared.js           (imports + helper functions)

Create proformaRenderer.js as a modified copy of invoiceRenderer.js with these changes:
1. Export function name: renderProformaPdf(proforma, company)  [not renderInvoicePdf]
2. No status label — remove SI_STATUS_LABELS map entirely, pass status: '' to drawDocTitle
3. Title: 'Proforma Invoice Penjualan' [not 'Sales Invoice']
4. Accent color: COLOR.blue  [not COLOR.red] — affects drawDivider, line above total, grand total text, drawDocTitle accentColor
5. Document number: proforma.proforma_number  [not invoice.invoice_number]
6. Meta row: 'Valid Until' showing formatDate(proforma.valid_until) [not 'Due Date' / due_date]
7. Meta row: 'Invoice Date' → 'Proforma Date' showing formatDate(proforma.date)
8. Remove 'Reference DO' (goods_delivery_number) meta row — proforma has no GD link
9. Keep 'Reference SO' meta row (proforma.sales_order?.so_number)
10. Watermark: draw diagonal "PROFORMA" text in very light blue BEFORE all other content:
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(90)
    doc.setTextColor(228, 234, 252)
    doc.text('PROFORMA', A4.width / 2, A4.height / 2, { angle: 35, align: 'center' })
    doc.setTextColor(...COLOR.textPrimary)
    doc.setFont('helvetica', 'normal')
    (Place this block right after: const doc = new jsPDF(...)  — before drawCompanyHeader)
11. drawContinuationHeader calls: change docTitle to 'Proforma Invoice Penjualan' and accentColor to COLOR.blue
12. drawPageFooter: use proforma.proforma_number as docNumber
13. Section labels: 'Payment Information' stays; 'Terms & Conditions' → 'Catatan'
14. Signature row: keep same structure

Import: all same imports from './shared.js'
```

- [ ] **Step 4.1: Read invoiceRenderer.js dan shared.js**

- [ ] **Step 4.2: Buat proformaRenderer.js**

Complete content:

```js
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  A4,
  MARGIN,
  CONTENT,
  COLOR,
  FONT,
  formatCurrency,
  formatDate,
  safeText,
  loadLogoDataUrl,
  drawCompanyHeader,
  drawDocTitle,
  drawDivider,
  drawSectionLabel,
  drawMetaRow,
  drawSignatureRow,
  drawPageFooter,
  drawContinuationHeader,
} from './shared.js'

export async function renderProformaPdf(proforma, company) {
  const logoDataUrl = await loadLogoDataUrl(company?.logo_url)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // Draw diagonal watermark first (appears behind all content)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(90)
  doc.setTextColor(228, 234, 252)
  doc.text('PROFORMA', A4.width / 2, A4.height / 2, { angle: 35, align: 'center' })
  doc.setTextColor(...COLOR.textPrimary)
  doc.setFont('helvetica', 'normal')

  const customer = proforma?.customer ?? {}
  const items = proforma?.items ?? []
  const companyName = safeText(company?.name)
  const rightX = A4.width - MARGIN.right
  const leftX = MARGIN.left
  const midX = leftX + CONTENT.width * 0.52
  const currency = 'IDR'

  // ---------------------------------------------------------------------------
  // Page 1 Header
  // ---------------------------------------------------------------------------
  const headerEndY = drawCompanyHeader(doc, company, MARGIN.top, CONTENT.width * 0.55, logoDataUrl)
  const titleEndY = drawDocTitle(
    doc,
    {
      label: 'Proforma Invoice Penjualan',
      number: proforma?.proforma_number,
      status: '',
      accentColor: COLOR.blue,
    },
    MARGIN.top,
  )

  let y = Math.max(headerEndY, titleEndY, MARGIN.top + 60) + 8
  drawDivider(doc, y, COLOR.blue)
  y += 14

  // ---------------------------------------------------------------------------
  // Info Row: Bill To (left) + Meta table (right)
  // ---------------------------------------------------------------------------
  const leftColStartY = y
  const rightColX = midX + 8
  const rightColLabelX = rightColX
  const rightColValueX = rightX

  drawSectionLabel(doc, 'Bill To', leftX, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.partyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(customer.name), leftX, y)
  y += 13

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.partyMeta)
  doc.setTextColor(...COLOR.textSecondary)

  if (customer.address) {
    const addrLines = doc.splitTextToSize(String(customer.address), midX - leftX - 8).slice(0, 3)
    addrLines.forEach((line) => {
      doc.text(line, leftX, y)
      y += 10
    })
  }
  if (customer.phone) { doc.text(safeText(customer.phone), leftX, y); y += 10 }
  if (customer.email) { doc.text(safeText(customer.email), leftX, y); y += 10 }
  if (customer.npwp)  { doc.text(`NPWP: ${customer.npwp}`, leftX, y); y += 10 }

  const leftColEndY = y

  let ry = leftColStartY
  ry = drawMetaRow(doc, 'Proforma Date', formatDate(proforma?.date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Valid Until',   formatDate(proforma?.valid_until), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(
    doc,
    'Reference SO',
    safeText(proforma?.sales_order?.so_number, null),
    rightColLabelX,
    rightColValueX,
    ry,
    { empty: !proforma?.sales_order?.so_number },
  )
  ry = drawMetaRow(doc, 'Currency', currency, rightColLabelX, rightColValueX, ry)

  y = Math.max(leftColEndY, ry) + 20

  // ---------------------------------------------------------------------------
  // Items Table
  // ---------------------------------------------------------------------------
  const tableBody = items.map((item, idx) => {
    const productName = item?.product?.name ?? ''
    const sku = item?.product?.sku ?? ''
    const descLines = [safeText(productName)]
    if (sku) descLines.push(`SKU: ${sku}`)

    return [
      String(idx + 1).padStart(2, '0'),
      descLines.join('\n'),
      formatCurrency(item?.quantity),
      safeText(item?.unit?.name, ''),
      formatCurrency(item?.unit_price),
      formatCurrency(item?.total),
    ]
  })

  autoTable(doc, {
    head: [['#', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT PRICE', 'AMOUNT']],
    body: tableBody,
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top + 56, bottom: MARGIN.bottom + 24 },
    theme: 'plain',
    columnStyles: {
      0: { cellWidth: 24, halign: 'left' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 36, halign: 'left' },
      4: { cellWidth: 72, halign: 'right' },
      5: { cellWidth: 80, halign: 'right' },
    },
    headStyles: {
      fontSize: FONT.tableHeader,
      fontStyle: 'normal',
      textColor: COLOR.textMuted,
      fillColor: false,
      lineWidth: { bottom: 1.5 },
      lineColor: COLOR.borderDark,
    },
    bodyStyles: {
      fontSize: FONT.tableCell,
      textColor: COLOR.textPrimary,
      lineWidth: { bottom: 0.5 },
      lineColor: COLOR.borderLight,
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawContinuationHeader(doc, {
          companyName,
          docTitle: 'Proforma Invoice Penjualan',
          docNumber: proforma?.proforma_number,
          accentColor: COLOR.blue,
        })
        // Re-draw watermark on continuation pages
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(90)
        doc.setTextColor(228, 234, 252)
        doc.text('PROFORMA', A4.width / 2, A4.height / 2, { angle: 35, align: 'center' })
        doc.setTextColor(...COLOR.textPrimary)
        doc.setFont('helvetica', 'normal')
      }
    },
  })

  y = (doc.lastAutoTable?.finalY ?? y) + 12

  // ---------------------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------------------
  const subtotal =
    proforma?.subtotal ?? items.reduce((sum, item) => sum + (Number(item?.total) || 0), 0)
  const ppn = proforma?.tax_total ?? items.reduce((sum, item) => sum + (Number(item?.tax_amount) || 0), 0)
  const total = proforma?.total ?? subtotal + ppn
  const totalsLeftX = rightX - 240

  doc.setDrawColor(...COLOR.borderLight)
  doc.setLineWidth(0.5)
  doc.line(totalsLeftX, y, rightX, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.totalLabel)
  doc.setTextColor(...COLOR.textSecondary)
  doc.text('Subtotal', totalsLeftX, y)
  doc.setFontSize(FONT.totalValue)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(`${currency} ${formatCurrency(subtotal)}`, rightX, y, { align: 'right' })
  y += 14

  doc.setFontSize(FONT.totalLabel)
  doc.setTextColor(...COLOR.textSecondary)
  doc.text('PPN 11%', totalsLeftX, y)
  doc.setFontSize(FONT.totalValue)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(`${currency} ${formatCurrency(ppn)}`, rightX, y, { align: 'right' })
  y += 10

  doc.setDrawColor(...COLOR.blue)
  doc.setLineWidth(1.5)
  doc.line(totalsLeftX, y, rightX, y)
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.grandTotal)
  doc.setTextColor(...COLOR.blue)
  doc.text('Total', totalsLeftX, y)
  doc.text(`${currency} ${formatCurrency(total)}`, rightX, y, { align: 'right' })
  y += 16

  // ---------------------------------------------------------------------------
  // Payment Info + Notes + Signatures
  // ---------------------------------------------------------------------------
  if (y + 180 > A4.height - MARGIN.bottom - 24) {
    doc.addPage()
    y = drawContinuationHeader(doc, {
      companyName,
      docTitle: 'Proforma Invoice Penjualan',
      docNumber: proforma?.proforma_number,
      accentColor: COLOR.blue,
    })
    y += 8
  }

  const twoColWidth = (CONTENT.width - 20) / 2
  const leftColX = leftX
  const rightColXTwo = leftX + twoColWidth + 20

  drawSectionLabel(doc, 'Payment Information', leftColX, y)
  let leftY = y + 10

  const hasBank = company?.bank_name || company?.bank_account_number || company?.bank_account_name
  if (hasBank) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textSecondary)
    if (company?.bank_name)          { doc.text(`Bank: ${company.bank_name}`, leftColX, leftY); leftY += 11 }
    if (company?.bank_account_number){ doc.text(`Account No: ${company.bank_account_number}`, leftColX, leftY); leftY += 11 }
    if (company?.bank_account_name)  { doc.text(`Account Name: ${company.bank_account_name}`, leftColX, leftY); leftY += 11 }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textDisabled)
    doc.text('— belum dikonfigurasi —', leftColX, leftY)
    leftY += 11
  }

  drawSectionLabel(doc, 'Catatan', rightColXTwo, y)
  let rightY = y + 10
  const notesText = proforma?.notes ?? ''
  if (notesText) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textSecondary)
    const notesLines = doc.splitTextToSize(String(notesText), twoColWidth).slice(0, 4)
    notesLines.forEach((line) => { doc.text(line, rightColXTwo, rightY); rightY += 11 })
  }

  y = Math.max(leftY, rightY) + 16

  drawSignatureRow(
    doc,
    [
      { label: 'Prepared by', name: null, role: 'Finance' },
      { label: 'Authorized by', name: company?.signer_name || null, role: company?.signer_title || 'Director' },
    ],
    y,
    { totalWidth: CONTENT.width * 0.7 },
  )

  // ---------------------------------------------------------------------------
  // Page footers
  // ---------------------------------------------------------------------------
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(doc, {
      docNumber: proforma?.proforma_number,
      pageNumber: i,
      totalPages,
    })
  }

  return doc
}
```

- [ ] **Step 4.3: Commit**

```bash
git add apps/erp-acc/erp-app/src/utils/pdfRenderers/proformaRenderer.js
git commit -m "feat(erp-acc): add proformaRenderer for PDF with watermark and blue accent"
```

---

## Task 5: usePrintProformaInvoice Hook

**Agent: Codex GPT 5.4**
**Files:**
- Create: `apps/erp-acc/erp-app/src/hooks/usePrintProformaInvoice.js`

### Codex Task 5 Prompt

```
Task: Create usePrintProformaInvoice.js

Read this file first: src/hooks/usePrintInvoice.js

Create usePrintProformaInvoice.js as a copy of usePrintInvoice.js with these changes:
1. Import ProformaInvoicePrintTemplate from '../components/shared/ProformaInvoicePrintTemplate'
2. Import getProformaInvoice from '../services/proformaService'
3. Import renderProformaPdf from '../utils/pdfRenderers/proformaRenderer'
4. Container ID: 'proforma-invoice-print-root' (not 'invoice-print-root')
5. Remove fetchInvoiceWithRefs helper — call getProformaInvoice(proformaId) directly (no SO/GD ref fetching needed)
6. renderToContainer: pass { proforma, company } to ProformaInvoicePrintTemplate
7. triggerPDF: save file as `proforma-${proforma.proforma_number}-${proforma.date}.pdf`
8. Export name: usePrintProformaInvoice
```

- [ ] **Step 5.1: Read usePrintInvoice.js**

- [ ] **Step 5.2: Buat usePrintProformaInvoice.js**

```js
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { useToast } from '../components/ui/ToastContext'
import ProformaInvoicePrintTemplate from '../components/shared/ProformaInvoicePrintTemplate'
import { getProformaInvoice } from '../services/proformaService'
import { getCompanySettings } from '../services/companySettingsService'
import { renderProformaPdf } from '../utils/pdfRenderers/proformaRenderer'

let _printRoot = null

function cleanupPrintContainer() {
  if (_printRoot) {
    try { _printRoot.unmount() } catch { /* ignore */ }
    _printRoot = null
  }
  const container = document.getElementById('proforma-invoice-print-root')
  if (container) container.style.display = 'none'
}

function renderToContainer(proforma, company) {
  cleanupPrintContainer()
  const container = document.getElementById('proforma-invoice-print-root')
  const root = createRoot(container)
  flushSync(() => {
    root.render(createElement(ProformaInvoicePrintTemplate, { proforma, company }))
  })
  _printRoot = root
  return container
}

export function usePrintProformaInvoice() {
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  function setLoading(id, val) {
    setLoadingIds(prev => ({ ...prev, [id]: val }))
  }

  async function triggerPrint(proformaId) {
    setLoading(proformaId, true)
    try {
      const [proforma, company] = await Promise.all([
        getProformaInvoice(proformaId),
        getCompanySettings(),
      ])
      renderToContainer(proforma, company)
      const afterPrint = () => {
        cleanupPrintContainer()
        window.removeEventListener('afterprint', afterPrint)
      }
      window.addEventListener('afterprint', afterPrint)
      window.print()
    } catch (err) {
      toast.error(`Gagal mencetak: ${err.message}`)
      cleanupPrintContainer()
    } finally {
      setLoading(proformaId, false)
    }
  }

  async function triggerPDF(proformaId) {
    setLoading(proformaId, true)
    try {
      const [proforma, company] = await Promise.all([
        getProformaInvoice(proformaId),
        getCompanySettings(),
      ])
      const doc = await renderProformaPdf(proforma, company)
      doc.save(`proforma-${proforma.proforma_number}-${proforma.date}.pdf`)
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      setLoading(proformaId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
```

- [ ] **Step 5.3: Commit**

```bash
git add apps/erp-acc/erp-app/src/hooks/usePrintProformaInvoice.js
git commit -m "feat(erp-acc): add usePrintProformaInvoice hook"
```

---

## Task 6: ProformaInvoicesPage (List)

**Agent: Codex GPT 5.4**
**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/sales/ProformaInvoicesPage.jsx`

### Codex Task 6 Prompt

```
Task: Create ProformaInvoicesPage.jsx

Read this file first: src/pages/sales/SalesInvoicesPage.jsx

Create ProformaInvoicesPage.jsx as a modified copy with these changes:
1. Import getProformaInvoices from '../../services/proformaService'
2. Import usePrintProformaInvoice from '../../hooks/usePrintProformaInvoice'
3. Load data: useEffect + getProformaInvoices() (no custom hook needed, replicate useSalesInvoices pattern inline)
4. No statusFilter (proforma has no payment status) — remove the <select> filter for status
5. Column "Jatuh Tempo" → "Berlaku Hingga" showing proforma.valid_until
6. Remove columns: "Status", "Dibayar" (proforma has no payment tracking)
7. Navigate to /sales/proforma/:id on row click
8. Navigate to /sales/proforma/new on "Buat Proforma Invoice" button click
9. Use usePrintProformaInvoice for print/PDF actions
10. Table title: "Proforma Invoice"
11. Doc number field: proforma.proforma_number
12. State vars: [proformas, setProformas], [loading, setLoading], [error, setError]
13. Keep search by proforma_number or customer name

Full columns: No. Proforma | Tanggal | Customer | Berlaku Hingga | Total | Aksi
```

- [ ] **Step 6.1: Read SalesInvoicesPage.jsx**

- [ ] **Step 6.2: Buat ProformaInvoicesPage.jsx**

```jsx
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Spin } from 'antd'
import { getProformaInvoices } from '../../services/proformaService'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search, Printer, FileDown } from 'lucide-react'
import { usePrintProformaInvoice } from '../../hooks/usePrintProformaInvoice'

export default function ProformaInvoicesPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const [proformas, setProformas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const { triggerPrint, triggerPDF, loadingIds } = usePrintProformaInvoice()

  useEffect(() => {
    getProformaInvoices()
      .then(setProformas)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return proformas.filter(p => {
      return !search ||
        p.proforma_number?.toLowerCase().includes(search.toLowerCase()) ||
        p.customer?.name?.toLowerCase().includes(search.toLowerCase())
    })
  }, [proformas, search])

  if (loading) return <LoadingSpinner message="Memuat proforma invoice..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Proforma Invoice</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/proforma/new')}>
            <Plus size={20} /> Buat Proforma Invoice
          </Button>
        )}
      </Flex>

      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari no. proforma atau customer..."
          style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
        />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Proforma</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Berlaku Hingga</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>Belum ada proforma invoice</td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/sales/proforma/${p.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{p.proforma_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(p.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{p.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{p.valid_until ? formatDate(p.valid_until) : '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(p.total)}</td>
                  <td
                    style={{ padding: '8px 16px', textAlign: 'center' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {loadingIds[p.id] ? (
                      <Spin size="small" />
                    ) : (
                      <Space size={4}>
                        <button
                          title="Cetak"
                          onClick={() => triggerPrint(p.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          title="Unduh PDF"
                          onClick={() => triggerPDF(p.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <FileDown size={16} />
                        </button>
                      </Space>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
```

- [ ] **Step 6.3: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/ProformaInvoicesPage.jsx
git commit -m "feat(erp-acc): add ProformaInvoicesPage list view"
```

---

## Task 7: ProformaInvoiceFormPage

**Agent: Codex GPT 5.5**
**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/sales/ProformaInvoiceFormPage.jsx`

### Codex Task 7 Prompt

```
Task: Create ProformaInvoiceFormPage.jsx

Read these files first:
- src/pages/sales/SalesInvoiceFormPage.jsx  (reference form)
- src/services/proformaService.js           (saveProformaInvoice, getProformaInvoice, cancelProformaInvoice)
- src/services/salesService.js              (getSalesOrder — for pre-population from SO)

Create ProformaInvoiceFormPage.jsx with these specs:

Header state:
  { proforma_number: '', date: today(), valid_until: '', customer_id: '', sales_order_id: '', notes: '' }

Key differences from SalesInvoiceFormPage:
1. No payment_term_id / syarat pembayaran
2. No goods_delivery_id
3. No "Post Invoice" button — proforma tidak masuk akuntansi
4. No "Terima Pembayaran" button
5. No recurring template toggle
6. No payment summary card (no amount_paid / total / remaining)
7. "Jatuh Tempo" → field "Berlaku Hingga" (valid_until) — manual date input via DateInput component
8. readOnly: false always (proforma can always be edited, unless is_active = false)
9. Import saveProformaInvoice, getProformaInvoice, cancelProformaInvoice from proformaService
10. Pre-populate from SO: useEffect watching searchParams.get('so') — fetch getSalesOrder(soId), set customer_id and items
11. Cancel button: calls cancelProformaInvoice(id), then navigates to /sales/proforma
12. Save: calls saveProformaInvoice(header, validItems), navigate to /sales/proforma/:newId
13. Print/PDF via usePrintProformaInvoice
14. DocumentHeader: no dueDate prop, no onDueDateChange (proforma doesn't use these)
    Instead, add a manual DateInput below DocumentHeader for "Berlaku Hingga":
    <DateInput label="Berlaku Hingga" value={header.valid_until} onChange={e => setHeader(h => ({...h, valid_until: e.target.value}))} />
15. Import LineItemsTable from shared, use with priceField="sell_price" showTax readOnly={false}
16. Top buttons: Kembali (ArrowLeft) | Simpan | Print | PDF | (if !isNew) Batalkan Proforma

Pre-population from SO:
  const fromSoId = searchParams.get('so')
  if (!fromSoId || !isNew) return
  getSalesOrder(fromSoId).then(so => {
    setHeader(h => ({ ...h, customer_id: so.customer_id, sales_order_id: so.id }))
    setItems((so.items || []).map(i => ({
      _key: i.id, product_id: i.product_id, unit_id: i.unit_id,
      quantity: i.quantity, quantity_base: i.quantity_base,
      unit_price: '', tax_amount: 0, total: 0
    })))
  }).catch(err => toast.error('Gagal load SO: ' + err.message))

Validation in handleSave:
  - customer_id required
  - date required
  - at least one item with product_id and quantity > 0
  
Totals calculation (pass as subtotal/tax_total/total to saveProformaInvoice):
  validItems.reduce for subtotal (sum of item.total - item.tax_amount) and tax_total (sum of item.tax_amount)
  total = subtotal + tax_total
```

- [ ] **Step 7.1: Read SalesInvoiceFormPage.jsx, proformaService.js, getSalesOrder from salesService.js**

- [ ] **Step 7.2: Buat ProformaInvoiceFormPage.jsx**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Row, Col, Card } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { getProformaInvoice, saveProformaInvoice, cancelProformaInvoice } from '../../services/proformaService'
import { getSalesOrder } from '../../services/salesService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { usePrintProformaInvoice } from '../../hooks/usePrintProformaInvoice'
import { ArrowLeft, Save, Printer, FileDown, XCircle } from 'lucide-react'

export default function ProformaInvoiceFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const toast = useToast()
  const { triggerPrint, triggerPDF, loadingIds } = usePrintProformaInvoice()
  const isPrinting = loadingIds[id] || false
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    proforma_number: '',
    date: today(),
    valid_until: '',
    customer_id: '',
    sales_order_id: '',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])

  // Load existing proforma
  useEffect(() => {
    if (!isNew) {
      getProformaInvoice(id)
        .then(p => {
          setHeader({
            id: p.id,
            proforma_number: p.proforma_number,
            date: p.date,
            valid_until: p.valid_until || '',
            customer_id: p.customer_id,
            sales_order_id: p.sales_order_id || '',
            notes: p.notes || '',
          })
          setItems(p.items.map(i => ({
            _key: i.id,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
            tax_amount: i.tax_amount,
            total: i.total,
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  // Pre-populate from Sales Order
  useEffect(() => {
    const fromSoId = searchParams.get('so')
    if (!fromSoId || !isNew) return
    getSalesOrder(fromSoId)
      .then(so => {
        setHeader(h => ({ ...h, customer_id: so.customer_id, sales_order_id: so.id }))
        setItems(
          (so.items || []).map(i => ({
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
      .catch(err => toast.error('Gagal load SO: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!header.customer_id) { toast.error('Pilih customer'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }

    const subtotal = validItems.reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.tax_amount) || 0)), 0)
    const taxTotal = validItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0)
    const total = subtotal + taxTotal

    setSubmitting(true)
    try {
      const newId = await saveProformaInvoice(
        { id: isNew ? null : id, ...header, subtotal, tax_total: taxTotal, total },
        validItems
      )
      toast.success('Proforma invoice berhasil disimpan')
      navigate(`/sales/proforma/${newId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Batalkan proforma invoice ini?')) return
    setSubmitting(true)
    try {
      await cancelProformaInvoice(id)
      toast.success('Proforma invoice dibatalkan')
      navigate('/sales/proforma')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))

  if (loading) return <LoadingSpinner message="Memuat proforma invoice..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/proforma')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Proforma Invoice Baru' : `Proforma ${header.proforma_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan
            </Button>
          )}
          {!isNew && (
            <>
              <Button variant="secondary" onClick={() => triggerPrint(id)} loading={isPrinting} disabled={isPrinting}>
                <Printer size={18} /> Print
              </Button>
              <Button variant="secondary" onClick={() => triggerPDF(id)} loading={isPrinting} disabled={isPrinting}>
                <FileDown size={18} /> PDF
              </Button>
              {canWrite && (
                <Button variant="danger" onClick={handleCancel} loading={submitting}>
                  <XCircle size={18} /> Batalkan
                </Button>
              )}
            </>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.proforma_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={null}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={false}
      />

      <Card size="small">
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <DateInput
              label="Berlaku Hingga"
              value={header.valid_until}
              onChange={e => setHeader(h => ({ ...h, valid_until: e.target.value }))}
            />
          </Col>
        </Row>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Proforma Invoice</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="sell_price"
          readOnly={false}
          showTax
        />
      </Space>
    </Space>
  )
}
```

- [ ] **Step 7.3: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/ProformaInvoiceFormPage.jsx
git commit -m "feat(erp-acc): add ProformaInvoiceFormPage with SO pre-population"
```

---

## ═══ CLAUDE LANJUT — Task 8-10 ═══

> Setelah Codex selesai Task 3-7, Claude (Haiku) mengerjakan wiring dan verifikasi.

---

## Task 8: Routing + Print Root Div

**Agent: Claude Haiku**
**Files:**
- Modify: `apps/erp-acc/erp-app/src/App.jsx`

- [ ] **Step 8.1: Tambah lazy imports di App.jsx (setelah baris 39, sebelum SalesReturnsPage)**

Baca `src/App.jsx` terlebih dahulu. Tambahkan dua baris setelah `SalesReturnFormPage` import:

```jsx
const ProformaInvoicesPage  = lazy(() => import('./pages/sales/ProformaInvoicesPage'))
const ProformaInvoiceFormPage = lazy(() => import('./pages/sales/ProformaInvoiceFormPage'))
```

- [ ] **Step 8.2: Tambah routes di App.jsx**

Setelah baris `<Route path="sales/returns/:id" element={<SalesReturnFormPage />} />` (sekitar baris 163), tambahkan:

```jsx
{/* Proforma Invoices */}
<Route path="sales/proforma" element={<ProformaInvoicesPage />} />
<Route path="sales/proforma/new" element={<RoleGuard require="canWrite"><ProformaInvoiceFormPage /></RoleGuard>} />
<Route path="sales/proforma/:id" element={<ProformaInvoiceFormPage />} />
```

- [ ] **Step 8.3: Tambah print root div di App.jsx**

Di dalam fungsi `App()`, setelah baris 243 (`<div id="invoice-print-root" ...`), tambahkan:

```jsx
<div id="proforma-invoice-print-root" style={{ display: 'none' }} />
```

- [ ] **Step 8.4: Tambah nav item di Sidebar.jsx**

Baca `src/components/layout/Sidebar.jsx`. Di dalam array menu Penjualan (sekitar baris 56-59), tambahkan setelah `{ label: 'Invoice Penjualan', path: '/sales/invoices' }`:

```js
{ label: 'Proforma Invoice', path: '/sales/proforma' },
```

- [ ] **Step 8.5: Commit**

```bash
git add apps/erp-acc/erp-app/src/App.jsx apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): wire proforma invoice routes, print root, and sidebar nav"
```

---

## Task 9: Sales Order Shortcut Button

**Agent: Claude Haiku**
**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx`

- [ ] **Step 9.1: Baca SalesOrderFormPage.jsx untuk menemukan tombol aksi area**

- [ ] **Step 9.2: Tambah tombol "Proforma Invoice" di action bar**

Di bagian `<Space>` yang berisi tombol-tombol aksi (setelah tombol Print/PDF, sebelum atau sesudah Buat Invoice), tambahkan:

```jsx
{!isNew && (
  <Button variant="secondary" onClick={() => navigate(`/sales/proforma/new?so=${id}`)}>
    Proforma Invoice
  </Button>
)}
```

- [ ] **Step 9.3: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx
git commit -m "feat(erp-acc): add Proforma Invoice shortcut button in SalesOrderFormPage"
```

---

## Task 10: Build Verification

**Agent: Claude Haiku**

- [ ] **Step 10.1: Jalankan build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

Expected: build berhasil tanpa error (warnings OK).

- [ ] **Step 10.2: Fix build errors jika ada**

Jika ada import error atau missing export, fix di file yang relevan. Common issues:
- `renderProformaPdf` belum di-export → tambahkan `export` di proformaRenderer.js
- Import path salah → periksa path relatif
- `cancelProformaInvoice` belum di-export dari proformaService.js → tambahkan

- [ ] **Step 10.3: Final commit**

```bash
git add -A
git commit -m "feat(erp-acc): proforma sales invoice feature complete"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Print template (watermark + title + Berlaku Hingga) ✓, PDF renderer (watermark + no status) ✓, List page ✓, Form page (create/edit/cancel/print/SO shortcut) ✓, Navigation ✓, SQL migration ✓
- [x] **No placeholders:** Semua step mengandung kode lengkap
- [x] **Type consistency:** `proforma_number` digunakan konsisten di service, template, renderer, dan form; `valid_until` digunakan konsisten menggantikan `due_date`; `proformaId` konsisten di hook; `PFI` prefix konsisten di migration
- [x] **Dependency order:** Task 1 (SQL) → Task 2 (Service) → Task 3-5 (Template/Renderer/Hook) → Task 6-7 (Pages) → Task 8-9 (Wiring) → Task 10 (Build)
