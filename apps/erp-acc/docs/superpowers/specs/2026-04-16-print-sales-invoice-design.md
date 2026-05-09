# Design Spec: Cetak Invoice Penjualan

**Tanggal:** 2026-04-16
**Status:** Approved
**Scope:** ERP-ACC (`erp-app/`)

---

## Ringkasan

Menambahkan fitur cetak (print browser) dan unduh PDF untuk Invoice Penjualan (Sales Invoice). Output menggunakan satu HTML template yang sama untuk kedua format. Sekaligus membuat halaman Company Settings baru untuk menyimpan identitas perusahaan yang tampil di header invoice.

---

## Keputusan Desain

| Pertanyaan | Keputusan |
|---|---|
| Invoice mana? | Sales Invoice saja |
| Output format | PDF download + Browser print (keduanya) |
| Data perusahaan | Tabel baru `company_settings` di Supabase + halaman Settings baru |
| Info perusahaan | Nama, alamat, telepon, email, NPWP, logo |
| Trigger lokasi | List view (icon per baris) + Detail/form page (tombol toolbar) |
| Akses | Semua user yang sudah login |
| Pendekatan | HTML template + CSS print (bukan jsPDF programatik) |

---

## Arsitektur

Implementasi terdiri dari tiga bagian independen:

```
Company Settings ──► InvoicePrintTemplate ──► Print Actions (UI)
(Supabase table +     (HTML + CSS murni,       (usePrintInvoice hook,
 settings page)        satu template untuk      tombol di list & form)
                       print & PDF)
```

### File Baru

| File | Tujuan |
|------|--------|
| `erp-app/src/components/shared/InvoicePrintTemplate.jsx` | Template HTML invoice |
| `erp-app/src/components/shared/InvoicePrintTemplate.css` | Style untuk print & PDF |
| `erp-app/src/hooks/usePrintInvoice.js` | Logic fetch data + trigger print/PDF |
| `erp-app/src/hooks/useCompanySettings.js` | Fetch & cache company settings |
| `erp-app/src/pages/settings/CompanySettingsPage.jsx` | Form edit info perusahaan |
| `erp-app/src/services/companySettingsService.js` | CRUD ke Supabase |

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Tambah kolom Aksi (icon print + PDF) |
| `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Tambah tombol Print + Download PDF di toolbar |
| `erp-app/src/App.jsx` | Tambah route `/settings/company`, div `#invoice-print-root` |
| `erp-app/src/components/layout/Sidebar.jsx` | Tambah menu "Pengaturan Perusahaan" |
| Supabase | Migration: tabel `company_settings` + storage bucket `company-assets` |

---

## Bagian 1: Company Settings

### Tabel Supabase: `company_settings`

```sql
CREATE TABLE company_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  address     text,
  phone       text,
  email       text,
  npwp        text,        -- format: XX.XXX.XXX.X-XXX.XXX
  logo_url    text,        -- public URL dari Supabase Storage
  updated_at  timestamptz DEFAULT now()
);

-- Seed satu baris kosong
INSERT INTO company_settings (name) VALUES ('Nama Perusahaan');
```

Tabel ini selalu punya tepat **satu baris**. Tidak ada INSERT dari aplikasi — hanya UPDATE.

### Logo Upload

- Storage bucket: `company-assets` (public)
- Path: `company-assets/logo.<ext>` — nama file tetap, lama di-overwrite
- Format diterima: PNG, JPG (max 2MB)
- `logo_url` diisi public URL dari Supabase Storage setelah upload berhasil

### Halaman `/settings/company`

Form AntD dengan field:
- **Nama Perusahaan** (required)
- **Alamat** (AntD Input.TextArea)
- **Telepon**
- **Email**
- **NPWP**
- **Logo** — preview gambar saat ini + tombol "Ganti Logo" (file input tersembunyi)

Flow simpan:
1. Jika ada file logo baru → upload ke Storage dulu → dapatkan `logo_url`
2. UPDATE `company_settings` dengan semua field termasuk `logo_url` baru (jika ada)

Akses: hanya `canWrite` (admin/staff).

---

## Bagian 2: InvoicePrintTemplate

### Struktur Visual

```
┌──────────────────────────────────────────────┐
│  [LOGO]    NAMA PERUSAHAAN                   │
│            Alamat | Telp | Email | NPWP      │
├──────────────────────────────────────────────┤
│  INVOICE PENJUALAN          No: INV-2026-001 │
│  Tanggal: 16 Apr 2026       Jatuh Tempo: ... │
├──────────────────────────────────────────────┤
│  Kepada:                                     │
│  Nama Customer                               │
├──────────────────────────────────────────────┤
│  No │ Produk    │ Qty │ Satuan │ Harga │ Total│
│  1  │ Pasir ... │ 10  │ Ton    │ 150rb │ 1,5jt│
├──────────────────────────────────────────────┤
│                          Subtotal: Rp x,xxx  │
│                          PPN 11%:  Rp   xxx  │
│                          TOTAL:    Rp x,xxx  │
├──────────────────────────────────────────────┤
│  Catatan: ...                 Status: POSTED  │
└──────────────────────────────────────────────┘
```

### Props Komponen

```jsx
<InvoicePrintTemplate
  invoice={invoice}   // data dari getSalesInvoice(id)
  company={company}   // data dari getCompanySettings()
/>
```

### Aturan Implementasi

- Gunakan **HTML + inline style** murni — tidak ada AntD components, tidak ada Tailwind
- Ini intentional: jsPDF.html() dan window.print() keduanya reliabel dengan HTML/CSS biasa
- Ukuran kertas: A4 portrait

### CSS Print (`InvoicePrintTemplate.css`)

```css
@media print {
  body > * { display: none; }
  #invoice-print-root { display: block !important; }
  @page { size: A4; margin: 20mm; }
}

.invoice-template { font-family: Arial, sans-serif; font-size: 12px; color: #000; }
.invoice-header   { display: flex; justify-content: space-between; align-items: flex-start; }
.invoice-table    { width: 100%; border-collapse: collapse; margin-top: 16px; }
.invoice-table th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px; text-align: left; }
.invoice-table td { border: 1px solid #ccc; padding: 6px; }
.invoice-total    { text-align: right; margin-top: 12px; }
```

---

## Bagian 3: Print Actions & Integrasi UI

### Hook `usePrintInvoice`

```js
// src/hooks/usePrintInvoice.js
export function usePrintInvoice() {
  const [printing, setPrinting] = useState(false)

  async function triggerPrint(invoiceId) { ... }   // window.print()
  async function triggerPDF(invoiceId) { ... }     // jsPDF.html() → doc.save()

  return { triggerPrint, triggerPDF, printing }
}
```

Fetch invoice + company settings dilakukan **on-demand** saat tombol diklik (bukan saat halaman load). Keduanya di-fetch secara paralel dengan `Promise.all`.

### Hidden Container di App.jsx

```jsx
// Di dalam komponen root / App.jsx
<div id="invoice-print-root" style={{ display: 'none' }} />
```

Hook me-render `InvoicePrintTemplate` ke div ini saat dibutuhkan, lalu membersihkannya setelah selesai.

### Nama File PDF

Format: `invoice-{invoice_number}-{tanggal}.pdf`
Contoh: `invoice-INV-2026-001-2026-04-16.pdf`

### Tombol di `SalesInvoiceFormPage.jsx` (toolbar)

```
[← Kembali]  Invoice INV-2026-001    [Simpan] [Post Invoice] [🖨 Print] [⬇ PDF]
```

- Muncul untuk semua status invoice (draft, posted, partial, paid)
- Disabled saat `printing === true`
- Visible untuk semua user yang login (tidak ada canWrite check)

### Kolom di `SalesInvoicesPage.jsx` (tabel list)

Tambah kolom **Aksi** di paling kanan:

```
... │ Total │ Dibayar │ Aksi
               [🖨] [⬇]
```

- Icon `<Printer size={16} />` untuk print, `<FileDown size={16} />` untuk PDF
- Saat baris sedang di-fetch: icon diganti `<Spin size="small" />`
- Track loading per `invoiceId` (bukan global) agar baris lain tidak terpengaruh

---

## Error Handling

- Jika `getCompanySettings()` gagal: tampilkan toast error, batalkan print
- Jika `getSalesInvoice()` gagal: tampilkan toast error, batalkan print
- Jika logo tidak ditemukan (URL rusak): sembunyikan elemen logo, lanjutkan render tanpa logo
- Jika `jsPDF.html()` timeout / error: tampilkan toast error

---

## Batasan yang Disepakati

- Fitur ini hanya untuk **Sales Invoice** — Purchase Invoice tidak termasuk dalam scope ini
- Tidak ada print preview in-app (langsung ke dialog print browser)
- Logo: hanya satu file aktif per waktu (lama di-overwrite saat upload baru)
- Tidak ada multi-bahasa: semua label dalam Bahasa Indonesia

---

## Manual Test Steps

Setelah implementasi selesai, verifikasi hal berikut:

1. Buka `/settings/company` → isi semua field → simpan → reload → data tersimpan
2. Upload logo → preview muncul → simpan → reload → logo masih tampil
3. Buka invoice penjualan yang sudah ada → klik "Print" → dialog print browser muncul dengan layout A4
4. Klik "Download PDF" → file `.pdf` terunduh, nama file sesuai format
5. Di list invoice → klik icon print pada salah satu baris → print bekerja
6. Di list invoice → klik icon PDF pada salah satu baris → PDF terunduh
7. Verifikasi header invoice memuat: nama perusahaan, alamat, telepon, email, NPWP, logo
8. Verifikasi body invoice memuat: nomor invoice, tanggal, customer, item baris, subtotal, PPN, total
9. Login sebagai viewer → tombol print/PDF tetap muncul dan berfungsi
