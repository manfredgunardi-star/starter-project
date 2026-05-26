-- ============================================================
-- Migration 003: Dashboard Aggregate RPC
-- ============================================================
-- Consolidates dashboard metric queries into one SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_today date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := date_trunc('month', p_today)::date;
  v_last_month_start date := (date_trunc('month', p_today) - interval '1 month')::date;
  v_last_month_end date := (date_trunc('month', p_today) - interval '1 day')::date;
BEGIN
  RETURN jsonb_build_object(
    'total_penjualan',
      COALESCE((
        SELECT SUM(i.total)
        FROM invoices i
        WHERE i.type = 'sales'
          AND i.status IN ('posted', 'partial', 'paid')
          AND i.date >= v_month_start
          AND i.date <= p_today
      ), 0),

    'total_piutang',
      COALESCE((
        SELECT SUM(i.total - COALESCE(i.amount_paid, 0))
        FROM invoices i
        WHERE i.type = 'sales'
          AND i.status IN ('posted', 'partial')
      ), 0),

    'total_hutang',
      COALESCE((
        SELECT SUM(i.total - COALESCE(i.amount_paid, 0))
        FROM invoices i
        WHERE i.type = 'purchase'
          AND i.status IN ('posted', 'partial')
      ), 0),

    'total_kas',
      COALESCE((
        SELECT SUM(a.balance)
        FROM accounts a
        WHERE a.is_active = true
          AND a.deleted_at IS NULL
      ), 0),

    'total_overdue_piutang',
      COALESCE((
        SELECT SUM(i.total - COALESCE(i.amount_paid, 0))
        FROM invoices i
        WHERE i.type = 'sales'
          AND i.status IN ('posted', 'partial')
          AND i.due_date IS NOT NULL
          AND i.due_date < p_today
      ), 0),

    'total_overdue_hutang',
      COALESCE((
        SELECT SUM(i.total - COALESCE(i.amount_paid, 0))
        FROM invoices i
        WHERE i.type = 'purchase'
          AND i.status IN ('posted', 'partial')
          AND i.due_date IS NOT NULL
          AND i.due_date < p_today
      ), 0),

    'last_month_penjualan',
      COALESCE((
        SELECT SUM(i.total)
        FROM invoices i
        WHERE i.type = 'sales'
          AND i.status IN ('posted', 'partial', 'paid')
          AND i.date >= v_last_month_start
          AND i.date <= v_last_month_end
      ), 0),

    'low_stock',
      COALESCE((
        SELECT jsonb_agg(stock_row.item)
        FROM (
          SELECT jsonb_build_object(
            'quantity_on_hand', s.quantity_on_hand,
            'product', jsonb_build_object(
              'id', p.id,
              'name', p.name,
              'sku', p.sku,
              'base_unit', jsonb_build_object('name', u.name)
            )
          ) AS item
          FROM inventory_stock s
          JOIN products p ON p.id = s.product_id
          LEFT JOIN units u ON u.id = p.base_unit_id
          WHERE s.quantity_on_hand <= 10
          ORDER BY s.quantity_on_hand ASC
          LIMIT 8
        ) stock_row
      ), '[]'::jsonb),

    'recent_sales',
      COALESCE((
        SELECT jsonb_agg(sales_row.item)
        FROM (
          SELECT jsonb_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'date', i.date,
            'total', i.total,
            'status', i.status,
            'customer', CASE
              WHEN c.id IS NULL THEN NULL
              ELSE jsonb_build_object('name', c.name)
            END
          ) AS item
          FROM invoices i
          LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.type = 'sales'
          ORDER BY i.created_at DESC
          LIMIT 5
        ) sales_row
      ), '[]'::jsonb),

    'recent_payments',
      COALESCE((
        SELECT jsonb_agg(payment_row.item)
        FROM (
          SELECT jsonb_build_object(
            'id', p.id,
            'payment_number', p.payment_number,
            'date', p.date,
            'amount', p.amount,
            'type', p.type,
            'customer', CASE
              WHEN c.id IS NULL THEN NULL
              ELSE jsonb_build_object('name', c.name)
            END,
            'supplier', CASE
              WHEN s.id IS NULL THEN NULL
              ELSE jsonb_build_object('name', s.name)
            END
          ) AS item
          FROM payments p
          LEFT JOIN customers c ON c.id = p.customer_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          ORDER BY p.created_at DESC
          LIMIT 5
        ) payment_row
      ), '[]'::jsonb),

    'accounts',
      COALESCE((
        SELECT jsonb_agg(account_row.item)
        FROM (
          SELECT jsonb_build_object(
            'id', a.id,
            'name', a.name,
            'type', a.type,
            'balance', a.balance
          ) AS item
          FROM accounts a
          WHERE a.is_active = true
            AND a.deleted_at IS NULL
          ORDER BY a.name
        ) account_row
      ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(date) TO service_role;
