# Cost Centers / Departemen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan dimensi Cost Center (Departemen) ke jurnal manual sehingga beban dan pendapatan bisa dilacak per departemen, dilengkapi master data CRUD dan laporan P&L per Cost Center.

**Architecture:** Tabel baru `cost_centers` + kolom `cost_center_id` nullable di `journal_items`. Cost center bersifat opsional per baris jurnal. Laporan agregasi via SECURITY DEFINER RPC `get_pl_by_cost_center`. Service layer (`costCenterService.js`) + modifikasi `ManualJournalFormPage.jsx`. Tidak ada perubahan ke invoice/SO/PO items di sesi ini — fokus di jurnal manual dulu.

**Tech Stack:** PostgreSQL (Supabase), React 18, Ant Design, custom service pattern yang sama dengan `warehouseService.js`

---

## File Structure

| File | Action | Deskripsi |
|---|---|---|
| `migrations/008_cost_centers.sql` | **Create (Claude T1)** | Tabel cost_centers, ALTER journal_items, RLS, save/soft_delete RPCs |
| `migrations/009_pl_by_cost_center.sql` | **Create (Claude T2)** | get_pl_by_cost_center RPC |
| `src/services/costCenterService.js` | **Create (Codex T3)** | listCostCenters, saveCostCenter, softDeleteCostCenter |
| `src/pages/master/CostCentersPage.jsx` | **Create (Codex T3)** | Master data CRUD (pattern: WarehousesPage.jsx) |
| `src/services/reportService.js` | **Modify (Codex T5)** | Tambah getPLByCostCenter() |
| `src/pages/accounting/ManualJournalFormPage.jsx` | **Modify (Codex T4)** | Tambah cost_center_id ke items + dropdown per baris |
| `src/services/journalService.js` | **Modify (Codex T4)** | Pass cost_center_id dalam saveManualJournal items |
| `src/pages/reports/PLByCostCenterPage.jsx` | **Create (Codex T5)** | P&L report per cost center |
| `src/App.jsx` | **Modify (Codex T3+T5)** | Lazy import + routes |
| `src/components/layout/Sidebar.jsx` | **Modify (Codex T3+T5)** | Sidebar entries |

**Model assignment:**
- T1 (Migration 008): **Claude** — SQL schema + RPCs
- T2 (Migration 009): **Claude** — complex SQL aggregate RPC
- T3–T5: **Codex** — UI pages, service layer, routing

---

## Task 1 (Claude): Migration 008 — Cost Centers Table + RPCs

**File:** `C:\Project\apps\erp-acc\erp-app\migrations\008_cost_centers.sql`

**Catatan penting:**
- Tidak ada `company_id` di tabel — project ini single-tenant per Supabase instance
- Soft delete via SECURITY DEFINER RPC (sama dengan pattern migration 028 di `supabase/migrations/`)
- Kolom `cost_center_id` di `journal_items` bersifat **nullable** — tidak wajib diisi

- [ ] **Step 1: Buat file migration**

```sql
-- ============================================================
-- Migration 008: Cost Centers
-- ============================================================

-- Tabel cost_centers
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tambah cost_center_id ke journal_items (nullable — opsional per baris)
ALTER TABLE journal_items
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id);

-- RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cost_centers"
  ON cost_centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/staff insert cost_centers"
  ON cost_centers FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

CREATE POLICY "Admin/staff update cost_centers"
  ON cost_centers FOR UPDATE TO authenticated
  USING (is_admin_or_staff());

CREATE POLICY "Admin delete cost_centers"
  ON cost_centers FOR DELETE TO authenticated
  USING (is_admin());

-- RPC: Upsert cost center
CREATE OR REPLACE FUNCTION save_cost_center(
  p_id UUID,
  p_code TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    RAISE EXCEPTION 'Kode cost center wajib diisi';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nama cost center wajib diisi';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update
    UPDATE cost_centers
    SET
      code        = trim(p_code),
      name        = trim(p_name),
      description = p_description,
      updated_at  = now()
    WHERE id = p_id;
    v_id := p_id;
  ELSE
    -- Insert
    INSERT INTO cost_centers (code, name, description)
    VALUES (trim(p_code), trim(p_name), p_description)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- RPC: Soft delete cost center
CREATE OR REPLACE FUNCTION soft_delete_cost_center(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_count INT;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Cek apakah masih dipakai di journal_items yang posted
  SELECT COUNT(*) INTO ref_count
  FROM journal_items ji
  JOIN journals j ON j.id = ji.journal_id
  WHERE ji.cost_center_id = p_id
    AND j.is_posted = true;

  IF ref_count > 0 THEN
    RAISE EXCEPTION 'Cost center masih digunakan di % baris jurnal terposting', ref_count;
  END IF;

  UPDATE cost_centers
  SET
    is_active  = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  WHERE id = p_id;
END;
$$;
```

- [ ] **Step 2: Apply migration ke Supabase ERP-MG**

Buka Supabase Dashboard → ERP-MG → SQL Editor → paste dan run isi file di atas.
Expected: "Success. No rows returned"

- [ ] **Step 3: Verifikasi**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'journal_items' AND column_name = 'cost_center_id';
```
Expected: 1 row returned.

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('save_cost_center', 'soft_delete_cost_center');
```
Expected: 2 rows returned.

---

## Task 2 (Claude): Migration 009 — P&L per Cost Center RPC

**File:** `C:\Project\apps\erp-acc\erp-app\migrations\009_pl_by_cost_center.sql`

**Catatan SQL:** RPC ini mengembalikan P&L (revenue/expense) di-group per cost center per tipe COA. Hanya jurnal terposting (`is_posted = true`). Filter tanggal di jurnal header.

- [ ] **Step 1: Buat file migration**

```sql
-- ============================================================
-- Migration 009: P&L per Cost Center RPC
-- ============================================================

CREATE OR REPLACE FUNCTION get_pl_by_cost_center(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  cost_center_id   UUID,
  cost_center_code TEXT,
  cost_center_name TEXT,
  coa_type         TEXT,
  coa_id           UUID,
  coa_code         TEXT,
  coa_name         TEXT,
  total_debit      NUMERIC,
  total_credit     NUMERIC,
  net_amount       NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cc.id             AS cost_center_id,
    cc.code           AS cost_center_code,
    cc.name           AS cost_center_name,
    c.type            AS coa_type,
    c.id              AS coa_id,
    c.code            AS coa_code,
    c.name            AS coa_name,
    SUM(ji.debit)     AS total_debit,
    SUM(ji.credit)    AS total_credit,
    SUM(ji.debit) - SUM(ji.credit) AS net_amount
  FROM journal_items ji
  JOIN coa c ON c.id = ji.coa_id
  JOIN cost_centers cc ON cc.id = ji.cost_center_id
  JOIN journals j ON j.id = ji.journal_id
  WHERE j.is_posted = true
    AND j.date BETWEEN p_start_date AND p_end_date
    AND c.type IN ('revenue', 'expense')
  GROUP BY cc.id, cc.code, cc.name, c.type, c.id, c.code, c.name
  ORDER BY cc.code, c.type, c.code
$$;
```

- [ ] **Step 2: Apply ke Supabase**

Buka Supabase Dashboard → SQL Editor → paste dan run.
Expected: "Success."

- [ ] **Step 3: Verifikasi RPC terdaftar**

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_pl_by_cost_center';
```
Expected: 1 row.

- [ ] **Step 4: Test RPC dengan data (opsional, jika ada data)**

```sql
SELECT * FROM get_pl_by_cost_center('2026-01-01', '2026-12-31');
```
Expected: empty set (tidak ada data cost center dulu) — tidak boleh error.

- [ ] **Step 5: Commit files**

```bash
git add apps/erp-acc/erp-app/migrations/008_cost_centers.sql
git add apps/erp-acc/erp-app/migrations/009_pl_by_cost_center.sql
git commit -m "feat(erp-acc): add cost_centers table and pl_by_cost_center RPC migrations"
```

---

## Task 3 (Codex): Service + CostCentersPage + Routing + Sidebar

**Files:**
- Create: `src/services/costCenterService.js`
- Create: `src/pages/master/CostCentersPage.jsx`
- Modify: `src/App.jsx` (lazy import + route)
- Modify: `src/components/layout/Sidebar.jsx` (tambah entry)

**Referensi pattern:** `src/services/warehouseService.js` dan `src/pages/master/WarehousesPage.jsx`

### costCenterService.js

```js
// src/services/costCenterService.js
import { supabase } from '../lib/supabase'

export async function listCostCenters() {
  const { data, error } = await supabase
    .from('cost_centers')
    .select('id, code, name, description, is_active')
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data || []
}

export async function saveCostCenter({ id = null, code, name, description = null }) {
  const { data, error } = await supabase.rpc('save_cost_center', {
    p_id: id,
    p_code: code,
    p_name: name,
    p_description: description,
  })
  if (error) throw error
  return data
}

export async function softDeleteCostCenter(id) {
  const { error } = await supabase.rpc('soft_delete_cost_center', { p_id: id })
  if (error) throw error
}
```

### CostCentersPage.jsx

Ikuti pattern **persis** dari `WarehousesPage.jsx`:
- State: `costCenters`, `loading`, `error`, `isModalOpen`, `isDeleteOpen`, `isSubmitting`, `editingId`, `deletingId`, `formData`, `formError`
- `emptyForm = { code: '', name: '', description: '' }`
- Kolom tabel: Kode, Nama, Deskripsi, Aksi (Edit + Hapus)
- Tidak ada field "default" (beda dengan warehouses)
- Form fields: `code` (wajib), `name` (wajib), `description` (opsional, textarea)
- Validasi: kode dan nama wajib diisi

```jsx
// src/pages/master/CostCentersPage.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Flex, Space, Typography } from 'antd'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import Modal from '../../components/ui/Modal'
import { listCostCenters, saveCostCenter, softDeleteCostCenter } from '../../services/costCenterService'

const emptyForm = { code: '', name: '', description: '' }

export default function CostCentersPage() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)

  const [costCenters, setCostCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setCostCenters(await listCostCenters())
    } catch (err) {
      setError(err.message)
      toastRef.current.error(`Gagal memuat cost center: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { toastRef.current = toast }, [toast])
  useEffect(() => { load() }, [load])

  const handleAdd = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (cc) => {
    setEditingId(cc.id)
    setFormData({ code: cc.code || '', name: cc.name || '', description: cc.description || '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (cc) => {
    setDeletingId(cc.id)
    setIsDeleteOpen(true)
  }

  const validate = () => {
    if (!formData.code.trim()) return 'Kode cost center wajib diisi'
    if (!formData.name.trim()) return 'Nama cost center wajib diisi'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canWrite) { toast.error('Tidak memiliki akses'); return }
    const err = validate()
    if (err) { setFormError(err); return }
    setIsSubmitting(true)
    try {
      await saveCostCenter({ id: editingId, code: formData.code.trim(), name: formData.name.trim(), description: formData.description.trim() || null })
      toast.success(editingId ? 'Cost center diperbarui' : 'Cost center ditambahkan')
      await load()
      setIsModalOpen(false)
      setFormData(emptyForm)
    } catch (err) {
      setFormError(err.message)
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId || !canWrite) return
    setIsSubmitting(true)
    try {
      await softDeleteCostCenter(deletingId)
      toast.success('Cost center dihapus')
      await load()
      setDeletingId(null)
      setIsDeleteOpen(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = [
    { key: 'code', label: 'Kode' },
    { key: 'name', label: 'Nama' },
    { key: 'description', label: 'Deskripsi', render: v => v || '-' },
    {
      key: 'id',
      label: 'Aksi',
      render: (_, cc) => canWrite ? (
        <Space>
          <button onClick={() => handleEdit(cc)} title="Edit"><Edit2 size={18} /></button>
          <button onClick={() => handleDeleteClick(cc)} title="Hapus"><Trash2 size={18} /></button>
        </Space>
      ) : null,
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat cost center..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {error && (
        <Alert type="error" message={`Gagal memuat: ${error}`}
          action={<Button size="small" onClick={load}>Coba Lagi</Button>} showIcon />
      )}

      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Cost Center / Departemen</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus size={20} /> Tambah Cost Center
          </Button>
        )}
      </Flex>

      <DataTable columns={columns} data={costCenters} emptyMessage="Belum ada cost center" />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Cost Center' : 'Tambah Cost Center'} size="md">
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {formError && <Alert type="error" message={formError} showIcon />}
            <Input label="Kode *" placeholder="Contoh: MKT" value={formData.code}
              onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} autoFocus />
            <Input label="Nama *" placeholder="Contoh: Marketing" value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
            <Input label="Deskripsi" type="textarea" rows={2} placeholder="Opsional"
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} />
            <Flex justify="flex-end" gap={12}>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
              <Button variant="primary" type="submit" loading={isSubmitting} disabled={isSubmitting}>
                {editingId ? 'Simpan' : 'Tambah'}
              </Button>
            </Flex>
          </Space>
        </form>
      </Modal>

      <ConfirmDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete} title="Hapus Cost Center"
        message="Hapus cost center ini? Cost center yang sudah dipakai di jurnal terposting tidak bisa dihapus."
        confirmText="Hapus" variant="danger" />
    </Space>
  )
}
```

### App.jsx — tambah lazy import + route

Cari section lazy imports dan tambahkan (setelah WarehousesPage atau sebelum routes laporan):
```js
const CostCentersPage = lazy(() => import('./pages/master/CostCentersPage'))
```

Tambahkan route di dalam `<Routes>` pada section master data:
```jsx
<Route path="/master/cost-centers" element={<CostCentersPage />} />
```

### Sidebar.jsx — tambah entry Cost Center

Temukan menu "Master Data" di sidebar. Tambahkan item baru di bawah Gudang:
```js
{ label: 'Cost Center', path: '/master/cost-centers' }
```

- [ ] **Step 1: Buat costCenterService.js** (isi lengkap di atas)
- [ ] **Step 2: Buat CostCentersPage.jsx** (isi lengkap di atas)
- [ ] **Step 3: Tambah lazy import + route di App.jsx**
- [ ] **Step 4: Tambah sidebar entry di Sidebar.jsx**
- [ ] **Step 5: Build check**
  ```bash
  cd C:\Project\apps\erp-acc\erp-app && npm run build
  ```
  Expected: exit 0
- [ ] **Step 6: Commit**
  ```bash
  git add apps/erp-acc/erp-app/src/services/costCenterService.js
  git add apps/erp-acc/erp-app/src/pages/master/CostCentersPage.jsx
  git add apps/erp-acc/erp-app/src/App.jsx
  git add apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
  git commit -m "feat(erp-acc): add CostCentersPage master data with service, routing, and sidebar"
  ```

---

## Task 4 (Codex): Modify ManualJournalFormPage — Add Cost Center per Line

**Files:**
- Modify: `src/pages/accounting/ManualJournalFormPage.jsx`
- Modify: `src/services/journalService.js`

**Context tentang ManualJournalFormPage.jsx (BACA DULU sebelum edit):**

File ada di `src/pages/accounting/ManualJournalFormPage.jsx`. Halaman ini berisi form jurnal manual dengan baris-baris double-entry.

State items berupa array: `[{ _key, coa_id, description, debit, credit }, ...]`

Fungsi `emptyRow()` di baris 17:
```js
const emptyRow = () => ({ _key: Date.now() + Math.random(), coa_id: '', description: '', debit: '', credit: '' })
```

Fungsi `updateItem(idx, key, value)` di baris 70 mengupdate field individual per baris.

Tabel items di render mulai baris ~207 — kolom: Akun (COA), Keterangan, Debit, Kredit, [hapus].

Ketika load jurnal lama (baris ~48), items dibuild dari `j.journal_items`:
```js
setItems(j.journal_items.map(i => ({
  _key: i.id,
  coa_id: i.coa_id,
  ...
})))
```

Ketika save (baris ~87), items difilter dan dikirim ke `saveManualJournal(header, validItems)`.

**Perubahan yang diperlukan:**

1. Tambah `cost_center_id: ''` ke `emptyRow()`
2. Tambah `cost_center_id: i.cost_center_id || ''` saat load jurnal lama
3. Tambah kolom "Cost Center" di tabel (opsional, bisa di antara Keterangan dan Debit)
4. Tambah dropdown cost center per baris (nullable — pilihan "— Tanpa CC —")
5. Load list cost centers via `listCostCenters()` saat mount
6. Saat save: include `cost_center_id: item.cost_center_id || null` di `validItems`

**Import yang diperlukan di ManualJournalFormPage.jsx:**
```js
import { listCostCenters } from '../../services/costCenterService'
```

**State baru yang perlu ditambahkan:**
```js
const [costCenters, setCostCenters] = useState([])
```

**useEffect baru di bawah yang sudah ada:**
```js
useEffect(() => {
  listCostCenters().then(setCostCenters).catch(() => {})
}, [])
```

**Perubahan emptyRow:**
```js
const emptyRow = () => ({
  _key: Date.now() + Math.random(),
  coa_id: '',
  description: '',
  debit: '',
  credit: '',
  cost_center_id: '',
})
```

**Perubahan load jurnal lama (di dalam `.then(j => { ... })`):**
```js
setItems(j.journal_items.map(i => ({
  _key: i.id,
  coa_id: i.coa_id,
  coa_code: i.coa?.code,
  coa_name: i.coa?.name,
  description: i.description || '',
  debit: i.debit > 0 ? i.debit : '',
  credit: i.credit > 0 ? i.credit : '',
  cost_center_id: i.cost_center_id || '',
})))
```

**Perubahan handleSave — di `validItems`:**
```js
const validItems = items
  .filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
  .map(i => ({
    ...i,
    debit: round2(i.debit),
    credit: round2(i.credit),
    cost_center_id: i.cost_center_id || null,
  }))
```

**Perubahan di header tabel (tambah kolom "Cost Center"):**

Tambahkan `<th>` setelah `<th>Keterangan</th>`:
```jsx
<th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151', minWidth: 160 }}>Cost Center</th>
```

**Perubahan di body tabel — tambah `<td>` untuk cost center setelah kolom Keterangan:**
```jsx
<td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, minWidth: 160 }}>
  {readOnly ? (
    <span style={{ fontSize: 14, color: '#4b5563' }}>
      {costCenters.find(c => c.id === item.cost_center_id)?.name || '—'}
    </span>
  ) : (
    <select
      style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
      value={item.cost_center_id}
      onChange={e => updateItem(idx, 'cost_center_id', e.target.value)}
    >
      <option value="">— Tanpa CC —</option>
      {costCenters.map(cc => (
        <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
      ))}
    </select>
  )}
</td>
```

**Perubahan di `colSpan` tfoot:** `colSpan` di baris total perlu ditambah 1 karena ada kolom baru. Cari `colSpan={2}` di `<tfoot>` dan ubah menjadi `colSpan={3}`.

**Perubahan di journalService.js:**

Buka `src/services/journalService.js`, temukan fungsi `saveManualJournal`. Pastikan setiap item di payload menyertakan `cost_center_id`. Biasanya item dikirim ke RPC `save_manual_journal` via Supabase. Tambahkan `cost_center_id: item.cost_center_id ?? null` di mapping items.

Contoh: jika ada mapping seperti:
```js
items: validItems.map(item => ({
  coa_id: item.coa_id,
  description: item.description,
  debit: item.debit,
  credit: item.credit,
}))
```

Ubah menjadi:
```js
items: validItems.map(item => ({
  coa_id: item.coa_id,
  description: item.description,
  debit: item.debit,
  credit: item.credit,
  cost_center_id: item.cost_center_id ?? null,
}))
```

**PENTING:** Baca `journalService.js` dulu sebelum edit untuk memahami persis struktur payload yang dikirim.

- [ ] **Step 1: Baca journalService.js untuk pahami struktur saveManualJournal**
- [ ] **Step 2: Modifikasi ManualJournalFormPage.jsx** sesuai perubahan di atas
- [ ] **Step 3: Modifikasi journalService.js** agar cost_center_id masuk dalam payload
- [ ] **Step 4: Build check**
  ```bash
  cd C:\Project\apps\erp-acc\erp-app && npm run build
  ```
- [ ] **Step 5: Commit**
  ```bash
  git add apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx
  git add apps/erp-acc/erp-app/src/services/journalService.js
  git commit -m "feat(erp-acc): add optional cost center dropdown to manual journal line items"
  ```

---

## Task 5 (Codex): PLByCostCenterPage + Routing + Sidebar

**Files:**
- Create: `src/pages/reports/PLByCostCenterPage.jsx`
- Modify: `src/services/reportService.js` (tambah `getPLByCostCenter`)
- Modify: `src/App.jsx` (lazy import + route)
- Modify: `src/components/layout/Sidebar.jsx` (tambah entry Laporan)

**Data dari RPC `get_pl_by_cost_center(p_start_date, p_end_date)`:**
```
cost_center_id, cost_center_code, cost_center_name,
coa_type ('revenue' | 'expense'),
coa_id, coa_code, coa_name,
total_debit, total_credit, net_amount
```

**Tampilan laporan:** Group by cost center. Per cost center:
- Section PENDAPATAN: list akun revenue + total
- Section BEBAN: list akun expense + total
- Baris Laba/Rugi bersih per CC

**Pattern referensi:** `SalesReportPage.jsx` (untuk filter + Tampilkan button), `IncomeStatementPage.jsx` (untuk struktur tampilan P&L).

### Service — tambah di reportService.js

```js
export async function getPLByCostCenter(startDate, endDate) {
  const { data, error } = await supabase.rpc('get_pl_by_cost_center', {
    p_start_date: startDate,
    p_end_date:   endDate,
  })
  if (error) throw error
  return data || []
}
```

### PLByCostCenterPage.jsx

```jsx
// src/pages/reports/PLByCostCenterPage.jsx
import { useState } from 'react'
import { getPLByCostCenter } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import {
  Space, Card, Typography, Alert, Table, Divider, Row, Col, Statistic,
} from 'antd'

const { Title, Text } = Typography

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}

export default function PLByCostCenterPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getPLByCostCenter(startDate, endDate)
      setData(rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group data per cost center
  const grouped = {}
  if (data) {
    for (const row of data) {
      const key = row.cost_center_id
      if (!grouped[key]) {
        grouped[key] = {
          id: row.cost_center_id,
          code: row.cost_center_code,
          name: row.cost_center_name,
          revenue: [],
          expense: [],
        }
      }
      if (row.coa_type === 'revenue') grouped[key].revenue.push(row)
      else if (row.coa_type === 'expense') grouped[key].expense.push(row)
    }
  }

  const ccList = Object.values(grouped).sort((a, b) => a.code.localeCompare(b.code))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Laporan P&L per Cost Center</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Dari Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Text strong>Sampai Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <Button style={{ marginTop: 20 }} onClick={handleLoad} icon={<Search size={14} />} loading={loading}>
            Tampilkan
          </Button>
        </Space>
      </Card>

      {loading && <LoadingSpinner />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && !loading && ccList.length === 0 && (
        <Alert
          message="Tidak ada data P&L per cost center untuk periode ini."
          description="Pastikan jurnal sudah diposting dan memiliki cost center yang dipilih pada baris akun revenue/expense."
          type="info"
          showIcon
        />
      )}

      {data && !loading && ccList.map(cc => {
        const totalRevenue = cc.revenue.reduce((s, r) => s + Number(r.net_amount), 0)
        const totalExpense = cc.expense.reduce((s, r) => s + Number(r.net_amount), 0)
        // For expense, net_amount = debit - credit (positive = cost)
        // For revenue, net_amount = debit - credit (negative = income, because revenue normally has credit)
        // Laba = |revenue credit| - expense debit = -totalRevenue(netAmount) - totalExpense(netAmount) ... 
        // Simplified: net income = totalRevenue credit - totalExpense debit
        const totalRevenueCredit = cc.revenue.reduce((s, r) => s + Number(r.total_credit), 0)
        const totalExpenseDebit  = cc.expense.reduce((s, r) => s + Number(r.total_debit), 0)
        const netIncome = totalRevenueCredit - totalExpenseDebit

        const revenueColumns = [
          { title: 'Kode', dataIndex: 'coa_code', key: 'coa_code', width: 90, render: v => <Text type="secondary">{v}</Text> },
          { title: 'Nama Akun', dataIndex: 'coa_name', key: 'coa_name' },
          { title: 'Kredit', dataIndex: 'total_credit', key: 'total_credit', align: 'right', width: 140, render: v => formatCurrency(v) },
        ]
        const expenseColumns = [
          { title: 'Kode', dataIndex: 'coa_code', key: 'coa_code', width: 90, render: v => <Text type="secondary">{v}</Text> },
          { title: 'Nama Akun', dataIndex: 'coa_name', key: 'coa_name' },
          { title: 'Debit', dataIndex: 'total_debit', key: 'total_debit', align: 'right', width: 140, render: v => formatCurrency(v) },
        ]

        return (
          <Card
            key={cc.id}
            title={<Text strong>{cc.code} — {cc.name}</Text>}
            extra={
              <Text strong style={{ color: netIncome >= 0 ? '#16a34a' : '#dc2626', fontSize: 16 }}>
                {netIncome >= 0 ? 'Laba: ' : 'Rugi: '}{formatCurrency(Math.abs(netIncome))}
              </Text>
            }
          >
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}><Statistic title="Total Pendapatan" value={formatCurrency(totalRevenueCredit)} /></Col>
              <Col span={8}><Statistic title="Total Beban" value={formatCurrency(totalExpenseDebit)} /></Col>
              <Col span={8}>
                <Statistic
                  title={netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
                  value={formatCurrency(Math.abs(netIncome))}
                  valueStyle={{ color: netIncome >= 0 ? '#16a34a' : '#dc2626' }}
                />
              </Col>
            </Row>

            <Divider orientation="left" style={{ margin: '8px 0' }}>Pendapatan</Divider>
            <Table
              dataSource={cc.revenue}
              columns={revenueColumns}
              rowKey="coa_id"
              pagination={false}
              size="small"
              locale={{ emptyText: '—' }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={2} index={0}><Text strong>Total Pendapatan</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><Text strong type="success">{formatCurrency(totalRevenueCredit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />

            <Divider orientation="left" style={{ margin: '8px 0' }}>Beban</Divider>
            <Table
              dataSource={cc.expense}
              columns={expenseColumns}
              rowKey="coa_id"
              pagination={false}
              size="small"
              locale={{ emptyText: '—' }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={2} index={0}><Text strong>Total Beban</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><Text strong type="danger">{formatCurrency(totalExpenseDebit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        )
      })}
    </Space>
  )
}
```

### App.jsx

Tambahkan lazy import:
```js
const PLByCostCenterPage = lazy(() => import('./pages/reports/PLByCostCenterPage'))
```

Tambahkan route di section laporan:
```jsx
<Route path="/reports/pl-cost-center" element={<PLByCostCenterPage />} />
```

### Sidebar.jsx

Di section "Laporan", tambahkan entry baru (setelah Neraca Saldo atau Laporan Pembelian):
```js
{ label: 'P&L per Cost Center', path: '/reports/pl-cost-center' }
```

- [ ] **Step 1: Tambah `getPLByCostCenter` di reportService.js**
- [ ] **Step 2: Buat PLByCostCenterPage.jsx**
- [ ] **Step 3: Tambah lazy import + route di App.jsx**
- [ ] **Step 4: Tambah sidebar entry di Sidebar.jsx**
- [ ] **Step 5: Build check**
  ```bash
  cd C:\Project\apps\erp-acc\erp-app && npm run build
  ```
- [ ] **Step 6: Commit**
  ```bash
  git add apps/erp-acc/erp-app/src/services/reportService.js
  git add apps/erp-acc/erp-app/src/pages/reports/PLByCostCenterPage.jsx
  git add apps/erp-acc/erp-app/src/App.jsx
  git add apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
  git commit -m "feat(erp-acc): add P&L by cost center report page"
  ```

---

## Self-Review

1. **Spec coverage:**
   - Cost centers table ✅ (T1)
   - journal_items.cost_center_id ✅ (T1)
   - CRUD master data ✅ (T3)
   - Optional CC dropdown di journal form ✅ (T4)
   - P&L report per cost center ✅ (T5)
   - Routing + sidebar ✅ (T3, T5)

2. **Placeholder scan:** Semua code lengkap. Tidak ada TBD/TODO.

3. **Type consistency:**
   - `save_cost_center` RPC (T1) → dipanggil di `saveCostCenter()` service (T3) → params cocok: `p_id, p_code, p_name, p_description`
   - `soft_delete_cost_center` RPC (T1) → dipanggil di `softDeleteCostCenter()` (T3) → param `p_id` cocok
   - `get_pl_by_cost_center` RPC (T2) → dipanggil di `getPLByCostCenter()` (T5) → params `p_start_date, p_end_date` cocok
   - Return columns RPC T2: `cost_center_id, cost_center_code, cost_center_name, coa_type, coa_id, coa_code, coa_name, total_debit, total_credit, net_amount` — semua dipakai di PLByCostCenterPage ✅

4. **Edge case:** cost_center_id nullable di journal_items ✅ — dropdown "— Tanpa CC —" ada di T4. RPC T2 pakai INNER JOIN cost_centers — jadi baris tanpa cost center tidak masuk laporan (by design, hanya baris yang ada CC-nya yang dilaporkan).
