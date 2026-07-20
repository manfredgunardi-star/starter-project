-- ============================================================
-- Migration 007: Sales and Purchase Returns
-- ============================================================
-- Adds draft/posted return documents, return line items, RLS policies,
-- and SECURITY DEFINER RPCs for atomic save/post workflows.

-- ------------------------------------------------------------
-- 1. Sales returns
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. Purchase returns
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. RLS policies
-- ------------------------------------------------------------
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sr_select" ON public.sales_returns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sr_insert" ON public.sales_returns
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_staff());

CREATE POLICY "sr_update" ON public.sales_returns
  FOR UPDATE TO authenticated USING (public.is_admin_or_staff());

ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sri_select" ON public.sales_return_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sri_all" ON public.sales_return_items
  FOR ALL TO authenticated USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select" ON public.purchase_returns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pr_insert" ON public.purchase_returns
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_staff());

CREATE POLICY "pr_update" ON public.purchase_returns
  FOR UPDATE TO authenticated USING (public.is_admin_or_staff());

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pri_select" ON public.purchase_return_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pri_all" ON public.purchase_return_items
  FOR ALL TO authenticated USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ------------------------------------------------------------
-- 4. save_sales_return
-- ------------------------------------------------------------
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
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  PERFORM public._ensure_period_open((p_sr->>'date')::date);

  FOREACH v_item IN ARRAY p_items LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'unit_price')::numeric, 0)
        * COALESCE((v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + COALESCE((v_item->>'tax_amount')::numeric, 0);
    v_total := v_total + COALESCE((v_item->>'total')::numeric, 0);
  END LOOP;

  IF (p_sr->>'id') IS NULL OR (p_sr->>'id') = '' THEN
    v_id := gen_random_uuid();

    INSERT INTO public.sales_returns (
      id, sr_number, date, customer_id, sales_order_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_id,
      public.generate_number('SRN'),
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
    v_id := (p_sr->>'id')::uuid;

    UPDATE public.sales_returns
       SET date           = (p_sr->>'date')::date,
           customer_id    = (p_sr->>'customer_id')::uuid,
           sales_order_id = NULLIF(p_sr->>'sales_order_id', '')::uuid,
           warehouse_id   = NULLIF(p_sr->>'warehouse_id', '')::uuid,
           notes          = NULLIF(p_sr->>'notes', ''),
           subtotal       = v_subtotal,
           tax_amount     = v_tax_amount,
           total          = v_total
     WHERE id = v_id
       AND status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sales return tidak ditemukan atau sudah diposting';
    END IF;
  END IF;

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

-- ------------------------------------------------------------
-- 5. post_sales_return
-- ------------------------------------------------------------
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
  PERFORM public._ensure_can_post();

  SELECT *
    INTO v_sr
    FROM public.sales_returns
   WHERE id = p_sr_id
   FOR UPDATE;

  IF v_sr IS NULL THEN
    RAISE EXCEPTION 'Sales return tidak ditemukan';
  END IF;

  IF v_sr.status <> 'draft' THEN
    RAISE EXCEPTION 'Sales return sudah diposting';
  END IF;

  PERFORM public._ensure_period_open(v_sr.date);

  SELECT id INTO v_coa_persediaan FROM public.coa WHERE code = '1-14000';
  SELECT id INTO v_coa_hpp FROM public.coa WHERE code = '5-11000';

  IF v_coa_persediaan IS NULL OR v_coa_hpp IS NULL THEN
    RAISE EXCEPTION 'COA retur penjualan tidak lengkap';
  END IF;

  FOR v_item IN
    SELECT * FROM public.sales_return_items WHERE sales_return_id = p_sr_id
  LOOP
    v_avg_cost := COALESCE(
      (SELECT avg_cost FROM public.inventory_stock WHERE product_id = v_item.product_id),
      0
    );

    PERFORM public.inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_avg_cost,
      v_item.unit_id, v_item.quantity,
      'sales_return', p_sr_id, v_sr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  END LOOP;

  IF v_total_cost > 0 THEN
    v_journal_id := gen_random_uuid();

    INSERT INTO public.journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, customer_id, is_posted, created_by
    ) VALUES (
      v_journal_id, public.generate_number('JRN'), v_sr.date,
      'Retur Penjualan ' || v_sr.sr_number, 'auto',
      'sales_return', p_sr_id, v_sr.customer_id, true, v_sr.created_by
    );

    INSERT INTO public.journal_items (journal_id, coa_id, debit, description)
      VALUES (
        v_journal_id,
        v_coa_persediaan,
        v_total_cost,
        'Persediaan masuk retur - ' || v_sr.sr_number
      );

    INSERT INTO public.journal_items (journal_id, coa_id, credit, description)
      VALUES (
        v_journal_id,
        v_coa_hpp,
        v_total_cost,
        'Reversal HPP retur - ' || v_sr.sr_number
      );
  END IF;

  UPDATE public.sales_returns SET status = 'posted' WHERE id = p_sr_id;
END;
$$;

-- ------------------------------------------------------------
-- 6. save_purchase_return
-- ------------------------------------------------------------
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
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  PERFORM public._ensure_period_open((p_pr->>'date')::date);

  FOREACH v_item IN ARRAY p_items LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'unit_price')::numeric, 0)
        * COALESCE((v_item->>'quantity')::numeric, 0);
    v_total := v_total + COALESCE((v_item->>'total')::numeric, 0);
  END LOOP;

  IF (p_pr->>'id') IS NULL OR (p_pr->>'id') = '' THEN
    v_id := gen_random_uuid();

    INSERT INTO public.purchase_returns (
      id, pr_number, date, supplier_id, purchase_order_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_id,
      public.generate_number('PRN'),
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

    UPDATE public.purchase_returns
       SET date              = (p_pr->>'date')::date,
           supplier_id       = (p_pr->>'supplier_id')::uuid,
           purchase_order_id = NULLIF(p_pr->>'purchase_order_id', '')::uuid,
           warehouse_id      = NULLIF(p_pr->>'warehouse_id', '')::uuid,
           notes             = NULLIF(p_pr->>'notes', ''),
           subtotal          = v_subtotal,
           tax_amount        = 0,
           total             = v_total
     WHERE id = v_id
       AND status = 'draft';

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

-- ------------------------------------------------------------
-- 7. post_purchase_return
-- ------------------------------------------------------------
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
  PERFORM public._ensure_can_post();

  SELECT *
    INTO v_pr
    FROM public.purchase_returns
   WHERE id = p_pr_id
   FOR UPDATE;

  IF v_pr IS NULL THEN
    RAISE EXCEPTION 'Purchase return tidak ditemukan';
  END IF;

  IF v_pr.status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase return sudah diposting';
  END IF;

  PERFORM public._ensure_period_open(v_pr.date);

  SELECT id INTO v_coa_persediaan FROM public.coa WHERE code = '1-14000';
  SELECT id INTO v_coa_hutang FROM public.coa WHERE code = '2-11100';

  IF v_coa_persediaan IS NULL OR v_coa_hutang IS NULL THEN
    RAISE EXCEPTION 'COA retur pembelian tidak lengkap';
  END IF;

  FOR v_item IN
    SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_pr_id
  LOOP
    v_avg_cost := public.inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity,
      'purchase_return', p_pr_id, v_pr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  END LOOP;

  IF v_total_cost > 0 THEN
    v_journal_id := gen_random_uuid();

    INSERT INTO public.journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, supplier_id, is_posted, created_by
    ) VALUES (
      v_journal_id, public.generate_number('JRN'), v_pr.date,
      'Retur Pembelian ' || v_pr.pr_number, 'auto',
      'purchase_return', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
    );

    INSERT INTO public.journal_items (journal_id, coa_id, debit, description)
      VALUES (
        v_journal_id,
        v_coa_hutang,
        v_total_cost,
        'Hutang berkurang retur - ' || v_pr.pr_number
      );

    INSERT INTO public.journal_items (journal_id, coa_id, credit, description)
      VALUES (
        v_journal_id,
        v_coa_persediaan,
        v_total_cost,
        'Persediaan keluar retur - ' || v_pr.pr_number
      );
  END IF;

  UPDATE public.purchase_returns SET status = 'posted' WHERE id = p_pr_id;
END;
$$;

-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------
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
