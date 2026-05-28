-- ============================================================
-- Migration 030: Trial Balance (Neraca Saldo) Function
--
-- Berbeda dari get_account_balances:
--   - Selalu dari awal waktu (tidak ada p_start_date)
--   - Hanya mengembalikan akun yang punya aktivitas jurnal (INNER JOIN)
--   - Dipakai oleh TrialBalancePage untuk verifikasi keseimbangan buku
-- ============================================================

create or replace function get_trial_balance(p_as_of_date date)
returns table (
  coa_id         uuid,
  code           text,
  name           text,
  type           text,
  normal_balance text,
  total_debit    numeric,
  total_credit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id                                                      as coa_id,
    c.code,
    c.name,
    c.type,
    c.normal_balance,
    coalesce(sum(ji.debit),  0)                               as total_debit,
    coalesce(sum(ji.credit), 0)                               as total_credit,
    case c.normal_balance
      when 'debit'  then coalesce(sum(ji.debit),  0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit),  0)
    end                                                       as balance
  from coa c
  -- INNER JOIN: hanya akun dengan minimal satu journal entry yang terposting
  join journal_items ji on ji.coa_id = c.id
  join journals j       on ji.journal_id = j.id
    and j.is_posted = true
    and j.date <= p_as_of_date
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$;
