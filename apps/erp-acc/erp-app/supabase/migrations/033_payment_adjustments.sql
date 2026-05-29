-- ============================================================
-- Migration 033: Payment adjustment fields
-- Adds 3 optional adjustment types to payments:
--   discount:  waived portion of invoice (incoming → debit Diskon Penjualan;
--              outgoing → credit Diskon Pembelian)
--   fee:       extra bank transfer fee, outgoing only (debit Biaya Bank)
--   rounding:  signed tiny rounding difference (debit/credit Selisih Pembulatan)
--
-- Accounting identities:
--   v_effective = amount + discount_amount + rounding_amount
--   incoming: D Kas(amount) + D Diskon(discount) + D/C Pembulatan = C Piutang(v_effective)
--   outgoing: D Hutang(v_effective) + D Biaya(fee) = C Kas(amount+fee) + C Diskon(discount) + C/D Pembulatan
-- ============================================================

alter table payments
  add column if not exists discount_amount  numeric(15,2) not null default 0
    check (discount_amount >= 0),
  add column if not exists discount_coa_id  uuid references coa(id),
  add column if not exists fee_amount       numeric(15,2) not null default 0
    check (fee_amount >= 0),
  add column if not exists fee_coa_id       uuid references coa(id),
  add column if not exists rounding_amount  numeric(15,2) not null default 0,
  add column if not exists rounding_coa_id  uuid references coa(id);

-- -------------------------------------------------------
-- Re-create post_payment with adjustment journal lines
-- -------------------------------------------------------
create or replace function post_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay           record;
  v_journal_id    uuid;
  v_coa_piutang   uuid;
  v_coa_hutang    uuid;
  v_effective     numeric;
begin
  perform _ensure_can_post();

  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
   where p.id = p_payment_id
     for update of p;

  if v_pay is null then
    raise exception 'payment % not found', p_payment_id;
  end if;

  -- IDEMPOTENT: already posted — return existing journal, do nothing
  if v_pay.is_posted then
    return v_pay.posted_journal_id;
  end if;

  perform _ensure_period_open(v_pay.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang  from coa where code = '2-11000';

  -- Effective settlement amount applied to the invoice
  v_effective := v_pay.amount + v_pay.discount_amount + v_pay.rounding_amount;

  v_journal_id := gen_random_uuid();
  insert into journals (
    id, journal_number, date, description, source,
    reference_type, reference_id, customer_id, supplier_id,
    is_posted, created_by
  ) values (
    v_journal_id, generate_number('JRN'), v_pay.date,
    'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
    v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by
  );

  if v_pay.type = 'incoming' then
    -- D: Kas/Bank (cash actually received from customer)
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Terima pembayaran - ' || v_pay.payment_number);

    -- D: Diskon Penjualan (if any — expense because we gave discount to customer)
    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon penjualan - ' || v_pay.payment_number);
    end if;

    -- D or C: Selisih pembulatan (signed)
    --   rounding > 0: customer short-paid → our loss → debit
    --   rounding < 0: customer over-paid  → our gain → credit
    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    -- C: Piutang Usaha (full effective settlement)
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_effective,
              'Pelunasan piutang - ' || v_pay.payment_number);

    update accounts set balance = balance + v_pay.amount
     where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    -- D: Hutang Usaha (full effective settlement of the invoice)
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_effective,
              'Pelunasan hutang - ' || v_pay.payment_number);

    -- D: Biaya bank/transfer (if any — outgoing only)
    if v_pay.fee_amount > 0 then
      if v_pay.fee_coa_id is null then
        raise exception 'COA biaya bank wajib diisi jika fee_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.fee_coa_id, v_pay.fee_amount,
                'Biaya transfer - ' || v_pay.payment_number);
    end if;

    -- C: Kas/Bank (amount + fee = cash physically out of bank account)
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount + v_pay.fee_amount,
              'Bayar supplier - ' || v_pay.payment_number);

    -- C: Diskon Pembelian (received from supplier — gain for us)
    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon pembelian - ' || v_pay.payment_number);
    end if;

    -- C or D: Selisih pembulatan outgoing (signed)
    --   rounding > 0: write off hutang → gain → credit
    --   rounding < 0: tiny extra cost  → loss → debit
    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    update accounts set balance = balance - (v_pay.amount + v_pay.fee_amount)
     where id = v_pay.account_id;
  end if;

  -- Update invoice: use v_effective as settlement amount
  if v_pay.invoice_id is not null then
    update invoices
       set amount_paid = amount_paid + v_effective,
           status = case
             when amount_paid + v_effective >= total - 0.01 then 'paid'
             else 'partial'
           end
     where id = v_pay.invoice_id;
  end if;

  update payments
     set is_posted         = true,
         posted_journal_id = v_journal_id,
         posted_at         = now()
   where id = p_payment_id;

  return v_journal_id;
end $$;

-- -------------------------------------------------------
-- Re-create save_and_post_payment with adjustment fields
-- -------------------------------------------------------
create or replace function save_and_post_payment(p_payment jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_number text;
begin
  perform _ensure_can_post();
  perform _ensure_period_open((p_payment->>'date')::date);

  v_number := generate_number('PAY');
  v_id     := gen_random_uuid();

  insert into payments (
    id, payment_number, date, type,
    invoice_id, customer_id, supplier_id,
    account_id, amount, notes,
    discount_amount, discount_coa_id,
    fee_amount,      fee_coa_id,
    rounding_amount, rounding_coa_id,
    created_by
  ) values (
    v_id,
    v_number,
    (p_payment->>'date')::date,
    p_payment->>'type',
    nullif(p_payment->>'invoice_id',  '')::uuid,
    nullif(p_payment->>'customer_id', '')::uuid,
    nullif(p_payment->>'supplier_id', '')::uuid,
    (p_payment->>'account_id')::uuid,
    (p_payment->>'amount')::numeric,
    nullif(p_payment->>'notes', ''),
    coalesce((p_payment->>'discount_amount')::numeric,  0),
    nullif(p_payment->>'discount_coa_id',  '')::uuid,
    coalesce((p_payment->>'fee_amount')::numeric,       0),
    nullif(p_payment->>'fee_coa_id',       '')::uuid,
    coalesce((p_payment->>'rounding_amount')::numeric,  0),
    nullif(p_payment->>'rounding_coa_id',  '')::uuid,
    auth.uid()
  );

  perform post_payment(v_id);
  return v_id;
end $$;
