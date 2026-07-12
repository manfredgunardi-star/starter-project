-- ============================================================
-- Migration 039: Fix get_account_balances date-filter bug
-- The date/is_posted filter lived in the second LEFT JOIN's ON
-- clause, which never actually filtered journal_items out of
-- the sum (LEFT JOIN ON-clause conditions only null the right
-- side, they don't drop already-joined left-side rows). Moves
-- the filter inside the SUM via CASE WHEN so date ranges work.
-- ============================================================

create or replace function get_account_balances(p_start_date date, p_end_date date)
returns table (
  coa_id uuid,
  code text,
  name text,
  type text,
  normal_balance text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
) as $$
begin
  return query
  select
    c.id as coa_id,
    c.code,
    c.name,
    c.type,
    c.normal_balance,
    coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.debit else 0 end), 0) as total_debit,
    coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.credit else 0 end), 0) as total_credit,
    case c.normal_balance
      when 'debit' then
        coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.debit else 0 end), 0)
        - coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.credit else 0 end), 0)
      when 'credit' then
        coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.credit else 0 end), 0)
        - coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date then ji.debit else 0 end), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$ language plpgsql stable;
