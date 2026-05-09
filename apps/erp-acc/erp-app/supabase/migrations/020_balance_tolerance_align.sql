-- ============================================================
-- Migration 020: Align journal balance tolerance (V8)
-- Server validate_journal_balance previously used exact = comparison.
-- Client uses < 0.01.  We align both to < 0.01 (1 cent tolerance)
-- to handle floating-point rounding from client inputs.
-- ============================================================

create or replace function validate_journal_balance(p_journal_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_total_debit  numeric;
  v_total_credit numeric;
begin
  select
    coalesce(sum(debit),  0),
    coalesce(sum(credit), 0)
  into v_total_debit, v_total_credit
  from journal_items
  where journal_id = p_journal_id;

  -- 1-cent tolerance to absorb floating-point rounding from client
  return v_total_debit > 0
     and abs(v_total_debit - v_total_credit) < 0.01;
end $$;
