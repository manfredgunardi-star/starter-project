-- ============================================================
-- Migration 004: Fix document save RPC atomic metadata fields
-- ============================================================
-- Moves payment_term_id and warehouse_id into existing document-save RPCs
-- so the client no longer needs a second UPDATE after the atomic save.
--
-- Keep p_items as jsonb to replace the active functions used by the
-- Supabase client. Creating jsonb[] overloads would not replace the current
-- RPC signatures.

-- -------------------------------------------------------
-- 1. save_sales_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_sales_order(
  p_so    jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so_id     uuid;
  v_number    text;
  v_subtotal  numeric := 0;
  v_tax       numeric := 0;
  v_total     numeric := 0;
  v_item      jsonb;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_so->>'date')::date);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'quantity')::numeric, 0)
        * COALESCE((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + COALESCE((v_item->>'tax_amount')::numeric, 0);
  END LOOP;
  v_total := v_subtotal + v_tax;

  v_so_id := NULLIF(p_so->>'id', '')::uuid;

  IF v_so_id IS NULL THEN
    v_number := generate_number('SO');
    v_so_id  := gen_random_uuid();
    INSERT INTO sales_orders (
      id, so_number, date, customer_id, payment_term_id, warehouse_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_so_id, v_number,
      (p_so->>'date')::date,
      (p_so->>'customer_id')::uuid,
      NULLIF(p_so->>'payment_term_id', '')::uuid,
      NULLIF(p_so->>'warehouse_id', '')::uuid,
      COALESCE(p_so->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      NULLIF(p_so->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE sales_orders
       SET date            = (p_so->>'date')::date,
           customer_id     = (p_so->>'customer_id')::uuid,
           payment_term_id = NULLIF(p_so->>'payment_term_id', '')::uuid,
           warehouse_id    = NULLIF(p_so->>'warehouse_id', '')::uuid,
           subtotal        = v_subtotal,
           tax_amount      = v_tax,
           total           = v_total,
           notes           = NULLIF(p_so->>'notes', '')
     WHERE id = v_so_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sales order tidak dapat diubah (sudah dikonfirmasi atau tidak ditemukan)';
    END IF;
    DELETE FROM sales_order_items WHERE sales_order_id = v_so_id;
  END IF;

  INSERT INTO sales_order_items (
    sales_order_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  SELECT
    v_so_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    COALESCE((i->>'unit_price')::numeric, 0),
    COALESCE((i->>'tax_amount')::numeric, 0),
    COALESCE((i->>'total')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_so_id;
END $$;

-- -------------------------------------------------------
-- 2. save_goods_delivery
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_goods_delivery(
  p_gd    jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gd_id  uuid;
  v_number text;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_gd->>'date')::date);

  v_gd_id := NULLIF(p_gd->>'id', '')::uuid;

  IF v_gd_id IS NULL THEN
    v_number := generate_number('GD');
    v_gd_id  := gen_random_uuid();
    INSERT INTO goods_deliveries (
      id, gd_number, date, customer_id, sales_order_id,
      warehouse_id, status, notes, created_by
    ) VALUES (
      v_gd_id, v_number,
      (p_gd->>'date')::date,
      (p_gd->>'customer_id')::uuid,
      NULLIF(p_gd->>'sales_order_id', '')::uuid,
      NULLIF(p_gd->>'warehouse_id', '')::uuid,
      COALESCE(p_gd->>'status', 'draft'),
      NULLIF(p_gd->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE goods_deliveries
       SET date            = (p_gd->>'date')::date,
           customer_id     = (p_gd->>'customer_id')::uuid,
           sales_order_id  = NULLIF(p_gd->>'sales_order_id', '')::uuid,
           warehouse_id    = NULLIF(p_gd->>'warehouse_id', '')::uuid,
           notes           = NULLIF(p_gd->>'notes', '')
     WHERE id = v_gd_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'goods delivery tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    END IF;
    DELETE FROM goods_delivery_items WHERE goods_delivery_id = v_gd_id;
  END IF;

  INSERT INTO goods_delivery_items (
    goods_delivery_id, product_id, unit_id, quantity, quantity_base
  )
  SELECT
    v_gd_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_gd_id;
END $$;

-- -------------------------------------------------------
-- 3. save_sales_invoice
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_sales_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_invoice->>'date')::date);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'quantity')::numeric, 0)
        * COALESCE((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + COALESCE((v_item->>'tax_amount')::numeric, 0);
  END LOOP;
  v_total := v_subtotal + v_tax;

  v_inv_id := NULLIF(p_invoice->>'id', '')::uuid;

  IF v_inv_id IS NULL THEN
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    INSERT INTO invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, payment_term_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      NULLIF(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      NULLIF(p_invoice->>'sales_order_id',    '')::uuid,
      NULLIF(p_invoice->>'goods_delivery_id', '')::uuid,
      NULLIF(p_invoice->>'payment_term_id',   '')::uuid,
      COALESCE(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      NULLIF(p_invoice->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE invoices
       SET date              = (p_invoice->>'date')::date,
           due_date          = NULLIF(p_invoice->>'due_date', '')::date,
           customer_id       = (p_invoice->>'customer_id')::uuid,
           sales_order_id    = NULLIF(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id = NULLIF(p_invoice->>'goods_delivery_id', '')::uuid,
           payment_term_id   = NULLIF(p_invoice->>'payment_term_id',   '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = NULLIF(p_invoice->>'notes', '')
     WHERE id = v_inv_id AND status = 'draft' AND type = 'sales';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sales invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    END IF;
    DELETE FROM invoice_items WHERE invoice_id = v_inv_id;
  END IF;

  INSERT INTO invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  SELECT
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    COALESCE((i->>'unit_price')::numeric, 0),
    COALESCE((i->>'tax_amount')::numeric, 0),
    COALESCE((i->>'total')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_inv_id;
END $$;

-- -------------------------------------------------------
-- 4. save_purchase_order
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_purchase_order(
  p_po    jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id    uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_po->>'date')::date);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric, 0)
        * COALESCE((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + COALESCE((v_item->>'tax_amount')::numeric, 0);
  END LOOP;
  v_total := v_subtotal + v_tax;

  v_po_id := NULLIF(p_po->>'id', '')::uuid;

  IF v_po_id IS NULL THEN
    v_number := generate_number('PO');
    v_po_id  := gen_random_uuid();
    INSERT INTO purchase_orders (
      id, po_number, date, supplier_id, payment_term_id, warehouse_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_po_id, v_number,
      (p_po->>'date')::date,
      (p_po->>'supplier_id')::uuid,
      NULLIF(p_po->>'payment_term_id', '')::uuid,
      NULLIF(p_po->>'warehouse_id', '')::uuid,
      COALESCE(p_po->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      NULLIF(p_po->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE purchase_orders
       SET date            = (p_po->>'date')::date,
           supplier_id     = (p_po->>'supplier_id')::uuid,
           payment_term_id = NULLIF(p_po->>'payment_term_id', '')::uuid,
           warehouse_id    = NULLIF(p_po->>'warehouse_id', '')::uuid,
           subtotal        = v_subtotal,
           tax_amount      = v_tax,
           total           = v_total,
           notes           = NULLIF(p_po->>'notes', '')
     WHERE id = v_po_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase order tidak dapat diubah (sudah dikonfirmasi atau tidak ditemukan)';
    END IF;
    DELETE FROM purchase_order_items WHERE purchase_order_id = v_po_id;
  END IF;

  INSERT INTO purchase_order_items (
    purchase_order_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  SELECT
    v_po_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    COALESCE((i->>'unit_price')::numeric, 0),
    COALESCE((i->>'tax_amount')::numeric, 0),
    COALESCE((i->>'total')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_po_id;
END $$;

-- -------------------------------------------------------
-- 5. save_goods_receipt
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_goods_receipt(
  p_gr    jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gr_id  uuid;
  v_number text;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_gr->>'date')::date);

  v_gr_id := NULLIF(p_gr->>'id', '')::uuid;

  IF v_gr_id IS NULL THEN
    v_number := generate_number('GR');
    v_gr_id  := gen_random_uuid();
    INSERT INTO goods_receipts (
      id, gr_number, date, supplier_id, purchase_order_id,
      warehouse_id, status, notes, created_by
    ) VALUES (
      v_gr_id, v_number,
      (p_gr->>'date')::date,
      (p_gr->>'supplier_id')::uuid,
      NULLIF(p_gr->>'purchase_order_id', '')::uuid,
      NULLIF(p_gr->>'warehouse_id', '')::uuid,
      COALESCE(p_gr->>'status', 'draft'),
      NULLIF(p_gr->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE goods_receipts
       SET date               = (p_gr->>'date')::date,
           supplier_id        = (p_gr->>'supplier_id')::uuid,
           purchase_order_id  = NULLIF(p_gr->>'purchase_order_id', '')::uuid,
           warehouse_id       = NULLIF(p_gr->>'warehouse_id', '')::uuid,
           notes              = NULLIF(p_gr->>'notes', '')
     WHERE id = v_gr_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'goods receipt tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    END IF;
    DELETE FROM goods_receipt_items WHERE goods_receipt_id = v_gr_id;
  END IF;

  INSERT INTO goods_receipt_items (
    goods_receipt_id, product_id, unit_id,
    quantity, quantity_base, unit_price
  )
  SELECT
    v_gr_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    COALESCE((i->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_gr_id;
END $$;

-- -------------------------------------------------------
-- 6. save_purchase_invoice
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION save_purchase_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  PERFORM _ensure_period_open((p_invoice->>'date')::date);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'quantity')::numeric, 0)
        * COALESCE((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + COALESCE((v_item->>'tax_amount')::numeric, 0);
  END LOOP;
  v_total := v_subtotal + v_tax;

  v_inv_id := NULLIF(p_invoice->>'id', '')::uuid;

  IF v_inv_id IS NULL THEN
    v_number := generate_number('PINV');
    v_inv_id  := gen_random_uuid();
    INSERT INTO invoices (
      id, invoice_number, date, due_date, type, supplier_id,
      purchase_order_id, goods_receipt_id, payment_term_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) VALUES (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      NULLIF(p_invoice->>'due_date', '')::date,
      'purchase',
      (p_invoice->>'supplier_id')::uuid,
      NULLIF(p_invoice->>'purchase_order_id', '')::uuid,
      NULLIF(p_invoice->>'goods_receipt_id',  '')::uuid,
      NULLIF(p_invoice->>'payment_term_id',   '')::uuid,
      COALESCE(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      NULLIF(p_invoice->>'notes', ''),
      auth.uid()
    );
  ELSE
    UPDATE invoices
       SET date              = (p_invoice->>'date')::date,
           due_date          = NULLIF(p_invoice->>'due_date', '')::date,
           supplier_id       = (p_invoice->>'supplier_id')::uuid,
           purchase_order_id = NULLIF(p_invoice->>'purchase_order_id', '')::uuid,
           goods_receipt_id  = NULLIF(p_invoice->>'goods_receipt_id',  '')::uuid,
           payment_term_id   = NULLIF(p_invoice->>'payment_term_id',   '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = NULLIF(p_invoice->>'notes', '')
     WHERE id = v_inv_id AND status = 'draft' AND type = 'purchase';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    END IF;
    DELETE FROM invoice_items WHERE invoice_id = v_inv_id;
  END IF;

  INSERT INTO invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  SELECT
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    COALESCE((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    COALESCE((i->>'unit_price')::numeric, 0),
    COALESCE((i->>'tax_amount')::numeric, 0),
    COALESCE((i->>'total')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_inv_id;
END $$;
