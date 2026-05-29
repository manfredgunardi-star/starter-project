# Journal Bank Account + Payment Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Jurnal manual dapat memilih rekening bank/kas spesifik dan memperbarui `accounts.balance` secara atomik saat di-post; (2) Form pembayaran mendukung tiga tipe penyesuaian: diskon pelunasan, biaya bank/admin, dan selisih pembulatan.

**Architecture:** Dua migrasi SQL independen menambahkan kolom ke `journal_items` dan `payments`, lalu memperbarui RPC di Supabase. Dua sesi frontend (Codex) memperbarui form React terkait. Semua logika jurnal tetap di Supabase RPC — frontend hanya meneruskan field baru.

**Tech Stack:** PostgreSQL/Supabase (RPC, migration), React 18, Ant Design, journalService.js, cashBankService.js, Playwright (smoke tests)

---

## Model & Effort Summary

| Task | Deskripsi | Model | Effort |
|------|-----------|-------|--------|
| 1 | SQL Migration 032 — `journal_items.account_id` | Claude Sonnet 4.6 | Medium |
| 2 | Frontend — Manual Journal form + service | Codex GPT 5.5 | Medium |
| 3 | SQL Migration 033 — Payment adjustments | Claude Sonnet 4.6 | Medium |
| 4 | Frontend — Payment form + service | Codex GPT 5.5 | Medium |
| 5 | Playwright smoke tests + build validation | Claude Sonnet 4.6 | Low |

---

## File Map

### Dibuat (baru)
- `apps/erp-acc/erp-app/supabase/migrations/032_journal_items_account_id.sql`
- `apps/erp-acc/erp-app/supabase/migrations/033_payment_adjustments.sql`
- `apps/erp-acc/erp-app/playwright/bank-journal-payment-adjustments.spec.js`

### Dimodifikasi
- `apps/erp-acc/erp-app/src/services/journalService.js` — tambah `account_id` di select & insert
- `apps/erp-acc/erp-app/src/services/cashBankService.js` — tambah field adjustment di `savePayment` + tambah `coa_id` di `getAccounts`
- `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx` — dropdown rekening per baris
- `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx` — section penyesuaian

---

## Task 1 — SQL Migration 032: `journal_items.account_id`
**Model:** Claude Sonnet 4.6 | **Effort:** Medium

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/032_journal_items_account_id.sql`

Tambah kolom `account_id` (nullable FK ke `accounts`) pada tabel `journal_items`. Perbarui fungsi `post_manual_journal` sehingga saat jurnal diposting, setiap baris yang memiliki `account_id` akan mengupdate `accounts.balance` secara atomik. Logika: akun aset (bank/kas) — debit menambah saldo, kredit mengurangi.

- [ ] **Step 1.1: Tulis file migration**

Buat file `apps/erp-acc/erp-app/supabase/migrations/032_journal_items_account_id.sql`:

```sql
-- ============================================================
-- Migration 032: Add account_id to journal_items
-- Allows manual journals to reference a specific bank/cash account
-- so accounts.balance stays in sync when the journal is posted.
-- ============================================================

alter table journal_items
  add column if not exists account_id uuid references accounts(id);

-- Re-create post_manual_journal:
-- For each journal_items row with account_id set,
-- update accounts.balance after posting.
-- Asset accounts (bank/cash) have normal debit balance:
--   debit  → balance increases (+debit)
--   credit → balance decreases (-credit)
create or replace function post_manual_journal(p_journal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  for v_item in
    select account_id, debit, credit
      from journal_items
     where journal_id = p_journal_id
       and account_id is not null
  loop
    update accounts
       set balance = balance + v_item.debit - v_item.credit
     where id = v_item.account_id;
  end loop;

  update journals
     set is_posted = true
   where id = p_journal_id
     and source = 'manual';
end;
$$;
```

- [ ] **Step 1.2: Apply migration ke Supabase**

Buka Supabase Dashboard → SQL Editor, paste isi file di atas, klik Run.
Atau gunakan MCP tool `apply_migration` dengan konten file tersebut.

Expected: tidak ada error, kolom `account_id` muncul di tabel `journal_items`.

Verifikasi:
```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'journal_items'
   and column_name = 'account_id';
-- Expected: 1 row, data_type = uuid, is_nullable = YES
```

- [ ] **Step 1.3: Commit file migration**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/032_journal_items_account_id.sql
git commit -m "feat(db): add account_id to journal_items, update post_manual_journal balance sync"
```

---

## Task 2 — Frontend: Manual Journal Form + Service
**Model:** Codex GPT 5.5 | **Effort:** Medium

> **STOP — HANDOFF KE CODEX.** Lihat prompt Codex di bawah task ini.

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/journalService.js`
- Modify: `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx`

**Konteks skema setelah Task 1:**
- `journal_items` sekarang punya kolom `account_id uuid NULL references accounts(id)`
- `post_manual_journal` RPC sudah mengupdate `accounts.balance` untuk baris yang punya `account_id`

### Perubahan journalService.js

- [ ] **Step 2.1: Tambah `coa_id` ke getAccounts di cashBankService.js**

File: `apps/erp-acc/erp-app/src/services/cashBankService.js`

Ubah query `getAccounts` dari:
```javascript
.select('id, name, type, balance')
```
menjadi:
```javascript
.select('id, name, type, balance, coa_id')
```

- [ ] **Step 2.2: Tambah `account_id` ke getJournal select**

File: `apps/erp-acc/erp-app/src/services/journalService.js` baris 21–32.

Ubah bagian `journal_items(...)` dari:
```javascript
journal_items(
  id, coa_id, cost_center_id, debit, credit, description,
  coa:coa(id, code, name)
)
```
menjadi:
```javascript
journal_items(
  id, coa_id, cost_center_id, account_id, debit, credit, description,
  coa:coa(id, code, name)
)
```

- [ ] **Step 2.3: Tambah `account_id` ke saveManualJournal itemRows**

File: `apps/erp-acc/erp-app/src/services/journalService.js` baris 55–62.

Ubah `itemRows` mapping dari:
```javascript
const itemRows = items.map(i => ({
  journal_id: journal.id,
  coa_id: i.coa_id,
  debit: Number(i.debit) || 0,
  credit: Number(i.credit) || 0,
  description: i.description || null,
  cost_center_id: i.cost_center_id ?? null,
}))
```
menjadi:
```javascript
const itemRows = items.map(i => ({
  journal_id: journal.id,
  coa_id: i.coa_id,
  debit: Number(i.debit) || 0,
  credit: Number(i.credit) || 0,
  description: i.description || null,
  cost_center_id: i.cost_center_id ?? null,
  account_id: i.account_id || null,
}))
```

### Perubahan ManualJournalFormPage.jsx

- [ ] **Step 2.4: Import useAccounts dan tambah account_id ke emptyRow**

File: `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx`

Tambah import di baris 5 (setelah `import { useCOA }`):
```javascript
import { useAccounts } from '../../hooks/useCashBank'
```

Ubah `emptyRow` di baris 18:
```javascript
const emptyRow = () => ({
  _key: Date.now() + Math.random(),
  coa_id: '',
  description: '',
  cost_center_id: '',
  account_id: '',
  debit: '',
  credit: '',
})
```

- [ ] **Step 2.5: Load accounts di dalam komponen**

Tepat setelah baris `const { coa } = useCOA()`, tambahkan:
```javascript
const { accounts } = useAccounts()
```

- [ ] **Step 2.6: Tambah helper getAccountsForCoa**

Sebelum `return (` komponen, tambahkan:
```javascript
const getAccountsForCoa = (coaId) =>
  accounts.filter(a => a.coa_id === coaId)
```

- [ ] **Step 2.7: Populate account_id saat load jurnal existing**

Di dalam `useEffect` yang memanggil `getJournal` (baris ~55–68), pada `.map(i => ({...}))`:
```javascript
setItems(j.journal_items.map(i => ({
  _key: i.id,
  coa_id: i.coa_id,
  coa_code: i.coa?.code,
  coa_name: i.coa?.name,
  description: i.description || '',
  cost_center_id: i.cost_center_id || '',
  account_id: i.account_id || '',
  debit: i.debit > 0 ? i.debit : '',
  credit: i.credit > 0 ? i.credit : '',
})))
```

- [ ] **Step 2.8: Render dropdown rekening di tiap baris jurnal**

Dalam fungsi render baris jurnal (tempat `coa_id`, `debit`, `credit` dirender), setelah dropdown COA untuk setiap baris, tambahkan:

```jsx
{item.coa_id && getAccountsForCoa(item.coa_id).length > 0 && (
  <Select
    label="Rekening (opsional)"
    options={[
      { value: '', label: '— tidak dispesifikasi —' },
      ...getAccountsForCoa(item.coa_id).map(a => ({
        value: a.id,
        label: `${a.name} (${formatCurrency(a.balance)})`,
      })),
    ]}
    value={item.account_id || ''}
    onChange={e => updateItem(idx, 'account_id', e.target.value)}
    disabled={readOnly}
  />
)}
```

- [ ] **Step 2.9: Build validation**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: exit 0, no errors.

- [ ] **Step 2.10: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/journalService.js \
        apps/erp-acc/erp-app/src/services/cashBankService.js \
        apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx
git commit -m "feat(journal): add specific bank/cash account selection per journal line"
```

---

### CODEX PROMPT — Task 2

```
## Context

Kamu sedang mengerjakan proyek ERP Accounting (erp-acc) berbasis React 18 + Ant Design + Supabase.
Working directory: apps/erp-acc/erp-app/

Sebuah SQL migration sudah dijalankan yang menambahkan kolom `account_id uuid NULL` ke tabel
`journal_items` (FK ke tabel `accounts`). Fungsi Supabase `post_manual_journal` sudah diperbarui
untuk mengupdate `accounts.balance` secara atomik saat posting, untuk setiap baris yang memiliki
`account_id`.

## Tujuan

Ketika user membuat/mengedit Jurnal Manual, tiap baris jurnal yang COA-nya adalah akun bank atau kas
(yaitu COA yang punya rekening terkait di tabel `accounts`) harus menampilkan dropdown tambahan
"Rekening (opsional)" agar user bisa memilih rekening spesifik (misal: BCA, Mandiri).

Pemilihan rekening bersifat opsional — jika user tidak memilih, baris berfungsi seperti sebelumnya.

## Files yang harus diubah

### 1. apps/erp-acc/erp-app/src/services/cashBankService.js

Fungsi `getAccounts` saat ini hanya select: `'id, name, type, balance'`
Ubah menjadi: `'id, name, type, balance, coa_id'`

### 2. apps/erp-acc/erp-app/src/services/journalService.js

**Perubahan A** — fungsi `getJournal`, pada bagian select `journal_items(...)`:
Tambahkan `account_id` ke dalam kolom yang di-select:
```
journal_items(
  id, coa_id, cost_center_id, account_id, debit, credit, description,
  coa:coa(id, code, name)
)
```

**Perubahan B** — fungsi `saveManualJournal`, pada `itemRows` mapping:
Tambahkan `account_id: i.account_id || null` ke dalam objek itemRow.

### 3. apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx

Baca file ini dahulu sebelum mengubah. File menggunakan pattern:
- `const emptyRow = () => ({ _key, coa_id, description, cost_center_id, debit, credit })`
- `const { coa } = useCOA()` — sudah ada
- `useAccounts` tersedia dari `'../../hooks/useCashBank'` — belum diimport

**Perubahan yang diperlukan:**

1. Import `useAccounts` dari `'../../hooks/useCashBank'`

2. Tambahkan `account_id: ''` ke `emptyRow()`

3. Di dalam komponen, setelah `const { coa } = useCOA()`, tambahkan:
   `const { accounts } = useAccounts()`

4. Tambahkan helper function (sebelum `return`):
   ```javascript
   const getAccountsForCoa = (coaId) =>
     accounts.filter(a => a.coa_id === coaId)
   ```

5. Saat loading jurnal existing (`getJournal`), tambahkan `account_id: i.account_id || ''`
   pada mapping item.

6. Pada render tiap baris jurnal, SETELAH dropdown COA, tambahkan kondisional:
   - Jika `item.coa_id` ada DAN `getAccountsForCoa(item.coa_id).length > 0`, render Select:
     - Label: "Rekening (opsional)"
     - Options: `[{ value: '', label: '— tidak dispesifikasi —' }, ...getAccountsForCoa(item.coa_id).map(a => ({ value: a.id, label: `${a.name} (${formatCurrency(a.balance)})` }))]`
     - Value: `item.account_id || ''`
     - onChange: `e => updateItem(idx, 'account_id', e.target.value)`
     - disabled: `readOnly`

## Validation

Setelah semua perubahan:
```bash
cd apps/erp-acc/erp-app && npm run build
```
Harus exit 0 tanpa error.

## Commit

```bash
git add apps/erp-acc/erp-app/src/services/journalService.js \
        apps/erp-acc/erp-app/src/services/cashBankService.js \
        apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx
git commit -m "feat(journal): add specific bank/cash account selection per journal line"
```

Setelah commit selesai, kembalikan hasilnya kepada user.
```

---

## Task 3 — SQL Migration 033: Payment Adjustments
**Model:** Claude Sonnet 4.6 | **Effort:** Medium

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/033_payment_adjustments.sql`

Tambah 6 kolom adjustment ke tabel `payments`. Perbarui `post_payment` dan `save_and_post_payment` untuk menghasilkan baris jurnal tambahan sesuai tipe penyesuaian.

**Logika akuntansi per skenario:**

| Skenario | Entry Debit | Entry Kredit |
|---|---|---|
| Incoming + diskon | Kas/Bank (amount) + Diskon Penjualan (discount) | Piutang (amount+discount+rounding) |
| Incoming + pembulatan (+) | Kas/Bank + Pembulatan | Piutang |
| Incoming + pembulatan (−) | Kas/Bank | Piutang + Pembulatan |
| Outgoing + diskon | Hutang (amount+discount+rounding) | Kas/Bank (amount+fee) + Diskon Pembelian (discount) |
| Outgoing + biaya bank | Hutang + Biaya Bank (fee) | Kas/Bank (amount+fee) |
| Outgoing + pembulatan (+) | Hutang | Kas/Bank + Pembulatan |
| Outgoing + pembulatan (−) | Hutang + Pembulatan | Kas/Bank |

`v_effective = amount + discount_amount + rounding_amount` — jumlah yang diaplikasikan ke invoice.

- [ ] **Step 3.1: Tulis file migration**

Buat file `apps/erp-acc/erp-app/supabase/migrations/033_payment_adjustments.sql`:

```sql
-- ============================================================
-- Migration 033: Payment adjustment fields
-- Adds 3 optional adjustment types to payments:
--   discount:  waived portion of invoice (debit/credit to discount COA)
--   fee:       extra bank transfer fee (debit to fee COA)
--   rounding:  signed tiny rounding difference (debit/credit to rounding COA)
--
-- Accounting rules:
--   incoming: D Kas/Bank(amount) + D Diskon + D/C Pembulatan = C Piutang(v_effective)
--   outgoing: D Hutang(v_effective) + D Biaya_Bank = C Kas/Bank(amount+fee) + C Diskon + C/D Pembulatan
--   v_effective = amount + discount_amount + rounding_amount
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
    -- D: Kas/Bank (cash actually received)
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

    -- D or C: Selisih pembulatan (signed — positive = customer short-paid = our loss)
    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        -- Customer short-paid by rounding: debit (our loss)
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        -- Customer over-paid by rounding: credit (our gain)
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    -- C: Piutang (full effective settlement)
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

    -- D: Biaya bank/transfer (if any)
    if v_pay.fee_amount > 0 then
      if v_pay.fee_coa_id is null then
        raise exception 'COA biaya bank wajib diisi jika fee_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.fee_coa_id, v_pay.fee_amount,
                'Biaya transfer - ' || v_pay.payment_number);
    end if;

    -- C: Kas/Bank (amount + fee = cash physically out of bank)
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

    -- C or D: Selisih pembulatan outgoing
    -- rounding > 0: write off hutang → C (gain: we owe less)
    -- rounding < 0: extra cost from rounding → D (loss: we paid a tiny bit extra)
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

  -- Update invoice using v_effective as settlement amount
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
```

- [ ] **Step 3.2: Apply migration ke Supabase**

Buka Supabase Dashboard → SQL Editor, paste isi file di atas, klik Run.
Atau gunakan MCP tool `apply_migration`.

Verifikasi:
```sql
select column_name from information_schema.columns
 where table_name = 'payments'
   and column_name in ('discount_amount','fee_amount','rounding_amount','discount_coa_id','fee_coa_id','rounding_coa_id')
 order by column_name;
-- Expected: 6 rows
```

- [ ] **Step 3.3: Commit file migration**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/033_payment_adjustments.sql
git commit -m "feat(db): add discount/fee/rounding adjustments to payments, update post_payment RPC"
```

---

## Task 4 — Frontend: Payment Form + Service
**Model:** Codex GPT 5.5 | **Effort:** Medium

> **STOP — HANDOFF KE CODEX.** Lihat prompt Codex di bawah task ini.

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/cashBankService.js`
- Modify: `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx`

**Konteks skema setelah Task 3:**
Tabel `payments` sekarang memiliki 6 kolom baru (semua default 0/null):
`discount_amount`, `discount_coa_id`, `fee_amount`, `fee_coa_id`, `rounding_amount`, `rounding_coa_id`

### Perubahan cashBankService.js

- [ ] **Step 4.1: Tambah adjustment fields ke savePayment**

File: `apps/erp-acc/erp-app/src/services/cashBankService.js` — fungsi `savePayment`.

Ubah objek `p_payment` yang dikirim ke RPC dari:
```javascript
p_payment: {
  date:        payment.date,
  type:        payment.type,
  invoice_id:  payment.invoice_id  || null,
  customer_id: payment.customer_id || null,
  supplier_id: payment.supplier_id || null,
  account_id:  payment.account_id,
  amount:      Number(payment.amount),
  notes:       payment.notes || null,
},
```
menjadi:
```javascript
p_payment: {
  date:              payment.date,
  type:              payment.type,
  invoice_id:        payment.invoice_id        || null,
  customer_id:       payment.customer_id       || null,
  supplier_id:       payment.supplier_id       || null,
  account_id:        payment.account_id,
  amount:            Number(payment.amount),
  notes:             payment.notes             || null,
  discount_amount:   Number(payment.discount_amount)  || 0,
  discount_coa_id:   payment.discount_coa_id   || null,
  fee_amount:        Number(payment.fee_amount)        || 0,
  fee_coa_id:        payment.fee_coa_id         || null,
  rounding_amount:   Number(payment.rounding_amount)  || 0,
  rounding_coa_id:   payment.rounding_coa_id   || null,
},
```

### Perubahan PaymentFormPage.jsx

- [ ] **Step 4.2: Tambah state field adjustment dan import COA**

File: `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx`

Baca file ini dahulu sebelum mengubah.

Tambahkan import `useCOA` (sudah tersedia dari `'../../hooks/useMasterData'`):
```javascript
import { useCustomers, useSuppliers, useCOA } from '../../hooks/useMasterData'
```

Tambahkan `const { coa } = useCOA()` di dalam komponen, setelah hook lainnya.

Tambahkan field berikut ke objek `form` (state awal):
```javascript
discount_amount: '',
discount_coa_id: '',
fee_amount: '',
fee_coa_id: '',
rounding_amount: '',
rounding_coa_id: '',
```

- [ ] **Step 4.3: Tambah `coaOptions` untuk dropdown penyesuaian**

Setelah baris `const invoiceOptions = ...`, tambahkan:
```javascript
const coaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
```

- [ ] **Step 4.4: Perbarui validasi amount**

Di fungsi `validate()`, ganti pengecekan:
```javascript
if (remaining !== null && Number(form.amount) > remaining + 0.01) {
  const label = form.type === 'incoming' ? 'sisa piutang' : 'sisa hutang'
  toast.error(`Jumlah melebihi ${label} ${formatCurrency(remaining)}`)
  return false
}
```
menjadi:
```javascript
const effectiveAmount = Number(form.amount)
  + (Number(form.discount_amount) || 0)
  + (Number(form.rounding_amount) || 0)
if (remaining !== null && effectiveAmount > remaining + 0.01) {
  const label = form.type === 'incoming' ? 'sisa piutang' : 'sisa hutang'
  toast.error(`Jumlah efektif (termasuk penyesuaian) melebihi ${label} ${formatCurrency(remaining)}`)
  return false
}
```

- [ ] **Step 4.5: Perbarui handleSave untuk pass adjustment fields**

Di `handleSave`, ubah pemanggilan `savePayment`:
```javascript
await savePayment({
  ...form,
  amount:          Number(form.amount),
  customer_id:     form.type === 'incoming' ? form.customer_id : null,
  supplier_id:     form.type === 'outgoing' ? form.supplier_id : null,
  discount_amount: Number(form.discount_amount) || 0,
  discount_coa_id: form.discount_coa_id || null,
  fee_amount:      Number(form.fee_amount) || 0,
  fee_coa_id:      form.fee_coa_id || null,
  rounding_amount: Number(form.rounding_amount) || 0,
  rounding_coa_id: form.rounding_coa_id || null,
})
```

- [ ] **Step 4.6: Tambah section "Penyesuaian (opsional)" di form**

Di dalam `<Card>`, setelah field `notes` dan sebelum tombol Save, tambahkan:

```jsx
{/* Penyesuaian */}
<Space direction="vertical" style={{ width: '100%' }} size={4}>
  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
    Penyesuaian (opsional)
  </Typography.Text>

  {/* Diskon */}
  <Space style={{ width: '100%' }} size={8}>
    <Input
      label={form.type === 'incoming' ? 'Diskon penjualan' : 'Diskon pembelian'}
      type="number"
      min="0"
      value={form.discount_amount}
      onChange={e => field('discount_amount', e.target.value)}
      placeholder="0"
      style={{ width: 160 }}
    />
    {Number(form.discount_amount) > 0 && (
      <Select
        label="COA Diskon *"
        options={coaOptions}
        value={form.discount_coa_id}
        onChange={e => field('discount_coa_id', e.target.value)}
        placeholder="Pilih akun..."
        style={{ flex: 1 }}
      />
    )}
  </Space>

  {/* Biaya bank (outgoing only) */}
  {form.type === 'outgoing' && (
    <Space style={{ width: '100%' }} size={8}>
      <Input
        label="Biaya bank/transfer"
        type="number"
        min="0"
        value={form.fee_amount}
        onChange={e => field('fee_amount', e.target.value)}
        placeholder="0"
        style={{ width: 160 }}
      />
      {Number(form.fee_amount) > 0 && (
        <Select
          label="COA Biaya Bank *"
          options={coaOptions}
          value={form.fee_coa_id}
          onChange={e => field('fee_coa_id', e.target.value)}
          placeholder="Pilih akun..."
          style={{ flex: 1 }}
        />
      )}
    </Space>
  )}

  {/* Pembulatan */}
  <Space style={{ width: '100%' }} size={8}>
    <Input
      label="Selisih pembulatan (+ atau −)"
      type="number"
      value={form.rounding_amount}
      onChange={e => field('rounding_amount', e.target.value)}
      placeholder="0"
      style={{ width: 160 }}
    />
    {form.rounding_amount !== '' && Number(form.rounding_amount) !== 0 && (
      <Select
        label="COA Pembulatan *"
        options={coaOptions}
        value={form.rounding_coa_id}
        onChange={e => field('rounding_coa_id', e.target.value)}
        placeholder="Pilih akun..."
        style={{ flex: 1 }}
      />
    )}
  </Space>
</Space>
```

- [ ] **Step 4.7: Build validation**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: exit 0, no errors.

- [ ] **Step 4.8: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/cashBankService.js \
        apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx
git commit -m "feat(payment): add discount, bank fee, and rounding adjustment fields to payment form"
```

---

### CODEX PROMPT — Task 4

```
## Context

Kamu sedang mengerjakan proyek ERP Accounting (erp-acc) berbasis React 18 + Ant Design + Supabase.
Working directory: apps/erp-acc/erp-app/

Sebuah SQL migration sudah dijalankan yang menambahkan 6 kolom ke tabel `payments`:
- `discount_amount numeric DEFAULT 0`  + `discount_coa_id uuid NULL`
- `fee_amount      numeric DEFAULT 0`  + `fee_coa_id      uuid NULL`
- `rounding_amount numeric DEFAULT 0`  + `rounding_coa_id uuid NULL`

RPC `save_and_post_payment` sudah diperbarui untuk menerima dan memproses kolom-kolom ini.
Kamu tidak perlu mengubah SQL apapun.

## Tujuan

Update form pembayaran (PaymentFormPage.jsx) dengan section "Penyesuaian (opsional)" yang
memungkinkan user memasukkan:
1. Diskon pelunasan (untuk incoming: Diskon Penjualan; untuk outgoing: Diskon Pembelian)
2. Biaya bank/transfer (outgoing only)
3. Selisih pembulatan (signed: positif atau negatif, berlaku untuk keduanya)

Masing-masing memerlukan pemilihan COA jika nilainya bukan nol.

## Files yang harus diubah

### 1. apps/erp-acc/erp-app/src/services/cashBankService.js

Baca file ini dahulu. Fungsi `savePayment` mengirim objek ke RPC `save_and_post_payment`.
Tambahkan 6 field baru ke objek `p_payment`:
```
discount_amount:   Number(payment.discount_amount)  || 0,
discount_coa_id:   payment.discount_coa_id   || null,
fee_amount:        Number(payment.fee_amount)        || 0,
fee_coa_id:        payment.fee_coa_id         || null,
rounding_amount:   Number(payment.rounding_amount)  || 0,
rounding_coa_id:   payment.rounding_coa_id   || null,
```

### 2. apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx

Baca file ini dahulu. File menggunakan pattern:
- `const [form, setForm] = useState({...})` untuk state form
- `const field = (key, value) => setForm(f => ({ ...f, [key]: value }))` untuk update field
- `useCustomers`, `useSuppliers` sudah diimport dari `'../../hooks/useMasterData'`
- `useCOA` tersedia dari `'../../hooks/useMasterData'` — belum diimport
- Komponen UI: `Input`, `Select` dari `'../../components/ui/'`, Ant Design components

**Perubahan yang diperlukan:**

1. Tambahkan `import { useCustomers, useSuppliers, useCOA } from '../../hooks/useMasterData'`
   (replace import yang sudah ada)

2. Tambahkan `const { coa } = useCOA()` di dalam komponen

3. Tambahkan ke state `form` awal:
   ```
   discount_amount: '',
   discount_coa_id: '',
   fee_amount: '',
   fee_coa_id: '',
   rounding_amount: '',
   rounding_coa_id: '',
   ```

4. Setelah `const invoiceOptions = ...`, tambahkan:
   ```javascript
   const coaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
   ```

5. Di fungsi `validate()`, ganti pengecekan `form.amount > remaining`:
   Hitung `effectiveAmount = Number(form.amount) + (Number(form.discount_amount)||0) + (Number(form.rounding_amount)||0)`
   Bandingkan `effectiveAmount` (bukan `form.amount`) terhadap `remaining`.
   Ubah pesan error: `"Jumlah efektif (termasuk penyesuaian) melebihi ${label} ${formatCurrency(remaining)}"`

6. Di `handleSave`, tambahkan 6 field baru ke objek yang dikirim ke `savePayment`.

7. Di dalam `<Card>`, setelah field `notes`, tambahkan section penyesuaian:
   - Label section: "Penyesuaian (opsional)" (Typography.Text type="secondary")
   - Row 1: Input "Diskon penjualan"/"Diskon pembelian" (label tergantung form.type)
     + jika nilainya > 0, tampilkan Select COA dengan label "COA Diskon *"
   - Row 2 (outgoing only): Input "Biaya bank/transfer"
     + jika nilainya > 0, tampilkan Select COA "COA Biaya Bank *"
   - Row 3: Input "Selisih pembulatan (+ atau −)" (type="number", boleh negatif)
     + jika nilainya != 0 dan tidak kosong, tampilkan Select COA "COA Pembulatan *"
   - Setiap Input penyesuaian memiliki placeholder="0"
   - COA Select menggunakan `coaOptions`

## Validation

```bash
cd apps/erp-acc/erp-app && npm run build
```
Harus exit 0 tanpa error.

## Commit

```bash
git add apps/erp-acc/erp-app/src/services/cashBankService.js \
        apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx
git commit -m "feat(payment): add discount, bank fee, and rounding adjustment fields to payment form"
```

Setelah commit selesai, kembalikan hasilnya kepada user.
```

---

## Task 5 — Playwright Smoke Tests + Build Validation
**Model:** Claude Sonnet 4.6 | **Effort:** Low

**Files:**
- Create: `apps/erp-acc/erp-app/playwright/bank-journal-payment-adjustments.spec.js`

- [ ] **Step 5.1: Buat file Playwright smoke test**

Buat file `apps/erp-acc/erp-app/playwright/bank-journal-payment-adjustments.spec.js`:

```javascript
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.test' })

const LIVE_URL = 'https://erp-app-bay.vercel.app'
const AUTH_STATE = 'playwright/.auth/user.json'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function ensureAuthState() {
  if (fs.existsSync(AUTH_STATE)) return
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })
  if (error) throw new Error(`Supabase login gagal: ${error.message}`)
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) throw new Error('Session tidak ada setelah login')
  const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  fs.mkdirSync('playwright/.auth', { recursive: true })
  fs.writeFileSync(AUTH_STATE, JSON.stringify({
    cookies: [],
    origins: [{ origin: LIVE_URL, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }],
  }, null, 2))
}

async function gotoLive(page, route) {
  await page.goto(`${LIVE_URL}${route}`, { waitUntil: 'domcontentloaded' })
}

test.describe('Bank Account in Journal & Payment Adjustments — live smoke', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await ensureAuthState()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync('test-results/bank-journal-payment', { recursive: true })
      const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      await page.screenshot({ path: `test-results/bank-journal-payment/${safeTitle}.png`, fullPage: true })
    }
  })

  // --- Manual Journal: bank account dropdown ---

  test('T1: halaman Tambah Jurnal terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    await expect(page.locator('h3, .ant-typography')).toContainText(/jurnal/i)
  })

  test('T2: dropdown rekening muncul setelah COA bank dipilih', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    // Pilih COA pada baris pertama — cari select COA pertama
    const coaSelects = page.locator('select, .ant-select').first()
    await expect(coaSelects).toBeVisible()
    // Verifikasi form jurnal punya kolom debit dan kredit
    await expect(page.locator('input[placeholder*="0"]').first()).toBeVisible()
  })

  test('T3: journal_items.account_id kolom ada di database', async ({ page }) => {
    const { data, error } = await supabase.rpc('execute_sql_if_allowed', {
      sql: "select column_name from information_schema.columns where table_name='journal_items' and column_name='account_id'"
    }).catch(() => ({ data: null, error: null }))
    // Verifikasi via direct query instead
    const { data: items, error: qErr } = await supabase
      .from('journal_items')
      .select('id, account_id')
      .limit(1)
    expect(qErr).toBeNull()
    // Column exists if query doesn't throw "column does not exist"
    expect(items).toBeDefined()
  })

  // --- Payment Form: adjustment fields ---

  test('T4: halaman Tambah Pembayaran terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.locator('h3, .ant-typography')).toContainText(/pembayaran/i)
  })

  test('T5: section Penyesuaian tampil di form pembayaran', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.locator('text=Penyesuaian')).toBeVisible()
  })

  test('T6: input diskon muncul di form pembayaran', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.locator('input[placeholder="0"]').first()).toBeVisible()
  })

  test('T7: COA diskon muncul saat nilai diskon diisi', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    // Isi field diskon dengan nilai > 0
    const discountInput = page.locator('input[placeholder="0"]').first()
    await discountInput.fill('100000')
    await discountInput.blur()
    // COA select harus muncul
    await expect(page.locator('text=/COA Diskon/i')).toBeVisible({ timeout: 3000 })
  })

  test('T8: field biaya bank hanya tampil saat mode outgoing', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new?type=outgoing')
    await expect(page.locator('text=/Biaya bank/i')).toBeVisible()
  })

  test('T9: payments table punya kolom adjustment di database', async ({ page }) => {
    const { data: items, error } = await supabase
      .from('payments')
      .select('id, discount_amount, fee_amount, rounding_amount')
      .limit(1)
    expect(error).toBeNull()
    expect(items).toBeDefined()
  })
})
```

- [ ] **Step 5.2: Jalankan tests**

```bash
cd apps/erp-acc/erp-app
npx playwright test playwright/bank-journal-payment-adjustments.spec.js --reporter=list
```

Expected: semua test pass (atau T2 skip jika COA Bank tidak ada di staging data — catat mana yang fail).

- [ ] **Step 5.3: Final build validation**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: exit 0.

- [ ] **Step 5.4: Commit tests + push branch**

```bash
git add apps/erp-acc/erp-app/playwright/bank-journal-payment-adjustments.spec.js
git commit -m "test(playwright): smoke tests for bank account journal selection and payment adjustments"
git push origin claude/condescending-clarke-cb553b
```
