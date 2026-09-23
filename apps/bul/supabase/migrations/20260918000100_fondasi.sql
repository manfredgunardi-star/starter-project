-- Fondasi: schema internal, profil & peran, audit, penomoran, hak akses.

create schema if not exists internal;
revoke all on schema internal from public;

create table public.profil (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  nama text not null default '',
  peran text not null default 'viewer'
    check (peran in ('owner', 'keuangan', 'operasional', 'viewer')),
  aktif boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  pengguna_id uuid,
  aksi text not null,
  entitas text not null,
  entitas_id text,
  data jsonb not null default '{}'::jsonb
);
create index audit_log_entitas_idx on public.audit_log (entitas, entitas_id);

create table public.nomor_urut (
  kunci text primary key,
  nilai integer not null
);

create function internal.buat_profil_baru() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profil (id, email, nama)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nama', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_profil
  after insert on auth.users
  for each row execute function internal.buat_profil_baru();

create function public.peran_saya() returns text
language sql stable security definer set search_path = '' as $$
  select p.peran from public.profil p where p.id = auth.uid() and p.aktif
$$;

create function internal.wajib_peran(variadic p_peran text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_peran text;
begin
  if v_uid is null then
    raise exception 'Harus login' using errcode = '42501';
  end if;
  select p.peran into v_peran from public.profil p where p.id = v_uid and p.aktif;
  if v_peran is null then
    raise exception 'Akun belum aktif' using errcode = '42501';
  end if;
  if not (v_peran = any (p_peran)) then
    raise exception 'Peran % tidak boleh melakukan aksi ini', v_peran using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function internal.catat_audit(p_aksi text, p_entitas text, p_entitas_id text, p_data jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (pengguna_id, aksi, entitas, entitas_id, data)
  values (auth.uid(), p_aksi, p_entitas, p_entitas_id, coalesce(p_data, '{}'::jsonb));
$$;

create function internal.nomor_berikut(p_kunci text) returns integer
language sql security definer set search_path = '' as $$
  insert into public.nomor_urut as n (kunci, nilai) values (p_kunci, 1)
  on conflict (kunci) do update set nilai = n.nilai + 1
  returning nilai;
$$;

create function public.atur_profil(p_id uuid, p_peran text, p_aktif boolean, p_nama text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  v_uid := internal.wajib_peran('owner');
  if p_id = v_uid and (p_peran <> 'owner' or not coalesce(p_aktif, false)) then
    raise exception 'Owner tidak boleh menurunkan atau menonaktifkan dirinya sendiri' using errcode = 'P0001';
  end if;
  update public.profil
     set peran = p_peran, aktif = coalesce(p_aktif, false), nama = coalesce(p_nama, nama)
   where id = p_id;
  if not found then
    raise exception 'Profil tidak ditemukan' using errcode = 'P0002';
  end if;
  perform internal.catat_audit('atur_profil', 'profil', p_id::text,
    jsonb_build_object('peran', p_peran, 'aktif', p_aktif));
end;
$$;

-- Dipanggil di akhir SETIAP migrasi. Idempoten.
create function internal.terapkan_hak_akses() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
    execute format('grant select on table public.%I to authenticated', r.relname);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.relname and policyname = 'baca_pengguna_aktif'
    ) then
      execute format(
        'create policy baca_pengguna_aktif on public.%I for select to authenticated using ((select public.peran_saya()) is not null)',
        r.relname);
    end if;
  end loop;

  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
    execute format('grant select on public.%I to authenticated', r.relname);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;

  revoke all on all sequences in schema public from anon, authenticated;
  revoke all on schema internal from anon, authenticated;
end;
$$;

select internal.terapkan_hak_akses();
