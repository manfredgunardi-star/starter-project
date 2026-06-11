# Sales Invoice — Potongan Uang Muka (Advance Deduction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan field "Potongan Uang Muka" manual pada Sales Invoice yang mengurangi piutang saat posting, dengan akun COA yang dipilih user per-invoice.

**Architecture:** Dua kolom baru di tabel `invoices` (`advance_deduction_amount`, `advance_deduction_coa_id`), mengikuti pola `discount_coa_id` di migration 033. Saat posting, jurnal mendebit akun UM (mengurangi piutang yang dibukukan) sementara `invoices.total` tetap penuh. `post_payment` disesuaikan agar invoice tetap bisa mencapai status `paid`. Frontend menampilkan input + "Sisa Tagih", dan AR aging / PDF dikoreksi agar tidak melebih-hitung piutang.

**Tech Stack:** Supabase (PostgreSQL plpgsql RPC), React 18 + Ant Design, jsPDF (PDF), Vite.

**Keputusan terkunci (dari brainstorming 2026-06-11):**
- Akun COA: **dipilih user per-invoice** (dropdown), tidak menambah akun ke seed.
- Efek: **kurangi piutang, `total` tetap penuh**. Sisa tagih = `total − UM − amount_paid`.
- Lokasi: **Sales Invoice saja** (bukan di SO).
- Validasi: `0 ≤ UM ≤ total`. Tidak ada pelacakan saldo advance (disiplin di tangan user).
- Interaksi PPN: tidak ada — UM murni mengurangi total setelah PPN.

**Finance guardrail:** Perubahan menyentuh jurnal & alokasi pembayaran. Migration TIDAK boleh di-apply ke database produksi (ERP-MG) tanpa persetujuan user. Verifikasi SQL dilakukan di Supabase branch atau transaksi yang di-rollback.

---

## File Structure

| File | Tanggung jawab | Aksi |
|---|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql` | Skema + 3 RPC (save_sales_invoice, post_sales_invoice, post_payment) | Create |
| `apps/erp-acc/erp-app/src/services/salesService.js` | Kirim & terima field UM via RPC | Modify |
| `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Input UM + COA, validasi, tampilan sisa tagih | Modify |
| `apps/erp-acc/erp-app/src/services/reportService.js` | Sertakan kolom UM di query AR aging | Modify |
| `apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx` | Kurangi UM dari saldo aging | Modify |
| `apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js` | Baris "Uang Muka" + "Sisa Tagih" di PDF | Modify |

---

## Task 1: Migration — skema kolom + `save_sales_invoice`

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql`

- [ ] **Step 1: Tulis bagian skema + `save_sales_invoice` ke file migrasi baru**

Buat file `apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql` dengan isi:

```sql
-- ============================================================
-- Migration 037: Sales Invoice — Potongan Uang Muka (advance deduction)
-- Menambah 2 kolom di invoices (pola mengikuti discount_coa_id migration 033):
--   advance_deduction_amount : nominal potongan uang muka (>= 0)
--   advance_deduction_coa_id : akun COA tujuan debit saat posting (dipilih user)
--
-- Konvensi: invoices.total tetap PENUH (subtotal + PPN). Potongan uang muka
-- mengurangi PIUTANG yang dibukukan saat posting, bukan total invoice.
-- Sisa tagih = total - advance_deduction_amount - amount_paid.
--
-- Hanya berlaku untuk sales invoice (type='sales'). Validasi UM <= total
-- dilakukan server-side di save_sales_invoice.
-- ============================================================

alter table invoices
  add column if not exists advance_deduction_amount numeric(15,2) not null default 0
    check (advance_deduction_amount >= 0),
  add column if not exists advance_deduction_coa_id  uuid references coa(id);

-- -------------------------------------------------------
-- save_sales_invoice: persist + validasi UM
-- (lanjutan dari migration 036; subtotal/tax tetap recompute server-side)
-- -------------------------------------------------------
create or replace function save_sales_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id     uuid;
  v_number     text;
  v_subtotal   numeric := 0;
  v_tax        numeric := 0;
  v_total      numeric := 0;
  v_adv_amount numeric := 0;
  v_adv_coa    uuid;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qty * price as line_subtotal,
      case when p.is_taxable
           then round(qty * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity')::numeric, 0)   as qty,
             coalesce((i->>'unit_price')::numeric, 0)  as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  -- Potongan uang muka (manual). Validasi: 0 <= UM <= total, butuh COA bila > 0.
  v_adv_amount := coalesce((p_invoice->>'advance_deduction_amount')::numeric, 0);
  v_adv_coa    := nullif(p_invoice->>'advance_deduction_coa_id', '')::uuid;
  if v_adv_amount < 0 then
    raise exception 'potongan uang muka tidak boleh negatif';
  end if;
  if v_adv_amount > v_total + 0.01 then
    raise exception 'potongan uang muka (%) melebihi total invoice (%)', v_adv_amount, v_total;
  end if;
  if v_adv_amount > 0 and v_adv_coa is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, payment_term_id,
      status, subtotal, tax_amount, total,
      advance_deduction_amount, advance_deduction_coa_id,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id',    '')::uuid,
      nullif(p_invoice->>'goods_delivery_id', '')::uuid,
      nullif(p_invoice->>'payment_term_id',   '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      v_adv_amount, v_adv_coa,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date                     = (p_invoice->>'date')::date,
           due_date                 = nullif(p_invoice->>'due_date', '')::date,
           customer_id              = (p_invoice->>'customer_id')::uuid,
           sales_order_id           = nullif(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id        = nullif(p_invoice->>'goods_delivery_id', '')::uuid,
           payment_term_id          = nullif(p_invoice->>'payment_term_id',   '')::uuid,
           subtotal                 = v_subtotal,
           tax_amount               = v_tax,
           total                    = v_total,
           advance_deduction_amount = v_adv_amount,
           advance_deduction_coa_id = v_adv_coa,
           notes                    = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'sales';
    if not found then
      raise exception 'sales invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    v.qty,
    coalesce((i->>'quantity_base')::numeric, v.qty),
    v.price,
    t.line_tax,
    v.qty * v.price + t.line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity')::numeric, 0)  as qty,
           coalesce((i->>'unit_price')::numeric, 0) as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qty * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_inv_id;
end $$;
```

- [ ] **Step 2: Verifikasi skema + persist + validasi di Supabase branch**

Terapkan migrasi ke Supabase **branch** (bukan produksi). Gunakan MCP Supabase `create_branch` lalu `apply_migration` dengan isi file di atas, ATAU jalankan dalam transaksi yang di-rollback. Lalu jalankan verifikasi:

```sql
-- Verifikasi kolom ada
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'invoices'
  and column_name in ('advance_deduction_amount', 'advance_deduction_coa_id')
order by column_name;
-- Expected: 2 baris. advance_deduction_amount numeric default 0; advance_deduction_coa_id uuid.

-- Validasi UM > total harus GAGAL (pakai customer & product taxable dari seed).
-- Ganti <CUST>, <PROD>, <UNIT>, <COA_UM> dengan id nyata dari seed branch.
do $$
declare
  v_err text;
begin
  begin
    perform save_sales_invoice(
      jsonb_build_object(
        'date', current_date, 'customer_id', '<CUST>',
        'advance_deduction_amount', 999999999, 'advance_deduction_coa_id', '<COA_UM>'),
      jsonb_build_array(jsonb_build_object(
        'product_id','<PROD>','unit_id','<UNIT>','quantity',1,'unit_price',1000))
    );
    raise exception 'BUG: validasi UM>total tidak memicu error';
  exception when others then
    get stacked diagnostics v_err = message_text;
    raise notice 'OK validasi memicu: %', v_err;
  end;
end $$;
-- Expected: NOTICE 'OK validasi memicu: potongan uang muka ... melebihi total invoice ...'
```

Expected: kolom muncul; insert dengan UM > total raise exception berisi "melebihi total invoice".

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql
git commit -m "feat(sales-invoice): add advance deduction columns + persist/validate in save RPC"
```

---

## Task 2: Migration — `post_sales_invoice` (jurnal + status)

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql`

- [ ] **Step 1: Tambahkan `post_sales_invoice` ke file migrasi (append)**

Tambahkan blok berikut di akhir file `037_sales_invoice_advance_deduction.sql`:

```sql
-- -------------------------------------------------------
-- post_sales_invoice: debit akun UM mengurangi piutang yang dibukukan.
-- Jurnal pendapatan (lanjutan dari migration 011):
--   D Piutang            = total - UM        (hanya jika > 0)
--   D Akun Uang Muka     = UM                (hanya jika UM > 0)
--   C Pendapatan         = subtotal
--   C PPN Keluaran       = tax_amount        (hanya jika > 0)
-- Status invoice: 'paid' bila UM >= total - 0.01 (UM menutup seluruh tagihan),
-- selain itu 'posted'.
-- -------------------------------------------------------
create or replace function post_sales_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_hpp_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_pendapatan uuid;
  v_coa_ppn_out uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_has_gd boolean;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
  v_piutang numeric;
begin
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
  end if;

  if v_inv.advance_deduction_amount > 0 and v_inv.advance_deduction_coa_id is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;
  if v_inv.advance_deduction_amount > v_inv.total + 0.01 then
    raise exception 'potongan uang muka melebihi total invoice';
  end if;

  select id into v_coa_piutang from coa where code = '1-13000'; -- Piutang Usaha
  select id into v_coa_pendapatan from coa where code = '4-11000'; -- Pendapatan Penjualan
  select id into v_coa_ppn_out from coa where code = '2-12000'; -- PPN Keluaran
  select id into v_coa_hpp from coa where code = '5-11000'; -- HPP
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan

  -- Revenue journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice', p_invoice_id,
      v_inv.customer_id, true, v_inv.created_by);

  -- Debit: Piutang = total - uang muka (skip jika 0)
  v_piutang := v_inv.total - v_inv.advance_deduction_amount;
  if v_piutang > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_piutang, v_piutang, 'Piutang - ' || v_inv.invoice_number);
  end if;

  -- Debit: Akun Uang Muka (offset) jika ada
  if v_inv.advance_deduction_amount > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_inv.advance_deduction_coa_id, v_inv.advance_deduction_amount,
              'Potongan uang muka - ' || v_inv.invoice_number);
  end if;

  -- Credit: Pendapatan = subtotal (sebelum PPN)
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_pendapatan, v_inv.subtotal, 'Pendapatan - ' || v_inv.invoice_number);

  -- Credit: PPN Keluaran (jika ada)
  if v_inv.tax_amount > 0 then
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_ppn_out, v_inv.tax_amount, 'PPN Keluaran - ' || v_inv.invoice_number);
  end if;

  -- Check if goods already delivered via goods_deliveries (HPP sudah dibuat)
  select exists(
    select 1 from goods_deliveries
      where sales_order_id = v_inv.sales_order_id
        and status = 'posted'
  ) into v_has_gd;

  -- Jika belum ada delivery, handle HPP + stock out sekarang
  if not v_has_gd then
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      v_avg_cost := inventory_stock_out(
        v_item.product_id, v_item.quantity_base,
        v_item.unit_id, v_item.quantity, 'sales_invoice', p_invoice_id, v_inv.date
      );
      v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
    end loop;

    if v_total_hpp > 0 then
      v_hpp_journal_id := gen_random_uuid();
      insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
        values (v_hpp_journal_id, generate_number('JRN'), v_inv.date,
          'HPP Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice_hpp', p_invoice_id,
          v_inv.customer_id, true, v_inv.created_by);
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_hpp_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_inv.invoice_number);
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_hpp_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_inv.invoice_number);
    end if;
  end if;

  -- Update invoice status & SO status. UM penuh => langsung 'paid'.
  update invoices
     set status = case when advance_deduction_amount >= total - 0.01 then 'paid' else 'posted' end
   where id = p_invoice_id;
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;
```

- [ ] **Step 2: Verifikasi jurnal seimbang & piutang berkurang**

Terapkan ulang migrasi ke branch (re-run `apply_migration`/`execute_sql`). Buat invoice draft dengan UM, post, dan cek:

```sql
-- Buat + post invoice dengan UM. Ganti <CUST>,<PROD>,<UNIT>,<COA_UM> dengan id seed.
-- Asumsi product taxable 11%, qty 1, price 100000 => subtotal 100000, ppn 11000, total 111000.
do $$
declare
  v_inv uuid;
  v_jrn uuid;
  v_debit numeric;
  v_credit numeric;
  v_piutang numeric;
  v_status text;
begin
  v_inv := save_sales_invoice(
    jsonb_build_object('date', current_date, 'customer_id', '<CUST>',
      'advance_deduction_amount', 30000, 'advance_deduction_coa_id', '<COA_UM>'),
    jsonb_build_array(jsonb_build_object(
      'product_id','<PROD>','unit_id','<UNIT>','quantity',1,'unit_price',100000)));
  v_jrn := post_sales_invoice(v_inv);

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debit, v_credit from journal_items where journal_id = v_jrn;
  select coalesce(sum(debit),0) into v_piutang
    from journal_items ji join coa c on c.id = ji.coa_id
   where ji.journal_id = v_jrn and c.code = '1-13000';
  select status into v_status from invoices where id = v_inv;

  raise notice 'debit=% credit=% piutang=% status=%', v_debit, v_credit, v_piutang, v_status;
  if v_debit <> v_credit then raise exception 'BUG: jurnal tidak seimbang'; end if;
  if v_piutang <> 81000 then raise exception 'BUG: piutang harus 111000-30000=81000, dapat %', v_piutang; end if;
  if v_status <> 'posted' then raise exception 'BUG: status harus posted'; end if;
end $$;
-- Expected NOTICE: debit=111000 credit=111000 piutang=81000 status=posted
```

Expected: jurnal seimbang (debit=credit=111000), piutang = 81000, status `posted`.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql
git commit -m "feat(sales-invoice): post advance deduction to journal, reduce booked receivable"
```

---

## Task 3: Migration — `post_payment` (ambang status `paid`)

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql`

- [ ] **Step 1: Tambahkan `post_payment` ke file migrasi (append)**

Fungsi ini disalin utuh dari migration 033 dengan **satu perubahan**: ambang status `paid` memperhitungkan `advance_deduction_amount`. Tambahkan blok berikut di akhir file:

```sql
-- -------------------------------------------------------
-- post_payment: identik migration 033, KECUALI ambang status invoice
-- kini memperhitungkan advance_deduction_amount agar invoice dengan
-- potongan uang muka tetap bisa mencapai 'paid' saat sisa tagih lunas.
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

  if v_pay.is_posted then
    return v_pay.posted_journal_id;
  end if;

  perform _ensure_period_open(v_pay.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang  from coa where code = '2-11000';

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
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Terima pembayaran - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon penjualan - ' || v_pay.payment_number);
    end if;

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

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_effective,
              'Pelunasan piutang - ' || v_pay.payment_number);

    update accounts set balance = balance + v_pay.amount
     where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_effective,
              'Pelunasan hutang - ' || v_pay.payment_number);

    if v_pay.fee_amount > 0 then
      if v_pay.fee_coa_id is null then
        raise exception 'COA biaya bank wajib diisi jika fee_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.fee_coa_id, v_pay.fee_amount,
                'Biaya transfer - ' || v_pay.payment_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount + v_pay.fee_amount,
              'Bayar supplier - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon pembelian - ' || v_pay.payment_number);
    end if;

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

  -- Update invoice: ambang 'paid' kini memperhitungkan potongan uang muka.
  if v_pay.invoice_id is not null then
    update invoices
       set amount_paid = amount_paid + v_effective,
           status = case
             when amount_paid + v_effective + advance_deduction_amount >= total - 0.01 then 'paid'
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
```

- [ ] **Step 2: Verifikasi invoice mencapai `paid` saat sisa tagih lunas**

Terapkan ulang migrasi ke branch. Lanjutkan dari invoice Task 2 (total 111000, UM 30000, sisa tagih 81000). Buat pembayaran incoming 81000 lalu post:

```sql
-- Ganti <INV> dgn invoice ber-UM dari Task 2 (status 'posted', amount_paid 0),
-- <ACC> dgn akun kas/bank dari seed, <CUST> customer-nya.
do $$
declare
  v_pay uuid;
  v_status text;
  v_paid numeric;
begin
  v_pay := save_and_post_payment(jsonb_build_object(
    'date', current_date, 'type', 'incoming',
    'invoice_id', '<INV>', 'customer_id', '<CUST>',
    'account_id', '<ACC>', 'amount', 81000));
  select status, amount_paid into v_status, v_paid from invoices where id = '<INV>';
  raise notice 'status=% amount_paid=%', v_status, v_paid;
  if v_status <> 'paid' then raise exception 'BUG: invoice harus paid, dapat %', v_status; end if;
end $$;
-- Expected NOTICE: status=paid amount_paid=81000
```

Expected: setelah bayar 81000, `amount_paid=81000` dan status `paid` (karena 81000 + 30000 UM >= 111000).

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/037_sales_invoice_advance_deduction.sql
git commit -m "feat(payment): account for advance deduction in invoice paid threshold"
```

---

## Task 4: Service — kirim & terima field UM

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/salesService.js:153-178` (`saveSalesInvoice`)

- [ ] **Step 1: Tambahkan field UM ke payload `saveSalesInvoice`**

Di `salesService.js`, dalam `saveSalesInvoice`, pada objek `p_invoice` tambahkan dua field (setelah `notes`):

```js
export async function saveSalesInvoice(invoice, items) {
  const { data, error } = await supabase.rpc('save_sales_invoice', {
    p_invoice: {
      id:               invoice.id               || null,
      date:             invoice.date,
      due_date:         invoice.due_date         || null,
      customer_id:      invoice.customer_id,
      sales_order_id:   invoice.sales_order_id   || null,
      goods_delivery_id: invoice.goods_delivery_id || null,
      payment_term_id:  invoice.payment_term_id  || null,
      status:           invoice.status           || 'draft',
      notes:            invoice.notes            || null,
      advance_deduction_amount: Number(invoice.advance_deduction_amount) || 0,
      advance_deduction_coa_id: invoice.advance_deduction_coa_id || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}
```

`getSalesInvoice` sudah memakai `select('*, ...')` sehingga kolom baru otomatis ikut — tidak perlu diubah.

- [ ] **Step 2: Verifikasi build**

Run: `cd apps/erp-acc/erp-app && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(sales-invoice): pass advance deduction fields to save RPC"
```

---

## Task 5: Form — input UM, COA, validasi, sisa tagih

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`

- [ ] **Step 1: Tambah import `useCOA`, `InputNumber`, dan `rowTotals` sudah ada**

Di bagian import `SalesInvoiceFormPage.jsx`, ubah baris hook master data dan import AntD untuk menambahkan `InputNumber`:

```js
import { Space, Flex, Typography, Row, Col, Card, Switch, Divider, Select as AntdSelect, InputNumber } from 'antd'
```

dan ubah import master data:

```js
import { useProducts, useCustomers, useCOA } from '../../hooks/useMasterData'
```

- [ ] **Step 2: Tambah state UM + ambil COA**

Tepat setelah `const { customers } = useCustomers()` tambahkan:

```js
  const { coa } = useCOA()
```

Di objek `useState` untuk `header`, tambahkan dua field default (setelah `notes: ''`):

```js
    notes: '',
    advance_deduction_amount: 0,
    advance_deduction_coa_id: '',
```

Di blok `getSalesInvoice(...).then(inv => setHeader({...}))`, tambahkan dua field (setelah `notes: inv.notes || ''`):

```js
            notes: inv.notes || '',
            advance_deduction_amount: inv.advance_deduction_amount || 0,
            advance_deduction_coa_id: inv.advance_deduction_coa_id || '',
            amount_paid: inv.amount_paid,
            total: inv.total,
```

- [ ] **Step 3: Hitung total klien + sisa tagih yang benar**

Ganti baris `const remaining = (header.total || 0) - (header.amount_paid || 0)` menjadi blok berikut (sebelum `if (loading)`):

```js
  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const coaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))

  // Total dari item (server otoritatif, tapi perlu untuk validasi & tampilan draft)
  const clientTotal = items.reduce((sum, row) => {
    const prod = products.find(p => p.id === row.product_id)
    return sum + (rowTotals(row, prod).total || 0)
  }, 0)
  const invoiceTotal = header.total || clientTotal
  const advance = Number(header.advance_deduction_amount) || 0
  const remaining = invoiceTotal - advance - (header.amount_paid || 0)
```

- [ ] **Step 4: Validasi UM di `handleSave`**

Di dalam `handleSave`, setelah blok validasi item (`if (validItems.length === 0) {...}`) dan sebelum `if (makeRecurring && !recurStart)`, tambahkan:

```js
    if (advance < 0) { toast.error('Potongan uang muka tidak boleh negatif'); return }
    if (advance > clientTotal + 0.01) { toast.error('Potongan uang muka melebihi total invoice'); return }
    if (advance > 0 && !header.advance_deduction_coa_id) { toast.error('Pilih akun COA uang muka'); return }
```

- [ ] **Step 5: Tambah kartu input UM (hanya saat draft & boleh tulis)**

Tepat setelah blok `<Card size="small"> ... Syarat Pembayaran ... </Card>` (yang berisi `payment_term_id`), tambahkan kartu baru:

```jsx
      {!readOnly && (
        <Card size="small">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Potongan Uang Muka</div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={header.advance_deduction_amount || 0}
                onChange={v => setHeader(h => ({ ...h, advance_deduction_amount: v || 0 }))}
                formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={val => val.replace(/\./g, '')}
                placeholder="0"
              />
            </Col>
            {Number(header.advance_deduction_amount) > 0 && (
              <Col xs={24} md={10}>
                <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Akun COA Uang Muka *</div>
                <AntdSelect
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  placeholder="Pilih akun uang muka..."
                  value={header.advance_deduction_coa_id || undefined}
                  onChange={v => setHeader(h => ({ ...h, advance_deduction_coa_id: v || '' }))}
                  options={coaOptions}
                />
              </Col>
            )}
          </Row>
        </Card>
      )}
```

- [ ] **Step 6: Tampilkan UM & sisa tagih di ringkasan invoice posted**

Di kartu ringkasan pembayaran (`{!isNew && header.status !== 'draft' && (...)}`), ganti `<Row gutter={16}>` yang berisi 3 kolom menjadi versi yang menyertakan UM. Ganti seluruh isi `<Row gutter={16}>...</Row>` tersebut dengan:

```jsx
          <Row gutter={16}>
            <Col span={6}>
              <Typography.Text style={{ color: '#0958d9', display: 'block' }}>Total Invoice</Typography.Text>
              <Typography.Text strong style={{ color: '#003eb3', fontSize: 16 }}>{formatCurrency(header.total)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text style={{ color: '#0958d9', display: 'block' }}>Potongan Uang Muka</Typography.Text>
              <Typography.Text strong style={{ color: '#003eb3', fontSize: 16 }}>{formatCurrency(header.advance_deduction_amount || 0)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text type="success" style={{ display: 'block' }}>Dibayar</Typography.Text>
              <Typography.Text strong style={{ color: '#135200', fontSize: 16 }}>{formatCurrency(header.amount_paid)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text type="danger" style={{ display: 'block' }}>Sisa Tagih</Typography.Text>
              <Typography.Text strong type="danger" style={{ fontSize: 16 }}>{formatCurrency(remaining)}</Typography.Text>
            </Col>
          </Row>
```

- [ ] **Step 7: Verifikasi build**

Run: `cd apps/erp-acc/erp-app && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 8: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx
git commit -m "feat(sales-invoice): add advance deduction input, COA select, and net payable display"
```

---

## Task 6: AR Aging — kurangi UM dari saldo

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/reportService.js:39-46` (`getARAgingData`)
- Modify: `apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx:52`

- [ ] **Step 1: Sertakan kolom UM di query AR aging**

Di `reportService.js`, fungsi `getARAgingData`, tambahkan `advance_deduction_amount` ke daftar kolom select:

```js
    .select(`
      id, invoice_number, date, due_date, total, amount_paid, advance_deduction_amount, status,
      customer:customers(id, name)
    `)
```

(Query AP/`getAPAgingData` tidak diubah — UM hanya untuk sales/AR.)

- [ ] **Step 2: Kurangi UM saat menghitung saldo aging**

Di `ARAPAgingPage.jsx`, fungsi `buildRows`, ubah baris perhitungan `balance`:

```js
    const balance = Number(inv.total) - Number(inv.amount_paid) - Number(inv.advance_deduction_amount || 0)
```

- [ ] **Step 3: Verifikasi build**

Run: `cd apps/erp-acc/erp-app && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/reportService.js apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx
git commit -m "fix(ar-aging): subtract advance deduction from outstanding receivable"
```

---

## Task 7: PDF — baris "Uang Muka" + "Sisa Tagih"

**Files:**
- Modify: `apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js:252-258` (blok Total)

- [ ] **Step 1: Tambahkan baris potongan UM & sisa tagih setelah Total**

Di `invoiceRenderer.js`, setelah blok "Total row" (yang berakhir `y += 16`), dan sebelum komentar "Payment Info + Terms", sisipkan:

```js
  // Potongan Uang Muka + Sisa Tagih (jika ada potongan uang muka)
  const advanceDeduction = Number(invoice?.advance_deduction_amount) || 0
  if (advanceDeduction > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.totalLabel)
    doc.setTextColor(...COLOR.textSecondary)
    doc.text('Potongan Uang Muka', totalsLeftX, y)
    doc.setFontSize(FONT.totalValue)
    doc.setTextColor(...COLOR.textPrimary)
    doc.text(`${currency} (${formatCurrency(advanceDeduction)})`, rightX, y, { align: 'right' })
    y += 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT.totalLabel)
    doc.setTextColor(...COLOR.textPrimary)
    doc.text('Sisa Tagih', totalsLeftX, y)
    doc.text(`${currency} ${formatCurrency(total - advanceDeduction)}`, rightX, y, { align: 'right' })
    y += 16
  }
```

- [ ] **Step 2: Verifikasi build**

Run: `cd apps/erp-acc/erp-app && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js
git commit -m "feat(invoice-pdf): show advance deduction and net payable in totals"
```

---

## Task 8: Verifikasi end-to-end & ringkasan

**Files:** (tidak ada perubahan kode — verifikasi)

- [ ] **Step 1: Build penuh**

Run: `cd apps/erp-acc/erp-app && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 2: Smoke test manual (dokumentasikan langkah untuk user)**

Tulis langkah verifikasi manual untuk user (jangan apply migrasi ke produksi tanpa izin):
1. Apply migrasi 037 ke database via jalur yang biasa user pakai (Supabase MCP/SQL editor) — **minta persetujuan user dulu**.
2. Buat Sales Invoice baru, isi 1 item kena PPN, isi "Potongan Uang Muka" (mis. 30.000) dan pilih akun COA uang muka. Simpan.
3. Coba isi UM melebihi total → harus muncul error validasi.
4. Post invoice → cek di Jurnal: Piutang = total − UM, ada baris debit akun uang muka, jurnal seimbang.
5. Terima pembayaran sebesar sisa tagih → status invoice jadi `paid`.
6. Buka Laporan AR Aging → saldo invoice = total − UM − dibayar.
7. Cetak PDF invoice → muncul baris "Potongan Uang Muka" dan "Sisa Tagih".

- [ ] **Step 3: Commit (jika ada catatan/dokumentasi yang ditambahkan)**

```bash
git add -A
git commit -m "docs(sales-invoice): manual smoke test steps for advance deduction" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** Kolom skema (T1) ✓, validasi UM≤total (T1+T5) ✓, jurnal offset piutang (T2) ✓, status paid memperhitungkan UM (T3) ✓, akun COA dipilih user (T1+T5) ✓, lokasi invoice-only (semua task) ✓, AR aging benar (T6) ✓, PDF (T7) ✓.
- **Type consistency:** Nama kolom `advance_deduction_amount` & `advance_deduction_coa_id` konsisten di SQL, service, form, reportService, dan renderer. Helper `rowTotals(row, product)` dipakai sesuai signature di `utils/lineItemTotals.js`.
- **Konvensi:** `total` invoice tetap penuh di semua lapisan; hanya piutang yang dibukukan & tampilan "sisa tagih" yang dikurangi UM.
- **Guardrail:** Migrasi tidak di-apply ke produksi otomatis; verifikasi SQL di branch/transaksi.
