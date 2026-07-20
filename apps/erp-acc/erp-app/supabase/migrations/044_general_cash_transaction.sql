-- ============================================================
-- Migration 044: General cash/bank transaction (non-AP/AR)
-- Adds COA accounts for prepaid expense and tax expense, and a
-- new RPC post_general_cash_transaction: an atomic, multi-line,
-- staff-postable journal entry for transactions with no AP/AR
-- counterparty (bank fees, prepaid expense, tax expense, bank
-- interest income, etc). At least one line must reference a
-- cash/bank account (account_id) so this cannot be used as a
-- backdoor for arbitrary non-cash reclassification entries —
-- those remain admin-only via post_manual_journal.
-- ============================================================

-- New COA accounts (asset + expense side, following the existing
-- numbering convention: 1-1x000 under "Aset Lancar" (1-10000),
-- 5-xx000 under "BEBAN" (5-00000)).
insert into coa (code, name, type, normal_balance, parent_id) values
  ('1-17000', 'Biaya Dibayar Dimuka', 'asset', 'debit',
    (select id from coa where code = '1-10000')),
  ('5-20000', 'Beban Pajak', 'expense', 'debit',
    (select id from coa where code = '5-00000'));

create or replace function post_general_cash_transaction(
  p_date date,
  p_description text,
  p_lines jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal_id uuid;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_count int := 0;
  v_cash_leg_count int := 0;
  v_debit numeric;
  v_credit numeric;
begin
  perform _ensure_can_post();
  perform _ensure_period_open(p_date);

  if p_description is null or btrim(p_description) = '' then
    raise exception 'Deskripsi wajib diisi';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) != 'array' then
    raise exception 'p_lines harus berupa array';
  end if;

  -- Pass 1: validate every line before writing anything.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_count := v_line_count + 1;
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);

    if v_line->>'coa_id' is null then
      raise exception 'Baris % tidak punya coa_id', v_line_count;
    end if;
    -- Postgres numeric accepts 'NaN'/'Infinity'/'-Infinity' as valid values, and
    -- NaN sorts as greater than every ordinary number (NaN > 0 is true, NaN = NaN
    -- is true) -- so without this check, a debit/credit of "NaN" would silently
    -- pass every comparison below, including the final balance check, and
    -- corrupt accounts.balance to NaN once summed in.
    if v_debit::text in ('NaN', 'Infinity', '-Infinity') or v_credit::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Baris % memiliki nilai debit/kredit tidak valid', v_line_count;
    end if;
    if (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'Baris % harus mengisi tepat satu dari debit atau kredit', v_line_count;
    end if;
    if v_debit < 0 or v_credit < 0 then
      raise exception 'Baris % tidak boleh bernilai negatif', v_line_count;
    end if;
    if v_line->>'account_id' is not null then
      -- Defense in depth: the frontend only offers accounts whose coa_id already
      -- matches the line's selected coa_id, but this RPC is a direct, callable
      -- security-definer entry point -- it must not trust that constraint held.
      -- Without this check, a caller could pair a real cash/bank account_id with
      -- an unrelated coa_id, moving real money in accounts.balance while the
      -- general ledger records it against the wrong account entirely.
      if not exists (
        select 1 from accounts
         where id = (v_line->>'account_id')::uuid
           and coa_id = (v_line->>'coa_id')::uuid
      ) then
        raise exception 'Baris %: akun kas/bank tidak cocok dengan COA yang dipilih', v_line_count;
      end if;
      v_cash_leg_count := v_cash_leg_count + 1;
    end if;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if v_line_count < 2 then
    raise exception 'Minimal 2 baris jurnal';
  end if;
  if v_cash_leg_count < 1 then
    raise exception 'Minimal satu baris harus terhubung ke akun kas/bank';
  end if;
  if v_total_debit != v_total_credit or v_total_debit <= 0 then
    raise exception 'Jurnal tidak seimbang (total debit % != total kredit %)', v_total_debit, v_total_credit;
  end if;

  -- Pass 2: write header, then lines, then sync account balances.
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date, p_description,
      'manual', 'general_cash_transaction', true, p_user_id);

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_items (journal_id, coa_id, account_id, debit, credit, description)
      values (
        v_journal_id,
        (v_line->>'coa_id')::uuid,
        (v_line->>'account_id')::uuid,
        coalesce((v_line->>'debit')::numeric, 0),
        coalesce((v_line->>'credit')::numeric, 0),
        v_line->>'description'
      );

    if v_line->>'account_id' is not null then
      update accounts
         set balance = balance
           + coalesce((v_line->>'debit')::numeric, 0)
           - coalesce((v_line->>'credit')::numeric, 0)
       where id = (v_line->>'account_id')::uuid;
    end if;
  end loop;

  return v_journal_id;
end;
$$;
