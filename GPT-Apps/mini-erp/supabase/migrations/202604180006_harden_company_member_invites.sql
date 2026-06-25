-- Harden company member management so browser clients cannot write memberships directly.
-- Membership changes must go through save_company_member(), which validates target profile,
-- role elevation, extra permissions, and last-owner protection.

create index if not exists idx_profiles_lower_email
on public.profiles (lower(email))
where email is not null;

create or replace function public.is_company_owner(p_company_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = p_user_id
      and cm.role = 'owner'
      and cm.is_active = true
      and cm.deleted_at is null
  );
$$;

create or replace function public.can_read_company_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1
      from public.company_members viewer
      join public.company_members target
        on target.company_id = viewer.company_id
      where viewer.user_id = auth.uid()
        and viewer.is_active = true
        and viewer.deleted_at is null
        and target.user_id = p_profile_id
        and target.is_active = true
        and target.deleted_at is null
    );
$$;

drop policy if exists "profiles company member read" on public.profiles;
create policy "profiles company member read" on public.profiles
for select using (public.can_read_company_profile(id));

drop policy if exists "company members admin write" on public.company_members;
drop policy if exists "company members admin insert" on public.company_members;
drop policy if exists "company members admin update" on public.company_members;

create or replace function public.save_company_member(
  p_company_id uuid,
  p_identifier text,
  p_role public.member_role,
  p_extra_permissions text[] default '{}'::text[],
  p_is_active boolean default true
)
returns public.company_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
  v_target_user_id uuid;
  v_existing public.company_members%rowtype;
  v_saved public.company_members%rowtype;
  v_actor_is_owner boolean;
  v_other_active_owner_count integer;
  v_extra_permissions text[] := '{}'::text[];
  v_invalid_permissions text[] := '{}'::text[];
begin
  if v_actor is null then
    raise exception 'Authenticated user is required to manage company members.';
  end if;

  if nullif(v_identifier, '') is null then
    raise exception 'User ID or email is required.';
  end if;

  if not public.has_company_permission(p_company_id, 'users:manage') then
    raise exception 'users:manage permission is required to manage company members.';
  end if;

  select p.id
    into v_target_user_id
  from public.profiles p
  where p.id::text = v_identifier
     or lower(p.email) = v_identifier
  order by case when p.id::text = v_identifier then 0 else 1 end
  limit 1;

  if v_target_user_id is null then
    raise exception 'Target user profile was not found. Create the Supabase Auth user and profile before adding company access.';
  end if;

  select coalesce(array_agg(permission order by permission), '{}'::text[])
    into v_extra_permissions
  from (
    select distinct permission
    from unnest(coalesce(p_extra_permissions, '{}'::text[])) as permission
    where nullif(trim(permission), '') is not null
  ) normalized;

  select coalesce(array_agg(permission order by permission), '{}'::text[])
    into v_invalid_permissions
  from unnest(v_extra_permissions) as permission
  where permission not in ('approval:self-approve');

  if cardinality(v_invalid_permissions) > 0 then
    raise exception 'Unsupported extra company member permissions: %', array_to_string(v_invalid_permissions, ', ');
  end if;

  select *
    into v_existing
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = v_target_user_id;

  v_actor_is_owner := public.is_company_owner(p_company_id, v_actor);

  if p_role = 'owner' and not v_actor_is_owner then
    raise exception 'Only an active owner can grant owner role.';
  end if;

  if v_existing.user_id is not null
    and v_existing.role = 'owner'
    and not v_actor_is_owner then
    raise exception 'Only an active owner can change another owner membership.';
  end if;

  if v_existing.user_id is not null
    and v_existing.role = 'owner'
    and v_existing.is_active = true
    and v_existing.deleted_at is null
    and (p_role <> 'owner' or p_is_active = false) then
    select count(*)
      into v_other_active_owner_count
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id <> v_target_user_id
      and cm.role = 'owner'
      and cm.is_active = true
      and cm.deleted_at is null;

    if v_other_active_owner_count = 0 then
      raise exception 'Company must keep at least one active owner.';
    end if;
  end if;

  insert into public.company_members (
    company_id,
    user_id,
    role,
    extra_permissions,
    is_active,
    created_by,
    updated_by,
    deleted_at,
    deleted_by
  )
  values (
    p_company_id,
    v_target_user_id,
    p_role,
    v_extra_permissions,
    p_is_active,
    v_actor,
    v_actor,
    case when p_is_active then null else now() end,
    case when p_is_active then null else v_actor end
  )
  on conflict (company_id, user_id) do update
  set
    role = excluded.role,
    extra_permissions = excluded.extra_permissions,
    is_active = excluded.is_active,
    updated_by = v_actor,
    deleted_at = case
      when excluded.is_active then null
      else coalesce(public.company_members.deleted_at, now())
    end,
    deleted_by = case
      when excluded.is_active then null
      else v_actor
    end
  returning * into v_saved;

  return v_saved;
end;
$$;

revoke all on function public.is_company_owner(uuid, uuid) from public;
grant execute on function public.is_company_owner(uuid, uuid) to authenticated;

revoke all on function public.can_read_company_profile(uuid) from public;
grant execute on function public.can_read_company_profile(uuid) to authenticated;

revoke all on function public.save_company_member(uuid, text, public.member_role, text[], boolean) from public;
grant execute on function public.save_company_member(uuid, text, public.member_role, text[], boolean) to authenticated;
