-- ============================================================
-- Migration 022: Atomic reconciliation with FOR UPDATE lock (V15)
-- Replaces the client-side SELECT-then-INSERT pattern in
-- saveReconciliation, which was susceptible to lost updates when
-- concurrent requests read the same account balance.
-- ============================================================

create or replace function save_reconciliation(
  p_account_id       uuid,
  p_date             date,
  p_statement_balance numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance   numeric;
  v_recon_id  uuid;
  v_reconciled boolean;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  -- Lock the account row: prevents concurrent reconciliations from
  -- reading a stale balance
  select balance into v_balance
    from accounts
   where id = p_account_id
     for update;

  if v_balance is null then
    raise exception 'account % not found', p_account_id;
  end if;

  v_reconciled := abs(p_statement_balance - v_balance) < 0.01;

  insert into bank_reconciliations
    (account_id, date, statement_balance, system_balance, is_reconciled)
  values
    (p_account_id, p_date, p_statement_balance, v_balance, v_reconciled)
  returning id into v_recon_id;

  return jsonb_build_object(
    'id',               v_recon_id,
    'statement_balance', p_statement_balance,
    'system_balance',    v_balance,
    'is_reconciled',     v_reconciled
  );
end $$;
