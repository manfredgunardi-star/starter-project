# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Communication

- Respond in **Bahasa Indonesia** for discussion and explanations.
- Write **git commit messages in English** using conventional commit style (e.g., `fix:`, `feat:`, `refactor:`).

## Project Overview

Multi-company ERP for sand/stone logistics businesses. Three independent React SPAs share one git repo, each with its own Firebase project:

```
C:\Project/
├── sj-monitor/       # Surat Jalan Monitor — delivery note tracking, invoicing, payments
├── BUL-accounting/   # Pembukuan Truck — full accounting (COA, jurnal, kas/bank, penjualan)
├── BUL-monitor/      # BUL Monitor — delivery note tracking (variant of sj-monitor)
└── ERP-ACC/          # Git worktree for isolated development
```

Each sub-project is a **separate company** with its own Firestore database and deployment.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS 3, Lucide React icons
- **Backend**: Firebase Auth + Cloud Firestore (real-time sync)
- **Hosting**: Firebase Hosting (SPA rewrite to index.html)
- **Exports**: jsPDF + jspdf-autotable (PDF), xlsx (Excel)
- **Charts**: Recharts (BUL-accounting only)
- **No test framework, no linter/formatter configured**

## Commands

Each sub-project has its own `package.json`. Always `cd` into the correct project first:

```bash
cd sj-monitor && npm run dev      # Local dev server
cd sj-monitor && npm run build    # Production build (validate before claiming done)
cd BUL-accounting && npm run dev
cd BUL-accounting && npm run build
cd BUL-monitor && npm run dev
cd BUL-monitor && npm run build
```

**Deployment**: Codex may deploy to dev/staging only. Never deploy to production. Use `firebase deploy --only hosting` from the project directory.

## Module Boundaries

### sj-monitor
| Module | Key files | Purpose |
|---|---|---|
| Surat Jalan (SJ) | App.jsx | Create, edit, track delivery notes |
| Invoice | App.jsx | Generate invoices with Harga Per Rute pricing |
| Uang Muka | App.jsx | Down payment tracking per route/customer |
| Kas / Laporan Kas | LaporanKasPage.jsx | Cash flow reporting |
| Laporan Truk | LaporanTrukPage.jsx | Truck activity reports |
| Payslip | PayslipExport/Report/Table.jsx | Driver payslip generation |
| Ritasi | RitasiBulkUpload.jsx | Bulk trip data import |
| Master Data | firestoreService.js, App.jsx | Rute, Material, Armada, Supir |

### BUL-accounting
| Module | Key files | Purpose |
|---|---|---|
| COA | COAPage.jsx | Chart of Accounts management |
| Jurnal | JurnalPage.jsx, JournalEntryForm.jsx | Double-entry journal entries |
| Kas/Bank | KasBankPage.jsx | Cash and bank transactions |
| Penjualan | PenjualanPage.jsx | Sales records |
| Biaya | BiayaPage.jsx | Expense tracking |
| Aset | AsetPage.jsx | Asset management |
| Laporan | LaporanPage.jsx | Financial reports |
| Pelanggan/Supplier | PelangganPage.jsx, SupplierPage.jsx | Customer/vendor master data |
| Armada | ArmadaPage.jsx | Fleet management |

### BUL-monitor
Variant of sj-monitor for a different company. Main logic in App.jsx (7,249 lines).

## Data Safety Rules

1. **Always soft delete** — never hard-delete any business data. Use `softDeleteItemInFirestore()` which sets `isActive: false`, `deletedAt`, `deletedBy`.
2. **Audit trail** — use `addHistoryLog()` for all significant state changes (mark gagal, restore, status changes).
3. **Sanitize before write** — use `sanitizeForFirestore()` to clean objects before Firestore writes (strips undefined, converts Date to ISO).
4. **Auth context** — always call `ensureAuthed()` before Firestore writes.
5. **Upsert pattern** — use `upsertItemToFirestore()` for master data CRUD; requires `data.id`.

## Finance / Accounting Guardrails

**ASK before changing any of the following:**
- Double-entry bookkeeping logic (journal debit/credit balancing)
- Chart of Accounts (COA) structure or account mappings
- Tax calculations (PPN, PPh) or tax-related formulas
- Invoice pricing logic (Harga Per Rute)
- Uang Muka (down payment) calculation or allocation
- Cash/bank reconciliation logic
- Any formula that calculates money

## Security Guardrails

**ASK before modifying:**
- `firestore.rules` — RBAC rules for all collections
- Firebase Auth configuration or login flow (`useAuth.js`, `LoginPage.jsx`)
- Role definitions: superadmin, owner, admin_sj, admin_invoice, admin_keuangan, reader
- `firebase-config.js` / `firebase.js` — Firebase initialization

## Change Guardrails

**Always ask before:**
- Changing Firestore collection schema or adding/removing fields
- Modifying approval flow logic (planned but not yet implemented)
- Altering audit trail / history log behavior
- Changing posted transaction behavior
- Deleting or overwriting seed data or master data
- Introducing breaking changes to shared utilities (`firestoreService.js`, `currency.js`, `sjHelpers.js`)
- Modifying bulk import logic (CSV/Excel parsing in `ritasiBulkService.js`)

## Coding Conventions

- **Components**: React functional components with hooks, JSX files (not TSX)
- **State**: React hooks (`useState`, `useEffect`), custom hooks in `hooks/`
- **Services**: Firestore operations in `firestoreService.js` or `services/`
- **Utils**: Pure helpers in `utils/` (currency formatting, Excel generation, etc.)
- **Styling**: Tailwind CSS utility classes inline, no CSS modules
- **Indonesian terms in code**: Business domain uses Indonesian names (suratJalan, nomorSJ, supir, rute, armada, uangMuka, biaya, pelanggan, penjualan, jurnal)
- **ID pattern**: String IDs for Firestore documents
- **Date format**: ISO strings stored in Firestore

## Validation

- Run `npm run build` in the affected project — **must pass with no errors** before claiming work is done.
- No test framework exists yet. Describe manual test steps if the change affects user-facing behavior.

## Known Architecture Notes

- `App.jsx` files are monolithic (5,000–7,000+ lines). Refactoring is ongoing but changes should respect existing patterns.
- Each sub-project has independent `node_modules` — install dependencies per project.
- Firebase long-polling auto-detection is enabled for ISPs blocking QUIC/HTTP3.
- `.env` files contain Firebase config and are gitignored. Reference `.env.example` for required variables.

## Handling Ambiguity

If a task is unclear or could affect financial logic, data integrity, security, or audit behavior:
1. **Stop and ask** — do not guess.
2. State what you understand, what's ambiguous, and what the risk is.
3. Propose options and let the user decide.
