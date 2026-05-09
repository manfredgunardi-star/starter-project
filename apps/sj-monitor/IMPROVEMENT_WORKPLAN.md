# SJ Monitor — Improvement Workplan

> **Generated:** 2026-04-01
> **Scope:** `C:/project/sj-monitor` — Surat Jalan Monitor for sand & rock transportation ops
> **Current state:** Working production app, single-file monolith (6,045-line App.jsx), Firebase/React/Vite/Tailwind stack

---

## Executive Summary

The app works and serves its purpose, but the single-file architecture makes it fragile to change. The plan below is organized from **highest impact / lowest risk** to **nice-to-have**, so you can stop at any phase and still have a better codebase.

---

## Phase 1 — Security & Hygiene (URGENT)

> Fix things that could cause real damage if left alone.

### 1.1 Remove leaked credentials from git history
- `env.txt` in the repo root contains live Firebase API keys (committed to GitHub)
- Rotate the Firebase API key in Firebase Console → Project Settings
- Delete `env.txt` from the repo (or add it to `.gitignore`)
- Consider using `git filter-repo` to scrub it from history if the repo is public

### 1.2 Clean up .gitignore
- Add entries for: `.env`, `env.txt`, `.firebase/`, `build.log`, `*.zip`
- Already partially covered by root `.gitignore`, but each sub-project should be self-sufficient

### 1.3 Remove `console.log` of Firebase config
- `firebase-config.js:17` logs the projectId on every page load — remove it

### 1.4 Delete `App_Original.jsx`
- 5,109-line legacy backup sitting in `src/` — adds confusion, no runtime use
- If you need history, that's what git is for

---

## Phase 2 — Break Up the Monolith (HIGH IMPACT)

> The single biggest improvement. Every other phase becomes easier after this.

### 2.1 Extract page-level components
Split `App.jsx` into one file per tab/section:

```
src/
├── pages/
│   ├── SuratJalanPage.jsx        # SJ list, filters, SJ cards
│   ├── KeuanganPage.jsx          # Transaction list & management
│   ├── LaporanKasPage.jsx        # Cash flow report
│   ├── InvoicePage.jsx           # Invoice management
│   ├── MasterDataPage.jsx        # Trucks, drivers, routes, materials
│   ├── UsersPage.jsx             # User management (superadmin)
│   └── SettingsPage.jsx          # App settings, force logout
```

### 2.2 Extract reusable UI components
```
src/components/
├── Layout/
│   ├── Sidebar.jsx               # Tab navigation
│   ├── Header.jsx                # Top bar, user info, logout
│   └── AlertBanner.jsx           # Force-logout warning banner
├── SuratJalanCard.jsx            # Already a component, just move out
├── StatCard.jsx                  # Already a component, just move out
├── SearchableSelect.jsx          # Already a component, just move out
├── ConfirmDialog.jsx             # Confirmation modal
└── Modal/
    ├── SuratJalanModal.jsx       # Add/Edit SJ form
    ├── InvoiceModal.jsx          # Add/Edit invoice form
    ├── TransaksiModal.jsx        # Add transaction form
    ├── UserModal.jsx             # Add/Edit user form
    └── MasterDataModal.jsx       # Add truck/driver/route/material
```

### 2.3 Extract business logic into hooks
```
src/hooks/
├── useAuth.js                    # Auth state, login/logout, session mgmt
├── useSuratJalan.js              # SJ CRUD, real-time subscription
├── useInvoices.js                # Invoice CRUD, batch operations
├── useTransaksi.js               # Transaction CRUD
├── useMasterData.js              # Trucks/drivers/routes/materials subscriptions
├── useUsers.js                   # User management (superadmin)
├── useForceLogout.js             # Force logout timer & banner
└── usePermissions.js             # Role-based permission checks
```

### 2.4 Extract utility functions
```
src/utils/
├── currency.js                   # formatCurrency, formatTanggalID
├── firestore.js                  # upsertItem, softDelete, sanitize (already in firestoreService.js)
├── excel.js                      # downloadSJRecap, template generation
└── session.js                    # generateSessionId
```

### 2.5 Add React Router
- Install `react-router-dom`
- Replace tab-state navigation with proper URL routes: `/sj`, `/keuangan`, `/laporan`, `/invoice`, `/master-data`, `/users`, `/settings`
- Enables browser back/forward, deep linking, bookmarkable pages

---

## Phase 3 — State Management & Data Layer

> Eliminate prop-drilling and make data access predictable.

### 3.1 Auth Context (already partially exists)
- Move auth state + permissions into a dedicated `AuthProvider` context
- Expose `useAuth()` hook: `{ user, role, permissions, login, logout }`

### 3.2 Data Context or lightweight store
- Option A: **React Context + useReducer** per domain (SJ, invoices, transaksi)
- Option B: **Zustand** (tiny, no boilerplate, works well with Firestore listeners)
- Goal: any component can access data without threading props through 5 layers

### 3.3 Centralize Firestore subscriptions
- Move all `onSnapshot` listeners into a single `FirestoreProvider` or into individual hooks
- Unsubscribe properly on unmount (currently relies on cleanup, but the monolith rarely unmounts)

---

## Phase 4 — Data & Performance

> Prepare the app for growing data volumes.

### 4.1 Pagination / virtual scrolling
- Currently loads ALL documents on boot — fine for < 1,000 SJs, breaks at 10,000+
- Implement cursor-based pagination (`startAfter`, `limit`) for SJ and transaction lists
- Consider `react-window` or `@tanstack/virtual` for rendering large lists

### 4.2 Firestore composite indexes
- Add indexes for common query patterns: `(status, tanggalSJ)`, `(pt, tanggalSJ)`, `(isActive, createdAt)`
- Define in `firestore.indexes.json` so they deploy automatically

### 4.3 Finish legacy collection migration
- The app still reads from both `suratJalan` (old) and `surat_jalan` (new) collections in parallel
- Run the migration script (`scripts/migrate-sj-collection.mjs`) on production
- Remove all fallback/legacy collection code from the frontend
- Same for `invoices` → `invoice` collection

### 4.4 Archive / soft-delete cleanup
- Soft-deleted docs (`isActive: false`) are still fetched by `onSnapshot` listeners
- Add `.where("isActive", "==", true)` to all subscription queries
- Create a separate "Recycle Bin" or archive view for admins who need to see deleted items

---

## Phase 5 — UX Improvements

> Make the app more pleasant and informative for daily users.

### 5.1 Dashboard with summary charts
- Add a landing dashboard tab with:
  - SJ created this week/month (bar chart)
  - Delivery success rate (delivered vs failed)
  - Outstanding invoices count & value
  - Cash flow trend (line chart)
- Use a lightweight chart library: `recharts` or `chart.js`

### 5.2 Better date and filter controls
- Replace manual text date inputs with a proper date picker (`react-datepicker` or native `<input type="date">`)
- Add persistent filter state (save last-used filters to localStorage)
- Add "quick filters": Today, This Week, This Month

### 5.3 Toast notifications instead of alerts
- Replace `window.alert` / custom alert state with a toast library (`react-hot-toast` or `sonner`)
- Non-blocking feedback for save, delete, error actions

### 5.4 Responsive / mobile layout
- Audit Tailwind classes for mobile breakpoints
- The SJ card layout and modals should work well on tablets (field staff use)
- Consider a simplified mobile view for drivers: just their assigned SJs + mark delivered

### 5.5 Offline indicator
- Firestore SDK already queues writes offline, but users don't know they're offline
- Add a visible "Offline — changes will sync when reconnected" banner

---

## Phase 6 — Developer Experience

> Make the codebase easier to work on.

### 6.1 Add TypeScript (incremental)
- Rename `.jsx` → `.tsx` one file at a time (Vite supports mixed JS/TS)
- Start with types for the data models (SuratJalan, Invoice, Transaksi, User)
- Add types for hook return values and component props
- Catches bugs at build time, improves autocomplete

### 6.2 Linting & formatting
- Add ESLint + Prettier with a shared config
- Add a `lint` script to `package.json`
- Consider `husky` + `lint-staged` for pre-commit hooks

### 6.3 Testing
- Add Vitest (works natively with Vite)
- Start with unit tests for utility functions (`formatCurrency`, `sanitizeForFirestore`, etc.)
- Add integration tests for hooks (mock Firestore with `@firebase/rules-unit-testing`)
- Goal: catch regressions before they reach production

### 6.4 Environment management
- Use `.env.example` as template (already exists)
- Add `.env.development` and `.env.production` for different Firebase projects
- Remove the hardcoded `console.log` of config

---

## Phase 7 — Advanced Features (FUTURE)

> Only pursue these after Phases 1-3 are solid.

### 7.1 PDF invoice generation
- Generate downloadable PDF invoices from the app
- Use `jsPDF` or `@react-pdf/renderer`
- Include company logo, SJ details, totals

### 7.2 Driver mobile app / PWA
- Turn the app into a Progressive Web App (`vite-plugin-pwa`)
- Drivers can view their assigned SJs and mark delivered from their phone
- Push notifications for new SJ assignments (Firebase Cloud Messaging)

### 7.3 GPS / photo proof of delivery
- Allow drivers to upload a photo when marking delivery
- Store in Firebase Storage, link to SJ document
- Optional: capture GPS coordinates at delivery time

### 7.4 Reporting & analytics
- Monthly/quarterly summaries exportable to Excel/PDF
- Per-truck and per-driver performance metrics (trips, on-time %, qty variance)
- Cost analysis per route

### 7.5 Multi-company support
- Currently `pt` is a free-text field on each SJ
- Formalize with a `companies` collection
- Scope data access per company for multi-tenant use

### 7.6 Approval workflows
- Add approval states to invoices (draft → submitted → approved → paid)
- Require admin_keuangan sign-off before invoice is finalized
- Email/notification to approver

### 7.7 API integration
- REST API (Firebase Cloud Functions or separate backend) for external systems
- Integration with accounting software (export journal entries)
- Webhook notifications for key events (SJ delivered, invoice created)

---

## Suggested Execution Order

| Priority | Phase | Effort | Why |
|----------|-------|--------|-----|
| **NOW** | 1 — Security | ~1 hour | Credentials are exposed in a public repo |
| **Next** | 2.1-2.2 — Extract pages & components | ~2-3 sessions | Unblocks everything else |
| **Then** | 2.3-2.5 — Hooks, utils, router | ~2 sessions | Clean architecture |
| **Then** | 3 — State management | ~1-2 sessions | Eliminates prop-drilling |
| **Then** | 4.3 — Finish migration | ~1 session | Remove legacy code debt |
| Later | 4.1-4.2 — Pagination & indexes | As data grows | |
| Later | 5 — UX improvements | Pick & choose | |
| Later | 6 — DX (TS, lint, tests) | Incremental | |
| Future | 7 — Advanced features | Per business need | |

---

## Notes for Implementation

- Each phase can be done independently — you don't have to do them all
- Phase 2 is the most transformative: after splitting App.jsx, everything else becomes straightforward
- When using Sonnet to implement, share this workplan and specify which phase/task to work on
- Keep the app working after each change — don't try to refactor everything at once
