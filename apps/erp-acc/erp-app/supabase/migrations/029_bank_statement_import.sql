-- ============================================================
-- Migration 029: Bank Statement Import
-- Tabel: bank_import_sessions, bank_import_rows
-- RPCs: create_bank_import_session, match_bank_import_rows (internal),
--       confirm_bank_import, cancel_bank_import
-- ============================================================

-- ====== TABLES ======

create table bank_import_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  file_name text not null,
  import_date date not null default current_date,
  total_rows int not null default 0,
  matched_rows int not null default 0,
  unmatched_rows int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table bank_import_rows (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references bank_import_sessions(id) on delete cascade,
  row_number int not null,
  statement_date date not null,
  description text,
  amount numeric(15,2) not null,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'uncertain', 'unmatched', 'skipped')),
  matched_payment_id uuid references payments(id),
  confidence numeric(3,2),
  created_at timestamptz not null default now()
);

create index idx_bank_import_rows_session on bank_import_rows(session_id);
create index idx_bank_import_sessions_account on bank_import_sessions(account_id);

-- ====== RLS ======

alter table bank_import_sessions enable row level security;
alter table bank_import_rows enable row level security;

create policy "Authenticated read bank_import_sessions"
  on bank_import_sessions for select to authenticated using (true);
create policy "Admin/staff insert bank_import_sessions"
  on bank_import_sessions for insert to authenticated with check (is_admin_or_staff());
create policy "Admin/staff update bank_import_sessions"
  on bank_import_sessions for update to authenticated using (is_admin_or_staff());
create policy "Admin delete bank_import_sessions"
  on bank_import_sessions for delete to authenticated using (is_admin());

create policy "Authenticated read bank_import_rows"
  on bank_import_rows for select to authenticated using (true);
create policy "Admin/staff insert bank_import_rows"
  on bank_import_rows for insert to authenticated with check (is_admin_or_staff());
create policy "Admin/staff update bank_import_rows"
  on bank_import_rows for update to authenticated using (is_admin_or_staff());
create policy "Admin delete bank_import_rows"
  on bank_import_rows for delete to authenticated using (is_admin());

-- ====== RPCs ======

-- Internal helper: jalankan fuzzy matching untuk semua baris 'unmatched' dalam satu sesi.
-- Logic: cocokkan berdasarkan jumlah (exact) + arah (incoming/outgoing) + tanggal (±3 hari).
-- Confidence: 1.00 (hari sama), 0.95 (±1 hari), 0.92 (±2 hari), 0.90 (±3 hari)
-- match_status = 'matched' jika conf >= 0.90, 'uncertain' jika < 0.90.
create or replace function match_bank_import_rows(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_row record;
  v_payment record;
  v_expected_type text;
  v_conf numeric(3,2);
begin
  select account_id into v_account_id
  from bank_import_sessions
  where id = p_session_id;

  for v_row in
    select * from bank_import_rows
    where session_id = p_session_id and match_status = 'unmatched'
  loop
    v_expected_type := case when v_row.amount > 0 then 'incoming' else 'outgoing' end;

    select p.*,
      case abs(p.date - v_row.statement_date)
        when 0 then 1.00
        when 1 then 0.95
        when 2 then 0.92
        else    0.90
      end as conf
    into v_payment
    from payments p
    where p.account_id = v_account_id
      and p.type       = v_expected_type
      and p.amount     = abs(v_row.amount)
      and p.date between v_row.statement_date - interval '3 days'
                     and v_row.statement_date + interval '3 days'
    order by abs(p.date - v_row.statement_date), p.created_at
    limit 1;

    if found then
      v_conf := v_payment.conf;
      update bank_import_rows set
        match_status       = case when v_conf >= 0.90 then 'matched' else 'uncertain' end,
        matched_payment_id = v_payment.id,
        confidence         = v_conf
      where id = v_row.id;
    end if;
  end loop;

  -- Recompute session counters
  update bank_import_sessions set
    matched_rows   = (select count(*) from bank_import_rows
                      where session_id = p_session_id
                        and match_status in ('matched', 'uncertain')),
    unmatched_rows = (select count(*) from bank_import_rows
                      where session_id = p_session_id
                        and match_status = 'unmatched')
  where id = p_session_id;
end;
$$;

-- Public: buat sesi + baris secara atomik, lalu jalankan matching. Return UUID sesi.
create or replace function create_bank_import_session(
  p_account_id  uuid,
  p_file_name   text,
  p_import_date date,
  p_rows        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_row jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  insert into bank_import_sessions (account_id, file_name, import_date, total_rows, created_by)
  values (p_account_id, p_file_name, p_import_date, jsonb_array_length(p_rows), auth.uid())
  returning id into v_session_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into bank_import_rows (session_id, row_number, statement_date, description, amount)
    values (
      v_session_id,
      (v_row->>'row_number')::int,
      (v_row->>'statement_date')::date,
      v_row->>'description',
      (v_row->>'amount')::numeric
    );
  end loop;

  perform match_bank_import_rows(v_session_id);
  return v_session_id;
end;
$$;

-- Public: konfirmasi sesi import yang pending.
create or replace function confirm_bank_import(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  update bank_import_sessions
  set status = 'confirmed'
  where id = p_session_id and status = 'pending';
end;
$$;

-- Public: batalkan sesi import yang pending.
create or replace function cancel_bank_import(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  update bank_import_sessions
  set status = 'cancelled'
  where id = p_session_id and status = 'pending';
end;
$$;
