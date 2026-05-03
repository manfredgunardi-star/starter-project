-- ============================================================
-- Migration 015: Fix RLS Security (V1 + V2)
-- V1: Prevent privilege escalation via profiles.role column
-- V2: Restrict journal_items insert; convert posting RPCs to security definer
-- ============================================================

-- ============================================================
-- V1: Profiles privilege escalation fix
-- ============================================================

-- Drop the overly-permissive self-update policy
drop policy if exists "Users can update own profile" on profiles;

-- Trigger: block non-admins from touching sensitive columns
create or replace function fn_protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_my_role() <> 'admin' then
    if NEW.role is distinct from OLD.role then
      raise exception 'permission denied: tidak boleh mengubah role';
    end if;
    if NEW.is_active is distinct from OLD.is_active then
      raise exception 'permission denied: tidak boleh mengubah is_active';
    end if;
    if NEW.deleted_at is distinct from OLD.deleted_at then
      raise exception 'permission denied: tidak boleh mengubah deleted_at';
    end if;
    if NEW.deleted_by is distinct from OLD.deleted_by then
      raise exception 'permission denied: tidak boleh mengubah deleted_by';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_protect_profile_columns on profiles;
create trigger trg_protect_profile_columns
  before update on profiles
  for each row execute function fn_protect_profile_columns();

-- Restore self-update policy (trigger enforces column restrictions)
create policy "Users update own profile (non-sensitive)"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- V2: Restrict journal_items direct writes
-- ============================================================

-- Drop the open-to-all insert policy
drop policy if exists "Insert journal_items" on journal_items;
drop policy if exists "Admin update journal_items" on journal_items;
drop policy if exists "Admin delete journal_items" on journal_items;

-- Only admin can directly write journal_items; RPCs use security definer
create policy "Admin manage journal_items insert" on journal_items
  for insert to authenticated
  with check (is_admin());

create policy "Admin manage journal_items update" on journal_items
  for update to authenticated
  using (is_admin());

create policy "Admin manage journal_items delete" on journal_items
  for delete to authenticated
  using (is_admin());

-- Shared helper: assert caller is admin or staff
create or replace function _ensure_can_post()
returns void
language plpgsql
stable
as $$
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied: hanya admin/staff yang bisa posting';
  end if;
end $$;

-- Convert all posting RPCs to security definer so they can bypass
-- the new strict journal_items RLS while still enforcing _ensure_can_post()
alter function post_goods_receipt(uuid) security definer;
alter function post_goods_delivery(uuid) security definer;
alter function post_sales_invoice(uuid) security definer;
alter function post_purchase_invoice(uuid) security definer;
alter function post_payment(uuid) security definer;
alter function post_transfer(uuid, uuid, numeric, date, text, uuid) security definer;
alter function post_expense(uuid, uuid, numeric, date, text, uuid) security definer;
alter function post_manual_journal(uuid) security definer;

alter function post_goods_receipt(uuid) set search_path = public;
alter function post_goods_delivery(uuid) set search_path = public;
alter function post_sales_invoice(uuid) set search_path = public;
alter function post_purchase_invoice(uuid) set search_path = public;
alter function post_payment(uuid) set search_path = public;
alter function post_transfer(uuid, uuid, numeric, date, text, uuid) set search_path = public;
alter function post_expense(uuid, uuid, numeric, date, text, uuid) set search_path = public;
alter function post_manual_journal(uuid) set search_path = public;
