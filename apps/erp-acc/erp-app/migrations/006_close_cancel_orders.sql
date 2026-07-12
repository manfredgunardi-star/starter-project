-- ============================================================
-- Migration 006: Close and Cancel Sales/Purchase Orders
-- ============================================================
-- Adds terminal close/cancel statuses and server-side RPCs for
-- controlled order status transitions.

-- -------------------------------------------------------
-- 1. Update order status constraints
-- -------------------------------------------------------
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_status_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status = ANY (ARRAY['draft', 'confirmed', 'invoiced', 'done', 'closed', 'cancelled']));

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['draft', 'confirmed', 'received', 'done', 'closed', 'cancelled']));

-- -------------------------------------------------------
-- 2. cancel_sales_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_sales_order(p_so_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT so.status
    INTO v_status
    FROM public.sales_orders so
   WHERE so.id = p_so_id
   FOR UPDATE;

  IF v_status IS NULL OR v_status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Sales order tidak dapat dibatalkan (status tidak valid)';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.goods_deliveries gd
     WHERE gd.sales_order_id = p_so_id
       AND gd.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Tidak dapat dibatalkan: ada pengiriman barang yang sudah diposting';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.invoices i
     WHERE i.sales_order_id = p_so_id
       AND i.type = 'sales'
       AND i.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Tidak dapat dibatalkan: ada invoice yang sudah diposting';
  END IF;

  UPDATE public.sales_orders
     SET status = 'cancelled'
   WHERE id = p_so_id;
END;
$$;

-- -------------------------------------------------------
-- 3. close_sales_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_sales_order(p_so_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT so.status
    INTO v_status
    FROM public.sales_orders so
   WHERE so.id = p_so_id
   FOR UPDATE;

  IF v_status IS NULL OR v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Sales order tidak dapat ditutup (harus berstatus confirmed)';
  END IF;

  UPDATE public.sales_orders
     SET status = 'closed'
   WHERE id = p_so_id;
END;
$$;

-- -------------------------------------------------------
-- 4. cancel_purchase_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT po.status
    INTO v_status
    FROM public.purchase_orders po
   WHERE po.id = p_po_id
   FOR UPDATE;

  IF v_status IS NULL OR v_status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Purchase order tidak dapat dibatalkan (status tidak valid)';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.goods_receipts gr
     WHERE gr.purchase_order_id = p_po_id
       AND gr.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Tidak dapat dibatalkan: ada penerimaan barang yang sudah diposting';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.invoices i
     WHERE i.purchase_order_id = p_po_id
       AND i.type = 'purchase'
       AND i.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Tidak dapat dibatalkan: ada invoice yang sudah diposting';
  END IF;

  UPDATE public.purchase_orders
     SET status = 'cancelled'
   WHERE id = p_po_id;
END;
$$;

-- -------------------------------------------------------
-- 5. close_purchase_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT po.status
    INTO v_status
    FROM public.purchase_orders po
   WHERE po.id = p_po_id
   FOR UPDATE;

  IF v_status IS NULL OR v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Purchase order tidak dapat ditutup (harus berstatus confirmed)';
  END IF;

  UPDATE public.purchase_orders
     SET status = 'closed'
   WHERE id = p_po_id;
END;
$$;

-- -------------------------------------------------------
-- 6. Grants
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.cancel_sales_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_sales_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_purchase_order(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sales_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_sales_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_purchase_order(uuid) TO service_role;
