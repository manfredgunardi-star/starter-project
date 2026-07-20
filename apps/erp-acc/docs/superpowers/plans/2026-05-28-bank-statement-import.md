# Bank Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User dapat mengupload rekening koran (CSV/XLSX) dari bank, memetakan kolom, dan melihat baris mana yang sudah otomatis dicocokkan dengan pembayaran yang ada di sistem.

**Architecture:** Parsing file dilakukan client-side menggunakan library `xlsx` (sudah terinstall). Pencocokan (matching) dilakukan server-side via PostgreSQL RPC untuk konsistensi data. Setiap import tersimpan sebagai `bank_import_sessions` + `bank_import_rows` sehingga ada histori. User mereview hasil match dan mengkonfirmasi atau membatalkan.

**Tech Stack:** React 18 + Ant Design, Supabase PostgreSQL (SECURITY DEFINER RPCs), library `xlsx` (sudah ada di package.json).

**Executor Notes:**
- Working dir: `C:\Project\apps\erp-acc\erp-app\`
- No test framework di project ini — skip TDD steps, langsung implement + `npm run build` untuk validasi
- Ikuti pola RPC dari `cashBankService.js` (SECURITY DEFINER, `is_admin_or_staff()`)
- Ikuti pola UI dari `ProductsBulkImportPage.jsx` (upload, parse, preview table)
- Ikuti pola Ant Design dari `ReconciliationPage.jsx` (Space, Card, Typography, Row/Col)
- Kolom invoice table di DB: `id`, `invoice_number`, `date`, `due_date`, `type`, `subtotal`, `tax_amount`, `total`, `amount_paid`, `status`

---

## Model Assignment

| Task | Model | Alasan |
|------|-------|--------|
| T1: SQL Migration 029 | **Claude** | Complex SQL: tables + RLS + 4 SECURITY DEFINER RPCs |
| T2: bankImportService.js | **Claude** | File parsing business logic + string-to-date handling |
| T3: BankStatementImportPage.jsx | **Codex** | CRUD UI — upload + column mapper |
| T4: BankImportPreviewPage.jsx | **Codex** | Display UI — match color coding + confirm/cancel |
| T5: App.jsx routes + Sidebar.jsx | **Codex** | Boilerplate routing + nav additions |

---

## File Structure

```
erp-app/
├── supabase/migrations/
│   └── 029_bank_statement_import.sql   [CREATE — Task 1]
├── src/
│   ├── services/
│   │   └── bankImportService.js         [CREATE — Task 2]
│   ├── pages/cash/
│   │   ├── BankStatementImportPage.jsx  [CREATE — Task 3]
│   │   └── BankImportPreviewPage.jsx    [CREATE — Task 4]
│   ├── App.jsx                          [MODIFY — Task 5, lines ~80-95 (lazy imports + routes)]
│   └── components/layout/Sidebar.jsx   [MODIFY — Task 5, lines ~76-81 (Kas & Bank items)]
```

---

## Task 1 (Claude): SQL Migration 029 — Tables + RLS + RPCs

**Files:**
- Create: `supabase/migrations/029_bank_statement_import.sql`

- [ ] **Step 1: Buat file migration**

```sql
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

-- Internal helper: run fuzzy matching for all 'unmatched' rows in a session.
-- Matches by: exact amount + type direction + date within ±3 days.
-- Confidence: 1.00 (same day), 0.95 (±1 day), 0.92 (±2 days), 0.90 (±3 days)
-- match_status = 'matched' if conf >= 0.90, 'uncertain' below that.
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

-- Public: atomically create session + rows, then run matching. Returns session UUID.
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

-- Public: confirm a pending import session.
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

-- Public: cancel a pending import session.
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
```

- [ ] **Step 2: Apply migration ke Supabase**

Buka Supabase Dashboard → SQL Editor → paste isi file di atas → Run.
Atau via CLI: `supabase db push` (jika CLI sudah dikonfigurasi).

Verifikasi: di Table Editor, pastikan tabel `bank_import_sessions` dan `bank_import_rows` muncul.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_bank_statement_import.sql
git commit -m "feat(erp-acc): add bank_import_sessions and bank_import_rows tables with matching RPCs (migration 029)"
```

---

## Task 2 (Claude): bankImportService.js

**Files:**
- Create: `src/services/bankImportService.js`

- [ ] **Step 1: Buat service file**

```javascript
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

/**
 * Parse an uploaded File (CSV or XLSX) and return raw rows as array of arrays.
 * Each inner array is one row; element 0 = first column, etc.
 */
export function parseStatementFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error('Gagal membaca file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Map raw rows (array of arrays) to import rows using column indices.
 *
 * colMap shape:
 *   { dateCol: number, descCol: number | null, amountCol: number }
 *   OR
 *   { dateCol: number, descCol: number | null, debitCol: number, creditCol: number }
 *
 * skipRows: berapa baris awal yang dilewati (untuk skip header)
 *
 * Returns: array of { row_number, statement_date (YYYY-MM-DD), description, amount }
 * Baris dengan tanggal invalid atau amount=0 dibuang.
 */
export function mapStatementRows(rawRows, colMap, skipRows) {
  const { dateCol, descCol, amountCol, debitCol, creditCol } = colMap
  const dataRows = rawRows.slice(skipRows)

  return dataRows
    .map((row, i) => {
      const dateRaw = row[dateCol]
      const desc = descCol != null ? String(row[descCol] ?? '').trim() : null

      // Parse date: support Date object (from XLSX), 'DD/MM/YYYY', 'YYYY-MM-DD'
      let parsedDate = null
      if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
        parsedDate = dateRaw.toISOString().slice(0, 10)
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        const s = dateRaw.trim()
        const parts = s.split(/[-/.]/)
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD or YYYY/MM/DD
            parsedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          } else {
            // DD/MM/YYYY or DD-MM-YYYY
            parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          }
        }
      }
      if (!parsedDate) return null

      // Parse amount: positive = masuk (incoming), negative = keluar (outgoing)
      let amount = 0
      if (amountCol != null) {
        amount = Number(String(row[amountCol] ?? '0').replace(/[^0-9.-]/g, '')) || 0
      } else {
        const debit  = Number(String(row[debitCol]  ?? '0').replace(/[^0-9.]/g, '')) || 0
        const credit = Number(String(row[creditCol] ?? '0').replace(/[^0-9.]/g, '')) || 0
        amount = credit - debit  // credit = masuk (+), debit = keluar (-)
      }
      if (amount === 0) return null

      return {
        row_number:     skipRows + i + 1,
        statement_date: parsedDate,
        description:    desc || null,
        amount,
      }
    })
    .filter(Boolean)
}

/**
 * Create an import session + rows + run server-side matching.
 * Returns the new session UUID.
 */
export async function createImportSession(accountId, fileName, importDate, rows) {
  const { data, error } = await supabase.rpc('create_bank_import_session', {
    p_account_id:  accountId,
    p_file_name:   fileName,
    p_import_date: importDate,
    p_rows:        rows,  // Supabase JS serializes arrays to JSONB automatically
  })
  if (error) throw error
  return data  // UUID string
}

/**
 * Fetch all import sessions, optionally filtered by account.
 */
export async function getImportSessions(accountId = null) {
  let q = supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .order('created_at', { ascending: false })
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) throw error
  return data
}

/**
 * Fetch a single session by ID.
 */
export async function getImportSession(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch all rows for a session, with matched payment info.
 */
export async function getImportRows(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_rows')
    .select('*, payment:payments(payment_number, date, amount, type, notes)')
    .eq('session_id', sessionId)
    .order('row_number')
  if (error) throw error
  return data
}

/**
 * Mark a single row as 'skipped'.
 */
export async function skipImportRow(rowId) {
  const { error } = await supabase
    .from('bank_import_rows')
    .update({ match_status: 'skipped' })
    .eq('id', rowId)
  if (error) throw error
}

/** Confirm a pending import session (mark as 'confirmed'). */
export async function confirmImport(sessionId) {
  const { error } = await supabase.rpc('confirm_bank_import', { p_session_id: sessionId })
  if (error) throw error
}

/** Cancel a pending import session (mark as 'cancelled'). */
export async function cancelImport(sessionId) {
  const { error } = await supabase.rpc('cancel_bank_import', { p_session_id: sessionId })
  if (error) throw error
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: build sukses, tidak ada import error dari `bankImportService.js`.

- [ ] **Step 3: Commit**

```bash
git add src/services/bankImportService.js
git commit -m "feat(erp-acc): add bankImportService with file parsing and Supabase RPC calls"
```

---

## Task 3 (Codex): BankStatementImportPage.jsx

**Files:**
- Create: `src/pages/cash/BankStatementImportPage.jsx`

**Deskripsi:** Halaman 3-langkah: (1) pilih akun + upload file, (2) konfigurasi column mapping, (3) submit. Setelah submit sukses redirect ke `/cash/import/:sessionId`.

**Pattern reference:**
- Upload + parse: `src/pages/master/ProductsBulkImportPage.jsx` (gunakan `XLSX`, `FileReader`)
- Layout: `src/pages/cash/ReconciliationPage.jsx` (Space, Card, Row/Col, AntD Typography)
- Navigate: `useNavigate` dari react-router-dom
- Services: import dari `../../services/bankImportService`
- Accounts data: `useAccounts` dari `../../hooks/useCashBank` (returns `{ accounts, loading }`)
- Format currency: `formatCurrency` dari `../../utils/currency`
- Toast: `useToast` dari `../../components/ui/ToastContext`

**Logika column mapping:**
- File di-parse dengan `parseStatementFile(file)` → `rawRows` (array of arrays)
- Header row = `rawRows[skipRows]` (default skipRows = 1, karena baris 0 biasanya header)
- User memilih: dateCol (required), descCol (optional), mode amount (`single` atau `split`)
  - `single`: satu kolom amount, positif = masuk, negatif = keluar
  - `split`: debitCol (keluar) + creditCol (masuk)
- Preview: tampilkan `rawRows.slice(skipRows, skipRows + 5)` sebagai tabel

**Minimum implementation:**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ArrowLeft } from 'lucide-react'
import {
  Space, Card, Typography, Button, Select, InputNumber, Radio,
  Upload, Table, Alert, Row, Col, Flex
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useAccounts } from '../../hooks/useCashBank'
import { useToast } from '../../components/ui/ToastContext'
import {
  parseStatementFile, mapStatementRows, createImportSession
} from '../../services/bankImportService'
import { today } from '../../utils/date'

const { Title, Text } = Typography

export default function BankStatementImportPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { accounts } = useAccounts()

  const [accountId, setAccountId] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [skipRows, setSkipRows] = useState(1)
  const [amountMode, setAmountMode] = useState('single')  // 'single' | 'split'
  const [colMap, setColMap] = useState({ dateCol: 0, descCol: 1, amountCol: 2, debitCol: 3, creditCol: 4 })
  const [submitting, setSubmitting] = useState(false)

  const headerRow = rawRows[0] || []
  const colOptions = headerRow.map((h, i) => ({ value: i, label: `Kolom ${i + 1}${h ? `: ${String(h).slice(0, 20)}` : ''}` }))

  const previewRows = rawRows.slice(skipRows, skipRows + 5)
  const previewCols = headerRow.map((h, i) => ({
    title: String(h || `Kolom ${i + 1}`).slice(0, 20),
    dataIndex: i,
    key: i,
    render: v => String(v ?? ''),
    width: 120,
  }))
  const previewData = previewRows.map((r, i) => {
    const obj = { key: i }
    r.forEach((v, ci) => { obj[ci] = v })
    return obj
  })

  async function handleFileSelect(file) {
    try {
      const rows = await parseStatementFile(file)
      setRawRows(rows)
      setFileName(file.name)
    } catch (err) {
      toast.error(err.message)
    }
    return false  // Prevent AntD Upload default behavior
  }

  async function handleSubmit() {
    if (!accountId) { toast.error('Pilih akun terlebih dahulu'); return }
    if (rawRows.length === 0) { toast.error('Upload file terlebih dahulu'); return }

    const effectiveColMap = amountMode === 'single'
      ? { dateCol: colMap.dateCol, descCol: colMap.descCol, amountCol: colMap.amountCol }
      : { dateCol: colMap.dateCol, descCol: colMap.descCol, debitCol: colMap.debitCol, creditCol: colMap.creditCol }

    const rows = mapStatementRows(rawRows, effectiveColMap, skipRows)
    if (rows.length === 0) { toast.error('Tidak ada baris valid yang dapat diproses. Periksa konfigurasi kolom.'); return }

    setSubmitting(true)
    try {
      const sessionId = await createImportSession(accountId, fileName, today(), rows)
      navigate(`/cash/import/${sessionId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map(a => ({
    value: a.id,
    label: `${a.name} (${a.type === 'bank' ? 'Bank' : 'Kas'})`
  }))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/cash/accounts')} />
        <Title level={2} style={{ margin: 0 }}>Import Rekening Koran</Title>
      </Flex>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">

            {/* Step 1: Pilih Akun + Upload */}
            <Card title="1. Pilih Akun & Upload File">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text strong>Akun Bank/Kas</Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="Pilih akun..."
                    options={accountOptions}
                    value={accountId}
                    onChange={setAccountId}
                  />
                </div>
                <div>
                  <Text strong>File Rekening Koran (.csv, .xlsx, .xls)</Text>
                  <div style={{ marginTop: 4 }}>
                    <Upload
                      accept=".csv,.xlsx,.xls"
                      beforeUpload={handleFileSelect}
                      showUploadList={false}
                      maxCount={1}
                    >
                      <Button icon={<UploadOutlined />}>
                        {fileName ? fileName : 'Pilih File'}
                      </Button>
                    </Upload>
                  </div>
                </div>
                <div>
                  <Text strong>Skip baris awal (header)</Text>
                  <InputNumber
                    style={{ width: '100%', marginTop: 4 }}
                    min={0}
                    max={10}
                    value={skipRows}
                    onChange={v => setSkipRows(v ?? 1)}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Biasanya 1 (lewati baris judul kolom). Sesuaikan jika ada baris meta di atas.
                  </Text>
                </div>
              </Space>
            </Card>

            {/* Step 2: Column Mapping (tampil setelah file diupload) */}
            {rawRows.length > 0 && (
              <Card title="2. Pemetaan Kolom">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div>
                    <Text strong>Kolom Tanggal</Text>
                    <Select
                      style={{ width: '100%', marginTop: 4 }}
                      options={colOptions}
                      value={colMap.dateCol}
                      onChange={v => setColMap(m => ({ ...m, dateCol: v }))}
                    />
                  </div>
                  <div>
                    <Text strong>Kolom Keterangan (opsional)</Text>
                    <Select
                      style={{ width: '100%', marginTop: 4 }}
                      options={[{ value: null, label: '— Tidak ada —' }, ...colOptions]}
                      value={colMap.descCol}
                      onChange={v => setColMap(m => ({ ...m, descCol: v }))}
                    />
                  </div>
                  <div>
                    <Text strong>Mode Jumlah</Text>
                    <Radio.Group
                      style={{ marginTop: 4, display: 'block' }}
                      value={amountMode}
                      onChange={e => setAmountMode(e.target.value)}
                    >
                      <Radio value="single">Satu kolom (+ = masuk, - = keluar)</Radio>
                      <Radio value="split">Dua kolom terpisah (Debit dan Kredit)</Radio>
                    </Radio.Group>
                  </div>
                  {amountMode === 'single' ? (
                    <div>
                      <Text strong>Kolom Jumlah</Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        options={colOptions}
                        value={colMap.amountCol}
                        onChange={v => setColMap(m => ({ ...m, amountCol: v }))}
                      />
                    </div>
                  ) : (
                    <Row gutter={12}>
                      <Col span={12}>
                        <Text strong>Kolom Debit (keluar)</Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          options={colOptions}
                          value={colMap.debitCol}
                          onChange={v => setColMap(m => ({ ...m, debitCol: v }))}
                        />
                      </Col>
                      <Col span={12}>
                        <Text strong>Kolom Kredit (masuk)</Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          options={colOptions}
                          value={colMap.creditCol}
                          onChange={v => setColMap(m => ({ ...m, creditCol: v }))}
                        />
                      </Col>
                    </Row>
                  )}
                </Space>
              </Card>
            )}

            {/* Step 3: Submit */}
            {rawRows.length > 0 && (
              <Flex justify="flex-end" gap={8}>
                <Button onClick={() => navigate('/cash/accounts')}>Batal</Button>
                <Button type="primary" loading={submitting} onClick={handleSubmit}>
                  Proses Import
                </Button>
              </Flex>
            )}
          </Space>
        </Col>

        {/* Preview Panel */}
        {rawRows.length > 0 && (
          <Col xs={24} lg={10}>
            <Card title={`Preview (5 baris pertama setelah skip ${skipRows} baris)`} size="small">
              <Table
                dataSource={previewData}
                columns={previewCols}
                pagination={false}
                size="small"
                scroll={{ x: true }}
                locale={{ emptyText: 'Tidak ada data' }}
              />
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  )
}
```

- [ ] **Step 1: Buat file** dengan kode di atas.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS, tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add src/pages/cash/BankStatementImportPage.jsx
git commit -m "feat(erp-acc): add BankStatementImportPage - file upload and column mapper"
```

---

## Task 4 (Codex): BankImportPreviewPage.jsx

**Files:**
- Create: `src/pages/cash/BankImportPreviewPage.jsx`

**Deskripsi:** Halaman preview hasil matching. Baca `sessionId` dari `useParams()`. Fetch session + rows. Tampilkan tabel dengan color coding. User bisa skip baris atau konfirmasi/batalkan seluruh import.

**Color coding:**
- `match_status === 'matched'` → green row background `#f6ffed`
- `match_status === 'uncertain'` → yellow `#fffbe6`
- `match_status === 'unmatched'` → red `#fff1f0`
- `match_status === 'skipped'` → gray `#fafafa` (disabled)

**Minimum implementation:**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, SkipForward } from 'lucide-react'
import {
  Space, Card, Typography, Button, Table, Tag, Alert,
  Statistic, Row, Col, Flex, Popconfirm
} from 'antd'
import { useToast } from '../../components/ui/ToastContext'
import {
  getImportSession, getImportRows, skipImportRow, confirmImport, cancelImport
} from '../../services/bankImportService'
import { formatCurrency } from '../../utils/currency'

const { Title, Text } = Typography

const STATUS_CONFIG = {
  matched:   { color: '#52c41a', bg: '#f6ffed', label: 'Cocok',     tag: 'success' },
  uncertain: { color: '#faad14', bg: '#fffbe6', label: 'Tidak Pasti', tag: 'warning' },
  unmatched: { color: '#ff4d4f', bg: '#fff1f0', label: 'Tidak Cocok', tag: 'error' },
  skipped:   { color: '#8c8c8c', bg: '#fafafa', label: 'Dilewati',   tag: 'default' },
}

export default function BankImportPreviewPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [session, setSession] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    Promise.all([getImportSession(sessionId), getImportRows(sessionId)])
      .then(([s, r]) => { setSession(s); setRows(r) })
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function handleSkip(rowId) {
    try {
      await skipImportRow(rowId)
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, match_status: 'skipped' } : r))
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleConfirm() {
    setActionLoading(true)
    try {
      await confirmImport(sessionId)
      toast.success('Import dikonfirmasi')
      navigate('/cash/accounts')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancel() {
    setActionLoading(true)
    try {
      await cancelImport(sessionId)
      toast.success('Import dibatalkan')
      navigate('/cash/accounts')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const columns = [
    { title: 'Baris', dataIndex: 'row_number', key: 'row_number', width: 60 },
    { title: 'Tanggal', dataIndex: 'statement_date', key: 'statement_date', width: 110 },
    { title: 'Keterangan', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 130,
      render: (v) => (
        <Text style={{ color: v > 0 ? '#52c41a' : '#ff4d4f' }}>
          {v > 0 ? '+' : ''}{formatCurrency(v)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'match_status',
      key: 'match_status',
      width: 120,
      render: (s) => {
        const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.unmatched
        return <Tag color={cfg.tag}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Pembayaran Cocok',
      key: 'payment',
      render: (_, row) => row.payment
        ? <Text type="secondary">{row.payment.payment_number} — {formatCurrency(row.payment.amount)}</Text>
        : null,
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 90,
      align: 'center',
      render: (v) => v != null ? `${Math.round(v * 100)}%` : '—',
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_, row) =>
        row.match_status === 'unmatched' ? (
          <Button
            size="small"
            icon={<SkipForward size={12} />}
            onClick={() => handleSkip(row.id)}
          >
            Lewati
          </Button>
        ) : null,
    },
  ]

  const matchedCount  = rows.filter(r => r.match_status === 'matched').length
  const uncertainCount = rows.filter(r => r.match_status === 'uncertain').length
  const unmatchedCount = rows.filter(r => r.match_status === 'unmatched').length

  const isConfirmed = session?.status === 'confirmed'
  const isCancelled = session?.status === 'cancelled'

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/cash/accounts')} />
        <Title level={2} style={{ margin: 0 }}>Preview Import Rekening Koran</Title>
      </Flex>

      {session && (
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Statistic title="Total Baris" value={session.total_rows} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Cocok" value={matchedCount} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Tidak Pasti" value={uncertainCount} valueStyle={{ color: '#faad14' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Tidak Cocok" value={unmatchedCount} valueStyle={{ color: '#ff4d4f' }} />
          </Col>
        </Row>
      )}

      {session && (
        <Alert
          message={`File: ${session.file_name} — Akun: ${session.account?.name}`}
          description="Baris bertanda 'Cocok' sudah diverifikasi dengan pembayaran di sistem. 'Tidak Pasti' perlu dikonfirmasi manual. 'Tidak Cocok' berarti belum ada pembayaran yang sesuai."
          type="info"
          showIcon
        />
      )}

      {(isConfirmed || isCancelled) && (
        <Alert
          message={isConfirmed ? 'Import sudah dikonfirmasi' : 'Import dibatalkan'}
          type={isConfirmed ? 'success' : 'warning'}
          showIcon
        />
      )}

      <Card size="small">
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 50 }}
          size="small"
          onRow={(row) => ({
            style: { backgroundColor: STATUS_CONFIG[row.match_status]?.bg || 'white' }
          })}
        />
      </Card>

      {session?.status === 'pending' && (
        <Flex justify="flex-end" gap={8}>
          <Popconfirm
            title="Batalkan import?"
            description="Import akan ditandai sebagai dibatalkan."
            onConfirm={handleCancel}
            okText="Ya, Batalkan"
            cancelText="Tidak"
          >
            <Button loading={actionLoading} icon={<XCircle size={14} />}>Batalkan Import</Button>
          </Popconfirm>
          <Popconfirm
            title="Konfirmasi import?"
            description={`${unmatchedCount} baris tidak cocok akan diabaikan. Lanjutkan?`}
            onConfirm={handleConfirm}
            okText="Ya, Konfirmasi"
            cancelText="Tidak"
          >
            <Button type="primary" loading={actionLoading} icon={<CheckCircle size={14} />}>
              Konfirmasi Import
            </Button>
          </Popconfirm>
        </Flex>
      )}
    </Space>
  )
}
```

- [ ] **Step 1: Buat file** dengan kode di atas.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/cash/BankImportPreviewPage.jsx
git commit -m "feat(erp-acc): add BankImportPreviewPage - match color coding with confirm/cancel"
```

---

## Task 5 (Codex): App.jsx routes + Sidebar.jsx navigation

**Files:**
- Modify: `src/App.jsx` (lazy imports + routes)
- Modify: `src/components/layout/Sidebar.jsx` (Kas & Bank menu items)

**Step 1: App.jsx** — tambahkan lazy imports di blok `// cash pages` (sekitar baris 51-55):

```jsx
// Tambahkan setelah baris ReconciliationPage:
const BankStatementImportPage = lazy(() => import('./pages/cash/BankStatementImportPage'))
const BankImportPreviewPage   = lazy(() => import('./pages/cash/BankImportPreviewPage'))
```

Tambahkan routes di blok cash routes (sekitar baris 174-178), setelah `cash/reconciliation`:

```jsx
<Route path="cash/import" element={<RoleGuard require="canWrite"><BankStatementImportPage /></RoleGuard>} />
<Route path="cash/import/:sessionId" element={<BankImportPreviewPage />} />
```

**Step 2: Sidebar.jsx** — di object `Kas & Bank` (sekitar baris 76-81), tambahkan item:

```js
{ label: 'Import Rekening Koran', path: '/cash/import', minRole: 'write' },
```

Posisi: setelah `{ label: 'Rekonsiliasi', ... }`.

- [ ] **Step 1: Edit App.jsx** — tambahkan lazy imports dan 2 routes (lihat kode di atas).

- [ ] **Step 2: Edit Sidebar.jsx** — tambahkan item `Import Rekening Koran`.

- [ ] **Step 3: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): wire bank statement import routes and sidebar navigation"
```

---

## Verification Checklist

Setelah semua task selesai, verifikasi manual:

1. Navigasi ke **Kas & Bank → Import Rekening Koran** → halaman muncul
2. Upload file XLSX dengan kolom tanggal/keterangan/jumlah → preview 5 baris tampil
3. Klik "Proses Import" → redirect ke halaman preview dengan warna baris
4. Klik "Lewati" pada baris unmatched → status berubah ke abu-abu
5. Klik "Konfirmasi Import" → redirect ke /cash/accounts, toast success
6. `npm run build` → PASS
