-- Bootstrap a first company, owner membership, and starter master data.
-- Call as an authenticated Supabase user:
--   select public.bootstrap_company('DEMO', 'Demo Company');

create or replace function public.bootstrap_company(
  p_company_code text default 'DEMO',
  p_company_name text default 'Demo Company',
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_company_id uuid;
  v_created boolean := false;
begin
  if v_actor is null then
    raise exception 'Authenticated user is required to bootstrap a company.';
  end if;

  if nullif(trim(p_company_code), '') is null then
    raise exception 'Company code is required.';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required.';
  end if;

  insert into public.profiles (id, display_name, email)
  values (
    v_actor,
    coalesce(nullif(trim(p_display_name), ''), v_email, 'Owner'),
    v_email
  )
  on conflict (id) do update
  set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    email = coalesce(excluded.email, public.profiles.email),
    updated_at = now();

  insert into public.companies (code, name, created_by, updated_by)
  values (upper(trim(p_company_code)), trim(p_company_name), v_actor, v_actor)
  on conflict (code) do nothing
  returning id into v_company_id;

  if v_company_id is not null then
    v_created := true;
  else
    select id
      into v_company_id
    from public.companies
    where code = upper(trim(p_company_code));

    if not public.has_company_access(v_company_id) then
      raise exception 'Company code already exists and is not accessible by this user.';
    end if;
  end if;

  if v_created then
    insert into public.company_members (
      company_id,
      user_id,
      role,
      extra_permissions,
      created_by,
      updated_by
    )
    values (
      v_company_id,
      v_actor,
      'owner',
      array['approval:self-approve'],
      v_actor,
      v_actor
    )
    on conflict (company_id, user_id) do nothing;
  end if;

  insert into public.cost_centers (company_id, code, name, notes, created_by, updated_by)
  values
    (v_company_id, 'CC-001', 'Operasional', 'Cost center operasional utama.', v_actor, v_actor),
    (v_company_id, 'CC-002', 'Administrasi', 'Cost center administrasi dan umum.', v_actor, v_actor)
  on conflict (company_id, code) do update
  set
    name = excluded.name,
    notes = excluded.notes,
    updated_by = v_actor,
    updated_at = now();

  insert into public.accounts (
    company_id,
    code,
    name,
    account_type,
    normal_balance,
    is_cash_bank,
    notes,
    created_by,
    updated_by
  )
  values
    (v_company_id, '1-1000', 'Kas', 'asset', 'debit', true, 'Akun kas utama.', v_actor, v_actor),
    (v_company_id, '1-2000', 'Bank', 'asset', 'debit', true, 'Akun bank utama.', v_actor, v_actor),
    (v_company_id, '2-1000', 'Hutang Usaha', 'liability', 'credit', false, 'Kewajiban usaha.', v_actor, v_actor),
    (v_company_id, '3-1000', 'Modal', 'equity', 'credit', false, 'Modal pemilik.', v_actor, v_actor),
    (v_company_id, '4-1000', 'Pendapatan', 'revenue', 'credit', false, 'Pendapatan usaha.', v_actor, v_actor),
    (v_company_id, '5-1000', 'Beban Operasional', 'expense', 'debit', false, 'Beban operasional.', v_actor, v_actor)
  on conflict (company_id, code) do update
  set
    name = excluded.name,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    is_cash_bank = excluded.is_cash_bank,
    notes = excluded.notes,
    updated_by = v_actor,
    updated_at = now();

  insert into public.units (company_id, code, name, symbol, notes, created_by, updated_by)
  values
    (v_company_id, 'SAT-001', 'Pcs', 'pcs', 'Satuan unit.', v_actor, v_actor),
    (v_company_id, 'SAT-002', 'Jam', 'jam', 'Satuan jasa per jam.', v_actor, v_actor)
  on conflict (company_id, code) do update
  set
    name = excluded.name,
    symbol = excluded.symbol,
    notes = excluded.notes,
    updated_by = v_actor,
    updated_at = now();

  insert into public.product_categories (company_id, code, name, description, created_by, updated_by)
  values
    (v_company_id, 'CAT-001', 'Jasa Profesional', 'Kategori untuk jasa konsultasi, implementasi, dan support.', v_actor, v_actor),
    (v_company_id, 'CAT-002', 'Produk Digital', 'Kategori untuk produk non-fisik.', v_actor, v_actor)
  on conflict (company_id, code) do update
  set
    name = excluded.name,
    description = excluded.description,
    updated_by = v_actor,
    updated_at = now();

  insert into public.audit_logs (
    company_id,
    action,
    collection_name,
    document_id,
    actor_id,
    actor_name,
    after_data,
    metadata
  )
  values (
    v_company_id,
    case when v_created then 'company_bootstrap' else 'company_seed_refresh' end,
    'companies',
    v_company_id::text,
    v_actor,
    coalesce(p_display_name, v_email),
    jsonb_build_object('companyId', v_company_id, 'code', upper(trim(p_company_code)), 'name', trim(p_company_name)),
    jsonb_build_object('seed', 'starter-company-coa')
  );

  return v_company_id;
end;
$$;

revoke all on function public.bootstrap_company(text, text, text) from public;
grant execute on function public.bootstrap_company(text, text, text) to authenticated;
