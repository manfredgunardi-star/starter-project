-- ============================================================
-- Migration 009: P&L per Cost Center RPC
-- ============================================================

CREATE OR REPLACE FUNCTION get_pl_by_cost_center(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  cost_center_id   UUID,
  cost_center_code TEXT,
  cost_center_name TEXT,
  coa_type         TEXT,
  coa_id           UUID,
  coa_code         TEXT,
  coa_name         TEXT,
  total_debit      NUMERIC,
  total_credit     NUMERIC,
  net_amount       NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cc.id             AS cost_center_id,
    cc.code           AS cost_center_code,
    cc.name           AS cost_center_name,
    c.type            AS coa_type,
    c.id              AS coa_id,
    c.code            AS coa_code,
    c.name            AS coa_name,
    SUM(ji.debit)     AS total_debit,
    SUM(ji.credit)    AS total_credit,
    SUM(ji.debit) - SUM(ji.credit) AS net_amount
  FROM journal_items ji
  JOIN coa c ON c.id = ji.coa_id
  JOIN cost_centers cc ON cc.id = ji.cost_center_id
  JOIN journals j ON j.id = ji.journal_id
  WHERE j.is_posted = true
    AND j.date BETWEEN p_start_date AND p_end_date
    AND c.type IN ('revenue', 'expense')
  GROUP BY cc.id, cc.code, cc.name, c.type, c.id, c.code, c.name
  ORDER BY cc.code, c.type, c.code
$$;
