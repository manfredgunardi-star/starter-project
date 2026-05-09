# Invoice Penjualan Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `InvoicePrintTemplate` menjadi tampilan profesional bergaya PDF LMJ — aksen biru, header 2-kolom, tabel navy, Terbilang, info bank, area tanda tangan.

**Architecture:** 6 perubahan independen yang dikerjakan berurutan: SQL migration → service update → CompanySettings UI → utility terbilang → CSS rewrite → JSX rewrite. Setiap task di-build dan di-verify sebelum lanjut ke berikutnya.

**Tech Stack:** React 18, Ant Design 5, CSS (print-safe), Supabase PostgreSQL, jsPDF

**Note:** Proyek ini tidak memiliki test framework. Setiap task diverifikasi dengan `npm run build` (harus exit 0). Smoke test manual ada di Task 7.

**Spec:** `docs/superpowers/specs/2026-05-04-invoice-penjualan-redesign.md`
> ⚠️ Spec menyebut tabel `companies` — **ini salah**. Tabel yang benar adalah `company_settings`.

---

## File Map

| File | Action | Task |
|---|---|---|
| `erp-app/supabase/migrations/024_company_invoice_fields.sql` | Create | Task 1 |
| `erp-app/src/services/companySettingsService.js` | Modify | Task 2 |
| `erp-app/src/pages/settings/CompanySettingsPage.jsx` | Modify | Task 3 |
| `erp-app/src/utils/terbilang.js` | Create | Task 4 |
| `erp-app/src/components/shared/InvoicePrintTemplate.css` | Rewrite | Task 5 |
| `erp-app/src/components/shared/InvoicePrintTemplate.jsx` | Rewrite | Task 6 |

---

## Task 1: SQL Migration — Tambah 5 Field ke company_settings

> **Model rekomendasi:** `haiku` — DDL sederhana, tidak ada logika bisnis.

**Files:**
- Create: `erp-app/supabase/migrations/024_company_invoice_fields.sql`

- [ ] **Step 1: Buat file migration**

Buat file baru dengan konten berikut:

```sql
-- Migration 024: Company Invoice Fields
-- Menambahkan field untuk info bank dan tanda tangan invoice

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS bank_name            text,
  ADD COLUMN IF NOT EXISTS bank_account_number  text,
  ADD COLUMN IF NOT EXISTS bank_account_name    text,
  ADD COLUMN IF NOT EXISTS signer_name          text,
  ADD COLUMN IF NOT EXISTS signer_title         text;
```

- [ ] **Step 2: Apply migration ke Supabase**

Buka Supabase dashboard → SQL Editor → paste konten migration → Run.

Verifikasi berhasil: tidak ada error, tabel `company_settings` sekarang punya 5 kolom baru.

- [ ] **Step 3: Commit**

```bash
git add erp-app/supabase/migrations/024_company_invoice_fields.sql
git commit -m "feat(db): add bank and signer fields to company_settings"
```

---

## Task 2: Update Service — Simpan 5 Field Baru

> **Model rekomendasi:** `haiku` — hanya menambahkan field ke objek update yang sudah ada.

**Files:**
- Modify: `erp-app/src/services/companySettingsService.js` (baris 16–27)

- [ ] **Step 1: Update fungsi `updateCompanySettings`**

Ganti blok `.update({...})` yang ada:

```js
// SEBELUM — baris 16-27
  const { error } = await supabase
    .from('company_settings')
    .update({
      name: settings.name,
      address: settings.address || null,
      phone: settings.phone || null,
      email: settings.email || null,
      npwp: settings.npwp || null,
      logo_url: settings.logo_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settings.id)
```

Menjadi:

```js
// SESUDAH
  const { error } = await supabase
    .from('company_settings')
    .update({
      name: settings.name,
      address: settings.address || null,
      phone: settings.phone || null,
      email: settings.email || null,
      npwp: settings.npwp || null,
      logo_url: settings.logo_url || null,
      bank_name: settings.bank_name || null,
      bank_account_number: settings.bank_account_number || null,
      bank_account_name: settings.bank_account_name || null,
      signer_name: settings.signer_name || null,
      signer_title: settings.signer_title || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settings.id)
```

- [ ] **Step 2: Verifikasi build**

```bash
cd erp-app && npm run build
```

Expected: exit 0, tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/services/companySettingsService.js
git commit -m "feat(service): save bank and signer fields in updateCompanySettings"
```

---

## Task 3: Update CompanySettingsPage — Section "Informasi Invoice"

> **Model rekomendasi:** `sonnet` — UI form dengan Ant Design, perlu memahami pola yang ada.

**Files:**
- Modify: `erp-app/src/pages/settings/CompanySettingsPage.jsx`

- [ ] **Step 1: Tambah 5 field ke `form.setFieldsValue` di `useEffect`**

Cari blok `form.setFieldsValue({...})` di dalam `useEffect` (sekitar baris 22–29).

Ganti dengan:

```js
form.setFieldsValue({
  name: company.name || '',
  address: company.address || '',
  phone: company.phone || '',
  email: company.email || '',
  npwp: company.npwp || '',
  bank_name: company.bank_name || '',
  bank_account_number: company.bank_account_number || '',
  bank_account_name: company.bank_account_name || '',
  signer_name: company.signer_name || '',
  signer_title: company.signer_title || '',
})
```

- [ ] **Step 2: Tambah Card "Informasi Invoice" setelah Card yang ada**

Cari baris `</Card>` pertama (penutup card form utama, sebelum `</Space>`), lalu tambahkan Card baru setelah baris tersebut:

```jsx
      <Card title="Informasi Invoice">
        <Form form={form} layout="vertical">
          <Form.Item label="Nama Bank" name="bank_name">
            <Input placeholder="Contoh: BCA, BRI, Mandiri" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nomor Rekening" name="bank_account_number">
            <Input placeholder="Contoh: 1234567890" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nama Pemilik Rekening" name="bank_account_name">
            <Input placeholder="Contoh: PT Nama Perusahaan" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nama Penanda Tangan Invoice" name="signer_name">
            <Input placeholder="Contoh: Aldo Liong" disabled={saving} />
          </Form.Item>

          <Form.Item label="Jabatan Penanda Tangan" name="signer_title">
            <Input placeholder="Contoh: Direktur" disabled={saving} />
          </Form.Item>
        </Form>
      </Card>
```

> ⚠️ Perhatikan: kedua Card menggunakan `form` instance yang **sama** — ini disengaja agar `handleSave` satu kali tekan menyimpan semua field sekaligus.

- [ ] **Step 3: Verifikasi build**

```bash
cd erp-app && npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages/settings/CompanySettingsPage.jsx
git commit -m "feat(ui): add invoice info section to CompanySettingsPage"
```

---

## Task 4: Buat Utility `terbilang.js`

> **Model rekomendasi:** `sonnet` — logika konversi angka ke kata-kata Indonesia, perlu test manual dengan beberapa nilai.

**Files:**
- Create: `erp-app/src/utils/terbilang.js`

- [ ] **Step 1: Buat file `terbilang.js`**

```js
// Mengkonversi angka ke kalimat Rupiah Indonesia.
// Mendukung 0 sampai 999.999.999.999 (ratusan milyar).

const SATUAN = [
  '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
  'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas',
  'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas',
]
const PULUHAN = [
  '', '', 'Dua Puluh', 'Tiga Puluh', 'Empat Puluh', 'Lima Puluh',
  'Enam Puluh', 'Tujuh Puluh', 'Delapan Puluh', 'Sembilan Puluh',
]

function ratusan(n) {
  if (n === 0) return ''
  if (n < 20) return SATUAN[n]
  if (n < 100) {
    const sisa = n % 10
    return PULUHAN[Math.floor(n / 10)] + (sisa ? ' ' + SATUAN[sisa] : '')
  }
  const ratus = Math.floor(n / 100)
  const sisa = n % 100
  const prefix = ratus === 1 ? 'Seratus' : SATUAN[ratus] + ' Ratus'
  return prefix + (sisa ? ' ' + ratusan(sisa) : '')
}

export function terbilang(angka) {
  const n = Math.floor(angka || 0)
  if (n <= 0) return 'Nol Rupiah'

  const milyar = Math.floor(n / 1_000_000_000)
  const juta   = Math.floor((n % 1_000_000_000) / 1_000_000)
  const ribu   = Math.floor((n % 1_000_000) / 1_000)
  const sisa   = n % 1_000

  const parts = []
  if (milyar) parts.push(ratusan(milyar) + ' Milyar')
  if (juta)   parts.push(ratusan(juta) + ' Juta')
  if (ribu)   parts.push(ribu === 1 ? 'Seribu' : ratusan(ribu) + ' Ribu')
  if (sisa)   parts.push(ratusan(sisa))

  return parts.join(' ') + ' Rupiah'
}
```

- [ ] **Step 2: Verifikasi manual dengan console**

Buka browser console atau Node REPL, import file dan jalankan:

```js
// Expected outputs — verifikasi semua cocok:
terbilang(0)           // "Nol Rupiah"
terbilang(1000)        // "Seribu Rupiah"
terbilang(1001)        // "Seribu Satu Rupiah"
terbilang(150000)      // "Seratus Lima Puluh Ribu Rupiah"
terbilang(11000000)    // "Sebelas Juta Rupiah"
terbilang(1831500000)  // "Satu Milyar Delapan Ratus Tiga Puluh Satu Juta Lima Ratus Ribu Rupiah"
```

- [ ] **Step 3: Verifikasi build**

```bash
cd erp-app && npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/utils/terbilang.js
git commit -m "feat(util): add terbilang — Indonesian number-to-words converter"
```

---

## Task 5: Rewrite `InvoicePrintTemplate.css`

> **Model rekomendasi:** `sonnet` — rewrite CSS penuh dengan 6 zona baru, perlu perhatian detail visual.

**Files:**
- Rewrite: `erp-app/src/components/shared/InvoicePrintTemplate.css`

- [ ] **Step 1: Ganti seluruh isi file dengan CSS baru**

```css
/* =====================================================
   Invoice Print Template — 6 Zona
   Accent: #1D4ED8 (blue-700)
   Table header: #1E293B (slate-900)
   ===================================================== */

@media print {
  body > * { display: none !important; }
  #invoice-print-root {
    display: block !important;
    position: static !important;
    top: auto !important;
    left: auto !important;
    width: auto !important;
  }
  @page { size: A4 portrait; margin: 20mm; }
}

/* === Base === */
.inv-template {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  color: #111827;
  width: 100%;
  box-sizing: border-box;
  padding: 24px;
}

/* === Zone 1: Header === */
.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
}

.inv-header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
}

.inv-logo {
  max-height: 70px;
  max-width: 120px;
  object-fit: contain;
  flex-shrink: 0;
}

.inv-company-name {
  font-size: 16px;
  font-weight: bold;
  margin: 0 0 4px 0;
  color: #111827;
}

.inv-company-detail {
  margin: 2px 0;
  color: #6B7280;
  font-size: 11px;
}

.inv-header-right {
  text-align: right;
  flex-shrink: 0;
}

.inv-title {
  font-size: 20px;
  font-weight: bold;
  text-transform: uppercase;
  color: #111827;
  margin: 0 0 8px 0;
  letter-spacing: 0.5px;
}

.inv-number {
  font-size: 13px;
  font-weight: bold;
  margin: 0 0 2px 0;
}

.inv-meta-row {
  margin: 2px 0;
  color: #374151;
  font-size: 11px;
}

.inv-divider {
  height: 2px;
  background: #1D4ED8;
  margin-bottom: 20px;
}

/* === Zone 2: Bill To === */
.inv-bill-to-section {
  margin-bottom: 20px;
}

.inv-bill-to-box {
  display: inline-block;
  min-width: 280px;
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  padding: 12px 16px;
}

.inv-section-label {
  font-size: 10px;
  font-weight: 600;
  color: #1D4ED8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 4px 0;
}

.inv-customer-name {
  font-size: 13px;
  font-weight: bold;
  margin: 0;
  color: #111827;
}

/* === Zone 3: Table === */
.inv-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 8px;
}

.inv-table thead tr {
  background: #1E293B;
  color: #FFFFFF;
}

.inv-table th {
  padding: 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #1E293B;
}

.inv-table td {
  border: 1px solid #E5E7EB;
  padding: 6px 8px;
  font-size: 11px;
  vertical-align: top;
}

.inv-table tbody tr:nth-child(even) td {
  background: #F9FAFB;
}

.inv-text-right  { text-align: right; }
.inv-text-center { text-align: center; }

/* === Zone 4: Totals === */
.inv-totals {
  display: flex;
  justify-content: flex-end;
  margin: 16px 0;
}

.inv-totals-table {
  width: 280px;
  border-collapse: collapse;
}

.inv-totals-table td {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
}

.inv-totals-table td:first-child { text-align: left;  color: #6B7280; }
.inv-totals-table td:last-child  { text-align: right; font-weight: 500; }

.inv-grand-total td {
  background: #1D4ED8;
  color: #FFFFFF !important;
  font-weight: bold;
  font-size: 13px;
  padding: 8px 10px;
}

/* === Zone 5: Terbilang === */
.inv-terbilang-box {
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 24px;
}

.inv-terbilang-text {
  font-size: 12px;
  font-weight: bold;
  color: #111827;
  margin: 4px 0 0 0;
}

/* === Zone 6: Footer === */
.inv-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-top: 16px;
  border-top: 1px solid #E5E7EB;
}

.inv-footer-left {
  flex: 1;
  max-width: 55%;
}

.inv-notes-label {
  font-weight: 600;
  color: #374151;
  font-size: 11px;
  margin: 0 0 4px 0;
}

.inv-notes-text {
  font-size: 11px;
  color: #6B7280;
  margin: 0 0 12px 0;
  white-space: pre-line;
}

.inv-bank-label {
  font-weight: 600;
  color: #374151;
  font-size: 11px;
  margin: 0 0 2px 0;
}

.inv-bank-detail {
  font-size: 11px;
  color: #374151;
  margin: 1px 0;
}

.inv-signature {
  text-align: center;
  min-width: 160px;
}

.inv-signature > p:first-child {
  font-size: 11px;
  color: #374151;
  margin: 0 0 60px 0;
}

.inv-signer-name {
  font-weight: bold;
  font-size: 12px;
  margin: 0;
  border-top: 1px solid #374151;
  padding-top: 4px;
}

.inv-signer-title {
  font-size: 11px;
  color: #6B7280;
  margin: 2px 0 0 0;
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd erp-app && npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/shared/InvoicePrintTemplate.css
git commit -m "feat(style): rewrite InvoicePrintTemplate CSS with 6-zone professional layout"
```

---

## Task 6: Rewrite `InvoicePrintTemplate.jsx`

> **Model rekomendasi:** `sonnet` — rewrite React component dengan 6 zona, conditional rendering, import terbilang.

**Files:**
- Rewrite: `erp-app/src/components/shared/InvoicePrintTemplate.jsx`
- Depends on: Task 4 (terbilang), Task 5 (CSS classes)

- [ ] **Step 1: Ganti seluruh isi file**

```jsx
import './InvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { terbilang } from '../../utils/terbilang'

export default function InvoicePrintTemplate({ invoice, company }) {
  const subtotal = invoice.items.reduce(
    (acc, item) => acc + (item.total - (item.tax_amount || 0)), 0
  )
  const taxTotal = invoice.items.reduce(
    (acc, item) => acc + (item.tax_amount || 0), 0
  )
  const grandTotal = invoice.total || 0

  return (
    <div className="inv-template">

      {/* Zone 1: Header */}
      <div className="inv-header">
        <div className="inv-header-left">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt="Logo"
              className="inv-logo"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <div>
            <p className="inv-company-name">{company?.name || 'Nama Perusahaan'}</p>
            {company?.address && <p className="inv-company-detail">{company.address}</p>}
            {company?.phone && <p className="inv-company-detail">Telp: {company.phone}</p>}
            {company?.email && <p className="inv-company-detail">Email: {company.email}</p>}
            {company?.npwp && <p className="inv-company-detail">NPWP: {company.npwp}</p>}
          </div>
        </div>
        <div className="inv-header-right">
          <p className="inv-title">Invoice Penjualan</p>
          <p className="inv-number">{invoice.invoice_number}</p>
          <p className="inv-meta-row">Tanggal: {formatDate(invoice.date)}</p>
          {invoice.due_date && (
            <p className="inv-meta-row">Jatuh Tempo: {formatDate(invoice.due_date)}</p>
          )}
        </div>
      </div>
      <div className="inv-divider" />

      {/* Zone 2: Bill To */}
      <div className="inv-bill-to-section">
        <div className="inv-bill-to-box">
          <p className="inv-section-label">Ditagihkan Kepada</p>
          <p className="inv-customer-name">{invoice.customer?.name || '—'}</p>
        </div>
      </div>

      {/* Zone 3: Table */}
      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Deskripsi</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 130, textAlign: 'right' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="inv-text-center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="inv-text-center">{item.quantity}</td>
              <td className="inv-text-center">{item.unit?.name || '—'}</td>
              <td className="inv-text-right">{formatCurrency(item.unit_price)}</td>
              <td className="inv-text-right">
                {formatCurrency(item.total - (item.tax_amount || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Zone 4: Totals */}
      <div className="inv-totals">
        <table className="inv-totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
            {taxTotal > 0 && (
              <tr>
                <td>PPN</td>
                <td>{formatCurrency(taxTotal)}</td>
              </tr>
            )}
            <tr className="inv-grand-total">
              <td>Grand Total</td>
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Zone 5: Terbilang */}
      <div className="inv-terbilang-box">
        <p className="inv-section-label">Terbilang</p>
        <p className="inv-terbilang-text">{terbilang(Math.round(grandTotal))}</p>
      </div>

      {/* Zone 6: Footer */}
      <div className="inv-footer">
        <div className="inv-footer-left">
          {invoice.notes && (
            <div>
              <p className="inv-notes-label">Catatan Pembayaran</p>
              <p className="inv-notes-text">{invoice.notes}</p>
            </div>
          )}
          {company?.bank_name && (
            <div style={{ marginTop: invoice.notes ? 12 : 0 }}>
              <p className="inv-bank-label">Transfer ke:</p>
              <p className="inv-bank-detail">
                {company.bank_name}
                {company.bank_account_number ? ` – ${company.bank_account_number}` : ''}
              </p>
              {company.bank_account_name && (
                <p className="inv-bank-detail">a.n. {company.bank_account_name}</p>
              )}
            </div>
          )}
        </div>
        {company?.signer_name && (
          <div className="inv-signature">
            <p>Hormat kami,</p>
            <p className="inv-signer-name">{company.signer_name}</p>
            {company.signer_title && (
              <p className="inv-signer-title">{company.signer_title}</p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd erp-app && npm run build
```

Expected: exit 0, tidak ada error atau warning tentang import terbilang.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/shared/InvoicePrintTemplate.jsx
git commit -m "feat(ui): redesign InvoicePrintTemplate — professional LMJ-style layout"
```

---

## Task 7: Smoke Test Manual

> **Model rekomendasi:** `sonnet` — navigasi browser, verifikasi visual.

Jalankan dev server:

```bash
cd erp-app && npm run dev
```

### Checklist Smoke Test

**A. Setup data Company Settings**

- [ ] Buka app → Settings → Pengaturan Perusahaan
- [ ] Isi section "Informasi Invoice":
  - Nama Bank: `BCA`
  - Nomor Rekening: `1234567890`
  - Nama Pemilik Rekening: `PT Test Perusahaan`
  - Nama Penanda Tangan: `John Doe`
  - Jabatan: `Direktur`
- [ ] Klik Simpan → verifikasi toast "Pengaturan perusahaan berhasil disimpan"

**B. Verifikasi invoice print**

- [ ] Buka halaman Sales Invoice → pilih invoice yang sudah ada (atau buat baru)
- [ ] Klik tombol Print atau Download PDF
- [ ] Verifikasi **Zone 1 (Header)**:
  - Logo di kiri (jika ada), nama perusahaan di bawah logo
  - "INVOICE PENJUALAN" tampil besar dan bold di kanan
  - Nomor invoice, tanggal, jatuh tempo di kanan bawah judul
- [ ] Verifikasi **garis biru** tebal memisahkan header dari body
- [ ] Verifikasi **Zone 2 (Bill To)**:
  - Kotak dengan border, label "DITAGIHKAN KEPADA" berwarna biru
  - Nama customer bold di dalam kotak
- [ ] Verifikasi **Zone 3 (Tabel)**:
  - Header tabel background navy gelap (`#1E293B`), teks putih
  - Kolom: No, Deskripsi, Qty, Satuan, Harga Satuan, Jumlah (tidak ada kolom Pajak)
  - Baris genap background abu-abu sangat muda
- [ ] Verifikasi **Zone 4 (Totals)**:
  - Subtotal dan PPN (jika ada) tampil normal
  - Baris "Grand Total" background biru dengan teks putih bold
- [ ] Verifikasi **Zone 5 (Terbilang)**:
  - Kotak border muncul di bawah totals
  - Label "TERBILANG" berwarna biru uppercase
  - Kalimat angka dalam Rupiah Indonesia tampil bold dan akurat
- [ ] Verifikasi **Zone 6 (Footer)**:
  - Kiri: info bank ("Transfer ke: BCA – 1234567890" dan "a.n. PT Test Perusahaan")
  - Kanan: "Hormat kami," diikuti spasi kosong untuk tanda tangan, lalu nama dan jabatan

**C. Verifikasi edge cases**

- [ ] Buat invoice **tanpa jatuh tempo** → baris "Jatuh Tempo" tidak muncul di header
- [ ] Buat invoice **tanpa notes** → section "Catatan Pembayaran" tidak muncul
- [ ] Hapus `bank_name` dari Company Settings → blok info bank tidak muncul di footer
- [ ] Hapus `signer_name` dari Company Settings → area tanda tangan tidak muncul
- [ ] Invoice dengan item **tanpa PPN** → baris PPN di totals tidak muncul

**D. Final commit jika semua OK**

```bash
git add -A
git commit -m "feat: professional invoice penjualan redesign complete

- 6-zone layout: header, bill-to, table, totals, terbilang, footer
- Blue accent (#1D4ED8), navy table header, Grand Total highlight
- terbilang utility for Indonesian number-to-words
- Bank info and signature area in footer (configurable via Company Settings)"
```
