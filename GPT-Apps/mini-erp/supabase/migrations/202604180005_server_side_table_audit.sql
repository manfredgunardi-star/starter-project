-- Server-side audit for direct table writes that are intentionally allowed by RLS.
-- Accounting approval/posting/void RPCs keep their detailed RPC audit logs.

create or replace function public.write_table_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := coalesce(new.company_id, old.company_id);
  v_document_id text;
  v_collection_name text := TG_ARGV[0];
  v_action_prefix text := TG_ARGV[1];
  v_action text;
begin
  if public.is_accounting_rpc_context() then
    return new;
  end if;

  if TG_TABLE_NAME = 'company_members' then
    v_document_id := coalesce(new.user_id::text, old.user_id::text);
  else
    v_document_id := coalesce(new.id::text, old.id::text);
  end if;

  if TG_OP = 'INSERT' then
    v_action := v_action_prefix || '_create';
  elsif TG_OP = 'UPDATE'
    and coalesce(old.is_active, true) = true
    and (
      coalesce(new.is_active, true) = false
      or (old.deleted_at is null and new.deleted_at is not null)
    ) then
    v_action := v_action_prefix || '_soft_delete';
  elsif TG_OP = 'UPDATE'
    and coalesce(old.is_active, true) = false
    and coalesce(new.is_active, true) = true then
    v_action := v_action_prefix || '_restore';
  elsif TG_OP = 'UPDATE' then
    v_action := v_action_prefix || '_update';
  else
    return new;
  end if;

  insert into public.audit_logs (
    company_id,
    action,
    collection_name,
    document_id,
    actor_id,
    actor_name,
    before_data,
    after_data
  )
  values (
    v_company_id,
    v_action,
    v_collection_name,
    v_document_id,
    auth.uid(),
    auth.jwt() ->> 'email',
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'UPDATE' then to_jsonb(new) else to_jsonb(new) end
  );

  return new;
end;
$$;

drop trigger if exists audit_business_partners on public.business_partners;
create trigger audit_business_partners after insert or update on public.business_partners
for each row execute function public.write_table_audit_log('business_partners', 'business_partner');

drop trigger if exists audit_units on public.units;
create trigger audit_units after insert or update on public.units
for each row execute function public.write_table_audit_log('units', 'unit');

drop trigger if exists audit_product_categories on public.product_categories;
create trigger audit_product_categories after insert or update on public.product_categories
for each row execute function public.write_table_audit_log('product_categories', 'product_category');

drop trigger if exists audit_products on public.products;
create trigger audit_products after insert or update on public.products
for each row execute function public.write_table_audit_log('products', 'product');

drop trigger if exists audit_cost_centers on public.cost_centers;
create trigger audit_cost_centers after insert or update on public.cost_centers
for each row execute function public.write_table_audit_log('cost_centers', 'cost_center');

drop trigger if exists audit_accounts on public.accounts;
create trigger audit_accounts after insert or update on public.accounts
for each row execute function public.write_table_audit_log('accounts', 'account');

drop trigger if exists audit_company_members on public.company_members;
create trigger audit_company_members after insert or update on public.company_members
for each row execute function public.write_table_audit_log('company_members', 'company_member');

drop trigger if exists audit_journal_entries on public.journal_entries;
create trigger audit_journal_entries after insert or update on public.journal_entries
for each row execute function public.write_table_audit_log('journal_entries', 'journal_draft');

drop trigger if exists audit_journal_entry_lines on public.journal_entry_lines;
create trigger audit_journal_entry_lines after insert or update on public.journal_entry_lines
for each row execute function public.write_table_audit_log('journal_entry_lines', 'journal_line');

drop trigger if exists audit_cash_bank_transactions on public.cash_bank_transactions;
create trigger audit_cash_bank_transactions after insert or update on public.cash_bank_transactions
for each row execute function public.write_table_audit_log('cash_bank_transactions', 'cash_bank_draft');

revoke all on function public.write_table_audit_log() from public;
