# ERP Pembukuan — Smoke Test Checklist

**Version**: 1.0  
**Date**: 2026-04-10  
**Build Status**: ✅ PASSED

---

## Build Verification

- [x] `npm run build` completes without errors
- [x] No TypeScript/JSX syntax errors
- [x] All imports resolve correctly
- [x] CSS/Tailwind compiles successfully
- [x] Chunk size warning is acceptable (657.10 kB main bundle, 166.82 kB gzipped)

---

## Login & Authentication

- [ ] Navigate to `http://localhost:5173`
- [ ] Login page loads with email/password fields
- [ ] Can sign up with new email and password
- [ ] Can login with valid credentials
- [ ] Redirects to Dashboard after login
- [ ] "Keluar" (logout) button works

---

## Navigation & Sidebar

- [ ] Dashboard link appears at top of sidebar
- [ ] All menu groups expand/collapse smoothly
- [ ] Active page highlighted in blue
- [ ] Sidebar scrolls when content exceeds height
- [ ] Menu items:
  - Master Data (Satuan, Produk, Customer, Supplier, COA)
  - Inventory (Stok, Kartu Stok)
  - Penjualan (Sales Order, Pengiriman, Invoice Penjualan)
  - Pembelian (Purchase Order, Penerimaan, Invoice Pembelian)
  - Kas & Bank (Akun, Pembayaran, Transfer, Rekonsiliasi)
  - Pembukuan (Jurnal, Buku Besar)
  - Laporan (Neraca, Laba Rugi, Arus Kas)
  - Settings (Users, Audit Log)

---

## Master Data (CRUD)

### Units
- [ ] List page loads
- [ ] Add new unit with name
- [ ] Edit unit name
- [ ] Delete unit (soft delete)

### Products
- [ ] List page loads
- [ ] Add product with SKU, name, base unit, buy/sell price
- [ ] Add unit conversions
- [ ] Edit product details
- [ ] Delete product (soft delete)
- [ ] Tax checkbox toggles tax_rate field

### Customers
- [ ] List page loads
- [ ] Add customer with name, address, phone, email, NPWP
- [ ] Edit customer
- [ ] Delete customer (soft delete)

### Suppliers
- [ ] List page loads
- [ ] Add supplier
- [ ] Edit supplier
- [ ] Delete supplier (soft delete)

### COA (Chart of Accounts)
- [ ] List page loads
- [ ] Add COA with code, name, type (asset/liability/equity/revenue/expense)
- [ ] Edit COA
- [ ] Delete COA (soft delete)

---

## Sales Flow

### Sales Orders
- [ ] List page shows all sales orders
- [ ] Create new SO: select customer, add items, set date
- [ ] Auto-generate SO number (SO-YYYY-00001)
- [ ] Edit SO in draft status
- [ ] Confirm SO → status changes to "confirmed"
- [ ] Cannot edit confirmed SO

### Goods Deliveries
- [ ] Create GD from SO or standalone
- [ ] Auto-generate GD number (GD-YYYY-00001)
- [ ] Add items with quantity
- [ ] Post GD → creates journal entries (debit COGS, credit inventory)
- [ ] Inventory decreases when GD posted

### Sales Invoices
- [ ] Create invoice from GD or standalone
- [ ] Auto-generate invoice number (INV-YYYY-00001)
- [ ] Display customer, items, totals
- [ ] Post invoice → creates journal entries (debit piutang, credit revenue)
- [ ] Status: draft → posted → partial → paid

---

## Purchase Flow

### Purchase Orders
- [ ] List page shows all POs
- [ ] Create new PO: select supplier, add items, set date
- [ ] Auto-generate PO number (PO-YYYY-00001)
- [ ] Edit PO in draft status
- [ ] Confirm PO → status changes to "confirmed"
- [ ] Cannot edit confirmed PO

### Goods Receipts
- [ ] Create GR from PO or standalone
- [ ] Auto-generate GR number (GR-YYYY-00001)
- [ ] Add items with quantity and unit price
- [ ] Post GR → creates journal entries (debit inventory, credit hutang barang diterima)
- [ ] Inventory increases when GR posted
- [ ] Hutang account (Hutang Barang Diterima) increases

### Purchase Invoices
- [ ] Create invoice from GR or standalone
- [ ] Auto-generate invoice number (PINV-YYYY-00001)
- [ ] Display supplier, items, totals
- [ ] Post invoice → creates journal entries (transfer hutang barang to hutang usaha)
- [ ] Status: draft → posted → partial → paid
- [ ] "Bayar Hutang" button links to payment form

---

## Inventory Management

### Stock Page
- [ ] Shows current inventory by product
- [ ] Displays: product name, SKU, quantity, base unit
- [ ] Shows weighted average cost (average_cost from inventory_stock)
- [ ] Filter by product name or SKU

### Stock Card
- [ ] Select product from dropdown
- [ ] Filter by date range
- [ ] Shows all movements: GR in, GD out, adjustments
- [ ] Displays: date, type, quantity, unit price, running total
- [ ] Running balance calculated correctly

---

## Cash & Bank

### Accounts
- [ ] List all active cash/bank accounts
- [ ] Display account name, type, current balance
- [ ] Can add new account (linked to COA)
- [ ] Can deactivate/reactivate account

### Payments
- [ ] Create incoming payment (from customer)
- [ ] Create outgoing payment (to supplier)
- [ ] Link to invoice (optional)
- [ ] Auto-generate payment number (PAY-YYYY-00001)
- [ ] Auto-select account from payment type
- [ ] Post payment → creates journal entries (debit/credit cash, credit/debit AR/AP)
- [ ] Payment reduces outstanding invoice balance

### Transfers
- [ ] Create transfer between accounts
- [ ] Validate: from_account ≠ to_account
- [ ] Check sufficient balance
- [ ] Auto-post transfer (no draft state)
- [ ] Creates journal entry (debit to_account, credit from_account)

### Reconciliation
- [ ] Enter statement balance
- [ ] System shows current balance and difference
- [ ] Calculate reconciling items if needed
- [ ] Save reconciliation

---

## Accounting & Journals

### Manual Journals
- [ ] List all journals (manual + auto-posted)
- [ ] Create manual journal: add debit/credit lines
- [ ] Auto-generate journal number (JRN-YYYY-00001)
- [ ] Debit ≠ Credit shows error
- [ ] Save as draft, then post
- [ ] Cannot edit posted journal
- [ ] Debit and credit are balanced when posted

### Ledger (Buku Besar)
- [ ] Select COA account from dropdown
- [ ] Filter by date range
- [ ] Display: date, description, debit, credit, running balance
- [ ] Running balance calculated from start of period
- [ ] Totals match account balances

---

## Financial Reports

### Balance Sheet (Neraca)
- [ ] Select as-of date
- [ ] Shows ASET, KEWAJIBAN, MODAL sections
- [ ] Aset = Kewajiban + Modal check (✓ or ⚠)
- [ ] Cumulative balances from beginning of time
- [ ] Summary cards show totals
- [ ] All accounts grouped by type

### Income Statement (Laba Rugi)
- [ ] Select date range
- [ ] Shows PENDAPATAN (revenue) and BEBAN (expense)
- [ ] Net income = Revenue - Expense
- [ ] Only shows accounts with non-zero balance
- [ ] Summary cards with totals

### Cash Flow (Arus Kas)
- [ ] Select date range
- [ ] Shows KAS MASUK (incoming payments from customers)
- [ ] Shows KAS KELUAR (outgoing payments to suppliers)
- [ ] Net cash flow = In - Out
- [ ] Summary cards with totals
- [ ] Tables show payment details by date

---

## Settings

### Users Management
- [ ] List all users with name, ID, role, status
- [ ] Edit user: change full_name, role (viewer/staff/admin)
- [ ] Deactivate user → is_active = false
- [ ] Reactivate user → is_active = true
- [ ] Only admin can manage users (RLS policy)

### Audit Log
- [ ] Filter by table name
- [ ] Filter by date range
- [ ] Shows: timestamp, table, action (create/update/delete), record ID, user email
- [ ] Color-coded badges for actions
- [ ] Expand row to see before/after data
- [ ] For updates, show which fields changed
- [ ] Limit to 200 entries per query

---

## UI & Responsiveness

### General
- [ ] All labels in Indonesian (Bahasa Indonesia)
- [ ] No English text in UI except field names
- [ ] Consistent color scheme:
  - Green: positive, incoming, success
  - Red: negative, outgoing, danger
  - Blue: primary action, active state
  - Gray: neutral, disabled
- [ ] Buttons have hover effects
- [ ] Loading spinners appear during async operations
- [ ] Toast notifications (success/error) display correctly

### Tables
- [ ] Tables are readable on desktop (1920px+)
- [ ] Horizontal scroll on smaller screens
- [ ] Currency formatted with Rp. and thousand separators
- [ ] Dates formatted as "DD MMM YYYY" (Indonesian locale)
- [ ] Status badges colored appropriately

### Forms
- [ ] Input fields have clear labels
- [ ] Date inputs are type="date" (browser native picker)
- [ ] Dropdowns for related records (customer, product, etc.)
- [ ] Validation errors shown below field
- [ ] Save button disabled while submitting
- [ ] Success message after save

### Dashboard
- [ ] Metric cards display: Penjualan, Piutang, Hutang, Kas & Bank
- [ ] Recent invoice list (last 5)
- [ ] Recent payment list (last 5)
- [ ] Low stock warning (qty ≤ 10)
- [ ] Cash account balances
- [ ] Links to detail pages work

---

## Data Integrity

- [ ] Soft deletes working: deleted_at and deleted_by populated
- [ ] Audit log triggered on INSERT/UPDATE/DELETE for main tables
- [ ] Journal entries balanced (debit = credit for each journal)
- [ ] Inventory movements tracked correctly
- [ ] Account balances calculated correctly via ledger RPC
- [ ] No duplicate invoice numbers
- [ ] No orphaned items (items cascade delete with parent)

---

## Error Handling

- [ ] Missing required fields show validation error
- [ ] Invalid numeric input shows error
- [ ] Network errors caught and displayed
- [ ] Duplicate key (e.g., invoice_number) shows error
- [ ] RLS policy violations show error
- [ ] Graceful fallbacks for missing data

---

## Performance

- [ ] Dashboard loads within 2 seconds
- [ ] List pages (50+ records) load smoothly
- [ ] No memory leaks on page navigation
- [ ] Inline editing/deletion responsive
- [ ] Date range filtering responsive
- [ ] Large forms (50+ fields) load/save smoothly

---

## Browser Compatibility

- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Sign-Off

**QA Tester**: _______________  
**Date**: _______________  
**Status**: ⬜ PASS / ⬜ FAIL

**Notes**:
```
[Space for additional notes]
```

---

## Issues Found (if any)

| # | Page/Feature | Issue | Severity | Status |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

---

## Deployment Readiness

- [x] Build successful with no errors
- [x] All routes configured in App.jsx
- [x] Database migrations applied (001-013)
- [x] RLS policies enabled on all tables
- [x] Audit triggers configured
- [x] No console errors during runtime
- [ ] Performance tested on staging
- [ ] Smoke test passed by QA
- [ ] Ready for production deployment

---

**End of Smoke Test Checklist**
