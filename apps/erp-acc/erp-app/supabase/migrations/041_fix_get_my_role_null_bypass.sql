-- ============================================================
-- Migration 041: Fix NULL-role RLS/RPC bypass
-- ============================================================
-- get_my_role() returned NULL for any caller with no matching profiles
-- row (in particular an unauthenticated caller, where auth.uid() is NULL).
-- Every write/post RPC gates access with:
--   if not is_admin_or_staff() then raise exception 'permission denied'; end if;
-- In PL/pgSQL, `IF <NULL> THEN ... END IF` does not execute (NULL behaves
-- like false for control flow), so `not is_admin_or_staff()` evaluating to
-- NULL silently skips the exception and falls through into the real
-- insert/update logic. Same issue affects the `<>` check in migration 015.
--
-- Fix: coalesce the role to a sentinel that never matches 'admin'/'staff'
-- so is_admin_or_staff()/is_admin() always resolve to a real boolean.
-- auth.uid() is never NULL for a legitimately authenticated admin/staff
-- user, so this is a no-op for every real caller.
create or replace function get_my_role()
returns text as $$
  select coalesce(
    (select role from profiles where id = auth.uid()),
    'anonymous'
  );
$$ language sql security definer stable;
