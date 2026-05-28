-- ============================================================
-- Migration 031: Fix duplicate payment matching in bank import
--
-- Problem: match_bank_import_rows could match the same payment_id
-- across multiple import sessions, allowing a payment to appear
-- as "matched" in two confirmed sessions (double reconciliation).
--
-- Fix: exclude payments that are already matched_payment_id in
-- any bank_import_row whose session has status = 'confirmed'.
-- ============================================================

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
      -- Exclude payments already confirmed in a previous session
      and p.id not in (
        select bir.matched_payment_id
        from bank_import_rows bir
        join bank_import_sessions bis on bir.session_id = bis.id
        where bis.status = 'confirmed'
          and bir.matched_payment_id is not null
      )
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
