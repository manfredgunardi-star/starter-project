-- Migration 025: Recurring Transactions
-- Tables: recurring_templates, recurring_instances
-- Also: sequences for recurring doc numbers, RPC function, pg_cron job
--
-- Notes vs original plan:
-- * journals does NOT have a `status` column — it uses `is_posted boolean`. Auto-created
--   recurring journals are written with is_posted = false (draft / unposted).
-- * invoices.type is NOT NULL with CHECK ('sales','purchase'). Recurring auto-creates
--   sales invoices only, so we hard-set type='sales'.
-- * journals.source check constraint already includes asset_* values (migration 014).
--   We extend it to add 'recurring' only if not already present.
-- * pg_cron runs daily at 18:00 UTC = 01:00 WIB.

-- ============================================================
-- Extend journals.source to include 'recurring'
-- ============================================================
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'journals'
      AND c.contype = 'c'
      AND c.conname = 'journals_source_check';

  IF v_def IS NULL OR v_def NOT LIKE '%recurring%' THEN
    ALTER TABLE journals DROP CONSTRAINT IF EXISTS journals_source_check;
    ALTER TABLE journals ADD CONSTRAINT journals_source_check
      CHECK (source IN ('auto','manual','asset_acquisition','asset_depreciation','asset_disposal','recurring'));
  END IF;
END $$;

-- ============================================================
-- Sequences for recurring-generated document numbers
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS recurring_invoice_seq START 1;
CREATE SEQUENCE IF NOT EXISTS recurring_journal_seq START 1;

-- ============================================================
-- Table 1: recurring_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  type            text        NOT NULL CHECK (type IN ('invoice','journal')),
  interval_type   text        NOT NULL CHECK (interval_type IN ('daily','weekly','monthly','yearly')),
  day_of_month    int         CHECK (day_of_month BETWEEN -1 AND 31),  -- -1 = last day of month
  day_of_week     int         CHECK (day_of_week BETWEEN 0 AND 6),     -- 0=Sun, 6=Sat
  start_date      date        NOT NULL,
  end_date        date,
  next_run        date        NOT NULL,
  last_run        date,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  template_data   jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        REFERENCES auth.users(id),
  deleted_at      timestamptz,
  deleted_by      uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_next_run
  ON recurring_templates(next_run)
  WHERE is_active AND status = 'active';

-- ============================================================
-- Table 2: recurring_instances
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_instances (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid        NOT NULL REFERENCES recurring_templates(id),
  transaction_type text        NOT NULL,
  transaction_id   uuid,
  run_date         date        NOT NULL,
  status           text        NOT NULL DEFAULT 'created' CHECK (status IN ('created','failed')),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_template
  ON recurring_instances(template_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_recurring_templates" ON recurring_templates;
CREATE POLICY "auth_select_recurring_templates"
  ON recurring_templates FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "auth_insert_recurring_templates" ON recurring_templates;
CREATE POLICY "auth_insert_recurring_templates"
  ON recurring_templates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_recurring_templates" ON recurring_templates;
CREATE POLICY "auth_update_recurring_templates"
  ON recurring_templates FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_select_recurring_instances" ON recurring_instances;
CREATE POLICY "auth_select_recurring_instances"
  ON recurring_instances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_recurring_instances" ON recurring_instances;
CREATE POLICY "auth_insert_recurring_instances"
  ON recurring_instances FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- RPC: process_recurring_templates
-- Called by frontend "Run Now" (with p_template_id)
-- Called by pg_cron daily (without p_template_id → process all due)
-- ============================================================
CREATE OR REPLACE FUNCTION process_recurring_templates(p_template_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tmpl    recurring_templates%ROWTYPE;
  v_today   date := CURRENT_DATE;
  v_inv_id  uuid;
  v_jnl_id  uuid;
  v_next    date;
  v_results jsonb := '[]'::jsonb;
  v_inv_no  text;
  v_jnl_no  text;
  v_subtotal numeric;
  v_tax      numeric;
  v_total    numeric;
BEGIN
  FOR v_tmpl IN
    SELECT * FROM recurring_templates
    WHERE is_active = true
      AND status    = 'active'
      AND next_run  <= v_today
      AND (p_template_id IS NULL OR id = p_template_id)
    ORDER BY next_run
  LOOP
    v_inv_id := NULL;
    v_jnl_id := NULL;
    v_inv_no := NULL;
    v_jnl_no := NULL;

    BEGIN
      -- ---- Invoice (sales only) ----
      IF v_tmpl.type = 'invoice' THEN
        v_inv_no := 'REC-INV-' || to_char(v_today, 'YYYY') || '-'
                    || lpad(nextval('recurring_invoice_seq')::text, 4, '0');

        v_subtotal := COALESCE((v_tmpl.template_data->>'subtotal')::numeric, 0);
        v_tax      := COALESCE((v_tmpl.template_data->>'tax_amount')::numeric, 0);
        v_total    := COALESCE((v_tmpl.template_data->>'total')::numeric, v_subtotal + v_tax);

        INSERT INTO invoices (
          invoice_number, date, due_date, type,
          customer_id, status, notes,
          subtotal, tax_amount, total, amount_paid, created_by
        )
        VALUES (
          v_inv_no,
          v_today,
          v_today + COALESCE((v_tmpl.template_data->>'due_days')::int, 30),
          'sales',
          (v_tmpl.template_data->>'customer_id')::uuid,
          'draft',
          COALESCE(v_tmpl.template_data->>'notes', ''),
          v_subtotal,
          v_tax,
          v_total,
          0,
          v_tmpl.created_by
        )
        RETURNING id INTO v_inv_id;

        -- Insert line items
        INSERT INTO invoice_items (
          invoice_id, product_id, unit_id,
          quantity, quantity_base, unit_price,
          tax_amount, total
        )
        SELECT
          v_inv_id,
          (item->>'product_id')::uuid,
          (item->>'unit_id')::uuid,
          (item->>'quantity')::numeric,
          COALESCE((item->>'quantity_base')::numeric, (item->>'quantity')::numeric),
          (item->>'unit_price')::numeric,
          COALESCE((item->>'tax_amount')::numeric, 0),
          (item->>'total')::numeric
        FROM jsonb_array_elements(v_tmpl.template_data->'items') AS item;

        INSERT INTO recurring_instances (template_id, transaction_type, transaction_id, run_date, status)
        VALUES (v_tmpl.id, 'invoice', v_inv_id, v_today, 'created');

      -- ---- Journal (manual, draft / not yet posted) ----
      ELSIF v_tmpl.type = 'journal' THEN
        v_jnl_no := 'REC-JNL-' || to_char(v_today, 'YYYY') || '-'
                    || lpad(nextval('recurring_journal_seq')::text, 4, '0');

        INSERT INTO journals (
          journal_number, date, description, source, is_posted, created_by
        )
        VALUES (
          v_jnl_no,
          v_today,
          COALESCE(v_tmpl.template_data->>'description', v_tmpl.name),
          'recurring',
          false,
          v_tmpl.created_by
        )
        RETURNING id INTO v_jnl_id;

        INSERT INTO journal_items (journal_id, coa_id, description, debit, credit)
        SELECT
          v_jnl_id,
          (item->>'coa_id')::uuid,
          COALESCE(item->>'description', ''),
          COALESCE((item->>'debit')::numeric, 0),
          COALESCE((item->>'credit')::numeric, 0)
        FROM jsonb_array_elements(v_tmpl.template_data->'items') AS item;

        INSERT INTO recurring_instances (template_id, transaction_type, transaction_id, run_date, status)
        VALUES (v_tmpl.id, 'journal', v_jnl_id, v_today, 'created');
      END IF;

      -- ---- Calculate next_run ----
      v_next := CASE v_tmpl.interval_type
        WHEN 'daily'   THEN v_tmpl.next_run + 1
        WHEN 'weekly'  THEN v_tmpl.next_run + 7
        WHEN 'monthly' THEN
          CASE
            WHEN v_tmpl.day_of_month = -1 THEN
              (date_trunc('month', v_tmpl.next_run + interval '1 month')
                + interval '1 month' - interval '1 day')::date
            ELSE
              (date_trunc('month', v_tmpl.next_run + interval '1 month')
                + ((LEAST(v_tmpl.day_of_month, 28) - 1) || ' days')::interval)::date
          END
        WHEN 'yearly'  THEN (v_tmpl.next_run + interval '1 year')::date
      END;

      UPDATE recurring_templates SET
        last_run   = v_today,
        next_run   = v_next,
        status     = CASE
                       WHEN end_date IS NOT NULL AND v_next > end_date THEN 'completed'
                       ELSE 'active'
                     END,
        updated_at = now()
      WHERE id = v_tmpl.id;

      v_results := v_results || jsonb_build_object(
        'template_id',    v_tmpl.id,
        'status',         'success',
        'transaction_id', COALESCE(v_inv_id, v_jnl_id),
        'doc_number',     COALESCE(v_inv_no, v_jnl_no)
      );

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO recurring_instances (template_id, transaction_type, run_date, status, error_message)
      VALUES (v_tmpl.id, v_tmpl.type, v_today, 'failed', SQLERRM);

      v_results := v_results || jsonb_build_object(
        'template_id', v_tmpl.id,
        'status',      'failed',
        'error',       SQLERRM
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

-- Allow authenticated users to call this RPC
GRANT EXECUTE ON FUNCTION process_recurring_templates(uuid) TO authenticated;

-- ============================================================
-- pg_cron: run daily at 18:00 UTC = 01:00 WIB
-- Requires pg_cron extension (enabled in Supabase by default)
-- Uses unschedule+schedule pattern so re-running this migration is idempotent.
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('process-recurring-daily');
EXCEPTION WHEN OTHERS THEN
  -- Job did not exist yet; ignore.
  NULL;
END $$;

SELECT cron.schedule(
  'process-recurring-daily',
  '0 18 * * *',
  'SELECT process_recurring_templates()'
);
