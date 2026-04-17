# Print Purchase Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tombol Print dan Download PDF pada halaman list dan form Purchase Order, menggunakan template HTML baru yang share CSS dengan InvoicePrintTemplate.

**Architecture:** Dua file baru (`POPrintTemplate.jsx` dan `usePrintPO.js`) ditambahkan parallel dengan yang sudah ada untuk Sales Invoice. Hook fetch data PO + company settings on-demand lalu render ke container `#invoice-print-root` yang sudah ada di App.jsx.

**Tech Stack:** React 18, jsPDF + jspdf-autotable, Lucide React icons, Ant Design (Spin), CSS bersama dari `InvoicePrintTemplate.css`

---

## File Map

| Status | File | Perubahan |
|--------|------|-----------|
| CREATE | `erp-app/src/components/shared/POPrintTemplate.jsx` | Template HTML dokumen PO |
| CREATE | `erp-app/src/hooks/usePrintPO.js` | Hook fetch + trigger print/PDF |
| MODIFY | `erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Tambah tombol Print + PDF di toolbar |
| MODIFY | `erp-app/src/pages/purchase/PurchaseOrdersPage.jsx` | Tambah kolom Aksi dengan icon Print + PDF |

---

## Task 1: Buat `POPrintTemplate.jsx`

**Files:**
- Create: `erp-app/src/components/shared/POPrintTemplate.jsx`

Komponen ini render HTML untuk dokumen PO. Tidak ada AntD, tidak ada Tailwind — hanya HTML + CSS class dari `InvoicePrintTemplate.css` yang sudah ada.

Data PO dari `getPurchaseOrder(id)` memiliki struktur:
```js
{
  po_number: 'PO-2026-001',
  date: '2026-04-17',
  status: 'draft' | 'confirmed' | 'received' | 'done',
  notes: '...',
  total: 1500000,
  supplier: { name: 'PT Supplier ABC' },
  purchase_order_items: [
    {
      product: { name: 'Pasir Beton' },
      unit: { name: 'Ton' },
      quantity: 10,
      unit_price: 150000,
      tax_amount: 0,
      total: 1500000,
    }
  ]
}
```

- [ ] **Step 1: Buat file `POPrintTemplate.jsx`**

```jsx
// erp-app/src/components/shared/POPrintTemplate.jsx
import './InvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'

const STATUS_LABELS = {
  draft:     'Draft',
  confirmed: 'Confirmed',
  received:  'Received',
  done:      'Done',
}

const STATUS_COLORS = {
  draft:     { background: '#f3f4f6', color: '#374151' },
  confirmed: { background: '#dbeafe', color: '#1d4ed8' },
  received:  { background: '#fef9c3', color: '#854d0e' },
  done:      { background: '#dcfce7', color: '#166534' },
}

export default function POPrintTemplate({ po, company }) {
  const items = po.purchase_order_items || []
  const subtotal = items.reduce(
    (acc, item) => acc + ((item.total || 0) - (item.tax_amount || 0)), 0
  )
  const grandTotal = po.total || 0
  const statusStyle = STATUS_COLORS[po.status] || STATUS_COLORS.draft

  return (
    <div className="invoice-template" style={{ padding: '24px' }}>

      {/* Header: company info + logo */}
      <div className="invoice-header">
        <div className="invoice-company-info">
          <p className="invoice-company-name">{company?.name || 'Nama Perusahaan'}</p>
          {company?.address && <p className="invoice-company-detail">{company.address}</p>}
          {company?.phone && <p className="invoice-company-detail">Telp: {company.phone}</p>}
          {company?.email && <p className="invoice-company-detail">Email: {company.email}</p>}
          {company?.npwp && <p className="invoice-company-detail">NPWP: {company.npwp}</p>}
        </div>
        {company?.logo_url && (
          <img
            src={company.logo_url}
            alt="Logo"
            className="invoice-logo"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
      </div>

      {/* Meta: judul + nomor PO + tanggal */}
      <div className="invoice-meta">
        <div className="invoice-meta-left">
          <p className="invoice-title">Purchase Order</p>
        </div>
        <div className="invoice-meta-right">
          <p className="invoice-number">{po.po_number}</p>
          <p>Tanggal: {formatDate(po.date)}</p>
        </div>
      </div>

      {/* Supplier */}
      <div className="invoice-to">
        <p className="invoice-to-label">Kepada (Supplier)</p>
        <p className="invoice-to-name">{po.supplier?.name || '—'}</p>
      </div>

      {/* Tabel item */}
      <table className="invoice-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Produk</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="center">{item.quantity}</td>
              <td className="center">{item.unit?.name || '—'}</td>
              <td className="right">{formatCurrency(item.unit_price)}</td>
              <td className="right">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="invoice-totals">
        <table className="invoice-totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
            <tr className="grand-total">
              <td>TOTAL</td>
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer: catatan + status */}
      <div className="invoice-footer">
        <div className="invoice-notes">
          {po.notes && (
            <>
              <p className="invoice-notes-label">Catatan:</p>
              <p style={{ margin: 0 }}>{po.notes}</p>
            </>
          )}
        </div>
        <span className="invoice-status-badge" style={statusStyle}>
          {STATUS_LABELS[po.status] || po.status}
        </span>
      </div>

    </div>
  )
}
```

- [ ] **Step 2: Verifikasi build tidak error**

```bash
cd erp-app && npm run build
```

Expected: build sukses tanpa error. Warning about bundle size OK — bukan error.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/shared/POPrintTemplate.jsx
git commit -m "feat: add POPrintTemplate component for purchase order printing"
```

---

## Task 2: Buat `usePrintPO.js`

**Files:**
- Create: `erp-app/src/hooks/usePrintPO.js`

Hook ini identik polanya dengan `usePrintInvoice.js`. Beda: fetch `getPurchaseOrder`, render `POPrintTemplate`, nama file PDF `po-{po_number}-{date}.pdf`.

Container `#invoice-print-root` sudah ada di App.jsx — tidak perlu diubah.

- [ ] **Step 1: Buat file `usePrintPO.js`**

```js
// erp-app/src/hooks/usePrintPO.js
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { jsPDF } from 'jspdf'
import { useToast } from '../components/ui/ToastContext'
import POPrintTemplate from '../components/shared/POPrintTemplate'
import { getPurchaseOrder } from '../services/purchaseService'
import { getCompanySettings } from '../services/companySettingsService'

// Module-level variable untuk track root React di print container
let _printRoot = null

function cleanupPrintContainer() {
  if (_printRoot) {
    try { _printRoot.unmount() } catch { /* ignore */ }
    _printRoot = null
  }
  const container = document.getElementById('invoice-print-root')
  if (container) {
    container.style.display = 'none'
    container.style.position = ''
    container.style.top = ''
    container.style.left = ''
    container.style.width = ''
  }
}

function renderToContainer(po, company) {
  cleanupPrintContainer()
  const container = document.getElementById('invoice-print-root')
  const root = createRoot(container)
  flushSync(() => {
    root.render(createElement(POPrintTemplate, { po, company }))
  })
  _printRoot = root
  return container
}

export function usePrintPO() {
  // loadingIds: { [poId]: boolean } — tracking loading per baris di list
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  function setLoading(poId, val) {
    setLoadingIds(prev => ({ ...prev, [poId]: val }))
  }

  async function triggerPrint(poId) {
    setLoading(poId, true)
    try {
      const [po, company] = await Promise.all([
        getPurchaseOrder(poId),
        getCompanySettings(),
      ])
      renderToContainer(po, company)

      const afterPrint = () => {
        cleanupPrintContainer()
        window.removeEventListener('afterprint', afterPrint)
      }
      window.addEventListener('afterprint', afterPrint)
      window.print()
    } catch (err) {
      toast.error(`Gagal mencetak: ${err.message}`)
      cleanupPrintContainer()
    } finally {
      setLoading(poId, false)
    }
  }

  async function triggerPDF(poId) {
    setLoading(poId, true)
    try {
      const [po, company] = await Promise.all([
        getPurchaseOrder(poId),
        getCompanySettings(),
      ])
      const container = renderToContainer(po, company)

      container.style.display = 'block'
      container.style.position = 'fixed'
      container.style.top = '-9999px'
      container.style.left = '0'
      container.style.width = '794px'

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      await new Promise((resolve, reject) => {
        doc.html(container, {
          x: 15,
          y: 15,
          width: 565,
          windowWidth: 794,
          html2canvas: { scale: 1, useCORS: true },
          callback: (d) => {
            try {
              const filename = `po-${po.po_number}-${po.date}.pdf`
              d.save(filename)
              resolve()
            } catch (e) {
              reject(e)
            }
          }
        })
      })
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      cleanupPrintContainer()
      setLoading(poId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
```

- [ ] **Step 2: Verifikasi build tidak error**

```bash
cd erp-app && npm run build
```

Expected: build sukses tanpa error.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/hooks/usePrintPO.js
git commit -m "feat: add usePrintPO hook for purchase order print and PDF"
```

---

## Task 3: Tambah Print/PDF ke `PurchaseOrderFormPage.jsx`

**Files:**
- Modify: `erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx`

Tambah dua tombol Print dan Download PDF di toolbar bawah form, setelah tombol Konfirmasi. Tombol muncul hanya jika `id` ada (bukan PO baru).

State PO yang diperlukan sudah ada (`po.id`, dipakai untuk `triggerPrint` dan `triggerPDF`).

- [ ] **Step 1: Tambah imports di `PurchaseOrderFormPage.jsx`**

Tambahkan di bagian import (setelah baris `import { ArrowLeft, Save, Check } from 'lucide-react'`):

```js
import { Printer, FileDown } from 'lucide-react'
import { usePrintPO } from '../../hooks/usePrintPO'
import { Spin } from 'antd'
```

- [ ] **Step 2: Inisialisasi hook di dalam komponen**

Tambahkan setelah baris `const toast = useToast()`:

```js
const { triggerPrint, triggerPDF, loadingIds } = usePrintPO()
```

- [ ] **Step 3: Tambah tombol Print dan PDF di toolbar**

Temukan blok `<Flex justify="flex-end" gap={12}>` (sekitar baris 154). Tambahkan dua tombol Print dan PDF setelah tombol Konfirmasi:

```jsx
<Flex justify="flex-end" gap={12}>
  <Button variant="secondary" onClick={() => navigate('/purchase/orders')}>
    Batal
  </Button>
  {po.status === 'draft' && canWrite && (
    <Button variant="primary" onClick={handleSave} loading={submitting}>
      <Save size={18} /> Simpan Draft
    </Button>
  )}
  {po.status === 'draft' && canPost && (
    <Button variant="primary" onClick={handleConfirm} loading={submitting}>
      <Check size={18} /> Konfirmasi
    </Button>
  )}
  {id && (
    <>
      <Button
        variant="secondary"
        onClick={() => triggerPrint(id)}
        disabled={loadingIds[id]}
      >
        {loadingIds[id] ? <Spin size="small" /> : <Printer size={18} />}
        Print
      </Button>
      <Button
        variant="secondary"
        onClick={() => triggerPDF(id)}
        disabled={loadingIds[id]}
      >
        {loadingIds[id] ? <Spin size="small" /> : <FileDown size={18} />}
        Download PDF
      </Button>
    </>
  )}
</Flex>
```

- [ ] **Step 4: Verifikasi build tidak error**

```bash
cd erp-app && npm run build
```

Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

```bash
git add erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx
git commit -m "feat: add print and PDF buttons to PurchaseOrderFormPage toolbar"
```

---

## Task 4: Tambah Kolom Aksi ke `PurchaseOrdersPage.jsx`

**Files:**
- Modify: `erp-app/src/pages/purchase/PurchaseOrdersPage.jsx`

Tambah kolom Aksi di paling kanan tabel dengan icon Print dan PDF per baris. Click pada icon tidak boleh trigger navigasi ke detail (stopPropagation).

- [ ] **Step 1: Tambah imports di `PurchaseOrdersPage.jsx`**

Tambahkan di bagian import (setelah baris `import { Plus, Search } from 'lucide-react'`):

```js
import { Printer, FileDown } from 'lucide-react'
import { Spin } from 'antd'
import { usePrintPO } from '../../hooks/usePrintPO'
```

- [ ] **Step 2: Inisialisasi hook di dalam komponen**

Tambahkan setelah baris `const { canWrite } = useAuth()`:

```js
const { triggerPrint, triggerPDF, loadingIds } = usePrintPO()
```

- [ ] **Step 3: Tambah header kolom Aksi**

Temukan baris `<th>` terakhir (Total). Tambahkan satu `<th>` Aksi setelahnya:

```jsx
<th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Total</th>
<th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
```

- [ ] **Step 4: Tambah sel Aksi di setiap baris**

Temukan `<td>` terakhir yang berisi `{formatCurrency(po.total)}`. Tambahkan sel Aksi setelahnya di dalam `filtered.map(po => ...)`:

```jsx
<td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>
  {formatCurrency(po.total)}
</td>
<td
  style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}
  onClick={e => e.stopPropagation()}
>
  {loadingIds[po.id] ? (
    <Spin size="small" />
  ) : (
    <>
      <button
        title="Print PO"
        onClick={() => triggerPrint(po.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#6b7280' }}
      >
        <Printer size={16} />
      </button>
      <button
        title="Download PDF"
        onClick={() => triggerPDF(po.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#6b7280' }}
      >
        <FileDown size={16} />
      </button>
    </>
  )}
</td>
```

- [ ] **Step 5: Verifikasi build tidak error**

```bash
cd erp-app && npm run build
```

Expected: build sukses tanpa error.

- [ ] **Step 6: Commit**

```bash
git add erp-app/src/pages/purchase/PurchaseOrdersPage.jsx
git commit -m "feat: add print and PDF action icons to PurchaseOrdersPage table"
```

---

## Manual Test Steps (setelah semua task selesai)

Lakukan di browser setelah `npm run dev` atau di production setelah deploy:

1. Buka halaman `/purchase/orders`
2. Pastikan kolom **Aksi** muncul di paling kanan tabel
3. Klik icon `🖨` pada salah satu baris → dialog print browser muncul dengan layout A4
4. Verifikasi header print memuat info perusahaan (nama, alamat, telp, email, NPWP, logo)
5. Verifikasi body memuat: "Purchase Order", nomor PO, tanggal, nama supplier, tabel item (produk, qty, satuan, harga, total), subtotal, total
6. Verifikasi **tidak ada baris PPN**
7. Tutup dialog print → baris kembali normal (tidak loading)
8. Klik icon `⬇` pada salah satu baris → file `po-{no}-{tgl}.pdf` terunduh
9. Buka detail PO (`/purchase/orders/{id}`)
10. Pastikan tombol **Print** dan **Download PDF** muncul di toolbar bawah
11. Klik **Print** → dialog print muncul, konten sama seperti di atas
12. Klik **Download PDF** → file PDF terunduh
13. Klik icon print di **dua baris berbeda secara cepat** → loading hanya muncul di baris yang diklik (bukan semua baris)
14. Buka PO baru (form kosong, belum ada `id`) → tombol Print/PDF **tidak** muncul (hanya ada saat edit PO yang sudah ada)
