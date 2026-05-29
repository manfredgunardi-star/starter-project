-- ============================================================
-- Migration 032: Add account_id to journal_items
-- Allows manual journals to reference a specific bank/cash account
-- so accounts.balance stays in sync when the journal is posted.
-- ============================================================

alter table journal_items
  add column if not exists account_id uuid references accounts(id);

-- Re-create post_manual_journal:
-- For each journal_items row with account_id set,
-- update accounts.balance after posting.
-- Asset accounts (bank/cash) have normal debit balance:
--   debit  → balance increases (+debit)
--   credit → balance decreases (-credit)
create or replace function post_manual_journal(p_journal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  for v_item in
    select account_id, debit, credit
      from journal_items
     where journal_id = p_journal_id
       and account_id is not null
  loop
    update accounts
       set balance = balance + v_item.debit - v_item.credit
     where id = v_item.account_id;
  end loop;

  update journals
     set is_posted = true
   where id = p_journal_id
     and source = 'manual';
end;
$$;
