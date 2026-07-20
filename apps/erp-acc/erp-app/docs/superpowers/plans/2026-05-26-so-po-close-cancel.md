# SO/PO Close & Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan kemampuan menutup (close) dan membatalkan (cancel) Sales Order dan Purchase Order yang belum atau baru sebagian terpenuhi, agar operasional tidak terkunci oleh order yang sudah tidak relevan.

**Architecture:** Dua status baru (`closed`, `cancelled`) ditambahkan ke CHECK constraint di DB. Empat Supabase RPC (`close_sales_order`, `cancel_sales_order`, `close_purchase_order`, `cancel_purchase_order`) menangani validasi dan transisi status secara server-side. JS service functions memanggil RPC ini. Form page menampilkan tombol Close/Cancel dengan konfirmasi modal.

**Business rules:**
- **Cancel:** Hanya untuk status `draft` atau `confirmed`. Tidak boleh ada GD/GR/Invoice yang sudah diposting (status != 'draft') yang terhubung ke order tersebut.
- **Close:** Hanya untuk status `confirmed`. Force-close tanpa syarat tambahan — digunakan saat order hanya sebagian terpenuhi dan tidak akan dilanjutkan.
- **Done:** Status ini tetap di-set otomatis oleh sistem (sudah ada), tidak berubah.

**Tech Stack:** React 19, Ant Design 6, Supabase (PostgreSQL SECURITY DEFINER RPCs), Vite 8.

---

## Model & Effort

| Task | Model | Estimasi |
|------|-------|----------|
| T1: StatusBadge + list page filter updates | **Claude Haiku** (mekanis, 2 file, isolated) | ~15 menit |
| T2: SQL migration — constraint + 4 RPCs | **Codex GPT-5.5** (SQL murni, spec lengkap di bawah) | ~20 menit |
| T3: salesService.js — closeSalesOrder + cancelSalesOrder | **Claude Haiku** (mekanis, 1 file) | ~10 menit |
| T4: purchaseService.js — closePurchaseOrder + cancelPurchaseOrder | **Claude Haiku** (mekanis, 1 file) | ~10 menit |
| T5: Form pages UI — Close/Cancel buttons + Modal.confirm | **Claude Sonnet** (multi-file, judgment needed) | ~30 menit |

**Total Claude tasks sebelum Codex:** T1 saja.  
**Keyword setelah Codex T2 selesai:** `lanjut so-po close cancel integrasi`

---

## File Map

| File | Aksi | Task |
|------|------|------|
| `src/components/ui/StatusBadge.jsx` | Modify — tambah `closed` | T1 |
| `src/pages/sales/SalesOrdersPage.jsx` | Modify — tambah opsi filter | T1 |
| `src/pages/purchase/PurchaseOrdersPage.jsx` | Modify — tambah opsi filter + STATUS_COLOR | T1 |
| `migrations/006_close_cancel_orders.sql` | Create — Codex | T2 |
| `src/services/salesService.js` | Modify — 2 fungsi baru | T3 |
| `src/services/purchaseService.js` | Modify — 2 fungsi baru | T4 |
| `src/pages/sales/SalesOrderFormPage.jsx` | Modify — 2 tombol + handlers | T5 |
| `src/pages/purchase/PurchaseOrderFormPage.jsx` | Modify — 2 tombol + handlers | T5 |

---

## Task 1: StatusBadge + List Page Filter Updates

**Model:** Claude Haiku  
**Files:**
- Modify: `src/components/ui/StatusBadge.jsx`
- Modify: `src/pages/sales/SalesOrdersPage.jsx`
- Modify: `src/pages/purchase/PurchaseOrdersPage.jsx`

- [ ] **Step 1: Tambah status `closed` ke StatusBadge**

File: `src/components/ui/StatusBadge.jsx`

Ganti isi `statusConfig`:

```js
const statusConfig = {
  draft:     { color: 'default', label: 'Draft' },
  posted:    { color: 'success', label: 'Posted' },
  confirmed: { color: 'blue',    label: 'Confirmed' },
  paid:      { color: 'blue',    label: 'Paid' },
  partial:   { color: 'warning', label: 'Partial' },
  pending:   { color: 'orange',  label: 'Pending' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error',   label: 'Cancelled' },
  closed:    { color: 'default', label: 'Closed' },
}
```

- [ ] **Step 2: Tambah opsi filter di SalesOrdersPage**

File: `src/pages/sales/SalesOrdersPage.jsx`

Cari blok `<select>` filter status (sekitar baris 56). Tambahkan dua opsi baru setelah `<option value="done">Done</option>`:

```jsx
          <option value="done">Done</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
```

- [ ] **Step 3: Tambah opsi filter + STATUS_COLOR di PurchaseOrdersPage**

File: `src/pages/purchase/PurchaseOrdersPage.jsx`

Update `STATUS_COLOR` map (baris 13–18):

```js
const STATUS_COLOR = {
  draft:     'default',
  confirmed: 'blue',
  received:  'gold',
  done:      'success',
  closed:    'default',
  cancelled: 'error',
}
```

Tambah opsi filter setelah `<option value="done">Done</option>`:

```jsx
          <option value="done">Done</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
```

- [ ] **Step 4: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/ui/StatusBadge.jsx \
        apps/erp-acc/erp-app/src/pages/sales/SalesOrdersPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrdersPage.jsx
git commit -m "feat(erp-acc): add closed/cancelled status to SO/PO badges and filters"
```

---

## Task 2: SQL Migration — Constraint Update + 4 RPCs

> **Assigned to: Codex (GPT-5.5/5.4)**  
> **Keyword untuk melanjutkan setelah Codex selesai:** `lanjut so-po close cancel integrasi`

**File yang harus dibuat:** `apps/erp-acc/erp-app/migrations/006_close_cancel_orders.sql`

**Full path untuk Codex:** `C:\Project\apps\erp-acc\erp-app\migrations\006_close_cancel_orders.sql`

### Context Database (dari introspeksi live DB)

```
Tabel sales_orders:
  - id uuid PK
  - so_number text
  - status text DEFAULT 'draft'
  - CHECK constraint "sales_orders_status_check": status IN ('draft','confirmed','invoiced','done')

Tabel purchase_orders:
  - id uuid PK
  - po_number text
  - status text DEFAULT 'draft'
  - CHECK constraint "purchase_orders_status_check": status IN ('draft','confirmed','received','done')

Tabel goods_deliveries:
  - id uuid, sales_order_id uuid FK, status text

Tabel goods_receipts:
  - id uuid, purchase_order_id uuid FK, status text

Tabel invoices:
  - id uuid, sales_order_id uuid FK nullable, purchase_order_id uuid FK nullable
  - type text ('sales'|'purchase'), status text

Helper functions sudah ada:
  - is_admin_or_staff() RETURNS boolean
```

### Spec SQL yang harus ditulis

**Bagian 1: Update CHECK constraints**

```sql
-- Drop dan recreate constraint sales_orders
ALTER TABLE public.sales_orders
  DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status = ANY (ARRAY['draft','confirmed','invoiced','done','closed','cancelled']));

-- Drop dan recreate constraint purchase_orders
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['draft','confirmed','received','done','closed','cancelled']));
```

**Bagian 2: cancel_sales_order RPC**

Signature: `cancel_sales_order(p_so_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`

Logic:
1. `IF NOT is_admin_or_staff() THEN RAISE EXCEPTION 'permission denied'`
2. Cek SO ada dan `status IN ('draft','confirmed')` — jika tidak: `RAISE EXCEPTION 'Sales order tidak dapat dibatalkan (status tidak valid)'`
3. Cek tidak ada `goods_deliveries` dengan `sales_order_id = p_so_id AND status != 'draft'` — jika ada: `RAISE EXCEPTION 'Tidak dapat dibatalkan: ada pengiriman barang yang sudah diposting'`
4. Cek tidak ada `invoices` dengan `sales_order_id = p_so_id AND type = ''sales'' AND status != ''draft''` — jika ada: `RAISE EXCEPTION 'Tidak dapat dibatalkan: ada invoice yang sudah diposting'`
5. `UPDATE sales_orders SET status = 'cancelled' WHERE id = p_so_id`

**Bagian 3: close_sales_order RPC**

Signature: `close_sales_order(p_so_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`

Logic:
1. `IF NOT is_admin_or_staff() THEN RAISE EXCEPTION 'permission denied'`
2. Cek SO ada dan `status = 'confirmed'` — jika tidak: `RAISE EXCEPTION 'Sales order tidak dapat ditutup (harus berstatus confirmed)'`
3. `UPDATE sales_orders SET status = 'closed' WHERE id = p_so_id`

**Bagian 4: cancel_purchase_order RPC**

Signature: `cancel_purchase_order(p_po_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`

Logic (sama dengan cancel_sales_order tapi untuk purchase):
1. `IF NOT is_admin_or_staff() THEN RAISE EXCEPTION 'permission denied'`
2. Cek PO ada dan `status IN ('draft','confirmed')` — jika tidak: RAISE EXCEPTION
3. Cek tidak ada `goods_receipts` dengan `purchase_order_id = p_po_id AND status != 'draft'`
4. Cek tidak ada `invoices` dengan `purchase_order_id = p_po_id AND type = 'purchase' AND status != 'draft'`
5. `UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id`

**Bagian 5: close_purchase_order RPC**

Signature: `close_purchase_order(p_po_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`

Logic:
1. `IF NOT is_admin_or_staff() THEN RAISE EXCEPTION 'permission denied'`
2. Cek PO ada dan `status = 'confirmed'`
3. `UPDATE purchase_orders SET status = 'closed' WHERE id = p_po_id`

**GRANT yang diperlukan (semua 4 function):**
```sql
GRANT EXECUTE ON FUNCTION public.cancel_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sales_order(uuid) TO service_role;
-- (ulangi untuk close_sales_order, cancel_purchase_order, close_purchase_order)
```

---

## Task 3: salesService.js — Tambah close/cancel Functions

> **Jalankan SETELAH Task 2 (Codex SQL) selesai dan migration di-apply ke Supabase.**

**Model:** Claude Haiku  
**Files:**
- Modify: `src/services/salesService.js`

- [ ] **Step 1: Tambah dua fungsi di akhir salesService.js**

Tambahkan setelah fungsi `getOutstandingInvoices` (baris terakhir file):

```js
export async function closeSalesOrder(id) {
  const { error } = await supabase.rpc('close_sales_order', { p_so_id: id })
  if (error) throw error
}

export async function cancelSalesOrder(id) {
  const { error } = await supabase.rpc('cancel_sales_order', { p_so_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(erp-acc): add closeSalesOrder and cancelSalesOrder service functions"
```

---

## Task 4: purchaseService.js — Tambah close/cancel Functions

> **Jalankan SETELAH Task 2 (Codex SQL) selesai dan migration di-apply ke Supabase.**

**Model:** Claude Haiku  
**Files:**
- Modify: `src/services/purchaseService.js`

- [ ] **Step 1: Tambah dua fungsi di akhir purchaseService.js**

Tambahkan setelah fungsi `confirmPurchaseOrder` (baris terakhir file):

```js
export async function closePurchaseOrder(id) {
  const { error } = await supabase.rpc('close_purchase_order', { p_po_id: id })
  if (error) throw error
}

export async function cancelPurchaseOrder(id) {
  const { error } = await supabase.rpc('cancel_purchase_order', { p_po_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "feat(erp-acc): add closePurchaseOrder and cancelPurchaseOrder service functions"
```

---

## Task 5: Form Pages — Close/Cancel Buttons + Modal.confirm

> **Jalankan SETELAH Task 3 dan Task 4 selesai.**

**Model:** Claude Sonnet  
**Files:**
- Modify: `src/pages/sales/SalesOrderFormPage.jsx`
- Modify: `src/pages/purchase/PurchaseOrderFormPage.jsx`

### SalesOrderFormPage.jsx

- [ ] **Step 1: Tambah import**

Tambahkan `Modal` ke import AntD dan tambahkan dua fungsi service baru:

```js
// Ganti baris import antd yang ada:
import { Space, Flex, Typography, Col } from 'antd'
// Menjadi:
import { Space, Flex, Typography, Col, Modal } from 'antd'

// Ganti baris import salesService yang ada:
import { getSalesOrder, saveSalesOrder, confirmSalesOrder } from '../../services/salesService'
// Menjadi:
import { getSalesOrder, saveSalesOrder, confirmSalesOrder, closeSalesOrder, cancelSalesOrder } from '../../services/salesService'

// Ganti baris import lucide yang ada:
import { ArrowLeft, Save, CheckCircle, Truck } from 'lucide-react'
// Menjadi:
import { ArrowLeft, Save, CheckCircle, Truck, Archive, XCircle } from 'lucide-react'
```

- [ ] **Step 2: Tambah handler `handleCloseOrder` dan `handleCancelOrder`**

Tambahkan dua fungsi ini setelah fungsi `handleConfirm` yang ada:

```js
  const handleCloseOrder = () => {
    Modal.confirm({
      title: 'Tutup Sales Order?',
      content: 'Menutup SO berarti tidak ada lagi pengiriman yang akan dibuat dari order ini. Tindakan ini tidak dapat dibatalkan.',
      okText: 'Ya, Tutup',
      cancelText: 'Batal',
      onOk: async () => {
        setSubmitting(true)
        try {
          await closeSalesOrder(id)
          toast.success('Sales Order berhasil ditutup')
          setHeader(h => ({ ...h, status: 'closed' }))
        } catch (err) {
          toast.error(err.message)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const handleCancelOrder = () => {
    Modal.confirm({
      title: 'Batalkan Sales Order?',
      content: 'SO yang dibatalkan tidak dapat diubah kembali. Pengiriman dan invoice yang masih draft akan tetap ada.',
      okText: 'Ya, Batalkan',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        setSubmitting(true)
        try {
          await cancelSalesOrder(id)
          toast.success('Sales Order berhasil dibatalkan')
          setHeader(h => ({ ...h, status: 'cancelled' }))
        } catch (err) {
          toast.error(err.message)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }
```

- [ ] **Step 3: Tambah tombol di JSX**

Di dalam blok `<Space>` yang berisi tombol-tombol aksi (setelah tombol "Buat Invoice"), tambahkan dua tombol baru:

```jsx
          {!isNew && header.status === 'confirmed' && canPost && (
            <Button variant="secondary" onClick={handleCloseOrder} loading={submitting}>
              <Archive size={18} /> Tutup SO
            </Button>
          )}
          {!isNew && ['draft', 'confirmed'].includes(header.status) && canPost && (
            <Button variant="secondary" onClick={handleCancelOrder} loading={submitting}>
              <XCircle size={18} /> Batalkan
            </Button>
          )}
```

### PurchaseOrderFormPage.jsx

- [ ] **Step 4: Tambah import di PurchaseOrderFormPage**

```js
// Tambahkan Modal ke import AntD yang ada:
import { Space, Flex, Typography, Card, Alert, Spin, Col } from 'antd'
// Menjadi:
import { Space, Flex, Typography, Card, Alert, Spin, Col, Modal } from 'antd'

// Tambahkan dua fungsi ke import purchaseService:
import { savePurchaseOrder, getPurchaseOrder, confirmPurchaseOrder } from '../../services/purchaseService'
// Menjadi:
import { savePurchaseOrder, getPurchaseOrder, confirmPurchaseOrder, closePurchaseOrder, cancelPurchaseOrder } from '../../services/purchaseService'

// Tambahkan ikon ke import lucide:
import { ArrowLeft, Save, Check, Printer, FileDown, ClipboardList } from 'lucide-react'
// Menjadi:
import { ArrowLeft, Save, Check, Printer, FileDown, ClipboardList, Archive, XCircle } from 'lucide-react'
```

- [ ] **Step 5: Tambah handler di PurchaseOrderFormPage**

Cari fungsi `handleConfirm` (atau fungsi confirm yang ada) di PurchaseOrderFormPage. Tambahkan dua fungsi berikut setelah fungsi confirm:

```js
  const handleCloseOrder = () => {
    Modal.confirm({
      title: 'Tutup Purchase Order?',
      content: 'Menutup PO berarti tidak ada lagi penerimaan barang yang akan dibuat dari order ini. Tindakan ini tidak dapat dibatalkan.',
      okText: 'Ya, Tutup',
      cancelText: 'Batal',
      onOk: async () => {
        setSubmitting(true)
        try {
          await closePurchaseOrder(id)
          toast.success('Purchase Order berhasil ditutup')
          setPO(prev => ({ ...prev, status: 'closed' }))
        } catch (err) {
          toast.error(err.message)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const handleCancelOrder = () => {
    Modal.confirm({
      title: 'Batalkan Purchase Order?',
      content: 'PO yang dibatalkan tidak dapat diubah kembali. Penerimaan barang dan invoice yang masih draft akan tetap ada.',
      okText: 'Ya, Batalkan',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        setSubmitting(true)
        try {
          await cancelPurchaseOrder(id)
          toast.success('Purchase Order berhasil dibatalkan')
          setPO(prev => ({ ...prev, status: 'cancelled' }))
        } catch (err) {
          toast.error(err.message)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }
```

> **Catatan:** PurchaseOrderFormPage menggunakan state `po` (object) untuk header, bukan `header` seperti SalesOrderFormPage. Pastikan `setPO(prev => ({ ...prev, status: '...' }))` mengacu pada setter state yang benar. Baca file dulu untuk konfirmasi nama state variable-nya.

- [ ] **Step 6: Tambah tombol di JSX PurchaseOrderFormPage**

Cari blok `<Space>` atau `<Flex>` yang berisi tombol-tombol aksi di bagian atas form. Tambahkan dua tombol setelah tombol confirm/existing action buttons:

```jsx
          {po?.status === 'confirmed' && canPost && (
            <Button variant="secondary" onClick={handleCloseOrder} loading={submitting}>
              <Archive size={18} /> Tutup PO
            </Button>
          )}
          {po && ['draft', 'confirmed'].includes(po.status) && canPost && (
            <Button variant="secondary" onClick={handleCancelOrder} loading={submitting}>
              <XCircle size={18} /> Batalkan
            </Button>
          )}
```

- [ ] **Step 7: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error. Jika ada error `Cannot find module`, cek nama fungsi import cocok dengan yang di-export di service files.

- [ ] **Step 8: Smoke test manual**

```bash
npm run dev
```

1. Buka SO yang berstatus `confirmed` → tombol "Tutup SO" dan "Batalkan" harus muncul
2. Klik "Tutup SO" → modal konfirmasi muncul → klik "Ya, Tutup" → status berubah ke "Closed"
3. Buka SO yang berstatus `draft` → hanya "Batalkan" yang muncul, "Tutup SO" tidak muncul
4. SO berstatus `cancelled`/`closed`/`done` → tidak ada tombol close/cancel

- [ ] **Step 9: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx
git commit -m "feat(erp-acc): add Close/Cancel buttons to SO and PO form pages"
```

---

## Self-Review

**Spec coverage:**
- ✅ Cancel SO/PO — T2 RPC + T3/T4 service + T5 UI
- ✅ Close SO/PO — T2 RPC + T3/T4 service + T5 UI
- ✅ Status `closed`/`cancelled` tampil di list — T1 StatusBadge + filter
- ✅ Validasi server-side: tidak bisa cancel jika ada GD/GR/invoice yang diposting — T2 RPC
- ✅ Konfirmasi sebelum aksi — T5 Modal.confirm
- ✅ Error dari RPC ditampilkan ke user — T5 `toast.error(err.message)`
- ✅ State UI terupdate tanpa reload — T5 `setHeader`/`setPO`

**Placeholder scan:** Tidak ada TBD, TODO, atau "implement later".

**Type consistency:**
- `closeSalesOrder(id)` — didefinisikan T3, dipakai T5 ✅
- `cancelSalesOrder(id)` — didefinisikan T3, dipakai T5 ✅
- `closePurchaseOrder(id)` — didefinisikan T4, dipakai T5 ✅
- `cancelPurchaseOrder(id)` — didefinisikan T4, dipakai T5 ✅
- RPC names: `close_sales_order`, `cancel_sales_order`, `close_purchase_order`, `cancel_purchase_order` — konsisten antara T2 dan T3/T4
