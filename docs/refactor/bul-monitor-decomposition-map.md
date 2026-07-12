# Decomposition Map — bul-monitor/src/App.jsx

**Generated:** 2026-06-15   **Source size:** 7249 lines
**Template reference:** sj-monitor `pages/` + `components/`

---

## Seams (extractable units)

| ID | Unit | Kind | Lines (approx) | Coupling | Financial? |
|----|------|------|----------------|----------|------------|
| U1 | `SearchableSelect` | component | 314–383 | low | no |
| U2 | `StatCard` | component | 5899–5911 | low | no |
| U3 | `LoginScreen` | component | 5790–5897 | low | no |
| U4 | `UsersManagement` | section-component | 5655–5789 | low | no |
| U5 | `SettingsManagement` | section-component | 5172–5433 | low | no |
| U6 | `MasterDataManagement` | section-component | 4660–5169 | med | no (contains `uangJalan` display only) |
| U7 | `LaporanKas` | section-component | 386–861 | med | yes (`uangJalan` totals, kas summaries) |
| U8 | `KeuanganManagement` | section-component | 5435–5653 | med | yes (`totalPemasukan`, `totalPengeluaran`, `saldoKas`) |
| U9 | `InvoiceManagement` | section-component | 864–1325 | high | yes (`hargaSatuan`, `totalNilai`, invoice logic) |
| U10 | `SuratJalanCard` | component | 5913–6141 | high | yes (`uangJalan` display, lock-state logic) |
| U11 | `Modal` | component | 6143–7249 | high | yes (`hargaSatuan`, `uangJalan`, invoice form) |
| U12 | Global helper cluster | helpers | 27–312 | n/a | yes (several: `upsertUangJalanTransaksiForSJ`, `sanitizeForFirestore`, `softDeleteItemInFirestore`) |

---

## Dependencies per unit

- **U1 `SearchableSelect`:**
  - State: `isOpen`, `searchTerm` (local)
  - Props: `options`, `value`, `onChange`, `placeholder`, `label`, `displayKey`, `valueKey`
  - Imports: `React`, `useState`, `Search` (lucide-react)
  - Context: none
  - Coupling: none — fully self-contained

- **U2 `StatCard`:**
  - State: none (pure presentational)
  - Props: `title`, `value`, `icon`, `color`
  - Imports: `React`
  - Context: none
  - Coupling: none — purely presentational

- **U3 `LoginScreen`:**
  - State: `username`, `password` (local)
  - Props: `onLogin`, `alertMessage`, `setAlertMessage`, `appSettings`
  - Imports: `React`, `useState`, `Package`, `AlertCircle` (lucide-react)
  - Context: none
  - Coupling: low — calls `onLogin` callback only; reads `appSettings`

- **U4 `UsersManagement`:**
  - State: none (local role-badge helpers only)
  - Props: `usersList`, `currentUser`, `onAddUser`, `onEditUser`, `onDeleteUser`, `onToggleActive`
  - Imports: `React`, `Plus`, `Edit`, `Trash2` (lucide-react)
  - Context: none
  - Coupling: low — all mutations passed as callbacks; no direct Firestore access

- **U5 `SettingsManagement`:**
  - State: `settings`, `logoFile`, `logoPreview` (local)
  - Props: `currentUser`, `appSettings`, `onUpdateSettings`
  - Imports: `React`, `useState`
  - Context: none (reads `currentUser.role` for guard)
  - Coupling: low — `onUpdateSettings` is the only parent write

- **U6 `MasterDataManagement`:**
  - State: `masterTab`, `alertMessage` (local)
  - Props: `truckList`, `supirList`, `ruteList`, `materialList`, `pelangganList`, `currentUser`, multiple `onAdd*`/`onEdit*`/`onDelete*` callbacks, `onDownloadTemplate`, `onImportData`
  - Imports: `React`, `useState`, `Plus`, `Download`, `Edit`, `Trash2`, `XLSX` (for template download)
  - Context: none
  - Coupling: med — needs XLSX import; `uangJalan` appears only in display (rute list), not computed here

- **U7 `LaporanKas`:**
  - State: `filterDari`, `filterSampai`, `filterPT`, `showExportMenu` (local)
  - Props: `suratJalanList`, `transaksiList`, `formatCurrency`
  - Imports: `React`, `useState`, `XLSX`, `Download`
  - Context: none
  - Financial: yes — aggregates `uangJalan` from SJ, sums kas masuk/keluar across PT groups
  - Coupling: med — standalone report; all data passed as props

- **U8 `KeuanganManagement`:**
  - State: `filter`, `filterPT` (local)
  - Props: `transaksiList`, `suratJalanList`, `currentUser`, `onAddTransaksi`, `onDeleteTransaksi`, `onKirimTransaksiKeAccounting`
  - Imports: `React`, `useState`, `DollarSign`
  - Financial: yes — computes `totalPemasukan`, `totalPengeluaran`, `saldoKas`
  - Coupling: med — mutation callbacks from parent; formatting via module-level `formatCurrency`

- **U9 `InvoiceManagement`:**
  - State: `activeFilter`, `selectedInvoiceIds` (local)
  - Props: `invoiceList`, `suratJalanList`, `currentUser`, `onAddInvoice`, `onDeleteInvoice`, `onKirimInvoiceKeAccounting`, `onBulkKirimInvoiceKeAccounting`, `formatCurrency`
  - Imports: `React`, `useState`, `XLSX`, `Send`, `Download`, `CheckCircle`, `XCircle`
  - Financial: yes — `hargaSatuan`, `totalNilai`, invoice creation/cancellation logic (CSV export), integration with bul-accounting
  - Coupling: high — touches `suratJalanList.statusInvoice`; integration bridge callbacks

- **U10 `SuratJalanCard`:**
  - State: `expanded` (local)
  - Props: `suratJalan`, `biayaList`, `totalBiaya`, `currentUser`, `onUpdate`, `onMarkGagal`, `onRestore`, `onEditTerkirim`, `onDeleteBiaya`, `onKirimKeAccounting`, `formatCurrency`, `getStatusColor`, `getStatusIcon`, `isSelected`, `isSelectable`, `onToggleSelect`, `isBatalSelectable`, `isBatalSelected`, `onToggleBatalSelect`
  - Imports: `React`, `useState`, lucide icons
  - Financial: yes — displays `uangJalan`, guards locked state (`menunggu_review`/`terkunci`), `onKirimKeAccounting`
  - Coupling: high — large prop surface; relies on `getStatusColor`/`getStatusIcon` helpers defined inside `SuratJalanMonitor`

- **U11 `Modal`:**
  - State: `searchInvoiceSJ`, `biayaTambahanItems`, `biayaInput`, `formData`, `initializedRef` (local)
  - Props: `type`, `selectedItem`, `currentUser`, `setAlertMessage`, `truckList`, `supirList`, `ruteList`, `materialList`, `suratJalanList`, `pelangganList`, `onClose`, `onSubmit`
  - Imports: `React`, `useState`, `useEffect`, `useRef`, `SearchableSelect`, lucide icons
  - Financial: yes — `hargaSatuan`, `uangJalan`, invoice form fields, total-nilai calculation
  - Coupling: high — multiplexed single Modal for ~15 entity types; depends on `SearchableSelect` (U1); very large (>1100 lines)

- **U12 Global helper cluster:**
  - Includes: `buildUangJalanTransaksiId`, `softDeleteItemInFirestore`, `softDeactivateTransaksiInFirestore`, `deactivateUangJalanTransaksiForSJ`, `generateSessionId`, `formatCurrency`, `formatTanggalID`, `downloadSJRecapToExcel`, `sanitizeForFirestore`, `upsertItemToFirestore`, collection namespace helper `C`
  - Lines: 18–312
  - Coupling: n/a (these are consumed by everything; extract as a `src/utils/` + `src/services/` bundle)
  - Financial: yes — `uangJalan` in `downloadSJRecapToExcel`; `upsertItemToFirestore` used for all writes

---

## Safe extraction order

1. **U2 `StatCard`** — zero deps, pure presentational, 13 lines; ideal first PR to test the pipeline
2. **U1 `SearchableSelect`** — self-contained reusable component, zero Firestore deps; used by U11 so must be extracted before U11
3. **U3 `LoginScreen`** — isolated screen with no Firestore writes; one `onLogin` callback seam
4. **U4 `UsersManagement`** — no Firestore calls, no financial logic, clear prop boundary
5. **U5 `SettingsManagement`** — local state + one callback; low-risk settings screen
6. **U12 Global helper cluster** — extract to `src/utils/firestoreHelpers.js` + `src/utils/formatters.js`; prerequisite before extracting pages that import them (blocked until U2–U5 are stable)
7. **U6 `MasterDataManagement`** — medium coupling (XLSX import, multiple callbacks); safe after helpers extracted
8. **U7 `LaporanKas`** — financial aggregation but read-only (no writes); extract UI shell, keep aggregation functions byte-identical
9. **U8 `KeuanganManagement`** — financial totals but all computed from passed props; extract after U7 to validate the pattern
10. **U10 `SuratJalanCard`** — high prop count; extract after `getStatusColor`/`getStatusIcon` helpers are promoted to module scope or U12
11. **U9 `InvoiceManagement`** — complex integration + financial; extract last among section-components
12. **U11 `Modal`** — largest/most complex unit (>1100 lines, 15 modal types); recommend splitting into per-entity sub-modals in a later phase, not in the first extraction pass

---

## Financial units (require human review before extraction)

- **U7 `LaporanKas`:** touches `uangJalan` totals and per-PT kas summaries across `suratJalanList` and `transaksiList`. Extract UI shell only; keep all `sumNominal`, `totalKasKeluarUangJalan`, per-PT aggregation functions byte-identical. Flag in PR for accountant review.
- **U8 `KeuanganManagement`:** computes `totalPemasukan`, `totalPengeluaran`, `saldoKas` from `transaksiList`. Same rule — UI shell move only, no formula changes.
- **U9 `InvoiceManagement`:** `hargaSatuan`/`totalNilai` logic in `exportInvoiceToExcel`, `addInvoice` (in parent), integration bridge calls. Move UI shell; keep CSV export formula byte-identical.
- **U10 `SuratJalanCard`:** displays `uangJalan`, enforces lock state for `menunggu_review`/`terkunci`. No computation, but lock-state guards are business-critical — extract byte-identical.
- **U11 `Modal`:** `hargaSatuan` and `uangJalan` inputs, invoice total preview, rute `uangJalan` auto-fill. All form submit logic delegates to parent `onSubmit` — extract form UI byte-identical, do not touch the submitted data shape.
- **U12 helpers:** `upsertUangJalanTransaksiForSJ`, `sanitizeForFirestore`, `softDeleteItemInFirestore` — move as pure byte copies to `src/utils/`; zero logic changes.
