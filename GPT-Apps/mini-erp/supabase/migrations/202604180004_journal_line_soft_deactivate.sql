-- Allow draft journal line edits without hard-deleting accounting detail.

alter table public.journal_entry_lines
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

alter table public.journal_entry_lines
  drop constraint if exists journal_entry_lines_journal_entry_id_line_position_key;

create unique index if not exists idx_journal_lines_active_position
on public.journal_entry_lines (journal_entry_id, line_position)
where is_active = true;

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
    and jel.journal_entry_id = p_journal_entry_id
    and jel.is_active = true;
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
    credit,
    is_active
  )
  select
    company_id,
    v_reversal_id,
    line_position,
    account_id,
    cost_center_id,
    coalesce('Reversal - ' || nullif(description, ''), 'Reversal line'),
    credit,
    debit,
    true
  from public.journal_entry_lines
  where company_id = p_company_id
    and journal_entry_id = p_journal_entry_id
    and is_active = true
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
    credit,
    is_active
  )
  select
    company_id,
    v_reversal_id,
    line_position,
    account_id,
    cost_center_id,
    coalesce('Reversal - ' || nullif(description, ''), 'Reversal cash bank line'),
    credit,
    debit,
    true
  from public.journal_entry_lines
  where company_id = p_company_id
    and journal_entry_id = v_original_journal.id
    and is_active = true
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

create or replace view reporting.vw_journal_lines
with (security_invoker = true) as
select
  je.company_id,
  je.id as journal_entry_id,
  je.journal_number,
  je.journal_date,
  je.description as journal_description,
  je.status,
  je.approval_status,
  jel.id as journal_line_id,
  jel.line_position,
  a.id as account_id,
  a.code as account_code,
  a.name as account_name,
  a.account_type,
  a.normal_balance,
  cc.id as cost_center_id,
  cc.code as cost_center_code,
  cc.name as cost_center_name,
  jel.description as line_description,
  jel.debit,
  jel.credit,
  (jel.debit - jel.credit) as signed_amount,
  je.created_at,
  je.posted_at
from public.journal_entries je
join public.journal_entry_lines jel on jel.journal_entry_id = je.id
join public.accounts a on a.id = jel.account_id
left join public.cost_centers cc on cc.id = jel.cost_center_id
where je.status = 'posted'
  and je.is_active = true
  and jel.is_active = true;
