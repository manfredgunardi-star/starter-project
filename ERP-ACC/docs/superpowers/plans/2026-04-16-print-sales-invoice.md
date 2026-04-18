# Print Sales Invoice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan fitur cetak (browser print) dan unduh PDF untuk Invoice Penjualan, beserta halaman Company Settings baru untuk menyimpan identitas perusahaan yang tampil di header invoice.

**Architecture:** HTML print template tunggal (`InvoicePrintTemplate.jsx`) dirender ke hidden div `#invoice-print-root`, lalu dipanggil via `window.print()` untuk cetak atau `jsPDF.html()` untuk unduh PDF. Company info diambil dari tabel baru `company_settings` di Supabase.

**Tech Stack:** React 19, Ant Design 6, jsPDF 4 + html2canvas (PDF), Supabase (table + Storage), Lucide React icons.

---

## File Map

| Status | File | Tanggung Jawab |
|--------|------|----------------|
| Baru | `erp-app/src/services/companySettingsService.js` | CRUD company_settings + logo upload ke Storage |
| Baru | `erp-app/src/hooks/useCompanySettings.js` | Fetch + cache company settings |
| Baru | `erp-app/src/pages/settings/CompanySettingsPage.jsx` | Form edit info perusahaan + logo |
| Baru | `erp-app/src/components/shared/InvoicePrintTemplate.css` | CSS print media query + style template |
| Baru | `erp-app/src/components/shared/InvoicePrintTemplate.jsx` | HTML template invoice (pure HTML + inline style) |
| Baru | `erp-app/src/hooks/usePrintInvoice.js` | Hook: fetch data, render template, trigger print/PDF |
| Modifikasi | `erp-app/src/App.jsx` | Tambah hidden div, route `/settings/company`, import |
| Modifikasi | `erp-app/src/components/layout/Sidebar.jsx` | Tambah menu "Pengaturan Perusahaan" |
| Modifikasi | `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Tombol Print + PDF di toolbar |
| Modifikasi | `erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Kolom Aksi dengan icon print + PDF |

---

## Task 1: Supabase — Buat Tabel `company_settings` + Storage Bucket

**Files:**
- Supabase SQL Editor (tidak ada file migration di repo ini — jalankan langsung di dashboard)

- [ ] **Step 1: Buka Supabase SQL Editor**

  Buka project Supabase → SQL Editor → New Query. Jalankan SQL berikut:

  ```sql
  -- Buat tabel company_settings (singleton: selalu 1 baris)
  CREATE TABLE IF NOT EXISTS company_settings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL DEFAULT 'Nama Perusahaan',
    address     text,
    phone       text,
    email       text,
    npwp        text,
    logo_url    text,
    updated_at  timestamptz DEFAULT now()
  );

  -- Enable RLS
  ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

  -- Semua user authenticated boleh baca (untuk header invoice)
  CREATE POLICY "company_settings_select" ON company_settings
    FOR SELECT TO authenticated USING (true);

  -- Hanya admin dan staff yang boleh update
  CREATE POLICY "company_settings_update" ON company_settings
    FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'staff')
      )
    );

  -- Seed satu baris default
  INSERT INTO company_settings (name)
  SELECT 'Nama Perusahaan'
  WHERE NOT EXISTS (SELECT 1 FROM company_settings);
  ```

- [ ] **Step 2: Buat Storage Bucket `company-assets`**

  Di Supabase Dashboard → Storage → New Bucket:
  - Name: `company-assets`
  - Public bucket: **YES** (centang)
  - Klik Save

- [ ] **Step 3: Set Storage Policies**

  Supabase Dashboard → Storage → company-assets → Policies → New Policy → Custom:

  Policy 1 — SELECT (semua authenticated bisa lihat):
  ```sql
  CREATE POLICY "company_assets_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'company-assets');
  ```

  Policy 2 — INSERT/UPDATE (hanya admin & staff):
  ```sql
  CREATE POLICY "company_assets_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'company-assets' AND
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'staff')
      )
    );

  CREATE POLICY "company_assets_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'company-assets' AND
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'staff')
      )
    );
  ```

- [ ] **Step 4: Verifikasi**

  Supabase → Table Editor → company_settings → pastikan ada 1 baris dengan name = 'Nama Perusahaan'.

---

## Task 2: `companySettingsService.js`

**Files:**
- Create: `erp-app/src/services/companySettingsService.js`

- [ ] **Step 1: Buat file service**

  ```js
  // erp-app/src/services/companySettingsService.js
  import { supabase } from '../lib/supabase'

  export async function getCompanySettings() {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  export async function updateCompanySettings(settings) {
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
    if (error) throw error
  }

  export async function uploadCompanyLogo(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `logo.${ext}`
    const { error } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = supabase.storage
      .from('company-assets')
      .getPublicUrl(path)
    // Bust cache dengan timestamp agar browser tidak pakai versi lama
    return `${data.publicUrl}?t=${Date.now()}`
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/src/services/companySettingsService.js
  git commit -m "feat: add companySettingsService for CRUD and logo upload"
  ```

---

## Task 3: Hook `useCompanySettings.js`

**Files:**
- Create: `erp-app/src/hooks/useCompanySettings.js`

- [ ] **Step 1: Buat hook**

  ```js
  // erp-app/src/hooks/useCompanySettings.js
  import { useState, useEffect } from 'react'
  import { getCompanySettings } from '../services/companySettingsService'

  export function useCompanySettings() {
    const [company, setCompany] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
      getCompanySettings()
        .then(setCompany)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }, [])

    return { company, loading, error, setCompany }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add erp-app/src/hooks/useCompanySettings.js
  git commit -m "feat: add useCompanySettings hook"
  ```

---

## Task 4: Halaman `CompanySettingsPage.jsx`

**Files:**
- Create: `erp-app/src/pages/settings/CompanySettingsPage.jsx`

- [ ] **Step 1: Buat halaman form**

  ```jsx
  // erp-app/src/pages/settings/CompanySettingsPage.jsx
  import { useState, useEffect, useRef } from 'react'
  import { Space, Typography, Form, Input, Card, Flex, Alert } from 'antd'
  import { useToast } from '../../components/ui/ToastContext'
  import { useCompanySettings } from '../../hooks/useCompanySettings'
  import { updateCompanySettings, uploadCompanyLogo } from '../../services/companySettingsService'
  import Button from '../../components/ui/Button'
  import LoadingSpinner from '../../components/ui/LoadingSpinner'

  const { Title } = Typography

  export default function CompanySettingsPage() {
    const toast = useToast()
    const { company, loading, error } = useCompanySettings()
    const [form] = Form.useForm()
    const [saving, setSaving] = useState(false)
    const [logoFile, setLogoFile] = useState(null)         // File object baru
    const [logoPreview, setLogoPreview] = useState(null)   // URL preview lokal
    const fileInputRef = useRef(null)

    // Isi form ketika data company berhasil dimuat
    useEffect(() => {
      if (company) {
        form.setFieldsValue({
          name: company.name || '',
          address: company.address || '',
          phone: company.phone || '',
          email: company.email || '',
          npwp: company.npwp || '',
        })
      }
    }, [company, form])

    function handleFileChange(e) {
      const file = e.target.files[0]
      if (!file) return
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
        toast.error('Format file harus PNG atau JPG')
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Ukuran file maksimal 2MB')
        return
      }
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }

    async function handleSave() {
      let values
      try {
        values = await form.validateFields()
      } catch {
        return
      }

      setSaving(true)
      try {
        let logo_url = company.logo_url || null
        if (logoFile) {
          logo_url = await uploadCompanyLogo(logoFile)
        }
        await updateCompanySettings({ id: company.id, ...values, logo_url })
        toast.success('Pengaturan perusahaan berhasil disimpan')
        setLogoFile(null)
      } catch (err) {
        toast.error(err.message)
      } finally {
        setSaving(false)
      }
    }

    if (loading) return <LoadingSpinner message="Memuat pengaturan..." />
    if (error) return <Alert type="error" message={error} />

    const currentLogo = logoPreview || company?.logo_url

    return (
      <Space direction="vertical" style={{ width: '100%' }} size={24}>
        <Flex justify="space-between" align="center">
          <Title level={3} style={{ margin: 0 }}>Pengaturan Perusahaan</Title>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Simpan
          </Button>
        </Flex>

        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              label="Nama Perusahaan"
              name="name"
              rules={[{ required: true, message: 'Nama perusahaan wajib diisi' }]}
            >
              <Input disabled={saving} />
            </Form.Item>

            <Form.Item label="Alamat" name="address">
              <Input.TextArea rows={3} disabled={saving} />
            </Form.Item>

            <Form.Item label="Telepon" name="phone">
              <Input disabled={saving} />
            </Form.Item>

            <Form.Item label="Email" name="email">
              <Input type="email" disabled={saving} />
            </Form.Item>

            <Form.Item label="NPWP" name="npwp">
              <Input placeholder="XX.XXX.XXX.X-XXX.XXX" disabled={saving} />
            </Form.Item>

            <Form.Item label="Logo Perusahaan">
              <Space direction="vertical">
                {currentLogo ? (
                  <img
                    src={currentLogo}
                    alt="Logo perusahaan"
                    style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 4 }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div style={{ width: 200, height: 80, border: '1px dashed #d1d5db', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
                    Belum ada logo
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  {currentLogo ? 'Ganti Logo' : 'Upload Logo'}
                </Button>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Format: PNG, JPG. Maks 2MB.
                </Typography.Text>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add erp-app/src/pages/settings/CompanySettingsPage.jsx
  git commit -m "feat: add CompanySettingsPage with logo upload"
  ```

---

## Task 5: `InvoicePrintTemplate` — CSS + Komponen

**Files:**
- Create: `erp-app/src/components/shared/InvoicePrintTemplate.css`
- Create: `erp-app/src/components/shared/InvoicePrintTemplate.jsx`

- [ ] **Step 1: Buat CSS**

  ```css
  /* erp-app/src/components/shared/InvoicePrintTemplate.css */

  @media print {
    body > * {
      display: none !important;
    }
    #invoice-print-root {
      display: block !important;
      position: static !important;
      top: auto !important;
      left: auto !important;
      width: auto !important;
    }
    @page {
      size: A4 portrait;
      margin: 20mm;
    }
  }

  .invoice-template {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #000;
    width: 100%;
    box-sizing: border-box;
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #1a1a1a;
  }

  .invoice-company-info { flex: 1; }
  .invoice-company-name { font-size: 18px; font-weight: bold; margin: 0 0 4px 0; }
  .invoice-company-detail { margin: 2px 0; color: #444; font-size: 11px; }

  .invoice-logo {
    max-height: 70px;
    max-width: 160px;
    object-fit: contain;
    margin-left: 24px;
  }

  .invoice-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .invoice-title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
  .invoice-meta-left p { margin: 3px 0; }
  .invoice-meta-right { text-align: right; }
  .invoice-meta-right p { margin: 3px 0; }
  .invoice-number { font-size: 14px; font-weight: bold; }

  .invoice-to {
    margin-bottom: 16px;
    padding: 10px 12px;
    background: #f8f8f8;
    border-left: 3px solid #333;
  }
  .invoice-to-label { font-size: 10px; color: #666; text-transform: uppercase; margin: 0 0 2px 0; }
  .invoice-to-name { font-weight: bold; font-size: 13px; margin: 0; }

  .invoice-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  .invoice-table th {
    background: #f0f0f0;
    border: 1px solid #ccc;
    padding: 7px 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
  }
  .invoice-table td {
    border: 1px solid #ccc;
    padding: 6px 8px;
    font-size: 11px;
    vertical-align: top;
  }
  .invoice-table td.right { text-align: right; }
  .invoice-table td.center { text-align: center; }

  .invoice-totals {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .invoice-totals-table { width: 260px; }
  .invoice-totals-table tr td { border: none; padding: 3px 8px; font-size: 12px; }
  .invoice-totals-table tr td:first-child { text-align: left; color: #555; }
  .invoice-totals-table tr td:last-child { text-align: right; font-weight: 500; }
  .invoice-totals-table .grand-total td {
    font-size: 13px;
    font-weight: bold;
    border-top: 2px solid #333;
    padding-top: 6px;
    color: #000;
  }

  .invoice-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    font-size: 11px;
    color: #555;
  }
  .invoice-notes { flex: 1; max-width: 60%; }
  .invoice-notes-label { font-weight: 600; color: #333; margin-bottom: 4px; }
  .invoice-status-badge {
    padding: 4px 12px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 12px;
    text-transform: uppercase;
  }
  ```

- [ ] **Step 2: Buat komponen template**

  ```jsx
  // erp-app/src/components/shared/InvoicePrintTemplate.jsx
  import './InvoicePrintTemplate.css'
  import { formatCurrency } from '../../utils/currency'
  import { formatDate } from '../../utils/date'

  const STATUS_LABELS = {
    draft: 'Draft',
    posted: 'Posted',
    partial: 'Sebagian Dibayar',
    paid: 'Lunas',
  }

  const STATUS_COLORS = {
    draft: { background: '#f3f4f6', color: '#374151' },
    posted: { background: '#dbeafe', color: '#1d4ed8' },
    partial: { background: '#fef9c3', color: '#854d0e' },
    paid: { background: '#dcfce7', color: '#166534' },
  }

  export default function InvoicePrintTemplate({ invoice, company }) {
    const subtotal = invoice.items.reduce(
      (acc, item) => acc + (item.total - (item.tax_amount || 0)), 0
    )
    const taxTotal = invoice.items.reduce(
      (acc, item) => acc + (item.tax_amount || 0), 0
    )
    const grandTotal = invoice.total || 0
    const statusStyle = STATUS_COLORS[invoice.status] || STATUS_COLORS.draft

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

        {/* Invoice meta: judul + nomor + tanggal */}
        <div className="invoice-meta">
          <div className="invoice-meta-left">
            <p className="invoice-title">Invoice Penjualan</p>
          </div>
          <div className="invoice-meta-right">
            <p className="invoice-number">{invoice.invoice_number}</p>
            <p>Tanggal: {formatDate(invoice.date)}</p>
            {invoice.due_date && <p>Jatuh Tempo: {formatDate(invoice.due_date)}</p>}
          </div>
        </div>

        {/* Customer */}
        <div className="invoice-to">
          <p className="invoice-to-label">Kepada</p>
          <p className="invoice-to-name">{invoice.customer?.name || '—'}</p>
        </div>

        {/* Tabel item */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: 32, textAlign: 'center' }}>No</th>
              <th>Produk</th>
              <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
              <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
              <th style={{ width: 110, textAlign: 'right' }}>Harga Satuan</th>
              <th style={{ width: 90, textAlign: 'right' }}>Pajak</th>
              <th style={{ width: 120, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className="center">{idx + 1}</td>
                <td>{item.product?.name || '—'}</td>
                <td className="center">{item.quantity}</td>
                <td className="center">{item.unit?.name || '—'}</td>
                <td className="right">{formatCurrency(item.unit_price)}</td>
                <td className="right">{formatCurrency(item.tax_amount || 0)}</td>
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
              {taxTotal > 0 && (
                <tr>
                  <td>PPN</td>
                  <td>{formatCurrency(taxTotal)}</td>
                </tr>
              )}
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
            {invoice.notes && (
              <>
                <p className="invoice-notes-label">Catatan:</p>
                <p style={{ margin: 0 }}>{invoice.notes}</p>
              </>
            )}
          </div>
          <span
            className="invoice-status-badge"
            style={statusStyle}
          >
            {STATUS_LABELS[invoice.status] || invoice.status}
          </span>
        </div>

      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add erp-app/src/components/shared/InvoicePrintTemplate.css
  git add erp-app/src/components/shared/InvoicePrintTemplate.jsx
  git commit -m "feat: add InvoicePrintTemplate component with print CSS"
  ```

---

## Task 6: Install `html2canvas` + Hook `usePrintInvoice.js`

**Files:**
- Create: `erp-app/src/hooks/usePrintInvoice.js`

- [ ] **Step 1: Install html2canvas (diperlukan oleh jsPDF.html())**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm install html2canvas
  ```

  Expected: `added 1 package` (atau similar, tanpa error).

- [ ] **Step 2: Buat hook**

  ```js
  // erp-app/src/hooks/usePrintInvoice.js
  import { useState } from 'react'
  import { createRoot } from 'react-dom/client'
  import { flushSync } from 'react-dom'
  import { createElement } from 'react'
  import { jsPDF } from 'jspdf'
  import { useToast } from '../components/ui/ToastContext'
  import InvoicePrintTemplate from '../components/shared/InvoicePrintTemplate'
  import { getSalesInvoice } from '../services/salesService'
  import { getCompanySettings } from '../services/companySettingsService'

  // Module-level variable untuk track root React yang di-render ke print container
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

  function renderToContainer(invoice, company) {
    cleanupPrintContainer()
    const container = document.getElementById('invoice-print-root')
    const root = createRoot(container)
    flushSync(() => {
      root.render(createElement(InvoicePrintTemplate, { invoice, company }))
    })
    _printRoot = root
    return container
  }

  export function usePrintInvoice() {
    // loadingIds: { [invoiceId]: boolean } — tracking loading per baris di list
    const [loadingIds, setLoadingIds] = useState({})
    const toast = useToast()

    function setLoading(invoiceId, val) {
      setLoadingIds(prev => ({ ...prev, [invoiceId]: val }))
    }

    async function triggerPrint(invoiceId) {
      setLoading(invoiceId, true)
      try {
        const [invoice, company] = await Promise.all([
          getSalesInvoice(invoiceId),
          getCompanySettings(),
        ])
        renderToContainer(invoice, company)

        // Setelah dialog print ditutup, bersihkan container
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
        setLoading(invoiceId, false)
      }
    }

    async function triggerPDF(invoiceId) {
      setLoading(invoiceId, true)
      try {
        const [invoice, company] = await Promise.all([
          getSalesInvoice(invoiceId),
          getCompanySettings(),
        ])
        const container = renderToContainer(invoice, company)

        // Tampilkan container off-screen agar html2canvas bisa mengukurnya
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
                const filename = `invoice-${invoice.invoice_number}-${invoice.date}.pdf`
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
        setLoading(invoiceId, false)
      }
    }

    return { triggerPrint, triggerPDF, loadingIds }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/package.json erp-app/package-lock.json erp-app/src/hooks/usePrintInvoice.js
  git commit -m "feat: add usePrintInvoice hook with print and PDF support"
  ```

---

## Task 7: Modifikasi `App.jsx` — Route + Hidden Div

**Files:**
- Modify: `erp-app/src/App.jsx`

- [ ] **Step 1: Tambah import CompanySettingsPage**

  Di bagian imports `// Settings`, tambahkan setelah `import UsersPage`:

  ```jsx
  import CompanySettingsPage from './pages/settings/CompanySettingsPage'
  ```

- [ ] **Step 2: Tambah route `/settings/company`**

  Di dalam blok `{/* Settings */}`, tambahkan setelah route `settings/audit-log`:

  ```jsx
  <Route path="settings/company" element={<RoleGuard require="canWrite"><CompanySettingsPage /></RoleGuard>} />
  ```

- [ ] **Step 3: Tambah hidden div `#invoice-print-root`**

  Di dalam `App()` return (setelah `<ToastProvider>` opening tag, sebelum `<AppContent />`):

  ```jsx
  export default function App() {
    return (
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <div id="invoice-print-root" style={{ display: 'none' }} />
            <AppContent />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    )
  }
  ```

- [ ] **Step 4: Build check**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm run build
  ```

  Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/src/App.jsx
  git commit -m "feat: add company settings route and invoice print container to App"
  ```

---

## Task 8: Modifikasi `Sidebar.jsx` — Menu Item

**Files:**
- Modify: `erp-app/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Ubah Settings group — tambah item + ubah minRole group**

  Temukan blok Settings group di `menuGroups` (sekitar baris 112–121) dan ubah seperti ini:

  ```js
  {
    label: 'Settings',
    icon: Settings,
    key: 'settings',
    minRole: 'write',          // diubah dari 'admin' ke 'write' agar staff bisa lihat
    items: [
      { label: 'Pengaturan Perusahaan', path: '/settings/company', minRole: 'write' },
      { label: 'Users', path: '/settings/users', minRole: 'admin' },
      { label: 'Audit Log', path: '/settings/audit-log', minRole: 'admin' },
    ]
  }
  ```

- [ ] **Step 2: Build check**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm run build
  ```

  Expected: build sukses tanpa error.

- [ ] **Step 3: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/src/components/layout/Sidebar.jsx
  git commit -m "feat: add Company Settings menu item to sidebar"
  ```

---

## Task 9: Tombol Print + PDF di `SalesInvoiceFormPage.jsx`

**Files:**
- Modify: `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`

- [ ] **Step 1: Tambah import**

  Di baris import atas file, tambahkan:

  ```jsx
  import { ArrowLeft, Save, Send, Printer, FileDown } from 'lucide-react'
  import { usePrintInvoice } from '../../hooks/usePrintInvoice'
  ```

  (Ganti baris `import { ArrowLeft, Save, Send } from 'lucide-react'` yang sudah ada.)

- [ ] **Step 2: Gunakan hook di dalam komponen**

  Di dalam `SalesInvoiceFormPage()`, setelah baris `const toast = useToast()`, tambahkan:

  ```jsx
  const { triggerPrint, triggerPDF, loadingIds } = usePrintInvoice()
  const isPrinting = loadingIds[id] || false
  ```

- [ ] **Step 3: Tambah tombol Print + PDF di toolbar**

  Di dalam blok `<Space>` yang berisi tombol Simpan/Post (sekitar baris 121–137), tambahkan dua tombol setelah tombol "Terima Pembayaran":

  ```jsx
  <Space>
    {!readOnly && canWrite && (
      <Button variant="secondary" onClick={handleSave} loading={submitting}>
        <Save size={18} /> Simpan
      </Button>
    )}
    {!isNew && header.status === 'draft' && canPost && (
      <Button variant="primary" onClick={handlePost} loading={submitting}>
        <Send size={18} /> Post Invoice
      </Button>
    )}
    {!isNew && ['posted', 'partial'].includes(header.status) && (
      <Button variant="primary" onClick={() => navigate(`/cash/payments/new?invoice=${id}`)}>
        Terima Pembayaran
      </Button>
    )}
    {!isNew && (
      <>
        <Button variant="secondary" onClick={() => triggerPrint(id)} loading={isPrinting} disabled={isPrinting}>
          <Printer size={18} /> Print
        </Button>
        <Button variant="secondary" onClick={() => triggerPDF(id)} loading={isPrinting} disabled={isPrinting}>
          <FileDown size={18} /> PDF
        </Button>
      </>
    )}
  </Space>
  ```

- [ ] **Step 4: Build check**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm run build
  ```

  Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/src/pages/sales/SalesInvoiceFormPage.jsx
  git commit -m "feat: add print and PDF buttons to SalesInvoiceFormPage toolbar"
  ```

---

## Task 10: Icon Print + PDF di `SalesInvoicesPage.jsx`

**Files:**
- Modify: `erp-app/src/pages/sales/SalesInvoicesPage.jsx`

- [ ] **Step 1: Tambah import**

  ```jsx
  import { Plus, Search, Printer, FileDown } from 'lucide-react'
  import { Spin } from 'antd'
  import { usePrintInvoice } from '../../hooks/usePrintInvoice'
  ```

  (Ganti baris `import { Plus, Search } from 'lucide-react'` yang sudah ada. Tambahkan `Spin` ke AntD import yang sudah ada.)

- [ ] **Step 2: Gunakan hook di dalam komponen**

  Di dalam `SalesInvoicesPage()`, setelah baris `const [statusFilter, setStatusFilter] = useState('')`, tambahkan:

  ```jsx
  const { triggerPrint, triggerPDF, loadingIds } = usePrintInvoice()
  ```

- [ ] **Step 3: Tambah kolom Aksi di tabel**

  Di `<thead>`, tambahkan header kolom Aksi setelah kolom "Dibayar":

  ```jsx
  <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
  ```

  Di `<tbody>`, di dalam `filtered.map(inv => ...)`, tambahkan kolom Aksi setelah kolom Dibayar:

  ```jsx
  <td
    style={{ padding: '8px 16px', textAlign: 'center' }}
    onClick={e => e.stopPropagation()}
  >
    {loadingIds[inv.id] ? (
      <Spin size="small" />
    ) : (
      <Space size={8}>
        <button
          title="Cetak"
          onClick={() => triggerPrint(inv.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
        >
          <Printer size={16} />
        </button>
        <button
          title="Unduh PDF"
          onClick={() => triggerPDF(inv.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'inline-flex', alignItems: 'center' }}
        >
          <FileDown size={16} />
        </button>
      </Space>
    )}
  </td>
  ```

  **Penting:** Tambahkan `onClick={e => e.stopPropagation()}` pada `<td>` aksi agar klik icon tidak memicu navigasi ke detail invoice.

- [ ] **Step 4: Build check**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm run build
  ```

  Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

  ```bash
  cd /c/Project/ERP-ACC
  git add erp-app/src/pages/sales/SalesInvoicesPage.jsx
  git commit -m "feat: add print and PDF action icons to SalesInvoicesPage table"
  ```

---

## Task 11: Verifikasi Manual

Jalankan dev server dan lakukan semua langkah berikut:

```bash
cd /c/Project/ERP-ACC/erp-app && npm run dev
```

- [ ] **Test 1 — Company Settings disimpan:**
  Buka `/settings/company` → isi nama, alamat, telepon, email, NPWP → klik Simpan → reload halaman → verifikasi semua field masih terisi.

- [ ] **Test 2 — Logo upload:**
  Upload file PNG/JPG di halaman Settings → preview muncul → Simpan → reload → logo masih tampil.

- [ ] **Test 3 — Print dari detail invoice:**
  Buka invoice penjualan mana pun → klik tombol "Print" → dialog print browser muncul → layout invoice terlihat di preview dengan header perusahaan, item baris, dan total.

- [ ] **Test 4 — Download PDF dari detail invoice:**
  Di halaman detail invoice yang sama → klik "PDF" → file `invoice-XXX-YYYY-MM-DD.pdf` terunduh → buka file, verifikasi konten benar.

- [ ] **Test 5 — Print dari list invoice:**
  Buka `/sales/invoices` → klik icon 🖨 pada salah satu baris → dialog print muncul → hanya baris tersebut yang dicetak (bukan semua invoice).

- [ ] **Test 6 — PDF dari list invoice:**
  Di halaman list → klik icon ⬇ pada baris yang sama → PDF terunduh dengan data invoice baris tersebut.

- [ ] **Test 7 — Konten invoice benar:**
  Verifikasi PDF/print memuat: nama perusahaan, alamat, telepon, email, NPWP, logo, nomor invoice, tanggal, jatuh tempo, nama customer, semua item baris (produk, qty, satuan, harga, pajak, total), subtotal, PPN, grand total, catatan, status.

- [ ] **Test 8 — Akses viewer:**
  Login sebagai user dengan role viewer → verifikasi tombol Print dan PDF muncul dan berfungsi di halaman list dan detail.

- [ ] **Test 9 — Sidebar visibility:**
  Login sebagai staff → verifikasi menu "Pengaturan Perusahaan" muncul di sidebar. Login sebagai viewer → verifikasi menu Settings tidak muncul sama sekali.

- [ ] **Final build:**

  ```bash
  cd /c/Project/ERP-ACC/erp-app && npm run build
  ```

  Expected: build sukses tanpa error atau warning kritis.
