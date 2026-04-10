-- ============================================================
-- Migration 013: Audit Log Triggers
-- Fires on INSERT/UPDATE/DELETE for critical business tables
-- ============================================================

-- Generic trigger function — works for all audited tables
create or replace function fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_old    jsonb;
  v_new    jsonb;
  v_id     uuid;
begin
  -- Map TG_OP to our action vocabulary
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_old    := null;
    v_new    := to_jsonb(NEW);
    v_id     := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_id     := NEW.id;
  else -- DELETE
    v_action := 'delete';
    v_old    := to_jsonb(OLD);
    v_new    := null;
    v_id     := OLD.id;
  end if;

  insert into audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  values (TG_TABLE_NAME, v_id, v_action, v_old, v_new, auth.uid());

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

-- -------------------------------------------------------
-- Attach triggers to critical tables
-- -------------------------------------------------------

-- Sales Orders
create trigger audit_sales_orders
  after insert or update or delete on sales_orders
  for each row execute function fn_audit_log();

-- Goods Deliveries
create trigger audit_goods_deliveries
  after insert or update or delete on goods_deliveries
  for each row execute function fn_audit_log();

-- Purchase Orders
create trigger audit_purchase_orders
  after insert or update or delete on purchase_orders
  for each row execute function fn_audit_log();

-- Goods Receipts
create trigger audit_goods_receipts
  after insert or update or delete on goods_receipts
  for each row execute function fn_audit_log();

-- Invoices (sales + purchase)
create trigger audit_invoices
  after insert or update or delete on invoices
  for each row execute function fn_audit_log();

-- Payments
create trigger audit_payments
  after insert or update or delete on payments
  for each row execute function fn_audit_log();

-- Journals (header only — items are detail)
create trigger audit_journals
  after insert or update or delete on journals
  for each row execute function fn_audit_log();

-- -------------------------------------------------------
-- RLS: users can read their own company's audit logs.
-- audit_logs is already accessible; add a policy so
-- authenticated users can SELECT (reads only — no writes).
-- -------------------------------------------------------
alter table audit_logs enable row level security;

create policy "Authenticated users can read audit logs"
  on audit_logs for select
  to authenticated
  using (true);

-- No insert/update/delete policy — only the trigger function
-- (security definer) may write to audit_logs.
