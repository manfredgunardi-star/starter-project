-- ============================================================
-- Migration 040: Income-statement-specific account balances
-- get_account_balances (used by the Balance Sheet) intentionally
-- includes fiscal-year-closing journals, since the Balance Sheet's
-- "Laba Berjalan" equity line depends on them being included.
-- The Income Statement needs the opposite: a period P&L must
-- exclude closing/reversal journals, or the year right after a
-- closed year shows understated revenue/expense (the closing
-- journal is dated 1 Jan of that year). This is a dedicated,
-- additive function for that one caller — get_account_balances
-- itself is intentionally left unchanged.
-- ============================================================

create or replace function get_income_statement_balances(p_start_date date, p_end_date date)
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
    coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
      then ji.debit else 0 end), 0) as total_debit,
    coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
      then ji.credit else 0 end), 0) as total_credit,
    case c.normal_balance
      when 'debit' then
        coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
          and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
          then ji.debit else 0 end), 0)
        - coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
          and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
          then ji.credit else 0 end), 0)
      when 'credit' then
        coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
          and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
          then ji.credit else 0 end), 0)
        - coalesce(sum(case when j.is_posted = true and j.date between p_start_date and p_end_date
          and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
          then ji.debit else 0 end), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$ language plpgsql stable;
