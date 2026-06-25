-- Accounting RPCs for approval, posting, void/reversal, and period locks.
-- These functions intentionally write audit_logs and approval_events server-side.

create or replace function public.write_audit_log(
  p_company_id uuid,
  p_action text,
  p_collection_name text,
  p_document_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  insert into public.audit_logs (
    company_id,
    action,
    collection_name,
    document_id,
    actor_id,
    actor_name,
    before_data,
    after_data,
    metadata
  )
  values (
    p_company_id,
    p_action,
    p_collection_name,
    p_document_id,
    v_actor,
    auth.jwt() ->> 'email',
    p_before,
    p_after,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.write_approval_event(
  p_company_id uuid,
  p_document_table text,
  p_document_id uuid,
  p_action text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.approval_events (
    company_id,
    document_table,
    document_id,
    action,
    note,
    actor_id
  )
  values (
    p_company_id,
    p_document_table,
    p_document_id,
    p_action,
    p_note,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.assert_accounting_period_open(
  p_company_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_date)::date;
begin
  if exists (
    select 1
    from public.accounting_period_locks apl
    where apl.company_id = p_company_id
      and apl.period_start = v_period
      and apl.status = 'locked'
      and apl.is_active = true
  ) then
    raise exception 'Accounting period % is locked.', to_char(v_period, 'YYYY-MM');
  end if;
end;
$$;

create or replace function public.is_self_approval_allowed(
  p_company_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_created_by is distinct from auth.uid()
    or public.has_company_permission(p_company_id, 'approval:self-approve');
$$;

create or replace function public.journal_entry_totals(
  p_company_id uuid,
  p_journal_entry_id uuid
)
returns table(line_count bigint, total_debit numeric, total_credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) as line_count,
    coalesce(sum(jel.debit), 0)::numeric(18, 2) as total_debit,
    coalesce(sum(jel.credit), 0)::numeric(18, 2) as total_credit
  from public.journal_entry_lines jel
  where jel.company_id = p_company_id
    and jel.journal_entry_id = p_journal_entry_id;
$$;

create or replace function public.approve_journal_entry(
  p_company_id uuid,
  p_journal_entry_id uuid,
  p_note text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.journal_entries;
  v_after public.journal_entries;
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:approve') then
    raise exception 'Missing accounting approval permission.';
  end if;

  select *
    into v_before
  from public.journal_entries
  where company_id = p_company_id
    and id = p_journal_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if v_before.status <> 'draft' or v_before.approval_status <> 'pending' then
    raise exception 'Only pending draft journals can be approved.';
  end if;

  if not public.is_self_approval_allowed(p_company_id, v_before.created_by) then
    raise exception 'Maker-check blocks self approval for this user.';
  end if;

  perform set_config('app.accounting_rpc_context', 'on', true);

  update public.journal_entries
  set
    approval_status = 'approved',
    approved_at = now(),
    approved_by = v_actor,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_journal_entry_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'journal_entries', p_journal_entry_id, 'approve', p_note);
  perform public.write_audit_log(p_company_id, 'journal_approve', 'journal_entries', p_journal_entry_id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('note', p_note));

  return v_after;
end;
$$;

create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_journal_entry_id uuid,
  p_note text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.journal_entries;
  v_after public.journal_entries;
  v_line_count bigint;
  v_total_debit numeric(18, 2);
  v_total_credit numeric(18, 2);
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:post') then
    raise exception 'Missing accounting posting permission.';
  end if;

  select *
    into v_before
  from public.journal_entries
  where company_id = p_company_id
    and id = p_journal_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'Only draft journals can be posted.';
  end if;

  if v_before.approval_status <> 'approved' then
    raise exception 'Journal must be approved before posting.';
  end if;

  perform public.assert_accounting_period_open(p_company_id, v_before.journal_date);

  select line_count, total_debit, total_credit
    into v_line_count, v_total_debit, v_total_credit
  from public.journal_entry_totals(p_company_id, p_journal_entry_id);

  if v_line_count < 2 then
    raise exception 'Journal must have at least two lines.';
  end if;

  if v_total_debit <= 0 or v_total_debit <> v_total_credit then
    raise exception 'Journal debit and credit totals must be balanced.';
  end if;

  perform set_config('app.accounting_rpc_context', 'on', true);

  update public.journal_entries
  set
    status = 'posted',
    total_debit = v_total_debit,
    total_credit = v_total_credit,
    posted_at = now(),
    posted_by = v_actor,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_journal_entry_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'journal_entries', p_journal_entry_id, 'post', p_note);
  perform public.write_audit_log(p_company_id, 'journal_post', 'journal_entries', p_journal_entry_id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('note', p_note));

  return v_after;
end;
$$;

create or replace function public.void_journal_entry(
  p_company_id uuid,
  p_journal_entry_id uuid,
  p_reason text default 'Void journal with reversal.'
)
returns public.journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.journal_entries;
  v_after public.journal_entries;
  v_reversal public.journal_entries;
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_number text := 'JV-REV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:post') then
    raise exception 'Missing accounting posting permission.';
  end if;

  select *
    into v_before
  from public.journal_entries
  where company_id = p_company_id
    and id = p_journal_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if v_before.status <> 'posted' then
    raise exception 'Only posted journals can be voided.';
  end if;

  if v_before.reversal_entry_id is not null or v_before.voided_at is not null then
    raise exception 'Journal already has a reversal.';
  end if;

  perform public.assert_accounting_period_open(p_company_id, v_before.journal_date);
  perform public.assert_accounting_period_open(p_company_id, current_date);
  perform set_config('app.accounting_rpc_context', 'on', true);

  insert into public.journal_entries (
    id,
    company_id,
    journal_number,
    journal_date,
    description,
    status,
    approval_status,
    source_type,
    source_id,
    total_debit,
    total_credit,
    approved_at,
    approved_by,
    posted_at,
    posted_by,
    reversal_of_entry_id,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_reversal_id,
    p_company_id,
    v_reversal_number,
    current_date,
    'Reversal: ' || v_before.description,
    'posted',
    'approved',
    'journal_reversal',
    v_before.id,
    v_before.total_credit,
    v_before.total_debit,
    now(),
    v_actor,
    now(),
    v_actor,
    v_before.id,
    true,
    v_actor,
    v_actor
  )
  returning * into v_reversal;

  insert into public.journal_entry_lines (
    company_id,
    journal_entry_id,
    line_position,
    account_id,
    cost_center_id,
    description,
    debit,
    credit
  )
  select
    company_id,
    v_reversal_id,
    line_position,
    account_id,
    cost_center_id,
    coalesce('Reversal - ' || nullif(description, ''), 'Reversal line'),
    credit,
    debit
  from public.journal_entry_lines
  where company_id = p_company_id
    and journal_entry_id = p_journal_entry_id
  order by line_position;

  update public.journal_entries
  set
    status = 'void',
    voided_at = now(),
    voided_by = v_actor,
    void_reason = p_reason,
    reversal_entry_id = v_reversal_id,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_journal_entry_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'journal_entries', p_journal_entry_id, 'void', p_reason);
  perform public.write_audit_log(p_company_id, 'journal_void_reversal', 'journal_entries', p_journal_entry_id::text, to_jsonb(v_before), jsonb_build_object('voidedJournal', to_jsonb(v_after), 'reversalJournal', to_jsonb(v_reversal)), jsonb_build_object('reason', p_reason));

  return v_after;
end;
$$;

create or replace function public.approve_cash_bank_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_note text default null
)
returns public.cash_bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.cash_bank_transactions;
  v_after public.cash_bank_transactions;
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:approve') then
    raise exception 'Missing accounting approval permission.';
  end if;

  select *
    into v_before
  from public.cash_bank_transactions
  where company_id = p_company_id
    and id = p_transaction_id
  for update;

  if not found then
    raise exception 'Cash bank transaction not found.';
  end if;

  if v_before.status <> 'draft' or v_before.approval_status <> 'pending' then
    raise exception 'Only pending draft cash bank transactions can be approved.';
  end if;

  if not public.is_self_approval_allowed(p_company_id, v_before.created_by) then
    raise exception 'Maker-check blocks self approval for this user.';
  end if;

  perform set_config('app.accounting_rpc_context', 'on', true);

  update public.cash_bank_transactions
  set
    approval_status = 'approved',
    approved_at = now(),
    approved_by = v_actor,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_transaction_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'cash_bank_transactions', p_transaction_id, 'approve', p_note);
  perform public.write_audit_log(p_company_id, 'cash_bank_approve', 'cash_bank_transactions', p_transaction_id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('note', p_note));

  return v_after;
end;
$$;

create or replace function public.post_cash_bank_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_note text default null
)
returns public.cash_bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.cash_bank_transactions;
  v_after public.cash_bank_transactions;
  v_journal_id uuid := gen_random_uuid();
  v_journal_number text := 'JV-KB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:post') then
    raise exception 'Missing accounting posting permission.';
  end if;

  select *
    into v_before
  from public.cash_bank_transactions
  where company_id = p_company_id
    and id = p_transaction_id
  for update;

  if not found then
    raise exception 'Cash bank transaction not found.';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'Only draft cash bank transactions can be posted.';
  end if;

  if v_before.approval_status <> 'approved' then
    raise exception 'Cash bank transaction must be approved before posting.';
  end if;

  perform public.assert_accounting_period_open(p_company_id, v_before.transaction_date);
  perform set_config('app.accounting_rpc_context', 'on', true);

  insert into public.journal_entries (
    id,
    company_id,
    journal_number,
    journal_date,
    description,
    status,
    approval_status,
    source_type,
    source_id,
    total_debit,
    total_credit,
    approved_at,
    approved_by,
    posted_at,
    posted_by,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_journal_id,
    p_company_id,
    v_journal_number,
    v_before.transaction_date,
    'Kas/Bank ' || case when v_before.transaction_type = 'in' then 'Masuk: ' else 'Keluar: ' end || v_before.description,
    'posted',
    'approved',
    'cash_bank',
    v_before.id,
    v_before.amount,
    v_before.amount,
    now(),
    v_actor,
    now(),
    v_actor,
    true,
    v_actor,
    v_actor
  );

  insert into public.journal_entry_lines (
    company_id,
    journal_entry_id,
    line_position,
    account_id,
    cost_center_id,
    description,
    debit,
    credit
  )
  values
    (
      p_company_id,
      v_journal_id,
      1,
      v_before.cash_account_id,
      v_before.cost_center_id,
      v_before.description,
      case when v_before.transaction_type = 'in' then v_before.amount else 0 end,
      case when v_before.transaction_type = 'in' then 0 else v_before.amount end
    ),
    (
      p_company_id,
      v_journal_id,
      2,
      v_before.counter_account_id,
      v_before.cost_center_id,
      v_before.description,
      case when v_before.transaction_type = 'in' then 0 else v_before.amount end,
      case when v_before.transaction_type = 'in' then v_before.amount else 0 end
    );

  update public.cash_bank_transactions
  set
    status = 'posted',
    journal_entry_id = v_journal_id,
    posted_at = now(),
    posted_by = v_actor,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_transaction_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'cash_bank_transactions', p_transaction_id, 'post', p_note);
  perform public.write_audit_log(p_company_id, 'cash_bank_post', 'cash_bank_transactions', p_transaction_id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('journalEntryId', v_journal_id, 'note', p_note));

  return v_after;
end;
$$;

create or replace function public.void_cash_bank_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_reason text default 'Void cash bank transaction with reversal.'
)
returns public.cash_bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.cash_bank_transactions;
  v_after public.cash_bank_transactions;
  v_original_journal public.journal_entries;
  v_voided_journal public.journal_entries;
  v_reversal public.journal_entries;
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_number text := 'JV-KB-REV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'accounting:post') then
    raise exception 'Missing accounting posting permission.';
  end if;

  select *
    into v_before
  from public.cash_bank_transactions
  where company_id = p_company_id
    and id = p_transaction_id
  for update;

  if not found then
    raise exception 'Cash bank transaction not found.';
  end if;

  if v_before.status <> 'posted' then
    raise exception 'Only posted cash bank transactions can be voided.';
  end if;

  if v_before.reversal_journal_entry_id is not null or v_before.voided_at is not null then
    raise exception 'Cash bank transaction already has a reversal.';
  end if;

  select *
    into v_original_journal
  from public.journal_entries
  where company_id = p_company_id
    and id = v_before.journal_entry_id
  for update;

  if not found then
    raise exception 'Source journal entry not found.';
  end if;

  perform public.assert_accounting_period_open(p_company_id, v_before.transaction_date);
  perform public.assert_accounting_period_open(p_company_id, current_date);
  perform set_config('app.accounting_rpc_context', 'on', true);

  insert into public.journal_entries (
    id,
    company_id,
    journal_number,
    journal_date,
    description,
    status,
    approval_status,
    source_type,
    source_id,
    total_debit,
    total_credit,
    approved_at,
    approved_by,
    posted_at,
    posted_by,
    reversal_of_entry_id,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_reversal_id,
    p_company_id,
    v_reversal_number,
    current_date,
    'Reversal Kas/Bank: ' || v_before.description,
    'posted',
    'approved',
    'cash_bank_reversal',
    v_before.id,
    v_original_journal.total_credit,
    v_original_journal.total_debit,
    now(),
    v_actor,
    now(),
    v_actor,
    v_original_journal.id,
    true,
    v_actor,
    v_actor
  )
  returning * into v_reversal;

  insert into public.journal_entry_lines (
    company_id,
    journal_entry_id,
    line_position,
    account_id,
    cost_center_id,
    description,
    debit,
    credit
  )
  select
    company_id,
    v_reversal_id,
    line_position,
    account_id,
    cost_center_id,
    coalesce('Reversal - ' || nullif(description, ''), 'Reversal cash bank line'),
    credit,
    debit
  from public.journal_entry_lines
  where company_id = p_company_id
    and journal_entry_id = v_original_journal.id
  order by line_position;

  update public.journal_entries
  set
    status = 'void',
    voided_at = now(),
    voided_by = v_actor,
    void_reason = p_reason,
    reversal_entry_id = v_reversal_id,
    updated_by = v_actor
  where company_id = p_company_id
    and id = v_original_journal.id
  returning * into v_voided_journal;

  update public.cash_bank_transactions
  set
    status = 'void',
    voided_at = now(),
    voided_by = v_actor,
    void_reason = p_reason,
    reversal_journal_entry_id = v_reversal_id,
    updated_by = v_actor
  where company_id = p_company_id
    and id = p_transaction_id
  returning * into v_after;

  perform public.write_approval_event(p_company_id, 'cash_bank_transactions', p_transaction_id, 'void', p_reason);
  perform public.write_audit_log(p_company_id, 'cash_bank_void_reversal', 'cash_bank_transactions', p_transaction_id::text, to_jsonb(v_before), jsonb_build_object('voidedTransaction', to_jsonb(v_after), 'voidedJournal', to_jsonb(v_voided_journal), 'reversalJournal', to_jsonb(v_reversal)), jsonb_build_object('reason', p_reason));

  return v_after;
end;
$$;

create or replace function public.lock_accounting_period(
  p_company_id uuid,
  p_period_start date,
  p_note text default null
)
returns public.accounting_period_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_period date := date_trunc('month', p_period_start)::date;
  v_before public.accounting_period_locks;
  v_after public.accounting_period_locks;
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'settings:manage') then
    raise exception 'Missing settings management permission.';
  end if;

  select *
    into v_before
  from public.accounting_period_locks
  where company_id = p_company_id
    and period_start = v_period
  for update;

  insert into public.accounting_period_locks (
    company_id,
    period_start,
    status,
    note,
    locked_at,
    locked_by,
    is_active,
    updated_by
  )
  values (
    p_company_id,
    v_period,
    'locked',
    p_note,
    now(),
    v_actor,
    true,
    v_actor
  )
  on conflict (company_id, period_start) do update
  set
    status = 'locked',
    note = excluded.note,
    locked_at = now(),
    locked_by = v_actor,
    is_active = true,
    updated_by = v_actor
  returning * into v_after;

  perform public.write_audit_log(p_company_id, 'period_lock', 'accounting_period_locks', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('period', to_char(v_period, 'YYYY-MM')));

  return v_after;
end;
$$;

create or replace function public.unlock_accounting_period(
  p_company_id uuid,
  p_period_start date,
  p_note text default null
)
returns public.accounting_period_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_period date := date_trunc('month', p_period_start)::date;
  v_before public.accounting_period_locks;
  v_after public.accounting_period_locks;
begin
  if v_actor is null then
    raise exception 'Authenticated user is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'settings:manage') then
    raise exception 'Missing settings management permission.';
  end if;

  select *
    into v_before
  from public.accounting_period_locks
  where company_id = p_company_id
    and period_start = v_period
  for update;

  if not found then
    raise exception 'Accounting period lock not found.';
  end if;

  update public.accounting_period_locks
  set
    status = 'unlocked',
    note = coalesce(p_note, note),
    unlocked_at = now(),
    unlocked_by = v_actor,
    updated_by = v_actor
  where company_id = p_company_id
    and period_start = v_period
  returning * into v_after;

  perform public.write_audit_log(p_company_id, 'period_unlock', 'accounting_period_locks', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('period', to_char(v_period, 'YYYY-MM')));

  return v_after;
end;
$$;

revoke all on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.write_approval_event(uuid, text, uuid, text, text) from public;
revoke all on function public.assert_accounting_period_open(uuid, date) from public;
revoke all on function public.is_self_approval_allowed(uuid, uuid) from public;
revoke all on function public.journal_entry_totals(uuid, uuid) from public;

grant execute on function public.approve_journal_entry(uuid, uuid, text) to authenticated;
grant execute on function public.post_journal_entry(uuid, uuid, text) to authenticated;
grant execute on function public.void_journal_entry(uuid, uuid, text) to authenticated;
grant execute on function public.approve_cash_bank_transaction(uuid, uuid, text) to authenticated;
grant execute on function public.post_cash_bank_transaction(uuid, uuid, text) to authenticated;
grant execute on function public.void_cash_bank_transaction(uuid, uuid, text) to authenticated;
grant execute on function public.lock_accounting_period(uuid, date, text) to authenticated;
grant execute on function public.unlock_accounting_period(uuid, date, text) to authenticated;
