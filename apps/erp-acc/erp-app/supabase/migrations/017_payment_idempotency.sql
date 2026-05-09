-- ============================================================
-- Migration 017: Payment idempotency (V4)
-- • Adds is_posted / posted_journal_id / posted_at to payments
-- • Re-creates post_payment with FOR UPDATE lock + idempotent return
-- • Adds save_and_post_payment RPC (atomic insert + post in 1 tx)
-- ============================================================

alter table payments
  add column if not exists is_posted      boolean     not null default false,
  add column if not exists posted_journal_id uuid      references journals(id),
  add column if not exists posted_at      timestamptz;

-- -------------------------------------------------------
-- post_payment: idempotent version
-- • Locks the payments row with FOR UPDATE before reading
-- • If already posted, returns existing journal id (no duplicate)
-- • If not posted, runs full journal logic then marks is_posted
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
begin
  perform _ensure_can_post();

  -- Lock the row so concurrent calls can't double-post
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
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Terima pembayaran - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_pay.amount,
              'Pelunasan piutang - ' || v_pay.payment_number);
    update accounts set balance = balance + v_pay.amount
     where id = v_pay.account_id;
  elsif v_pay.type = 'outgoing' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pay.amount,
              'Pelunasan hutang - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Bayar supplier - ' || v_pay.payment_number);
    update accounts set balance = balance - v_pay.amount
     where id = v_pay.account_id;
  end if;

  if v_pay.invoice_id is not null then
    update invoices
       set amount_paid = amount_paid + v_pay.amount,
           status = case
             when amount_paid + v_pay.amount >= total then 'paid'
             else 'partial'
           end
     where id = v_pay.invoice_id;
  end if;

  -- Mark as posted
  update payments
     set is_posted         = true,
         posted_journal_id = v_journal_id,
         posted_at         = now()
   where id = p_payment_id;

  return v_journal_id;
end $$;

-- -------------------------------------------------------
-- save_and_post_payment: atomic INSERT + post in one transaction
-- Eliminates the two-step insert-then-RPC pattern in the client
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
    account_id, amount, notes, created_by
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
    auth.uid()
  );

  perform post_payment(v_id);
  return v_id;
end $$;
