# Design Spec: Cetak Purchase Order

**Tanggal:** 2026-04-17
**Status:** Approved
**Scope:** ERP-ACC (`erp-app/`)

---

## Ringkasan

Menambahkan fitur cetak (print browser) dan unduh PDF untuk Purchase Order (PO). Mengikuti pola yang sama dengan fitur cetak Sales Invoice yang sudah ada. Output menggunakan satu HTML template baru (`POPrintTemplate`) yang share CSS dengan `InvoicePrintTemplate`.

---

## Keputusan Desain

| Pertanyaan | Keputusan |
|---|---|
| Output format | Print browser + PDF download (keduanya) |
| Trigger lokasi | List view (icon per baris) + Form/detail page (tombol toolbar) |
| Harga di dokumen | Ya — tampilkan harga satuan dan total per item |
| Template | File baru `POPrintTemplate.jsx`, share CSS yang sudah ada |
| Hook | File baru `usePrintPO.js`, pola sama dengan `usePrintInvoice.js` |
| Data perusahaan | Gunakan `getCompanySettings()` yang sudah ada |
| Print container | Gunakan `#invoice-print-root` yang sudah ada di App.jsx |
| Akses | Semua user yang sudah login |

---

## Arsitektur

```
getCompanySettings() ──► POPrintTemplate ──► usePrintPO (UI trigger)
getPurchaseOrder()        (HTML + CSS,         (print/PDF, loading per poId,
                           share CSS lama)      tombol di list & form)
```

### File Baru

| File | Tujuan |
|------|--------|
| `erp-app/src/components/shared/POPrintTemplate.jsx` | Template HTML dokumen PO |
| `erp-app/src/hooks/usePrintPO.js` | Logic fetch data + trigger print/PDF |

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Tambah tombol Print + Download PDF di toolbar |
| `erp-app/src/pages/purchase/PurchaseOrdersPage.jsx` | Tambah kolom Aksi (icon print + PDF per baris) |

### Yang Tidak Diubah

- `InvoicePrintTemplate.css` — dipakai ulang oleh `POPrintTemplate`
- `App.jsx` — container `#invoice-print-root` sudah ada
- `CompanySettingsPage`, `companySettingsService`, `getCompanySettings` — sudah siap

---

## Bagian 1: POPrintTemplate

### Struktur Visual

```
┌──────────────────────────────────────────────┐
│  [LOGO]    NAMA PERUSAHAAN                   │
│            Alamat | Telp | Email | NPWP      │
├──────────────────────────────────────────────┤
│  PURCHASE ORDER             No: PO-2026-001  │
│  Tanggal: 17 Apr 2026                        │
├──────────────────────────────────────────────┤
│  Kepada (Supplier):                          │
│  Nama Supplier                               │
├──────────────────────────────────────────────┤
│  No │ Produk    │ Qty │ Satuan │ Harga │ Total│
│  1  │ Pasir ... │ 10  │ Ton    │ 150rb │ 1,5jt│
├──────────────────────────────────────────────┤
│                          Subtotal: Rp x,xxx  │
│                          TOTAL:    Rp x,xxx  │
├──────────────────────────────────────────────┤
│  Catatan: ...              Status: CONFIRMED  │
└──────────────────────────────────────────────┘
```

### Perbedaan dari InvoicePrintTemplate

| Aspek | Invoice | PO |
|-------|---------|-----|
| Judul dokumen | "Invoice Penjualan" | "Purchase Order" |
| Pihak | Customer | Supplier |
| Tanggal tambahan | Jatuh Tempo | — (tidak ada) |
| Baris pajak | PPN 11% | — (tidak ada) |
| Status label | draft/posted/partial/paid | draft/confirmed/received/done |
| Nama file PDF | `invoice-{no}-{tgl}.pdf` | `po-{no}-{tgl}.pdf` |

### Props Komponen

```jsx
<POPrintTemplate
  po={po}           // data dari getPurchaseOrder(id) — termasuk items dan supplier
  company={company} // data dari getCompanySettings()
/>
```

### Status Labels & Warna

```js
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
```

### CSS

Gunakan import `InvoicePrintTemplate.css` — semua class yang dibutuhkan sudah tersedia:
- `.invoice-template`, `.invoice-header`, `.invoice-company-info`, `.invoice-company-name`
- `.invoice-company-detail`, `.invoice-logo`, `.invoice-meta`, `.invoice-table`
- `.invoice-total`, `.invoice-footer`

Tidak perlu file CSS baru.

---

## Bagian 2: Hook `usePrintPO`

### Implementasi

Pola identik dengan `usePrintInvoice.js`, hanya berbeda di:
- Import `getPurchaseOrder` dari `purchaseService`
- Import `POPrintTemplate` bukan `InvoicePrintTemplate`
- Nama file PDF: `po-{po_number}-{date}.pdf`

```js
// src/hooks/usePrintPO.js
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { jsPDF } from 'jspdf'
import { useToast } from '../components/ui/ToastContext'
import POPrintTemplate from '../components/shared/POPrintTemplate'
import { getPurchaseOrder } from '../services/purchaseService'
import { getCompanySettings } from '../services/companySettingsService'

export function usePrintPO() {
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  async function triggerPrint(poId) { ... }   // window.print()
  async function triggerPDF(poId) { ... }     // jsPDF.html() → doc.save()

  return { triggerPrint, triggerPDF, loadingIds }
}
```

Fetch PO + company settings dilakukan **on-demand** saat tombol diklik, secara paralel dengan `Promise.all`.

---

## Bagian 3: Integrasi UI

### `PurchaseOrderFormPage.jsx` — Toolbar

```
[← Kembali]  PO-2026-001    [Simpan] [Konfirmasi] [🖨 Print] [⬇ PDF]
```

- Tombol Print dan PDF muncul untuk **semua status** PO
- Disabled saat `loadingIds[id] === true`
- Visible untuk semua user yang login (tidak ada canWrite check)
- Import icon: `Printer`, `FileDown` dari `lucide-react`

### `PurchaseOrdersPage.jsx` — Kolom Aksi

Tambah kolom **Aksi** di paling kanan tabel:

```
No. PO │ Tanggal │ Supplier │ Total │ Status │ Aksi
                                             [🖨] [⬇]
```

- Icon `<Printer size={16} />` untuk print, `<FileDown size={16} />` untuk PDF
- Saat baris sedang di-fetch: tampilkan `<Spin size="small" />`
- Loading tracked per `poId` (bukan global) — baris lain tidak terpengaruh
- Visible untuk semua user yang login

---

## Error Handling

Sama dengan pola di `usePrintInvoice`:

- Jika `getPurchaseOrder()` gagal: toast error, batalkan print
- Jika `getCompanySettings()` gagal: toast error, batalkan print
- Jika logo tidak ditemukan (URL rusak): sembunyikan elemen logo, lanjutkan render
- Jika `jsPDF.html()` error: toast error

---

## Manual Test Steps

Setelah implementasi selesai, verifikasi hal berikut:

1. Buka list PO → icon print pada salah satu baris → dialog print browser muncul dengan layout A4
2. Buka list PO → icon PDF pada salah satu baris → file `po-{no}-{tgl}.pdf` terunduh
3. Buka detail PO (form page) → klik "Print" → dialog print muncul
4. Buka detail PO → klik "Download PDF" → file terunduh
5. Verifikasi header memuat info perusahaan (nama, alamat, telp, email, NPWP, logo)
6. Verifikasi body memuat: nomor PO, tanggal, nama supplier, item baris (produk, qty, satuan, harga, total), subtotal, total
7. Verifikasi tidak ada baris PPN
8. Verifikasi status label tampil dengan warna yang sesuai
9. Klik print/PDF di dua baris berbeda secara cepat → loading hanya muncul di baris yang diklik
