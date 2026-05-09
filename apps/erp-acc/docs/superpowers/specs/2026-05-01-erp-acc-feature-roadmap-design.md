# ERP-ACC Feature Roadmap PRD
**Date:** 2026-05-01  
**Project:** ERP-ACC (erp-app/)  
**Status:** Approved

---

## Context

ERP-ACC adalah full-featured accounting ERP berbasis React 19 + Supabase/PostgreSQL, dengan 14 database migrations yang mencakup modul: Sales (SO/GD/Invoice), Purchase (PO/GR/Invoice), Inventory, Fixed Assets, Accounting/GL, Cash/Bank, dan Financial Reports. App ini digunakan internal dan sedang dikembangkan sebagai produk SaaS untuk UKM Indonesia.

Research terhadap tools open source sejenis (ERPNext, BigCapital, Dolibarr, Tryton, Invoice Ninja, hledger, Beancount, python-accounting, dll.) mengidentifikasi beberapa gap di area automation dan workflow. Roadmap ini memprioritaskan **automation wins** terlebih dahulu untuk memberikan nilai langsung kepada user, sebelum compliance dan fitur analitis.

---

## Open Source Landscape Reference

| Kategori | Tool | Lisensi | Relevansi untuk ERP-ACC |
|---|---|---|---|
| Full ERP | ERPNext / Frappe | AGPL-3.0 | Referensi fitur lengkap; pendekatan recurring + cost centers |
| Cloud ERP | BigCapital | AGPL-3.0 | Stack Node.js/React modern; referensi API design |
| Desktop Accounting | Frappe Books | AGPL-3.0 | Pendekatan offline + recurring transactions |
| PHP ERP | Dolibarr | GPL-3.0 | Recurring billing pattern yang sederhana |
| Invoicing | Invoice Ninja | Source-available | Email workflow, payment reminder pattern |
| CLI | hledger + beancount | GPL | Plain-text export format (Phase 5 nanti) |
| Python Library | python-accounting | Community | Jika tambah reporting API backend nanti |
| JS Library | Medici (npm) | MIT | Double-entry engine; sudah ter-cover oleh journal ERP-ACC |
| Email Templates | react-email | MIT | JSX-based email templates → dipakai Phase 2 |
| Scheduling | pg_cron (Supabase) | PostgreSQL | Recurring transactions scheduler → dipakai Phase 1 |
| Email Delivery | Resend API | Freemium | Transactional email, 3k/bulan gratis → Phase 2 |

**Kesimpulan research:** Tidak ada MCP server akuntansi yang sudah exist di market — ini peluang diferensiasi di Phase 7. ERP-ACC sudah memiliki feature set yang kompetitif vs Dolibarr/Akaunting; gap utama ada di **automation** dan **compliance Indonesia**.

---

## Gap Analysis: ERP-ACC vs Market

| Fitur | Ada di Tools | Status ERP-ACC | Target Fase |
|---|---|---|---|
| Recurring transactions | ERPNext, Dolibarr, Invoice Ninja | ❌ Belum ada | **Phase 1** |
| Bank statement CSV/XLSX import | Semua major tools | ❌ Belum ada | **Phase 2** |
| Email notifikasi (invoice, reminder) | Invoice Ninja, Akaunting, ERPNext | ❌ Belum ada | **Phase 2** |
| Cost centers / departemen analytics | Tryton, ERPNext, LedgerSMB | ❌ Belum ada | **Phase 3** |
| Budget vs Actual | ERPNext, Odoo, Dolibarr | ❌ Belum ada | **Phase 3** |
| Multi-currency + kurs harian | Hampir semua tools | ❌ Belum ada | Phase 4 |
| DJP e-Faktur XML export | GNU Khata (lokal) | ❌ Belum ada | Phase 4 |
| PPh withholding tax | ERPNext, LedgerSMB | ❌ Belum ada | Phase 4 |
| Public REST API + webhooks | BigCapital, ERPNext | ❌ Belum ada | Phase 5 |
| Multi-tenant SaaS | Odoo, ERPNext | ❌ Belum ada | Phase 6 |
| MCP Server untuk AI integration | Tidak ada di market | ❌ Belum ada | Phase 7 |

---

## Phase 1: Recurring Transactions (Quick Win)

### Tujuan
User bisa mendefinisikan invoice, jurnal, atau expense berulang yang auto-create sesuai jadwal — tanpa input manual tiap bulan.

### Use Cases
- Invoice bulanan untuk customer langganan (sewa alat, jasa retainer)
- Jurnal accrual payroll setiap akhir bulan
- Expense berulang: sewa kantor, langganan software

### Database Schema

```sql
CREATE TABLE recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES company_settings(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('invoice', 'expense', 'journal')),
  interval_type TEXT NOT NULL CHECK (interval_type IN ('daily', 'weekly', 'monthly', 'yearly')),
  day_of_month INT,        -- untuk monthly: 1-31; -1 = hari terakhir bulan
  day_of_week INT,         -- untuk weekly: 0=Sun...6=Sat
  start_date DATE NOT NULL,
  end_date DATE,           -- NULL = tidak ada batas akhir
  next_run DATE NOT NULL,
  last_run DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  template_data JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recurring_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES recurring_templates(id),
  transaction_type TEXT,
  transaction_id UUID,
  run_date DATE,
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Technical Approach

**Scheduler:** Supabase pg_cron (built-in, zero new npm dependencies)
```sql
SELECT cron.schedule('recurring-daily', '0 1 * * *',
  $$SELECT process_recurring_templates()$$
);
```

**Libraries yang dimanfaatkan:**
- `pg_cron` — Supabase built-in, tidak perlu npm package baru
- `date-fns` (sudah terinstall) — `addMonths()`, `endOfMonth()`, `addWeeks()`

**File baru:**
- `erp-app/src/pages/recurring/RecurringPage.jsx`
- `erp-app/src/services/recurringService.js`
- `erp-app/supabase/migrations/015_recurring_transactions.sql`

**File yang dimodifikasi:**
- `erp-app/src/pages/sales/` — toggle "Jadikan Berulang?" di Invoice form
- `erp-app/src/pages/accounting/` — toggle di Manual Journal form
- `erp-app/src/App.jsx` — tambah route `/recurring`

### UI/UX
- Toggle "Jadikan Berulang?" di form Invoice dan Manual Journal
- Panel settings: interval (bulanan/mingguan), hari ke-, tanggal mulai, tanggal selesai (opsional)
- Halaman Recurring Templates: tabel nama, tipe, interval, next run, status
- Actions: Pause/Resume, Edit, Delete, "Run Now"
- Klik baris → modal history instance

### NOT in Scope Phase 1
- Recurring Purchase Orders
- Approval flow untuk dokumen yang auto-dibuat
- Variable/formula-based amounts
- Email notifikasi saat recurring dijalankan (Phase 2)

### Acceptance Criteria
- [ ] User dapat membuat recurring Sales Invoice bulanan
- [ ] `Run Now` → invoice terbuat dengan tanggal hari ini
- [ ] Scheduler pg_cron berjalan daily dan auto-create transaksi jatuh tempo
- [ ] Pause template → tidak ada invoice pada jadwal berikutnya
- [ ] History tab menampilkan semua instance yang pernah dibuat
- [ ] Tidak ada regresi di modul Invoice dan Journal yang sudah ada

**Estimasi Effort:** ~1.5 minggu developer

---

## Phase 2: Bank Statement Import + Email Notifications

### Part A: Bank Statement CSV/XLSX Import

**Flow:**
1. Cash/Bank → pilih akun → tombol "Import Statement"
2. Upload file CSV/XLSX
3. Column mapper UI (atau load saved template)
4. Preview: hijau = matched, kuning = uncertain, merah = unmatched
5. Konfirmasi → simpan matched, queue unmatched

**Database Schema:**
```sql
CREATE TABLE bank_import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  column_mappings JSONB NOT NULL,
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  separator TEXT DEFAULT ',',
  skip_rows INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  template_id UUID REFERENCES bank_import_templates(id),
  file_name TEXT,
  import_date DATE,
  total_rows INT,
  matched_rows INT,
  unmatched_rows INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Matching Logic:** amount (exact) + tanggal (± 3 hari); confidence ≥ 90% = auto-match

**Libraries:** `xlsx` + `date-fns` (keduanya sudah terinstall)

### Part B: Email Notifications

**Database Schema:**
```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

CREATE TABLE email_reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,    -- 'before_due', 'on_due', 'after_due'
  days_offset INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  template_subject TEXT,
  template_body TEXT
);
```

**Infrastructure:** Supabase Edge Function → Resend API + `react-email` + `jsPDF` (attached PDF)

**UI Changes:**
- Tombol "Kirim ke Customer" di Sales Invoice detail
- Settings → Email Configuration
- Settings → Reminder Rules
- Invoice detail → tab "Email Log"

**Estimasi Effort:** ~2.5 minggu developer

---

## Phase 3: Cost Centers + Budget vs Actual

### Part A: Cost Centers

```sql
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES cost_centers(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE journal_items ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id);
-- juga di invoice_items, expense records
```

**UI:** Master Data → Cost Centers; dropdown di Journal/Invoice/Expense form; P&L per Cost Center report

### Part B: Budget vs Actual

```sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  account_id UUID REFERENCES coa(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  fiscal_year INT NOT NULL,
  month INT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI:** `BudgetPage.jsx` (grid input); Dashboard widget; Budget vs Actual report dengan variance

**Libraries:** `recharts` (sudah terinstall)

**Estimasi Effort:** ~2.5 minggu developer

---

## Phase 4+ Future Roadmap

| Fase | Fitur | Trigger |
|---|---|---|
| Phase 4 | Multi-currency + kurs harian | Transaksi valas |
| Phase 4 | DJP e-Faktur XML export | Legal requirement SaaS Indonesia |
| Phase 4 | PPh withholding tax (23/25/26) | Compliance Indonesia |
| Phase 5 | Public REST API + webhooks | Permintaan integrasi customer |
| Phase 6 | Multi-tenant SaaS infrastructure | Onboarding paying customers |
| Phase 7 | MCP Server untuk AI integration | Claude query data ERP via natural language |

---

## Tech Stack Summary

| Komponen | Sekarang | Phase 1-3 |
|---|---|---|
| Frontend | React 19 + Vite + Ant Design | Sama |
| Database | Supabase (PostgreSQL) | + pg_cron extension |
| Scheduler | — | pg_cron (built-in Supabase) |
| Email | — | + Resend API + react-email |

**New npm packages needed:**
- Phase 1: 0
- Phase 2: `react-email` + Resend SDK
- Phase 3: 0

---

## Verification Plan

### Phase 1
1. Create recurring Sales Invoice bulanan → Run Now → invoice terbuat
2. Pause template → no invoice on next run
3. Resume → instance ke-2 muncul di history
4. Delete template → hilang dari daftar

### Phase 2A
1. Upload CSV BCA → column mapper → simpan template
2. Upload lagi → template auto-load → preview matched
3. Confirm → matched saved, unmatched flagged

### Phase 2B
1. Settings → masukkan Resend API key
2. Invoice → "Kirim ke Customer" → email tiba dengan PDF
3. Reminder rule → invoice jatuh tempo → reminder terpicu

### Phase 3
1. Buat cost centers → assign ke transaksi → P&L filter by cost center
2. Input budget → dashboard widget muncul dengan % realisasi

---

## Implementation Notes

- Ikuti soft delete pattern: `is_active`, `deleted_at`, `deleted_by`
- Ikuti audit trail: `addHistoryLog()` untuk state changes penting
- Ikuti service layer pattern: `recurringService.js`, `bankImportService.js`, `emailService.js`
- Ikuti RLS pattern: setiap tabel baru harus punya RLS policies
- Build must pass: `npm run build` di `erp-app/` sebelum claim selesai
