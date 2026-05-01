# Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring transactions so users can define Sales Invoice or Manual Journal templates that auto-create on schedule (daily/weekly/monthly/yearly), with a manual "Run Now" trigger and history view.

**Architecture:** Templates stored in `recurring_templates` with a JSONB snapshot of transaction data. A PostgreSQL RPC function `process_recurring_templates(p_template_id)` handles creation—called by the "Run Now" UI button via `supabase.rpc()` and by a daily pg_cron job. All auto-created transactions are in `draft` status so users review and post manually.

**Tech Stack:** Supabase PostgreSQL + pg_cron, React 19 + Ant Design, date-fns (already installed), supabase-js client

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `erp-app/supabase/migrations/015_recurring_transactions.sql` | Tables, sequences, RLS, RPC function, pg_cron schedule |
| Create | `erp-app/src/services/recurringService.js` | CRUD: list, get, create, update, softDelete templates + runNow |
| Create | `erp-app/src/pages/accounting/RecurringPage.jsx` | List page: table of templates with Run/Pause/Delete actions |
| Create | `erp-app/src/pages/accounting/RecurringFormPage.jsx` | Create/edit template standalone form |
| Modify | `erp-app/src/App.jsx` | Add 2 routes under `/accounting/recurring` |
| Modify | `erp-app/src/components/layout/Sidebar.jsx` | Add "Transaksi Berulang" to Pembukuan section |
| Modify | `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Add "Jadikan Berulang" toggle that saves a template on submit |
| Modify | `erp-app/src/pages/accounting/ManualJournalFormPage.jsx` | Add "Jadikan Berulang" toggle that saves a template on submit |

> **Verify before Task 1:** Open `erp-app/supabase/migrations/` and confirm the highest-numbered migration, then name yours one higher (e.g. if 014 is the last, use 015).

---

## Task 1: Database Migration

**Files:**
- Create: `erp-app/supabase/migrations/015_recurring_transactions.sql`

- [ ] **Step 1.1 — Create the migration file**

```sql
-- Migration 015: Recurring Transactions
-- Tables: recurring_templates, recurring_instances
-- Also: sequences for recurring doc numbers, RPC function, pg_cron job

-- ============================================================
-- Extend journals.source to include 'recurring'
-- ============================================================
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'journals' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%recurring%';
  IF v_conname IS NULL THEN
    EXECUTE 'ALTER TABLE journals DROP CONSTRAINT IF EXISTS journals_source_check';
    ALTER TABLE journals ADD CONSTRAINT journals_source_check
      CHECK (source IN ('auto','manual','asset_acquisition','asset_depreciation','asset_disposal','recurring'));
  END IF;
END $$;

-- ============================================================
-- Sequences for recurring-generated document numbers
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS recurring_invoice_seq START 1;
CREATE SEQUENCE IF NOT EXISTS recurring_journal_seq START 1;

-- ============================================================
-- Table 1: recurring_templates
-- ============================================================
CREATE TABLE recurring_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  type            text        NOT NULL CHECK (type IN ('invoice','journal')),
  interval_type   text        NOT NULL CHECK (interval_type IN ('daily','weekly','monthly','yearly')),
  day_of_month    int         CHECK (day_of_month BETWEEN -1 AND 31),  -- -1 = last day of month
  day_of_week     int         CHECK (day_of_week BETWEEN 0 AND 6),     -- 0=Sun, 6=Sat
  start_date      date        NOT NULL,
  end_date        date,
  next_run        date        NOT NULL,
  last_run        date,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  template_data   jsonb       NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        REFERENCES auth.users(id),
  deleted_at      timestamptz,
  deleted_by      uuid        REFERENCES auth.users(id)
);

CREATE INDEX idx_recurring_templates_next_run
  ON recurring_templates(next_run)
  WHERE is_active AND status = 'active';

-- ============================================================
-- Table 2: recurring_instances
-- ============================================================
CREATE TABLE recurring_instances (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid        NOT NULL REFERENCES recurring_templates(id),
  transaction_type text        NOT NULL,
  transaction_id   uuid,
  run_date         date        NOT NULL,
  status           text        NOT NULL DEFAULT 'created' CHECK (status IN ('created','failed')),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_instances_template
  ON recurring_instances(template_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_recurring_templates"
  ON recurring_templates FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "auth_insert_recurring_templates"
  ON recurring_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_recurring_templates"
  ON recurring_templates FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_select_recurring_instances"
  ON recurring_instances FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_recurring_instances"
  ON recurring_instances FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- RPC: process_recurring_templates
-- Called by frontend "Run Now" (with p_template_id)
-- Called by pg_cron daily (without p_template_id → process all due)
-- ============================================================
CREATE OR REPLACE FUNCTION process_recurring_templates(p_template_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tmpl    recurring_templates%ROWTYPE;
  v_today   date := CURRENT_DATE;
  v_inv_id  uuid;
  v_jnl_id  uuid;
  v_next    date;
  v_results jsonb := '[]'::jsonb;
  v_inv_no  text;
  v_jnl_no  text;
BEGIN
  FOR v_tmpl IN
    SELECT * FROM recurring_templates
    WHERE is_active = true
      AND status    = 'active'
      AND next_run  <= v_today
      AND (p_template_id IS NULL OR id = p_template_id)
    ORDER BY next_run
  LOOP
    BEGIN
      -- ---- Invoice ----
      IF v_tmpl.type = 'invoice' THEN
        v_inv_no := 'REC-INV-' || to_char(v_today, 'YYYY') || '-'
                    || lpad(nextval('recurring_invoice_seq')::text, 4, '0');

        INSERT INTO invoices (
          invoice_number, date, due_date,
          customer_id, status, notes,
          total, amount_paid, created_by
        )
        VALUES (
          v_inv_no,
          v_today,
          v_today + COALESCE((v_tmpl.template_data->>'due_days')::int, 30),
          (v_tmpl.template_data->>'customer_id')::uuid,
          'draft',
          COALESCE(v_tmpl.template_data->>'notes', ''),
          COALESCE((v_tmpl.template_data->>'total')::numeric, 0),
          0,
          v_tmpl.created_by
        )
        RETURNING id INTO v_inv_id;

        -- Insert line items
        INSERT INTO invoice_items (
          invoice_id, product_id, unit_id,
          quantity, quantity_base, unit_price,
          tax_amount, total
        )
        SELECT
          v_inv_id,
          (item->>'product_id')::uuid,
          (item->>'unit_id')::uuid,
          (item->>'quantity')::numeric,
          COALESCE((item->>'quantity_base')::numeric, (item->>'quantity')::numeric),
          (item->>'unit_price')::numeric,
          COALESCE((item->>'tax_amount')::numeric, 0),
          (item->>'total')::numeric
        FROM jsonb_array_elements(v_tmpl.template_data->'items') AS item;

        INSERT INTO recurring_instances (template_id, transaction_type, transaction_id, run_date, status)
        VALUES (v_tmpl.id, 'invoice', v_inv_id, v_today, 'created');

      -- ---- Journal ----
      ELSIF v_tmpl.type = 'journal' THEN
        v_jnl_no := 'REC-JNL-' || to_char(v_today, 'YYYY') || '-'
                    || lpad(nextval('recurring_journal_seq')::text, 4, '0');

        INSERT INTO journals (
          journal_number, date, description, source, status, created_by
        )
        VALUES (
          v_jnl_no,
          v_today,
          COALESCE(v_tmpl.template_data->>'description', v_tmpl.name),
          'recurring',
          'draft',
          v_tmpl.created_by
        )
        RETURNING id INTO v_jnl_id;

        INSERT INTO journal_items (journal_id, coa_id, description, debit, credit)
        SELECT
          v_jnl_id,
          (item->>'coa_id')::uuid,
          COALESCE(item->>'description', ''),
          COALESCE((item->>'debit')::numeric, 0),
          COALESCE((item->>'credit')::numeric, 0)
        FROM jsonb_array_elements(v_tmpl.template_data->'items') AS item;

        INSERT INTO recurring_instances (template_id, transaction_type, transaction_id, run_date, status)
        VALUES (v_tmpl.id, 'journal', v_jnl_id, v_today, 'created');
      END IF;

      -- ---- Calculate next_run ----
      v_next := CASE v_tmpl.interval_type
        WHEN 'daily'   THEN v_tmpl.next_run + 1
        WHEN 'weekly'  THEN v_tmpl.next_run + 7
        WHEN 'monthly' THEN
          CASE
            WHEN v_tmpl.day_of_month = -1 THEN
              (date_trunc('month', v_tmpl.next_run + interval '1 month')
                + interval '1 month' - interval '1 day')::date
            ELSE
              (date_trunc('month', v_tmpl.next_run + interval '1 month')
                + ((LEAST(v_tmpl.day_of_month, 28) - 1) || ' days')::interval)::date
          END
        WHEN 'yearly'  THEN (v_tmpl.next_run + interval '1 year')::date
      END;

      UPDATE recurring_templates SET
        last_run   = v_today,
        next_run   = v_next,
        status     = CASE
                       WHEN end_date IS NOT NULL AND v_next > end_date THEN 'completed'
                       ELSE 'active'
                     END,
        updated_at = now()
      WHERE id = v_tmpl.id;

      v_results := v_results || jsonb_build_object(
        'template_id',    v_tmpl.id,
        'status',         'success',
        'transaction_id', COALESCE(v_inv_id, v_jnl_id),
        'doc_number',     COALESCE(v_inv_no, v_jnl_no)
      );

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO recurring_instances (template_id, transaction_type, run_date, status, error_message)
      VALUES (v_tmpl.id, v_tmpl.type, v_today, 'failed', SQLERRM);

      v_results := v_results || jsonb_build_object(
        'template_id', v_tmpl.id,
        'status',      'failed',
        'error',       SQLERRM
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

-- Allow authenticated users to call this RPC
GRANT EXECUTE ON FUNCTION process_recurring_templates(uuid) TO authenticated;

-- ============================================================
-- pg_cron: run daily at 01:00 server time
-- Requires pg_cron extension (enabled in Supabase by default)
-- ============================================================
SELECT cron.schedule(
  'process-recurring-daily',
  '0 1 * * *',
  'SELECT process_recurring_templates()'
);
```

- [ ] **Step 1.2 — Apply the migration to Supabase**

If using Supabase CLI:
```bash
cd erp-app
npx supabase db push
```

If applying manually via Supabase Dashboard:
1. Open SQL Editor in Supabase Dashboard
2. Paste the full migration content
3. Run it
4. Verify in Table Editor: `recurring_templates` and `recurring_instances` tables exist

- [ ] **Step 1.3 — Verify tables exist**

In Supabase SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('recurring_templates', 'recurring_instances');
```

Expected: 2 rows returned.

- [ ] **Step 1.4 — Commit**

```bash
git add erp-app/supabase/migrations/015_recurring_transactions.sql
git commit -m "feat(recurring): add recurring_templates and recurring_instances tables, RPC, pg_cron"
```

---

## Task 2: Recurring Service

**Files:**
- Create: `erp-app/src/services/recurringService.js`

This service follows the exact same pattern as `assetCategoryService.js`.

- [ ] **Step 2.1 — Create `recurringService.js`**

```javascript
import { supabase } from '../lib/supabase'
import { addDays, addWeeks, addMonths, addYears, endOfMonth, setDate } from 'date-fns'

// ---- Helpers ----

export function calcNextRun(intervalType, dayOfMonth, dayOfWeek, fromDate) {
  const base = new Date(fromDate)
  switch (intervalType) {
    case 'daily':
      return addDays(base, 1).toISOString().slice(0, 10)
    case 'weekly': {
      const next = addWeeks(base, 1)
      return next.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const next = addMonths(base, 1)
      if (dayOfMonth === -1) return endOfMonth(next).toISOString().slice(0, 10)
      return setDate(next, Math.min(dayOfMonth, 28)).toISOString().slice(0, 10)
    }
    case 'yearly':
      return addYears(base, 1).toISOString().slice(0, 10)
    default:
      return addMonths(base, 1).toISOString().slice(0, 10)
  }
}

// ---- CRUD ----

export async function listRecurringTemplates() {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getRecurringTemplate(id) {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getRecurringInstances(templateId) {
  const { data, error } = await supabase
    .from('recurring_instances')
    .select('*')
    .eq('template_id', templateId)
    .order('run_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createRecurringTemplate(input) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('recurring_templates')
    .insert({
      name:          input.name,
      type:          input.type,
      interval_type: input.interval_type,
      day_of_month:  input.day_of_month ?? null,
      day_of_week:   input.day_of_week ?? null,
      start_date:    input.start_date,
      end_date:      input.end_date ?? null,
      next_run:      input.start_date,
      status:        'active',
      template_data: input.template_data,
      created_by:    user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateRecurringTemplate(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('recurring_templates')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function pauseRecurringTemplate(id) {
  return updateRecurringTemplate(id, { status: 'paused' })
}

export async function resumeRecurringTemplate(id) {
  return updateRecurringTemplate(id, { status: 'active' })
}

export async function softDeleteRecurringTemplate(id) {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('recurring_templates')
    .update({
      is_active:  false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- Run Now ----

export async function runNow(templateId) {
  const { data, error } = await supabase.rpc('process_recurring_templates', {
    p_template_id: templateId,
  })
  if (error) throw error
  // data is a jsonb array: [{ template_id, status, transaction_id, doc_number }]
  const result = Array.isArray(data) ? data[0] : data
  if (result?.status === 'failed') throw new Error(result.error ?? 'Run failed')
  return result
}
```

- [ ] **Step 2.2 — Verify build**

```bash
cd erp-app && npm run build
```

Expected: no errors.

- [ ] **Step 2.3 — Commit**

```bash
git add erp-app/src/services/recurringService.js
git commit -m "feat(recurring): add recurringService with CRUD, calcNextRun, runNow"
```

---

## Task 3: RecurringPage — List View

**Files:**
- Create: `erp-app/src/pages/accounting/RecurringPage.jsx`

- [ ] **Step 3.1 — Create `RecurringPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Card, Tag, Tooltip, Alert } from 'antd'
import { Plus, Play, Pause, Trash2, History, RefreshCw } from 'lucide-react'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import {
  listRecurringTemplates,
  getRecurringInstances,
  pauseRecurringTemplate,
  resumeRecurringTemplate,
  softDeleteRecurringTemplate,
  runNow,
} from '../../services/recurringService'
import { useAuth } from '../../contexts/AuthContext'

const { Title, Text } = Typography

const STATUS_COLOR = { active: 'green', paused: 'orange', completed: 'default' }
const STATUS_LABEL = { active: 'Aktif', paused: 'Dijeda', completed: 'Selesai' }
const TYPE_LABEL   = { invoice: 'Invoice', journal: 'Jurnal' }
const INTERVAL_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' }

export default function RecurringPage() {
  const navigate  = useNavigate()
  const { profile } = useAuth()
  const canWrite  = profile?.role === 'admin' || profile?.role === 'staff'

  const [templates,  setTemplates]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [actionId,   setActionId]   = useState(null)  // tracks loading per row
  const [histModal,  setHistModal]  = useState(null)  // { id, name }
  const [instances,  setInstances]  = useState([])
  const [histLoading, setHistLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTemplates(await listRecurringTemplates())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRunNow(tmpl) {
    setActionId(tmpl.id)
    setError(null)
    try {
      const result = await runNow(tmpl.id)
      await load()
      alert(`Berhasil dibuat: ${result.doc_number}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setActionId(null)
    }
  }

  async function handleTogglePause(tmpl) {
    setActionId(tmpl.id)
    try {
      if (tmpl.status === 'active') await pauseRecurringTemplate(tmpl.id)
      else await resumeRecurringTemplate(tmpl.id)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionId(null)
    }
  }

  async function handleDelete(tmpl) {
    if (!window.confirm(`Hapus template "${tmpl.name}"?`)) return
    setActionId(tmpl.id)
    try {
      await softDeleteRecurringTemplate(tmpl.id)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionId(null)
    }
  }

  async function openHistory(tmpl) {
    setHistModal({ id: tmpl.id, name: tmpl.name })
    setHistLoading(true)
    try {
      setInstances(await getRecurringInstances(tmpl.id))
    } catch (e) {
      setError(e.message)
    } finally {
      setHistLoading(false)
    }
  }

  const columns = [
    { title: 'Nama', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {TYPE_LABEL[r.type]} · {INTERVAL_LABEL[r.interval_type]}
          </Text>
        </Space>
      ),
    },
    { title: 'Run Berikutnya', dataIndex: 'next_run', key: 'next_run',
      render: v => v ?? '-',
    },
    { title: 'Terakhir Run', dataIndex: 'last_run', key: 'last_run',
      render: v => v ?? '-',
    },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    canWrite && {
      title: 'Aksi', key: 'actions',
      render: (_, r) => {
        const busy = actionId === r.id
        return (
          <Space>
            <Tooltip title="Run Sekarang">
              <Button
                size="small" icon={<RefreshCw size={14} />}
                loading={busy} disabled={r.status !== 'active'}
                onClick={() => handleRunNow(r)}
              />
            </Tooltip>
            <Tooltip title={r.status === 'active' ? 'Jeda' : 'Aktifkan'}>
              <Button
                size="small"
                icon={r.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                loading={busy} disabled={r.status === 'completed'}
                onClick={() => handleTogglePause(r)}
              />
            </Tooltip>
            <Tooltip title="Riwayat">
              <Button size="small" icon={<History size={14} />}
                onClick={() => openHistory(r)}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button size="small"
                onClick={() => navigate(`/accounting/recurring/${r.id}`)}
              />
            </Tooltip>
            <Tooltip title="Hapus">
              <Button size="small" danger icon={<Trash2 size={14} />}
                loading={busy} onClick={() => handleDelete(r)}
              />
            </Tooltip>
          </Space>
        )
      },
    },
  ].filter(Boolean)

  const instanceColumns = [
    { title: 'Tanggal Run', dataIndex: 'run_date',         key: 'run_date' },
    { title: 'Tipe',        dataIndex: 'transaction_type', key: 'type' },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={v === 'created' ? 'green' : 'red'}>{v}</Tag>,
    },
    { title: 'Error', dataIndex: 'error_message', key: 'error',
      render: v => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-',
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Title level={4} style={{ margin: 0 }}>Transaksi Berulang</Title>
        {canWrite && (
          <Button type="primary" icon={<Plus size={16} />}
            onClick={() => navigate('/accounting/recurring/new')}
          >
            Tambah Template
          </Button>
        )}
      </Flex>

      {error && <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />}

      <Card>
        <DataTable
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        open={!!histModal}
        title={`Riwayat: ${histModal?.name ?? ''}`}
        onCancel={() => setHistModal(null)}
        footer={null}
        width={700}
      >
        <DataTable
          columns={instanceColumns}
          dataSource={instances}
          rowKey="id"
          loading={histLoading}
          size="small"
        />
      </Modal>
    </Space>
  )
}
```

- [ ] **Step 3.2 — Verify build**

```bash
cd erp-app && npm run build
```

Expected: no errors.

- [ ] **Step 3.3 — Commit**

```bash
git add erp-app/src/pages/accounting/RecurringPage.jsx
git commit -m "feat(recurring): add RecurringPage list view with run/pause/history actions"
```

---

## Task 4: RecurringFormPage — Create/Edit Template

**Files:**
- Create: `erp-app/src/pages/accounting/RecurringFormPage.jsx`

- [ ] **Step 4.1 — Create `RecurringFormPage.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Form, Space, Flex, Typography, Card, Row, Col, Alert, Divider } from 'antd'
import { ArrowLeft, Save } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import DateInput from '../../components/ui/DateInput'
import {
  getRecurringTemplate,
  createRecurringTemplate,
  updateRecurringTemplate,
} from '../../services/recurringService'

const { Title, Text } = Typography

const TYPE_OPTIONS = [
  { value: 'invoice', label: 'Sales Invoice' },
  { value: 'journal', label: 'Manual Jurnal' },
]

const INTERVAL_OPTIONS = [
  { value: 'daily',   label: 'Harian' },
  { value: 'weekly',  label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly',  label: 'Tahunan' },
]

const DAY_OPTIONS = [
  { value: -1, label: 'Hari terakhir bulan' },
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `Tanggal ${i + 1}` })),
]

export default function RecurringFormPage() {
  const { id }  = useParams()
  const isEdit  = Boolean(id)
  const navigate = useNavigate()
  const [form]  = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [interval, setIntervalType] = useState('monthly')

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getRecurringTemplate(id)
      .then(tmpl => {
        form.setFieldsValue({
          name:          tmpl.name,
          type:          tmpl.type,
          interval_type: tmpl.interval_type,
          day_of_month:  tmpl.day_of_month,
          start_date:    tmpl.start_date,
          end_date:      tmpl.end_date,
        })
        setIntervalType(tmpl.interval_type)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isEdit, form])

  async function handleSave(values) {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name:          values.name,
        type:          values.type,
        interval_type: values.interval_type,
        day_of_month:  values.interval_type === 'monthly' ? (values.day_of_month ?? 1) : null,
        day_of_week:   null,
        start_date:    values.start_date,
        end_date:      values.end_date ?? null,
        template_data: isEdit
          ? undefined  // preserve existing template_data on edit
          : { customer_id: null, due_days: 30, notes: values.name, items: [] },
      }

      if (isEdit) {
        await updateRecurringTemplate(id, {
          name:          payload.name,
          interval_type: payload.interval_type,
          day_of_month:  payload.day_of_month,
          start_date:    payload.start_date,
          end_date:      payload.end_date,
        })
      } else {
        await createRecurringTemplate(payload)
      }
      navigate('/accounting/recurring')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Text>Memuat...</Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/accounting/recurring')} />
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'Edit Template Berulang' : 'Tambah Template Berulang'}
        </Title>
      </Flex>

      {error && <Alert type="error" message={error} showIcon />}

      <Card>
        <Form form={form} layout="vertical" onFinish={handleSave}
          initialValues={{ interval_type: 'monthly', day_of_month: 1 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Nama Template"
                rules={[{ required: true, message: 'Nama wajib diisi' }]}
              >
                <Input placeholder="Contoh: Invoice Sewa Alat Bulanan" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="Tipe Transaksi"
                rules={[{ required: true, message: 'Tipe wajib dipilih' }]}
              >
                <Select options={TYPE_OPTIONS} placeholder="Pilih tipe" disabled={isEdit} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Jadwal</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="interval_type" label="Interval"
                rules={[{ required: true }]}
              >
                <Select options={INTERVAL_OPTIONS}
                  onChange={v => setIntervalType(v)}
                />
              </Form.Item>
            </Col>
            {interval === 'monthly' && (
              <Col span={8}>
                <Form.Item name="day_of_month" label="Hari ke-"
                  rules={[{ required: true, message: 'Pilih hari' }]}
                >
                  <Select options={DAY_OPTIONS} />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="start_date" label="Mulai Tanggal"
                rules={[{ required: true, message: 'Tanggal mulai wajib diisi' }]}
              >
                <DateInput />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="end_date" label="Berakhir Tanggal (opsional)">
                <DateInput />
              </Form.Item>
            </Col>
          </Row>

          {!isEdit && (
            <Alert
              type="info"
              showIcon
              message="Setelah disimpan, edit detail transaksi (customer, item) dari halaman Transaksi Berulang dengan memilih template yang baru dibuat."
              style={{ marginBottom: 16 }}
            />
          )}

          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => navigate('/accounting/recurring')}>Batal</Button>
            <Button type="primary" htmlType="submit" loading={saving} icon={<Save size={16} />}>
              Simpan
            </Button>
          </Flex>
        </Form>
      </Card>
    </Space>
  )
}
```

> **Note:** This form creates a skeleton template. The full `template_data` (customer, items) is edited by using the "Jadikan Berulang" toggle in the Invoice/Journal form (Tasks 7 & 8), which captures real transaction data.

- [ ] **Step 4.2 — Verify build**

```bash
cd erp-app && npm run build
```

Expected: no errors.

- [ ] **Step 4.3 — Commit**

```bash
git add erp-app/src/pages/accounting/RecurringFormPage.jsx
git commit -m "feat(recurring): add RecurringFormPage for create/edit templates"
```

---

## Task 5: App.jsx + Sidebar — Routes & Navigation

**Files:**
- Modify: `erp-app/src/App.jsx`
- Modify: `erp-app/src/components/layout/Sidebar.jsx`

- [ ] **Step 5.1 — Add routes to App.jsx**

Open `erp-app/src/App.jsx`. Find the section with `/accounting/journals` and `/accounting/ledger` routes. Add directly after them:

```jsx
// Add these two imports at the top of App.jsx with other page imports:
import RecurringPage from './pages/accounting/RecurringPage'
import RecurringFormPage from './pages/accounting/RecurringFormPage'
```

Then in the routes JSX, find the accounting route group and add:

```jsx
<Route path="accounting/recurring" element={<RecurringPage />} />
<Route path="accounting/recurring/new" element={
  <RoleGuard require="canWrite"><RecurringFormPage /></RoleGuard>
} />
<Route path="accounting/recurring/:id" element={
  <RoleGuard require="canWrite"><RecurringFormPage /></RoleGuard>
} />
```

- [ ] **Step 5.2 — Add menu item to Sidebar.jsx**

Open `erp-app/src/components/layout/Sidebar.jsx`. Find the Pembukuan section:

```javascript
{
  label: 'Pembukuan',
  icon: BookOpen,
  key: 'pembukuan',
  items: [
    { label: 'Jurnal', path: '/accounting/journals' },
    { label: 'Buku Besar', path: '/accounting/ledger' }
  ]
}
```

Add the new item to the `items` array:

```javascript
{
  label: 'Pembukuan',
  icon: BookOpen,
  key: 'pembukuan',
  items: [
    { label: 'Jurnal',             path: '/accounting/journals' },
    { label: 'Buku Besar',         path: '/accounting/ledger' },
    { label: 'Transaksi Berulang', path: '/accounting/recurring' },
  ]
}
```

- [ ] **Step 5.3 — Verify build and navigation**

```bash
cd erp-app && npm run build
```

Expected: no errors. Then start dev server and confirm the menu item appears:

```bash
npm run dev
```

Navigate to Pembukuan → Transaksi Berulang. The list page should load (empty).

- [ ] **Step 5.4 — Commit**

```bash
git add erp-app/src/App.jsx erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(recurring): add routes and sidebar navigation for recurring transactions"
```

---

## Task 6: "Jadikan Berulang" Toggle in SalesInvoiceFormPage

**Files:**
- Modify: `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`

The toggle captures the current form data as `template_data` and creates a recurring template when the invoice is saved.

- [ ] **Step 6.1 — Add state and imports**

Open `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`.

Add this import at the top (with other service imports):

```javascript
import { createRecurringTemplate } from '../../services/recurringService'
```

Add this import for UI components (add to existing antd import line):
```javascript
// Add Switch, Divider to existing antd import:
import { Switch, Divider, /* ...existing... */ } from 'antd'
// Add Select to existing component imports if not already there
```

After the existing `useState` declarations in the component body, add:

```javascript
const [makeRecurring, setMakeRecurring] = useState(false)
const [recurInterval, setRecurInterval] = useState('monthly')
const [recurDay,      setRecurDay]      = useState(1)
const [recurStart,    setRecurStart]    = useState('')
```

- [ ] **Step 6.2 — Add recurring UI to the form**

Find the form's submit button area (near the end of the JSX, just before the closing `</Card>` or similar). Add this block directly above the submit buttons:

```jsx
<Divider />
<Flex align="center" gap={12} style={{ marginBottom: 12 }}>
  <Switch
    checked={makeRecurring}
    onChange={setMakeRecurring}
    id="recurring-toggle"
  />
  <label htmlFor="recurring-toggle" style={{ cursor: 'pointer', fontWeight: 500 }}>
    Jadikan Berulang
  </label>
</Flex>

{makeRecurring && (
  <Card size="small" style={{ marginBottom: 16 }}>
    <Row gutter={16}>
      <Col span={8}>
        <div style={{ marginBottom: 8 }}>
          <Text>Interval</Text>
        </div>
        <Select
          value={recurInterval}
          onChange={setRecurInterval}
          options={[
            { value: 'daily',   label: 'Harian' },
            { value: 'weekly',  label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
            { value: 'yearly',  label: 'Tahunan' },
          ]}
          style={{ width: '100%' }}
        />
      </Col>
      {recurInterval === 'monthly' && (
        <Col span={8}>
          <div style={{ marginBottom: 8 }}><Text>Tanggal ke-</Text></div>
          <Select
            value={recurDay}
            onChange={setRecurDay}
            options={[
              { value: -1, label: 'Hari terakhir bulan' },
              ...Array.from({ length: 28 }, (_, i) => ({
                value: i + 1, label: `${i + 1}`,
              })),
            ]}
            style={{ width: '100%' }}
          />
        </Col>
      )}
      <Col span={8}>
        <div style={{ marginBottom: 8 }}><Text>Mulai Tanggal *</Text></div>
        <DateInput
          value={recurStart}
          onChange={setRecurStart}
          style={{ width: '100%' }}
        />
      </Col>
    </Row>
  </Card>
)}
```

> **Note:** You may need to add `import { Row, Col } from 'antd'` if not already imported, and `Text` from `Typography`. Check existing imports first.

- [ ] **Step 6.3 — Hook into handleSave**

Find the `handleSave` function in `SalesInvoiceFormPage.jsx`. After the line that calls `saveSalesInvoice(...)` and gets back the saved invoice, add the following block (before any navigation):

```javascript
// Inside handleSave, after invoice is saved successfully:
if (makeRecurring && recurStart) {
  const templateData = {
    customer_id: header.customer_id,
    due_days:    header.due_days ?? 30,
    notes:       header.notes ?? '',
    total:       header.total ?? 0,
    items: items.map(it => ({
      product_id:    it.product_id,
      unit_id:       it.unit_id,
      quantity:      it.quantity,
      quantity_base: it.quantity_base ?? it.quantity,
      unit_price:    it.unit_price,
      tax_amount:    it.tax_amount ?? 0,
      total:         it.total,
      // display fields for preview
      product_name:  it.product_name ?? '',
      unit_name:     it.unit_name ?? '',
    })),
  }
  await createRecurringTemplate({
    name:          `Invoice Berulang – ${header.customer_name ?? header.customer_id}`,
    type:          'invoice',
    interval_type: recurInterval,
    day_of_month:  recurInterval === 'monthly' ? recurDay : null,
    start_date:    recurStart,
    template_data: templateData,
  })
}
```

> **Important:** The exact variable names (`header`, `items`, `header.customer_name`) depend on the existing code in `handleSave`. Inspect the function and use the correct variable names for the invoice header and items array. The pattern shows what data to capture.

- [ ] **Step 6.4 — Verify build**

```bash
cd erp-app && npm run build
```

Expected: no errors.

- [ ] **Step 6.5 — Commit**

```bash
git add erp-app/src/pages/sales/SalesInvoiceFormPage.jsx
git commit -m "feat(recurring): add 'Jadikan Berulang' toggle to SalesInvoiceFormPage"
```

---

## Task 7: "Jadikan Berulang" Toggle in ManualJournalFormPage

**Files:**
- Modify: `erp-app/src/pages/accounting/ManualJournalFormPage.jsx`

- [ ] **Step 7.1 — Add state and imports**

Open `erp-app/src/pages/accounting/ManualJournalFormPage.jsx`.

Add import:
```javascript
import { createRecurringTemplate } from '../../services/recurringService'
```

After existing `useState` declarations, add:
```javascript
const [makeRecurring, setMakeRecurring] = useState(false)
const [recurInterval, setRecurInterval] = useState('monthly')
const [recurDay,      setRecurDay]      = useState(1)
const [recurStart,    setRecurStart]    = useState('')
```

- [ ] **Step 7.2 — Add recurring UI to the journal form**

Find the form area, just above the submit buttons, and add the same recurring toggle block as in Task 6 Step 6.2. The JSX block is identical — copy it from `SalesInvoiceFormPage.jsx`.

- [ ] **Step 7.3 — Hook into handleSave**

In `handleSave`, after the journal is saved (after `saveManualJournal(...)` call), add:

```javascript
if (makeRecurring && recurStart) {
  const templateData = {
    description: header.description ?? '',
    items: items.map(it => ({
      coa_id:      it.coa_id,
      description: it.description ?? '',
      debit:       Number(it.debit)  || 0,
      credit:      Number(it.credit) || 0,
      // display fields
      coa_code: it.coa_code ?? '',
      coa_name: it.coa_name ?? '',
    })),
  }
  await createRecurringTemplate({
    name:          `Jurnal Berulang – ${header.description ?? 'Jurnal'}`,
    type:          'journal',
    interval_type: recurInterval,
    day_of_month:  recurInterval === 'monthly' ? recurDay : null,
    start_date:    recurStart,
    template_data: templateData,
  })
}
```

> **Important:** Same note as Task 6 — verify variable names (`header`, `items`) match the actual code in `handleSave`.

- [ ] **Step 7.4 — Verify build**

```bash
cd erp-app && npm run build
```

Expected: no errors.

- [ ] **Step 7.5 — Commit**

```bash
git add erp-app/src/pages/accounting/ManualJournalFormPage.jsx
git commit -m "feat(recurring): add 'Jadikan Berulang' toggle to ManualJournalFormPage"
```

---

## Task 8: End-to-End Manual Verification

No automated test framework exists in this project. Run these steps manually.

- [ ] **Step 8.1 — Start dev server**

```bash
cd erp-app && npm run dev
```

- [ ] **Step 8.2 — Test: Create recurring invoice template via toggle**

1. Log in as admin
2. Go to Sales → Invoice → Buat Invoice Baru
3. Fill in: customer, at least one line item, a due date
4. Toggle "Jadikan Berulang" → set Bulanan, tanggal 1, mulai 2026-06-01
5. Save the invoice
6. Navigate to Pembukuan → Transaksi Berulang
7. Confirm a new template appears with status "Aktif", next_run = 2026-06-01

Expected: template row visible with type=Invoice, interval=Bulanan.

- [ ] **Step 8.3 — Test: Run Now**

1. On the Transaksi Berulang list, click the Run Now button (↻) on the template created above
2. Wait for the alert: "Berhasil dibuat: REC-INV-2026-XXXX"
3. Navigate to Sales → Invoice list
4. Confirm a new draft invoice with number `REC-INV-2026-XXXX` appears
5. Back on Transaksi Berulang: last_run shows today's date, next_run shows 2026-07-01

- [ ] **Step 8.4 — Test: Pause and Resume**

1. Click Pause (⏸) on the template
2. Confirm status changes to "Dijeda"
3. Click Run Now — button should be disabled (not clickable)
4. Click Resume (▶) → status returns to "Aktif"

- [ ] **Step 8.5 — Test: History modal**

1. Click History (⏱) on the template
2. Modal opens showing the instance from Step 8.3
3. Row shows run_date = today, status = "created"

- [ ] **Step 8.6 — Test: Create recurring journal via toggle**

1. Go to Pembukuan → Jurnal → Jurnal Baru
2. Fill in description + at least 2 line items (balanced debit/credit)
3. Toggle "Jadikan Berulang" → set Bulanan, tanggal 1, mulai 2026-06-01
4. Save the journal
5. Go to Transaksi Berulang → confirm a new template with type=Jurnal appears
6. Click Run Now → confirm new draft journal is created

- [ ] **Step 8.7 — Test: Delete template**

1. Click Delete (🗑) on any template
2. Confirm dialog appears → click OK
3. Template disappears from the list
4. Verify in Supabase Dashboard: `is_active = false`, `deleted_at` is set

- [ ] **Step 8.8 — Final production build**

```bash
cd erp-app && npm run build
```

Expected: Build completes with no errors. Note any warnings for follow-up.

- [ ] **Step 8.9 — Commit final**

```bash
git add -A
git commit -m "feat(recurring): Phase 1 complete — recurring transactions with run-now, pause/resume, history"
```

---

## Known Limitations & Follow-ups

1. **Template data editing** — the `template_data` (customer, items, amounts) can only be set via the Invoice/Journal form toggle. A dedicated template data editor in `RecurringFormPage` is a future enhancement.

2. **invoice_number conflict** — recurring invoices use `REC-INV-YYYY-XXXX` prefix. If the existing invoicing uses the same format, the pg sequence may produce duplicates. Verify against `salesService.js` `generateInvoiceNumber()` (or equivalent) and adjust the prefix accordingly.

3. **Table column names** — verify that `invoices`, `invoice_items`, `journals`, `journal_items` match the actual Supabase table names. Run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;` to list all tables.

4. **pg_cron timezone** — the cron job runs at `01:00 server time` (UTC in Supabase). Adjust the cron expression if WIB (UTC+7) is required: `'0 18 * * *'` runs at 01:00 WIB.

5. **Email notifications on creation** — planned for Phase 2. When Phase 2 email is built, add a call to the email service inside `process_recurring_templates()` after each successful creation.
