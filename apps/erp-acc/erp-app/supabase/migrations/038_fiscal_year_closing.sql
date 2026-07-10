-- ============================================================
-- Migration 038: Fiscal Year Closing (Jurnal Penutup)
-- Closes a fully-past fiscal year by posting a real closing
-- journal (dated 1 Jan of the following year) that zeroes out
-- that year's Revenue/Expense balances into Laba Ditahan
-- (COA 3-12000), and locks all 12 months of that year via the
-- existing closed_periods mechanism. Reversible (LIFO only).
-- ============================================================

create table fiscal_year_closings (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null unique,
  closing_journal_id uuid references journals(id),
  total_revenue numeric(15,2) not null default 0,
  total_expense numeric(15,2) not null default 0,
  net_income numeric(15,2) not null default 0,
  status text not null default 'closed' check (status in ('closed', 'reversed')),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_journal_id uuid references journals(id),
  locked_period_keys jsonb not null default '[]'::jsonb
);

alter table fiscal_year_closings enable row level security;

create policy "Authenticated read fiscal_year_closings"
  on fiscal_year_closings for select to authenticated using (true);

create trigger audit_fiscal_year_closings
  after insert or update or delete on fiscal_year_closings
  for each row execute function fn_audit_log();

-- ------------------------------------------------------------
-- Read-only preview: per-account Revenue/Expense balances for
-- a calendar year, for the "preview before confirm" UI step.
-- ------------------------------------------------------------
create or replace function preview_fiscal_year_closing(p_year int)
returns table (
  coa_id uuid,
  code text,
  name text,
  type text,
  balance numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id as coa_id,
    c.code,
    c.name,
    c.type,
    case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
    and j.is_posted = true
    and j.date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
    and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
  where c.type in ('revenue', 'expense') and c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  having case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end != 0
  order by c.code;
end;
$$;

-- ------------------------------------------------------------
-- List every fiscal year that has Revenue/Expense activity,
-- with its current closing status, for the status table UI.
-- ------------------------------------------------------------
create or replace function list_fiscal_years_status()
returns table (
  fiscal_year int,
  status text,
  closed_at timestamptz,
  net_income numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with years as (
    select distinct extract(year from j.date)::int as fy
    from journals j
    join journal_items ji on ji.journal_id = j.id
    join coa c on c.id = ji.coa_id
    where j.is_posted = true
      and c.type in ('revenue', 'expense')
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
  )
  select
    y.fy,
    coalesce(fyc.status, 'open'),
    fyc.closed_at,
    fyc.net_income
  from years y
  left join fiscal_year_closings fyc on fyc.fiscal_year = y.fy and fyc.status = 'closed'
  order by y.fy;
end;
$$;

-- ------------------------------------------------------------
-- Close a fiscal year: post the closing journal + lock 12 months.
-- ------------------------------------------------------------
create or replace function close_fiscal_year(p_year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_year int := extract(year from current_date)::int;
  v_earliest_open int;
  v_row record;
  v_total_revenue numeric := 0;
  v_total_expense numeric := 0;
  v_net numeric;
  v_journal_id uuid;
  v_coa_laba_ditahan uuid;
  v_closing_date date;
  v_has_lines boolean := false;
  v_settings_id uuid;
  v_closed jsonb;
  v_month int;
  v_key text;
  v_locked_keys jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'permission denied: hanya admin yang bisa menutup tahun buku';
  end if;

  if p_year >= v_current_year then
    raise exception 'hanya tahun yang sudah lewat penuh yang bisa ditutup (tahun berjalan: %)', v_current_year;
  end if;

  if exists (select 1 from fiscal_year_closings where fiscal_year = p_year and status = 'closed') then
    raise exception 'tahun % sudah ditutup', p_year;
  end if;

  select min(sub.fy) into v_earliest_open
  from (
    select distinct extract(year from j.date)::int as fy
    from journals j
    join journal_items ji on ji.journal_id = j.id
    join coa c on c.id = ji.coa_id
    where j.is_posted = true
      and c.type in ('revenue', 'expense')
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
      and extract(year from j.date)::int < p_year
  ) sub
  where sub.fy not in (select fiscal_year from fiscal_year_closings where status = 'closed');

  if v_earliest_open is not null then
    raise exception 'tutup tahun % terlebih dahulu sebelum menutup tahun %', v_earliest_open, p_year;
  end if;

  select id into v_coa_laba_ditahan from coa where code = '3-12000';
  if v_coa_laba_ditahan is null then
    raise exception 'akun Laba Ditahan (3-12000) tidak ditemukan di COA';
  end if;

  v_closing_date := make_date(p_year + 1, 1, 1);
  v_journal_id := gen_random_uuid();

  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_closing_date,
      'Jurnal Penutup Tahun Buku ' || p_year, 'auto', 'fiscal_year_closing', null, true, auth.uid());

  for v_row in
    select
      c.id as coa_id,
      c.type,
      case c.normal_balance
        when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
        when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
      end as balance
    from coa c
    left join journal_items ji on ji.coa_id = c.id
    left join journals j on ji.journal_id = j.id
      and j.is_posted = true
      and j.date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
    where c.type in ('revenue', 'expense') and c.is_active = true
    group by c.id, c.type, c.normal_balance
  loop
    if v_row.balance = 0 then
      continue;
    end if;
    v_has_lines := true;
    if v_row.type = 'revenue' then
      v_total_revenue := v_total_revenue + v_row.balance;
      -- Revenue is normally credit-normal (balance >= 0): debit it to zero it out.
      -- An abnormal debit balance (balance < 0) must be credited instead, since
      -- journal_items has debit >= 0 / credit >= 0 check constraints.
      if v_row.balance >= 0 then
        insert into journal_items (journal_id, coa_id, debit, credit, description)
          values (v_journal_id, v_row.coa_id, v_row.balance, 0, 'Tutup saldo pendapatan ' || p_year);
      else
        insert into journal_items (journal_id, coa_id, debit, credit, description)
          values (v_journal_id, v_row.coa_id, 0, -v_row.balance, 'Tutup saldo pendapatan ' || p_year);
      end if;
    else
      v_total_expense := v_total_expense + v_row.balance;
      -- Expense is normally debit-normal (balance >= 0): credit it to zero it out.
      -- An abnormal credit balance (balance < 0) must be debited instead, since
      -- journal_items has debit >= 0 / credit >= 0 check constraints.
      if v_row.balance >= 0 then
        insert into journal_items (journal_id, coa_id, debit, credit, description)
          values (v_journal_id, v_row.coa_id, 0, v_row.balance, 'Tutup saldo beban ' || p_year);
      else
        insert into journal_items (journal_id, coa_id, debit, credit, description)
          values (v_journal_id, v_row.coa_id, -v_row.balance, 0, 'Tutup saldo beban ' || p_year);
      end if;
    end if;
  end loop;

  v_net := v_total_revenue - v_total_expense;

  if v_has_lines then
    if v_net > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_coa_laba_ditahan, 0, v_net, 'Laba tahun ' || p_year || ' ke Laba Ditahan');
    elsif v_net < 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_coa_laba_ditahan, -v_net, 0, 'Rugi tahun ' || p_year || ' dari Laba Ditahan');
    end if;
  else
    delete from journals where id = v_journal_id;
    v_journal_id := null;
  end if;

  select id, coalesce(closed_periods, '[]'::jsonb) into v_settings_id, v_closed
    from company_settings limit 1;

  if v_settings_id is null then
    raise exception 'company_settings belum ada baris — tidak bisa mengunci periode';
  end if;

  for v_month in 1..12 loop
    v_key := to_char(make_date(p_year, v_month, 1), 'YYYY-MM');
    if not (v_closed ? v_key) then
      v_closed := v_closed || to_jsonb(v_key);
      v_locked_keys := v_locked_keys || to_jsonb(v_key);
    end if;
  end loop;

  update company_settings set closed_periods = v_closed, updated_at = now() where id = v_settings_id;

  insert into fiscal_year_closings (fiscal_year, closing_journal_id, total_revenue, total_expense, net_income, status, closed_by, locked_period_keys)
    values (p_year, v_journal_id, v_total_revenue, v_total_expense, v_net, 'closed', auth.uid(), v_locked_keys);

  return v_journal_id;
end;
$$;

-- ------------------------------------------------------------
-- Reverse the most-recently-closed fiscal year (LIFO only).
-- ------------------------------------------------------------
create or replace function reverse_fiscal_year_closing(p_year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing record;
  v_reversal_journal_id uuid;
  v_item record;
  v_settings_id uuid;
  v_closed jsonb;
  v_latest_closed int;
begin
  if not is_admin() then
    raise exception 'permission denied: hanya admin yang bisa membatalkan penutupan tahun buku';
  end if;

  select * into v_closing from fiscal_year_closings where fiscal_year = p_year and status = 'closed';
  if v_closing is null then
    raise exception 'tahun % belum ditutup atau sudah dibatalkan', p_year;
  end if;

  select max(fiscal_year) into v_latest_closed from fiscal_year_closings where status = 'closed';
  if v_latest_closed != p_year then
    raise exception 'hanya penutupan tahun terakhir (%) yang bisa dibatalkan', v_latest_closed;
  end if;

  if v_closing.closing_journal_id is not null then
    v_reversal_journal_id := gen_random_uuid();
    insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
      values (v_reversal_journal_id, generate_number('JRN'), current_date,
        'Pembatalan Jurnal Penutup Tahun Buku ' || p_year, 'auto', 'fiscal_year_closing_reversal',
        v_closing.closing_journal_id, true, auth.uid());

    for v_item in
      select coa_id, debit, credit, description from journal_items where journal_id = v_closing.closing_journal_id
    loop
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_reversal_journal_id, v_item.coa_id, v_item.credit, v_item.debit, 'Reversal: ' || v_item.description);
    end loop;
  end if;

  select id, coalesce(closed_periods, '[]'::jsonb) into v_settings_id, v_closed
    from company_settings limit 1;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_closed
    from jsonb_array_elements_text(v_closed) as elem
    where elem not in (
      select lk from jsonb_array_elements_text(coalesce(v_closing.locked_period_keys, '[]'::jsonb)) as lk
    );

  update company_settings set closed_periods = v_closed, updated_at = now() where id = v_settings_id;

  update fiscal_year_closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_journal_id = v_reversal_journal_id
    where fiscal_year = p_year;

  return v_reversal_journal_id;
end;
$$;
