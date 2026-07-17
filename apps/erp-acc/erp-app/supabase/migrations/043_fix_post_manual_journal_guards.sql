-- ============================================================
-- Migration 043: Fix post_manual_journal — restore missing guards
-- Migration 032_journal_items_account_id.sql redefined
-- post_manual_journal() to add account_id balance sync, but the
-- redefinition dropped the _ensure_can_post() and
-- _ensure_period_open() guards that 016_period_lock_enforcement.sql
-- had added. Since then, ANY authenticated user (not just
-- staff/admin) can post an existing draft manual journal, even for
-- a closed accounting period. This restores both guards.
--
-- It also closes three defects the balance-sync side effect (added
-- in 032) introduced that neither the 016 nor the 032 version
-- guarded against, because before 032 there was no non-idempotent
-- side effect to protect: (1) no check that the journal isn't
-- already posted, so a repeat call double-applies the balance delta;
-- (2) no upfront check that source = 'manual', so a non-manual
-- journal id could mutate accounts.balance while the final header
-- UPDATE silently affects zero rows; (3) no row lock, so two
-- concurrent calls on the same journal could both pass the checks
-- before either commits and both apply the balance delta. Fixed by
-- adding `for update` (same locking idiom already used by
-- execute_asset_disposal — originally defined in 014_fixed_assets.sql,
-- re-created with a period-lock guard, including the same `for update`
-- lock, in 016_period_lock_enforcement.sql) plus explicit source/
-- is_posted checks before any mutation.
-- ============================================================

create or replace function post_manual_journal(p_journal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal record;
  v_item record;
begin
  perform _ensure_can_post();

  select * into v_journal from journals where id = p_journal_id for update;
  if v_journal is null then raise exception 'journal not found'; end if;
  if v_journal.source != 'manual' then
    raise exception 'journal % bukan jurnal manual (source=%)', p_journal_id, v_journal.source;
  end if;
  if v_journal.is_posted then
    raise exception 'journal % sudah diposting sebelumnya', p_journal_id;
  end if;

  perform _ensure_period_open(v_journal.date);

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
   where id = p_journal_id;
end;
$$;
