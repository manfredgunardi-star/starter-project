-- Staging smoke queries for Supabase SQL editor / psql.
-- Replace the company id before running.

-- 1. Confirm starter data exists.
select code, name, is_active
from public.companies
order by created_at desc
limit 5;

select code, name, account_type, normal_balance, is_cash_bank
from public.accounts
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by code;

-- 2. Confirm reporting views are queryable for Excel/Power Query.
select *
from reporting.vw_journal_lines
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
limit 20;

select *
from reporting.vw_buku_besar
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by account_code, journal_date, journal_number, line_position
limit 20;

select *
from reporting.vw_trial_balance
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by account_code;

select *
from reporting.vw_profit_loss
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by account_code;

select *
from reporting.vw_balance_sheet
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by account_code;
