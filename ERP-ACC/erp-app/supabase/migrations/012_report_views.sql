-- ============================================================
-- Migration 012: Report Functions
-- (account balances for financial reports, ledger/buku besar)
-- ============================================================

-- Account balances per COA — digunakan untuk Balance Sheet & Income Statement
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
    coalesce(sum(ji.debit), 0) as total_debit,
    coalesce(sum(ji.credit), 0) as total_credit,
    case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
    and j.is_posted = true
    and j.date between p_start_date and p_end_date
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$ language plpgsql stable;

-- Ledger (Buku Besar) per akun — dengan running balance
create or replace function get_ledger(p_coa_id uuid, p_start_date date, p_end_date date)
returns table (
  journal_date date,
  journal_number text,
  description text,
  debit numeric,
  credit numeric,
  running_balance numeric
) as $$
begin
  return query
  select
    j.date as journal_date,
    j.journal_number,
    coalesce(ji.description, j.description) as description,
    ji.debit,
    ji.credit,
    sum(
      case (select normal_balance from coa where id = p_coa_id)
        when 'debit' then ji.debit - ji.credit
        when 'credit' then ji.credit - ji.debit
      end
    ) over (order by j.date, j.created_at) as running_balance
  from journal_items ji
  join journals j on ji.journal_id = j.id
  where ji.coa_id = p_coa_id
    and j.is_posted = true
    and j.date between p_start_date and p_end_date
  order by j.date, j.created_at;
end;
$$ language plpgsql stable;
