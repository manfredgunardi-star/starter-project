# Sales & Purchase Returns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan fitur Retur Penjualan (customer mengembalikan barang) dan Retur Pembelian (kita mengembalikan ke supplier), lengkap dengan stock adjustment dan jurnal akuntansi otomatis.

**Architecture:** Dua pasang tabel baru (`sales_returns` + `purchase_returns` + items). Empat SECURITY DEFINER RPCs menangani save dan post. Post langsung adjust inventory (via `inventory_stock_in`/`out`) dan buat jurnal otomatis. Retur bisa partial qty dan multi-retur dari satu SO/PO. Tidak ada approval flow — draft → posted langsung.

**Tech Stack:** React 19, Ant Design 6, Supabase (PostgreSQL), Vite 8. Tidak ada test framework — verifikasi via `npm run build`.

**Confirmed Design Decisions:**
- Langsung adjust stock saat post (tanpa approval)
- Jurnal akuntansi otomatis di dalam RPC post
- Bisa partial qty (qty retur < qty original)
- Bisa multi-retur dari 1 SO/PO

---

## Model & Effort

| Task | Model | Estimasi |
|------|-------|----------|
| T1: SQL Migration — 4 tabel + 4 RPCs | **Codex GPT-5.5** (SQL murni) | ~30 menit |
| T2: salesReturnService.js + useSales.js | **Claude Haiku** (mekanis, 2 file) | ~10 menit |
| T3: purchaseReturnService.js + usePurchase.js | **Claude Haiku** (mekanis, 2 file) | ~10 menit |
| T4: List pages (SalesReturnsPage + PurchaseReturnsPage) | **Claude Haiku** (mekanis, pola sama) | ~15 menit |
| T5: SalesReturnFormPage.jsx | **Claude Sonnet** (form baru kompleks) | ~30 menit |
| T6: PurchaseReturnFormPage.jsx | **Claude Sonnet** (form baru kompleks) | ~30 menit |
| T7: Routing (App.jsx) + Navigation (Sidebar.jsx) | **Claude Haiku** (mekanis, 2 file) | ~10 menit |
| T8: Shortcut buttons di GD + GR form pages | **Claude Haiku** (tambah 1 tombol × 2 file) | ~10 menit |

**Total Claude tasks sebelum Codex:** Tidak ada — T1 Codex dulu.
**Keyword setelah Codex T1 selesai:** `lanjut sales purchase returns integrasi`

---

## File Map

| File | Aksi | Task |
|------|------|------|
| `migrations/007_sales_purchase_returns.sql` | **Create** (Codex) | T1 |
| `src/services/salesReturnService.js` | **Create** | T2 |
| `src/hooks/useSales.js` | **Modify** — add `useSalesReturns` | T2 |
| `src/services/purchaseReturnService.js` | **Create** | T3 |
| `src/hooks/usePurchase.js` | **Modify** — add `usePurchaseReturns` | T3 |
| `src/pages/sales/SalesReturnsPage.jsx` | **Create** | T4 |
| `src/pages/purchase/PurchaseReturnsPage.jsx` | **Create** | T4 |
| `src/pages/sales/SalesReturnFormPage.jsx` | **Create** | T5 |
| `src/pages/purchase/PurchaseReturnFormPage.jsx` | **Create** | T6 |
| `src/App.jsx` | **Modify** — 4 lazy imports + 6 routes | T7 |
| `src/components/layout/Sidebar.jsx` | **Modify** — 2 nav items | T7 |
| `src/pages/sales/GoodsDeliveryFormPage.jsx` | **Modify** — tombol "Buat Retur" | T8 |
| `src/pages/purchase/GoodsReceiptFormPage.jsx` | **Modify** — tombol "Buat Retur" | T8 |

---

## Task 1: SQL Migration — Tabel + RPCs

> **Assigned to: Codex GPT-5.5**
> **File yang harus dibuat:** `apps/erp-acc/erp-app/migrations/007_sales_purchase_returns.sql`
> **Full path untuk Codex:** `C:\Project\apps\erp-acc\erp-app\migrations\007_sales_purchase_returns.sql`

### Context Database (dari introspeksi live DB)

```
Functions yang sudah ada dan WAJIB digunakan:
  generate_number(p_prefix text) RETURNS text
    → auto-increment dengan format PREFIX-YYYY-00001
    → jika prefix belum ada, otomatis INSERT ke sequences table
    → gunakan 'SRN' untuk sales returns, 'PRN' untuk purchase returns

  inventory_stock_in(p_product_id uuid, p_quantity_base numeric, p_unit_cost numeric,
                     p_unit_id uuid, p_quantity_original numeric,
                     p_reference_type text, p_reference_id uuid, p_date date)
    → RETURNS void. Update inventory_stock + INSERT ke inventory_movements.
    → Digunakan saat goods MASUK ke warehouse (sales return = goods kembali dari customer)

  inventory_stock_out(p_product_id uuid, p_quantity_base numeric,
                      p_unit_id uuid, p_quantity_original numeric,
                      p_reference_type text, p_reference_id uuid, p_date date)
    → RETURNS numeric (avg_cost yang digunakan — untuk nilai jurnal)
    → Digunakan saat goods KELUAR dari warehouse (purchase return = kita kembalikan ke supplier)

Helper functions yang sudah ada:
  _ensure_can_post() — cek user punya role yang bisa post
  _ensure_period_open(p_date date) — cek periode tidak locked
  is_admin_or_staff() RETURNS boolean — cek RBAC

COA accounts yang sudah ada (dari coa table, kolom code):
  '1-14000' = Persediaan (Inventory asset)
  '2-11100' = Hutang Barang (AP)
  '5-11000' = HPP (COGS)

Journal tables:
  journals (id, journal_number, date, description, source, reference_type, reference_id,
            customer_id, supplier_id, is_posted, created_by, created_at)
  journal_items (journal_id, coa_id, debit, description) — debit OR credit column
               (journal_id, coa_id, credit, description)

Existing tables yang direferensikan:
  customers(id), suppliers(id), sales_orders(id), purchase_orders(id)
  warehouses(id), products(id), units(id), auth.users(id)
  inventory_stock(product_id, quantity_on_hand, avg_cost)
```

### Bagian 1: Tabel `sales_returns` dan `sales_return_items`

```sql
CREATE TABLE public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_number text NOT NULL,
  date date NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  sales_order_id uuid REFERENCES public.sales_orders(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id uuid NOT NULL
    REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  quantity numeric NOT NULL,
  quantity_base numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);
```

### Bagian 2: Tabel `purchase_returns` dan `purchase_return_items`

```sql
CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text NOT NULL,
  date date NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL
    REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  quantity numeric NOT NULL,
  quantity_base numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);
```

### Bagian 3: RLS Policies

```sql
-- sales_returns: authenticated bisa SELECT, write hanya via SECURITY DEFINER RPC
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sr_select" ON public.sales_returns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sr_insert" ON public.sales_returns
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_staff());
CREATE POLICY "sr_update" ON public.sales_returns
  FOR UPDATE TO authenticated USING (is_admin_or_staff());

-- sales_return_items
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sri_select" ON public.sales_return_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sri_all" ON public.sales_return_items
  FOR ALL TO authenticated USING (is_admin_or_staff())
  WITH CHECK (is_admin_or_staff());

-- purchase_returns
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_select" ON public.purchase_returns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_insert" ON public.purchase_returns
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_staff());
CREATE POLICY "pr_update" ON public.purchase_returns
  FOR UPDATE TO authenticated USING (is_admin_or_staff());

-- purchase_return_items
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pri_select" ON public.purchase_return_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pri_all" ON public.purchase_return_items
  FOR ALL TO authenticated USING (is_admin_or_staff())
  WITH CHECK (is_admin_or_staff());
```

### Bagian 4: RPC `save_sales_return`

```sql
CREATE OR REPLACE FUNCTION public.save_sales_return(
  p_sr jsonb,
  p_items jsonb[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Compute totals from items
  FOREACH v_item IN ARRAY p_items LOOP
    v_subtotal   := v_subtotal   + COALESCE((v_item->>'unit_price')::numeric * (v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + COALESCE((v_item->>'tax_amount')::numeric, 0);
    v_total      := v_total      + COALESCE((v_item->>'total')::numeric, 0);
  END LOOP;

  IF (p_sr->>'id') IS NULL OR (p_sr->>'id') = '' THEN
    -- INSERT new
    v_id := gen_random_uuid();
    INSERT INTO public.sales_returns (
      id, sr_number, date, customer_id, sales_order_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_id,
      generate_number('SRN'),
      (p_sr->>'date')::date,
      (p_sr->>'customer_id')::uuid,
      NULLIF(p_sr->>'sales_order_id', '')::uuid,
      NULLIF(p_sr->>'warehouse_id', '')::uuid,
      COALESCE(NULLIF(p_sr->>'status', ''), 'draft'),
      v_subtotal, v_tax_amount, v_total,
      NULLIF(p_sr->>'notes', ''),
      auth.uid()
    );
  ELSE
    -- UPDATE existing (only if still draft)
    v_id := (p_sr->>'id')::uuid;
    UPDATE public.sales_returns SET
      date          = (p_sr->>'date')::date,
      customer_id   = (p_sr->>'customer_id')::uuid,
      sales_order_id = NULLIF(p_sr->>'sales_order_id', '')::uuid,
      warehouse_id  = NULLIF(p_sr->>'warehouse_id', '')::uuid,
      notes         = NULLIF(p_sr->>'notes', ''),
      subtotal      = v_subtotal,
      tax_amount    = v_tax_amount,
      total         = v_total
    WHERE id = v_id AND status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sales return tidak ditemukan atau sudah diposting';
    END IF;
  END IF;

  -- Replace items
  DELETE FROM public.sales_return_items WHERE sales_return_id = v_id;
  FOREACH v_item IN ARRAY p_items LOOP
    INSERT INTO public.sales_return_items (
      sales_return_id, product_id, unit_id,
      quantity, quantity_base, unit_price, tax_amount, total
    ) VALUES (
      v_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'tax_amount')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;
```

### Bagian 5: RPC `post_sales_return`

Akuntansi: barang KEMBALI dari customer → stock naik, COGS turun.
- DR `1-14000` Persediaan (masuk ke gudang kembali, dinilai avg_cost saat ini)
- CR `5-11000` HPP (reversal COGS)

```sql
CREATE OR REPLACE FUNCTION public.post_sales_return(p_sr_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hpp uuid;
BEGIN
  PERFORM _ensure_can_post();

  SELECT * INTO v_sr FROM public.sales_returns WHERE id = p_sr_id;
  IF v_sr IS NULL THEN
    RAISE EXCEPTION 'Sales return tidak ditemukan';
  END IF;
  IF v_sr.status <> 'draft' THEN
    RAISE EXCEPTION 'Sales return sudah diposting';
  END IF;

  PERFORM _ensure_period_open(v_sr.date);

  SELECT id INTO v_coa_persediaan FROM public.coa WHERE code = '1-14000';
  SELECT id INTO v_coa_hpp        FROM public.coa WHERE code = '5-11000';

  FOR v_item IN
    SELECT * FROM public.sales_return_items WHERE sales_return_id = p_sr_id
  LOOP
    -- Get current avg_cost for journal valuation
    v_avg_cost := COALESCE(
      (SELECT avg_cost FROM public.inventory_stock WHERE product_id = v_item.product_id),
      0
    );
    -- Stock in: goods returned by customer
    PERFORM inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_avg_cost,
      v_item.unit_id, v_item.quantity,
      'sales_return', p_sr_id, v_sr.date
    );
    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  END LOOP;

  -- Journal: DR Persediaan / CR HPP
  v_journal_id := gen_random_uuid();
  INSERT INTO public.journals (
    id, journal_number, date, description, source,
    reference_type, reference_id, customer_id, is_posted, created_by
  ) VALUES (
    v_journal_id, generate_number('JRN'), v_sr.date,
    'Retur Penjualan ' || v_sr.sr_number, 'auto',
    'sales_return', p_sr_id, v_sr.customer_id, true, v_sr.created_by
  );
  INSERT INTO public.journal_items (journal_id, coa_id, debit, description)
    VALUES (v_journal_id, v_coa_persediaan, v_total_cost, 'Persediaan masuk retur - ' || v_sr.sr_number);
  INSERT INTO public.journal_items (journal_id, coa_id, credit, description)
    VALUES (v_journal_id, v_coa_hpp, v_total_cost, 'Reversal HPP retur - ' || v_sr.sr_number);

  UPDATE public.sales_returns SET status = 'posted' WHERE id = p_sr_id;
END;
$$;
```

### Bagian 6: RPC `save_purchase_return`

```sql
CREATE OR REPLACE FUNCTION public.save_purchase_return(
  p_pr jsonb,
  p_items jsonb[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_total numeric := 0;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  FOREACH v_item IN ARRAY p_items LOOP
    v_subtotal := v_subtotal + COALESCE((v_item->>'unit_price')::numeric * (v_item->>'quantity')::numeric, 0);
    v_total    := v_total    + COALESCE((v_item->>'total')::numeric, 0);
  END LOOP;

  IF (p_pr->>'id') IS NULL OR (p_pr->>'id') = '' THEN
    v_id := gen_random_uuid();
    INSERT INTO public.purchase_returns (
      id, pr_number, date, supplier_id, purchase_order_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_id,
      generate_number('PRN'),
      (p_pr->>'date')::date,
      (p_pr->>'supplier_id')::uuid,
      NULLIF(p_pr->>'purchase_order_id', '')::uuid,
      NULLIF(p_pr->>'warehouse_id', '')::uuid,
      COALESCE(NULLIF(p_pr->>'status', ''), 'draft'),
      v_subtotal, 0, v_total,
      NULLIF(p_pr->>'notes', ''),
      auth.uid()
    );
  ELSE
    v_id := (p_pr->>'id')::uuid;
    UPDATE public.purchase_returns SET
      date              = (p_pr->>'date')::date,
      supplier_id       = (p_pr->>'supplier_id')::uuid,
      purchase_order_id = NULLIF(p_pr->>'purchase_order_id', '')::uuid,
      warehouse_id      = NULLIF(p_pr->>'warehouse_id', '')::uuid,
      notes             = NULLIF(p_pr->>'notes', ''),
      subtotal          = v_subtotal,
      total             = v_total
    WHERE id = v_id AND status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase return tidak ditemukan atau sudah diposting';
    END IF;
  END IF;

  DELETE FROM public.purchase_return_items WHERE purchase_return_id = v_id;
  FOREACH v_item IN ARRAY p_items LOOP
    INSERT INTO public.purchase_return_items (
      purchase_return_id, product_id, unit_id,
      quantity, quantity_base, unit_price, total
    ) VALUES (
      v_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;
```

### Bagian 7: RPC `post_purchase_return`

Akuntansi: kita kembalikan barang ke supplier → stock turun, hutang dagang turun.
- DR `2-11100` Hutang Barang (kewajiban kepada supplier berkurang)
- CR `1-14000` Persediaan (barang keluar dari gudang, dinilai avg_cost)

```sql
CREATE OR REPLACE FUNCTION public.post_purchase_return(p_pr_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hutang uuid;
BEGIN
  PERFORM _ensure_can_post();

  SELECT * INTO v_pr FROM public.purchase_returns WHERE id = p_pr_id;
  IF v_pr IS NULL THEN
    RAISE EXCEPTION 'Purchase return tidak ditemukan';
  END IF;
  IF v_pr.status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase return sudah diposting';
  END IF;

  PERFORM _ensure_period_open(v_pr.date);

  SELECT id INTO v_coa_persediaan FROM public.coa WHERE code = '1-14000';
  SELECT id INTO v_coa_hutang     FROM public.coa WHERE code = '2-11100';

  FOR v_item IN
    SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_pr_id
  LOOP
    -- Stock out: we return goods to supplier; returns avg_cost used
    v_avg_cost := inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity,
      'purchase_return', p_pr_id, v_pr.date
    );
    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  END LOOP;

  -- Journal: DR Hutang Barang / CR Persediaan
  v_journal_id := gen_random_uuid();
  INSERT INTO public.journals (
    id, journal_number, date, description, source,
    reference_type, reference_id, supplier_id, is_posted, created_by
  ) VALUES (
    v_journal_id, generate_number('JRN'), v_pr.date,
    'Retur Pembelian ' || v_pr.pr_number, 'auto',
    'purchase_return', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
  );
  INSERT INTO public.journal_items (journal_id, coa_id, debit, description)
    VALUES (v_journal_id, v_coa_hutang, v_total_cost, 'Hutang berkurang retur - ' || v_pr.pr_number);
  INSERT INTO public.journal_items (journal_id, coa_id, credit, description)
    VALUES (v_journal_id, v_coa_persediaan, v_total_cost, 'Persediaan keluar retur - ' || v_pr.pr_number);

  UPDATE public.purchase_returns SET status = 'posted' WHERE id = p_pr_id;
END;
$$;
```

### Bagian 8: GRANTS

```sql
-- Revoke default PUBLIC execute, grant to authenticated only
REVOKE EXECUTE ON FUNCTION public.save_sales_return(jsonb, jsonb[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_sales_return(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_purchase_return(jsonb, jsonb[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_purchase_return(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_sales_return(jsonb, jsonb[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_return(jsonb, jsonb[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_sales_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_return(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_purchase_return(jsonb, jsonb[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_return(jsonb, jsonb[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_purchase_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_return(uuid) TO service_role;
```

---

## Task 2: salesReturnService.js + useSales.js

> **Jalankan SETELAH Task 1 (Codex SQL) selesai dan migration di-apply ke Supabase.**

**Model:** Claude Haiku
**Files:**
- Create: `src/services/salesReturnService.js`
- Modify: `src/hooks/useSales.js`

- [ ] **Step 1: Buat `src/services/salesReturnService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getSalesReturns() {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesReturn(id) {
  const { data, error } = await supabase
    .from('sales_returns')
    .select(`
      *,
      customer:customers(id, name),
      sales_order:sales_orders(id, so_number),
      items:sales_return_items(
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

export async function saveSalesReturn(sr, items) {
  const { data, error } = await supabase.rpc('save_sales_return', {
    p_sr: {
      id:             sr.id             || null,
      date:           sr.date,
      customer_id:    sr.customer_id,
      sales_order_id: sr.sales_order_id || null,
      warehouse_id:   sr.warehouse_id   || null,
      status:         sr.status         || 'draft',
      notes:          sr.notes          || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postSalesReturn(id) {
  const { error } = await supabase.rpc('post_sales_return', { p_sr_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Tambah `useSalesReturns` ke `src/hooks/useSales.js`**

Tambahkan import di baris 3 (setelah import getSalesInvoices):
```js
import { getSalesReturns } from '../services/salesReturnService'
```

Tambahkan fungsi di akhir file:
```js
export function useSalesReturns() {
  const fetcher = useCallback(() => getSalesReturns(), [])
  const { data: returns, loading, error, refetch } = useQuery(fetcher)
  return { returns, loading, error, refetch }
}
```

- [ ] **Step 3: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 4: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/services/salesReturnService.js \
        apps/erp-acc/erp-app/src/hooks/useSales.js
git commit -m "feat(erp-acc): add salesReturnService and useSalesReturns hook"
```

---

## Task 3: purchaseReturnService.js + usePurchase.js

> **Jalankan SETELAH Task 1 (Codex SQL) selesai.**

**Model:** Claude Haiku
**Files:**
- Create: `src/services/purchaseReturnService.js`
- Modify: `src/hooks/usePurchase.js`

- [ ] **Step 1: Buat `src/services/purchaseReturnService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getPurchaseReturns() {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseReturn(id) {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select(`
      *,
      supplier:suppliers(id, name),
      purchase_order:purchase_orders(id, po_number),
      items:purchase_return_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, total,
        product:products(id, name, sku, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function savePurchaseReturn(pr, items) {
  const { data, error } = await supabase.rpc('save_purchase_return', {
    p_pr: {
      id:                pr.id                || null,
      date:              pr.date,
      supplier_id:       pr.supplier_id,
      purchase_order_id: pr.purchase_order_id || null,
      warehouse_id:      pr.warehouse_id      || null,
      status:            pr.status            || 'draft',
      notes:             pr.notes             || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postPurchaseReturn(id) {
  const { error } = await supabase.rpc('post_purchase_return', { p_pr_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Tambah `usePurchaseReturns` ke `src/hooks/usePurchase.js`**

Tambahkan import di baris 3 (setelah import getPurchaseInvoices):
```js
import { getPurchaseReturns } from '../services/purchaseReturnService'
```

Tambahkan fungsi di akhir file:
```js
export function usePurchaseReturns() {
  const fetcher = useCallback(() => getPurchaseReturns(), [])
  const { data: returns, loading, error, refetch } = useQuery(fetcher)
  return { returns, loading, error, refetch }
}
```

- [ ] **Step 3: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 4: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/services/purchaseReturnService.js \
        apps/erp-acc/erp-app/src/hooks/usePurchase.js
git commit -m "feat(erp-acc): add purchaseReturnService and usePurchaseReturns hook"
```

---

## Task 4: List Pages — SalesReturnsPage + PurchaseReturnsPage

**Model:** Claude Haiku
**Files:**
- Create: `src/pages/sales/SalesReturnsPage.jsx`
- Create: `src/pages/purchase/PurchaseReturnsPage.jsx`

- [ ] **Step 1: Buat `src/pages/sales/SalesReturnsPage.jsx`**

Mirror pola `src/pages/sales/SalesOrdersPage.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useSalesReturns } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function SalesReturnsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { returns, loading, error } = useSalesReturns()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    if (!returns) return []
    return returns.filter(r => {
      const matchSearch = !search ||
        r.sr_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || r.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [returns, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat retur penjualan..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Retur Penjualan</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/returns/new')}>
            <Plus size={20} /> Buat Retur
          </Button>
        )}
      </Flex>

      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. retur atau customer..."
            style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Retur</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Customer</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref SO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada retur penjualan
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/sales/returns/${r.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.sr_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(r.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{r.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.sales_order?.so_number || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(r.total)}</td>
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

- [ ] **Step 2: Buat `src/pages/purchase/PurchaseReturnsPage.jsx`**

Mirror pola yang sama — ubah customer → supplier, so_number → po_number, SR → PR, /sales/returns → /purchase/returns, useSalesReturns → usePurchaseReturns (import dari `../../hooks/usePurchase`), "Retur Penjualan" → "Retur Pembelian":

```jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { usePurchaseReturns } from '../../hooks/usePurchase'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

export default function PurchaseReturnsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { returns, loading, error } = usePurchaseReturns()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    if (!returns) return []
    return returns.filter(r => {
      const matchSearch = !search ||
        r.pr_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || r.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [returns, search, statusFilter])

  if (loading) return <LoadingSpinner message="Memuat retur pembelian..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Retur Pembelian</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/purchase/returns/new')}>
            <Plus size={20} /> Buat Retur
          </Button>
        )}
      </Flex>

      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. retur atau supplier..."
            style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>No. Retur</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Tanggal</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Supplier</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref PO</th>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada retur pembelian
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/purchase/returns/${r.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.pr_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(r.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{r.supplier?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{r.purchase_order?.po_number || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(r.total)}</td>
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

- [ ] **Step 3: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 4: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx
git commit -m "feat(erp-acc): add SalesReturnsPage and PurchaseReturnsPage list pages"
```

---

## Task 5: SalesReturnFormPage.jsx

**Model:** Claude Sonnet
**Files:**
- Create: `src/pages/sales/SalesReturnFormPage.jsx`

**Pola referensi:** `src/pages/sales/SalesOrderFormPage.jsx` (punya harga) + `src/pages/sales/GoodsDeliveryFormPage.jsx` (support from_gd via searchParams).

**Behavior:**
- `?from_gd=<id>` → load GoodsDelivery, pre-fill customer_id, sales_order_id, warehouse_id, dan items dari GD (qty dari GD, harga dari product.sell_price)
- Status `draft`: form editable + tombol Simpan + tombol Post
- Status `posted`: form read-only, tidak ada tombol aksi
- Gunakan `LineItemsTable` component (sudah handle harga + tax) dengan `priceField="sell_price"` dan `showTax={true}`

- [ ] **Step 1: Buat file lengkap `src/pages/sales/SalesReturnFormPage.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Col, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { getSalesReturn, saveSalesReturn, postSalesReturn } from '../../services/salesReturnService'
import { getGoodsDelivery } from '../../services/salesService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send } from 'lucide-react'

export default function SalesReturnFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    sr_number: '',
    date: today(),
    customer_id: '',
    sales_order_id: '',
    warehouse_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [warehouses, setWarehouses] = useState([])

  useEffect(() => { toastRef.current = toast }, [toast])

  // Load warehouses
  useEffect(() => {
    let cancelled = false
    async function loadWarehouses() {
      try {
        const [warehouseList, defaultWarehouse] = await Promise.all([
          getWarehouses(),
          isNew ? getDefaultWarehouse() : Promise.resolve(null),
        ])
        if (cancelled) return
        setWarehouses(warehouseList || [])
        if (isNew && defaultWarehouse?.id) {
          setHeader(h => h.warehouse_id ? h : { ...h, warehouse_id: defaultWarehouse.id })
        }
      } catch (err) {
        if (!cancelled) toastRef.current.error(err.message)
      }
    }
    loadWarehouses()
    return () => { cancelled = true }
  }, [isNew])

  // Load existing return if editing
  useEffect(() => {
    if (!isNew) {
      getSalesReturn(id)
        .then(sr => {
          setHeader({
            id: sr.id,
            sr_number: sr.sr_number,
            date: sr.date,
            customer_id: sr.customer_id,
            sales_order_id: sr.sales_order_id || '',
            warehouse_id: sr.warehouse_id || '',
            status: sr.status,
            notes: sr.notes || '',
          })
          setItems(sr.items.map(i => ({
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
        .catch(err => toastRef.current.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  // Pre-fill from GD (shortcut from GoodsDeliveryFormPage)
  useEffect(() => {
    const fromGdId = searchParams.get('from_gd')
    if (!fromGdId || !isNew) return
    getGoodsDelivery(fromGdId)
      .then(gd => {
        setHeader(h => ({
          ...h,
          customer_id: gd.customer_id,
          sales_order_id: gd.sales_order_id || '',
          warehouse_id: gd.warehouse_id || h.warehouse_id,
        }))
        setItems(
          (gd.items || []).map(i => {
            const prod = products.find(p => p.id === i.product_id)
            return {
              _key: i.id,
              product_id: i.product_id,
              unit_id: i.unit_id,
              quantity: i.quantity,
              quantity_base: i.quantity_base,
              unit_price: prod?.sell_price || 0,
              tax_amount: 0,
              total: (prod?.sell_price || 0) * Number(i.quantity),
            }
          })
        )
      })
      .catch(err => toastRef.current.error('Gagal load GD: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = !isNew && header.status === 'posted'

  const handleSave = async () => {
    if (!header.customer_id) { toast.error('Pilih customer terlebih dahulu'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }

    setSubmitting(true)
    try {
      const srId = await saveSalesReturn(
        { id: isNew ? null : id, ...header },
        validItems
      )
      toast.success(isNew ? 'Retur penjualan berhasil dibuat' : 'Retur penjualan berhasil disimpan')
      navigate(`/sales/returns/${srId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postSalesReturn(id)
      toast.success('Retur diposting — stok bertambah, jurnal dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const warehouseOptions = warehouses.map(w => ({
    value: w.id,
    label: w.code ? `${w.code} - ${w.name}` : w.name,
  }))

  if (loading) return <LoadingSpinner message="Memuat retur penjualan..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/returns')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Retur Penjualan Baru' : `Retur ${header.sr_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && header.status === 'draft' && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting}>
              <Send size={18} /> Post Retur
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.sr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      >
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Gudang"
            options={warehouseOptions}
            value={header.warehouse_id || ''}
            onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
            placeholder="Pilih gudang..."
            disabled={readOnly}
          />
        </Col>
      </DocumentHeader>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Retur</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="sell_price"
          readOnly={readOnly}
          showTax
        />
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Retur telah diposting. Stok telah bertambah dan jurnal telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 3: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx
git commit -m "feat(erp-acc): add SalesReturnFormPage"
```

---

## Task 6: PurchaseReturnFormPage.jsx

**Model:** Claude Sonnet
**Files:**
- Create: `src/pages/purchase/PurchaseReturnFormPage.jsx`

**Pola referensi:** `src/pages/purchase/GoodsReceiptFormPage.jsx` + pola form dari T5.
- `?from_gr=<id>` → load GoodsReceipt, pre-fill supplier_id, purchase_order_id, warehouse_id, items dengan unit_price dari GR items
- State: `header` (bukan `po`) — konsisten dengan SalesReturnFormPage
- Gunakan `LineItemsTable` dengan `priceField="buy_price"` dan `showTax={false}` (purchase return tidak ada PPN)

- [ ] **Step 1: Buat file lengkap `src/pages/purchase/PurchaseReturnFormPage.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Col, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import { getPurchaseReturn, savePurchaseReturn, postPurchaseReturn } from '../../services/purchaseReturnService'
import { getGoodsReceipt } from '../../services/purchaseService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send } from 'lucide-react'

export default function PurchaseReturnFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { suppliers } = useSuppliers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    pr_number: '',
    date: today(),
    supplier_id: '',
    purchase_order_id: '',
    warehouse_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [warehouses, setWarehouses] = useState([])

  useEffect(() => { toastRef.current = toast }, [toast])

  // Load warehouses
  useEffect(() => {
    let cancelled = false
    async function loadWarehouses() {
      try {
        const [warehouseList, defaultWarehouse] = await Promise.all([
          getWarehouses(),
          isNew ? getDefaultWarehouse() : Promise.resolve(null),
        ])
        if (cancelled) return
        setWarehouses(warehouseList || [])
        if (isNew && defaultWarehouse?.id) {
          setHeader(h => h.warehouse_id ? h : { ...h, warehouse_id: defaultWarehouse.id })
        }
      } catch (err) {
        if (!cancelled) toastRef.current.error(err.message)
      }
    }
    loadWarehouses()
    return () => { cancelled = true }
  }, [isNew])

  // Load existing return if editing
  useEffect(() => {
    if (!isNew) {
      getPurchaseReturn(id)
        .then(pr => {
          setHeader({
            id: pr.id,
            pr_number: pr.pr_number,
            date: pr.date,
            supplier_id: pr.supplier_id,
            purchase_order_id: pr.purchase_order_id || '',
            warehouse_id: pr.warehouse_id || '',
            status: pr.status,
            notes: pr.notes || '',
          })
          setItems(pr.items.map(i => ({
            _key: i.id,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
            tax_amount: 0,
            total: i.total,
          })))
        })
        .catch(err => toastRef.current.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  // Pre-fill from GR (shortcut from GoodsReceiptFormPage)
  useEffect(() => {
    const fromGrId = searchParams.get('from_gr')
    if (!fromGrId || !isNew) return
    getGoodsReceipt(fromGrId)
      .then(gr => {
        setHeader(h => ({
          ...h,
          supplier_id: gr.supplier_id,
          purchase_order_id: gr.purchase_order_id || '',
          warehouse_id: gr.warehouse_id || h.warehouse_id,
        }))
        setItems(
          (gr.items || []).map(i => ({
            _key: i.id,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price || 0,
            tax_amount: 0,
            total: (i.unit_price || 0) * Number(i.quantity),
          }))
        )
      })
      .catch(err => toastRef.current.error('Gagal load GR: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = !isNew && header.status === 'posted'

  const handleSave = async () => {
    if (!header.supplier_id) { toast.error('Pilih supplier terlebih dahulu'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }

    setSubmitting(true)
    try {
      const prId = await savePurchaseReturn(
        { id: isNew ? null : id, ...header },
        validItems
      )
      toast.success(isNew ? 'Retur pembelian berhasil dibuat' : 'Retur pembelian berhasil disimpan')
      navigate(`/purchase/returns/${prId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postPurchaseReturn(id)
      toast.success('Retur diposting — stok berkurang, jurnal dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const warehouseOptions = warehouses.map(w => ({
    value: w.id,
    label: w.code ? `${w.code} - ${w.name}` : w.name,
  }))

  if (loading) return <LoadingSpinner message="Memuat retur pembelian..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/purchase/returns')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Retur Pembelian Baru' : `Retur ${header.pr_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && header.status === 'draft' && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting}>
              <Send size={18} /> Post Retur
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.pr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Supplier"
        partyId={header.supplier_id}
        onPartyChange={v => setHeader(h => ({ ...h, supplier_id: v }))}
        partyOptions={supplierOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      >
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Gudang"
            options={warehouseOptions}
            value={header.warehouse_id || ''}
            onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
            placeholder="Pilih gudang..."
            disabled={readOnly}
          />
        </Col>
      </DocumentHeader>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Retur</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="buy_price"
          readOnly={readOnly}
          showTax={false}
        />
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Retur telah diposting. Stok telah berkurang dan jurnal telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 3: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx
git commit -m "feat(erp-acc): add PurchaseReturnFormPage"
```

---

## Task 7: Routing (App.jsx) + Navigation (Sidebar.jsx)

**Model:** Claude Haiku
**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Tambah lazy imports di `src/App.jsx`**

Tambahkan 4 lazy imports setelah baris `const SalesInvoiceFormPage = lazy(...)` (Sales section):

```js
const SalesReturnsPage = lazy(() => import('./pages/sales/SalesReturnsPage'))
const SalesReturnFormPage = lazy(() => import('./pages/sales/SalesReturnFormPage'))
```

Tambahkan 2 lazy imports setelah baris `const PurchaseInvoiceFormPage = lazy(...)` (Purchase section):

```js
const PurchaseReturnsPage = lazy(() => import('./pages/purchase/PurchaseReturnsPage'))
const PurchaseReturnFormPage = lazy(() => import('./pages/purchase/PurchaseReturnFormPage'))
```

- [ ] **Step 2: Tambah routes di `src/App.jsx`**

Tambahkan setelah route `sales/invoices/:id` (di dalam blok `{/* Sales */}`):

```jsx
          {/* Sales Returns */}
          <Route path="sales/returns" element={<SalesReturnsPage />} />
          <Route path="sales/returns/new" element={<RoleGuard require="canWrite"><SalesReturnFormPage /></RoleGuard>} />
          <Route path="sales/returns/:id" element={<SalesReturnFormPage />} />
```

Tambahkan setelah route `purchase/invoices/:id` (di dalam blok `{/* Purchase */}`):

```jsx
          {/* Purchase Returns */}
          <Route path="purchase/returns" element={<PurchaseReturnsPage />} />
          <Route path="purchase/returns/new" element={<RoleGuard require="canWrite"><PurchaseReturnFormPage /></RoleGuard>} />
          <Route path="purchase/returns/:id" element={<PurchaseReturnFormPage />} />
```

- [ ] **Step 3: Tambah nav items di `src/components/layout/Sidebar.jsx`**

Di `menuGroups`, cari group `penjualan` (key: 'penjualan'). Tambahkan item setelah `{ label: 'Invoice Penjualan', path: '/sales/invoices' }`:

```js
      { label: 'Retur Penjualan', path: '/sales/returns' },
```

Cari group `pembelian` (key: 'pembelian'). Tambahkan setelah `{ label: 'Invoice Pembelian', path: '/purchase/invoices' }`:

```js
      { label: 'Retur Pembelian', path: '/purchase/returns' },
```

- [ ] **Step 4: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 5: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/App.jsx \
        apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): add routing and navigation for sales/purchase returns"
```

---

## Task 8: Shortcut Buttons di GD + GR Form Pages

**Model:** Claude Haiku
**Files:**
- Modify: `src/pages/sales/GoodsDeliveryFormPage.jsx`
- Modify: `src/pages/purchase/GoodsReceiptFormPage.jsx`

- [ ] **Step 1: Tambah tombol "Buat Retur" di `GoodsDeliveryFormPage.jsx`**

File: `src/pages/sales/GoodsDeliveryFormPage.jsx`

Tambahkan import `RotateCcw` ke baris lucide-react yang sudah ada (baris 13):
```js
// Ganti:
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'
// Menjadi:
import { ArrowLeft, Save, Send, Trash2, Plus, FileText, RotateCcw } from 'lucide-react'
```

Tambahkan satu tombol di dalam `<Space>` button toolbar, setelah tombol "Buat SI dari GD ini" (sekitar baris 222–226):

```jsx
          {!isNew && header.status === 'posted' && canWrite && (
            <Button variant="secondary" onClick={() => navigate(`/sales/returns/new?from_gd=${id}`)}>
              <RotateCcw size={18} /> Buat Retur
            </Button>
          )}
```

- [ ] **Step 2: Tambah tombol "Buat Retur" di `GoodsReceiptFormPage.jsx`**

File: `src/pages/purchase/GoodsReceiptFormPage.jsx`

Tambahkan import `RotateCcw` ke baris lucide-react (baris 13):
```js
// Ganti:
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'
// Menjadi:
import { ArrowLeft, Save, Send, Trash2, Plus, FileText, RotateCcw } from 'lucide-react'
```

Cari `<Space>` button toolbar di GoodsReceiptFormPage (sekitar baris 214–225). Tambahkan tombol setelah tombol "Buat PI dari GR ini" (jika ada) atau setelah tombol Post:

```jsx
          {!isNew && header.status === 'posted' && canWrite && (
            <Button variant="secondary" onClick={() => navigate(`/purchase/returns/new?from_gr=${id}`)}>
              <RotateCcw size={18} /> Buat Retur
            </Button>
          )}
```

**Catatan:** GoodsReceiptFormPage menggunakan state `header` (bukan `po`), sama dengan GoodsDeliveryFormPage. Pastikan kondisi `header.status === 'posted'` mengacu pada state variable yang benar. Baca file dulu untuk konfirmasi nama dan posisi exisiting buttons sebelum mengedit.

- [ ] **Step 3: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 4: Commit**

```bash
cd C:\Project
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx
git commit -m "feat(erp-acc): add Buat Retur shortcut buttons to GD and GR form pages"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Task |
|-------------|------|
| Retur penjualan — customer kembalikan barang | T1+T2+T5 |
| Retur pembelian — kita kembalikan ke supplier | T1+T3+T6 |
| Stock adjust langsung saat post (tanpa approval) | T1 `post_sales_return`/`post_purchase_return` |
| Jurnal akuntansi otomatis | T1: DR Persediaan/CR HPP (sales), DR Hutang/CR Persediaan (purchase) |
| Partial qty | ✅ Tidak ada validasi qty max — user input bebas |
| Multi-retur dari 1 SO/PO | ✅ Tidak ada unique constraint per SO/PO |
| List page dengan filter | T4 |
| Form dengan Save Draft + Post | T5+T6 |
| Shortcut dari GD/GR | T8 (`?from_gd`, `?from_gr`) |
| Nav menu | T7 Sidebar.jsx |
| Routing | T7 App.jsx |

### 2. Placeholder Scan

Tidak ada TBD, TODO, atau "implement later" di plan ini.

### 3. Type Consistency

- `saveSalesReturn(sr, items)` — didefinisikan T2, dipakai T5 ✅
- `postSalesReturn(id)` — didefinisikan T2, dipakai T5 ✅
- `savePurchaseReturn(pr, items)` — didefinisikan T3, dipakai T6 ✅
- `postPurchaseReturn(id)` — didefinisikan T3, dipakai T6 ✅
- RPC `save_sales_return(p_sr jsonb, p_items jsonb[])` — T1, dipanggil T2 ✅
- RPC `post_sales_return(p_sr_id uuid)` — T1, dipanggil T2 ✅
- RPC `save_purchase_return(p_pr jsonb, p_items jsonb[])` — T1, dipanggil T3 ✅
- RPC `post_purchase_return(p_pr_id uuid)` — T1, dipanggil T3 ✅
- State `header` di SalesReturnFormPage + PurchaseReturnFormPage (bukan `sr`/`pr`) — konsisten antara T5 dan T6 ✅
