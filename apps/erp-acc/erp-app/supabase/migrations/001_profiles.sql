-- ============================================================
-- Migration 001: Profiles & Auth
-- ============================================================
-- Profiles table (linked to Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'staff', 'viewer')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'viewer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper function to get current user's role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Enable RLS
alter table profiles enable row level security;

-- Profiles RLS policies
create policy "Users can read all active profiles"
  on profiles for select using (is_active = true);

create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

create policy "Admins can manage profiles"
  on profiles for all using (get_my_role() = 'admin');
