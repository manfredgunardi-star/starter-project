# UI Redesign — Floating Dock, Readability, Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top gradient header + horizontal tab bar with a minimal page title bar and a fixed floating bottom dock, improve typography with Inter font, and restyle the Surat Jalan list to a compact table layout — all in `App.jsx` and `index.css` with no structural refactor.

**Architecture:** Purely additive/replacement UI changes inside the existing monolith. The header block (~lines 1991–2031) and tab nav block (~lines 2037–2104) are removed and replaced with new JSX. A floating dock `<nav>` is added as the last child of the root `<div>`. The `SuratJalanCard` list wrapper is replaced with a table-style container that renders the same cards in compact rows.

**Tech Stack:** React 18, Tailwind CSS 3, lucide-react ^0.263, Vite, Firebase Hosting

**Spec:** `docs/superpowers/specs/2026-04-02-ui-redesign-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/index.css` | Add Inter Google Fonts import, set base font/line-height |
| `tailwind.config.cjs` | Extend `fontFamily.sans` with Inter |
| `src/App.jsx` | Remove header block, remove tab nav block, add PAGE_TITLES + minimal top bar, add floating dock, update StatCards, update SJ list to table style, add `pb-24` to content wrapper |
| `src/components/StatCard.jsx` | Update to flat white style with colored value number |

---

## Task 1: Typography — Inter font

**Files:**
- Modify: `src/index.css`
- Modify: `tailwind.config.cjs`

- [ ] **Step 1: Add Inter import and base styles to `src/index.css`**

Replace the entire contents of `src/index.css` with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
}

@layer utilities {
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
}
```

> Note: The `@import` must be before `@tailwind base` — CSS imports must come first.

- [ ] **Step 2: Extend Tailwind fontFamily in `tailwind.config.cjs`**

Replace the contents of `tailwind.config.cjs` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Verify in dev server**

```bash
cd sj-monitor && npm run dev
```

Open http://localhost:5173. The app text should now render in Inter (clean, geometric sans-serif). Compare a heading — it should look noticeably sharper than before.

- [ ] **Step 4: Commit**

```bash
cd sj-monitor
git add src/index.css tailwind.config.cjs
git commit -m "ui: add Inter font and base typography styles"
```

---

## Task 2: Update StatCard to flat style

**Files:**
- Modify: `src/components/StatCard.jsx`

- [ ] **Step 1: Replace StatCard with flat white version**

The current StatCard uses a colored icon background (`color` prop like `"bg-blue-500"`). The new design uses a flat white card with a colored number value instead. The `color` prop values passed in App.jsx map to: blue=Total, yellow=Pending, green=Terkirim, red=Gagal.

Replace the entire contents of `src/components/StatCard.jsx`:

```jsx
// src/components/StatCard.jsx

const VALUE_COLOR = {
  'bg-blue-500':   'text-blue-600',
  'bg-yellow-500': 'text-yellow-600',
  'bg-green-500':  'text-green-600',
  'bg-red-500':    'text-red-600',
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between mb-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
      <span className={`${VALUE_COLOR[color] ?? 'text-slate-400'} opacity-60`}>{icon}</span>
    </div>
    <p className={`text-2xl font-bold ${VALUE_COLOR[color] ?? 'text-slate-800'}`}>{value}</p>
  </div>
);

export default StatCard;
```

- [ ] **Step 2: Verify in dev server**

The 4 stat cards (Total SJ, Pending, Terkirim, Gagal) should now be flat white with colored numbers instead of gradient icon backgrounds.

- [ ] **Step 3: Commit**

```bash
cd sj-monitor
git add src/components/StatCard.jsx
git commit -m "ui: update StatCard to flat white style with colored values"
```

---

## Task 3: Remove gradient header, add minimal top bar

**Files:**
- Modify: `src/App.jsx` (lines ~1988–2031)

The section to remove starts at:
```jsx
{/* Header */}
<div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
```
and ends at the closing `</div>` before `{/* Force Logout Warning Banner */}` (~line 2031).

The section to add is a minimal sticky white bar that shows the current tab's title and the logged-in user's name.

- [ ] **Step 1: Add PAGE_TITLES constant in App.jsx**

Find the line near the top of the main `App` component function (around line 370, after the state declarations). Add this constant just before the `return (` statement (search for `return (` inside the main App function, around line 1988):

```jsx
const PAGE_TITLES = {
  'surat-jalan': 'Surat Jalan',
  'keuangan': 'Keuangan',
  'laporan-kas': 'Laporan Kas',
  'invoicing': 'Invoicing',
  'master-data': 'Master Data',
  'users': 'Kelola User',
  'settings': 'Pengaturan',
};
```

Place it immediately before `return (` in the main App component (search for `return (` at roughly line 1988 and insert PAGE_TITLES above it).

- [ ] **Step 2: Add `User` to the lucide-react import**

Find line 27:
```jsx
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

Add `User` to the import list:
```jsx
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, User, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

- [ ] **Step 3: Remove the gradient header block**

In App.jsx, find and delete the entire header block. It starts with:
```jsx
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
```
and ends just before:
```jsx
      {/* Force Logout Warning Banner */}
```
Delete everything between those two comments (inclusive of the header comment and its div, exclusive of the Force Logout comment).

- [ ] **Step 4: Add the minimal top bar in its place**

Insert this JSX immediately before `{/* Force Logout Warning Banner */}`:

```jsx
      {/* Minimal top bar */}
      {effectiveRole && (
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">
            {PAGE_TITLES[activeTab] ?? 'Monitoring SJ'}
          </h1>
          <div className="flex items-center gap-2 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-semibold">
            <User className="w-3 h-3" />
            <span>{currentUser?.name ?? ''}</span>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Verify**

Dev server should show: no blue gradient header. Instead, a clean white bar with the current tab name on the left and the user's name on the right. The ForceLogout banner still works below it.

- [ ] **Step 6: Commit**

```bash
cd sj-monitor
git add src/App.jsx
git commit -m "ui: remove gradient header, add minimal sticky top bar"
```

---

## Task 4: Replace tab navigation with floating bottom dock

**Files:**
- Modify: `src/App.jsx` (lines ~2037–2109)

- [ ] **Step 1: Add `Settings` and `Database` to the lucide-react import**

Update the import line (already modified in Task 3) to also include `Settings` and `Database`:

```jsx
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, User, Settings, Database, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

- [ ] **Step 2: Add DOCK_ITEMS constant**

Place this immediately after the `PAGE_TITLES` constant added in Task 3:

```jsx
const DOCK_ITEMS = [
  { tab: 'surat-jalan', icon: Package,     label: 'SJ',       roles: ['superadmin','admin_sj','admin_keuangan','admin_invoice','reader'] },
  { tab: 'keuangan',    icon: DollarSign,  label: 'Keuangan', roles: ['superadmin','admin_keuangan','reader'] },
  { tab: 'laporan-kas', icon: FileText,    label: 'Laporan',  roles: ['superadmin','admin_keuangan','admin_invoice','admin_sj','reader'] },
  { tab: 'invoicing',   icon: FileText,    label: 'Invoice',  roles: ['superadmin','admin_invoice','reader'] },
  { tab: 'master-data', icon: Database,    label: 'Data',     roles: ['superadmin'] },
  { tab: 'users',       icon: Users,       label: 'Users',    roles: ['superadmin'] },
  { tab: 'settings',    icon: Settings,    label: 'Settings', roles: ['superadmin'] },
].filter(item => item.roles.includes(effectiveRole ?? ''));
```

> `DOCK_ITEMS` uses `effectiveRole` which is already defined before `return (`, so placing this just before `return (` is correct.

- [ ] **Step 3: Remove the old tab navigation block**

Find and delete the entire tab navigation block. It starts with:
```jsx
      {/* Tab Navigation */}
      {effectiveRole && (
        <div className="max-w-7xl mx-auto px-3 py-2 sm:px-6 sm:py-4">
          <div className="flex gap-2 sm:gap-3 bg-white/80 backdrop-blur rounded-2xl p-2 sm:p-3 shadow-sm overflow-x-auto scrollbar-hide sm:flex-wrap">
```
and ends with the closing of `{effectiveRole && (` — just before `{/* Content */}`.

Delete everything from `{/* Tab Navigation */}` up to and including the closing `)}` of the `effectiveRole` block, stopping just before `{/* Content */}`.

- [ ] **Step 4: Add floating bottom dock**

Find the closing `</div>` of the root element (the last `</div>` before `);` in the main return, which closes `<div className="min-h-screen bg-gray-50">`). Insert the dock as the last child before that closing tag:

```jsx
      {/* Floating bottom dock */}
      {effectiveRole && (
        <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-black/10 ring-1 ring-white/80 flex items-center justify-around px-2 py-2">
            {DOCK_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-colors duration-150 min-w-[48px] cursor-pointer ${
                    isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                  title={item.label}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    isActive ? 'bg-blue-600' : ''
                  }`}>
                    <Icon className={`w-[18px] h-[18px] ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`} />
                  </div>
                  <span className={`text-[10px] font-semibold leading-none ${
                    isActive ? 'text-blue-600' : 'text-slate-400'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
```

- [ ] **Step 5: Add `pb-24` to the content wrapper**

Find this line (~line 2109 in the original, now shifted):
```jsx
      <div className="max-w-7xl mx-auto px-3 pb-6 sm:px-6 sm:pb-10">
```
Change it to:
```jsx
      <div className="max-w-7xl mx-auto px-3 pb-24 sm:px-6 sm:pb-28">
```

- [ ] **Step 6: Verify**

- The horizontal tab bar is gone
- A white pill dock is fixed at the bottom of the viewport
- Clicking dock items switches pages correctly
- Role-gating works: log in as a non-superadmin and confirm only allowed tabs appear
- Content is not hidden behind the dock (scroll to bottom of a long page)

- [ ] **Step 7: Commit**

```bash
cd sj-monitor
git add src/App.jsx
git commit -m "ui: replace tab nav with floating bottom dock"
```

---

## Task 5: Surat Jalan table-style list

**Files:**
- Modify: `src/App.jsx` (lines ~2374–2421, the SJ list render block)

The goal is to replace the `<div className="space-y-4">` that renders `SuratJalanCard` cards with a table-style white card container. The SuratJalanCards are kept — they render as compact rows in collapsed state. We wrap them in a structured table layout.

- [ ] **Step 1: Add a `StatusBadge` component constant in App.jsx**

Find the `InvoiceManagement` component declaration near line 32. Insert the `StatusBadge` component immediately above it (before `const InvoiceManagement`):

```jsx
// Compact status badge for table rows
const STATUS_BADGE_STYLES = {
  'dalam perjalanan': 'bg-orange-50 text-orange-600',
  'terkirim':         'bg-green-50 text-green-600',
  'gagal':            'bg-red-50 text-red-600',
  'pending':          'bg-slate-100 text-slate-500',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${STATUS_BADGE_STYLES[status?.toLowerCase()] ?? 'bg-slate-100 text-slate-500'}`}>
    {status ?? '—'}
  </span>
);
```

- [ ] **Step 2: Replace the SJ list wrapper**

Find the block (around line 2374):
```jsx
        {/* Surat Jalan List */}
        <div className="space-y-4">
          {filteredSuratJalan.length === 0 ? (
```

Replace the outer `<div className="space-y-4">` opening tag and the empty-state block structure with a table-style container. The full replacement from `{/* Surat Jalan List */}` through the closing `</div>` of `space-y-4` (line ~2421) should become:

```jsx
        {/* Surat Jalan List */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_1.5fr_1.2fr_100px] px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>No. SJ</span>
            <span>Rute</span>
            <span>Supir · Truk</span>
            <span>Status</span>
          </div>
          {filteredSuratJalan.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Belum ada data Surat Jalan</p>
              {(effectiveRole === 'superadmin' || effectiveRole === 'admin_sj') && (
                <button
                  onClick={() => {
                    setModalType('addSJ');
                    setSelectedItem(null);
                    setShowModal(true);
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Surat Jalan Pertama</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredSuratJalan.map(sj => (
                <SuratJalanCard
                  key={sj.id}
                  suratJalan={sj}
                  biayaList={biayaList.filter(b => b.suratJalanId === sj.id)}
                  totalBiaya={getTotalBiaya(sj.id)}
                  currentUser={currentUser}
                  onUpdate={(sj) => {
                    setSelectedItem(sj);
                    setModalType('markTerkirim');
                    setShowModal(true);
                  }}
                  onEditTerkirim={(sj) => {
                    setSelectedItem(sj);
                    setModalType('editTerkirim');
                    setShowModal(true);
                  }}
                  onMarkGagal={markAsGagal}
                  onRestore={restoreFromGagal}
                  onDeleteBiaya={deleteBiaya}
                  formatCurrency={formatCurrency}
                  getStatusColor={getStatusColor}
                  getStatusIcon={getStatusIcon}
                />
              ))}
            </div>
          )}
        </div>
```

> Note: `SuratJalanCard` props are unchanged — no logic is affected. The visual container is what changes. The column headers appear only on `sm:` and above; on mobile the card itself is responsible for layout.

- [ ] **Step 3: Update `SuratJalanCard.jsx` collapsed row style**

Read `src/components/SuratJalanCard.jsx` to find the outermost wrapper div. Add `border-0` and tighten the default padding to fit within the table container. Change the outer wrapper from whatever shadow/rounded classes it has to:

```
className="border-0 rounded-none"
```

And ensure the card's own top-level background is transparent (so the white table container background shows through), by removing any `bg-white` or `shadow` on the outer wrapper. The table container provides the white background and shadow.

> SuratJalanCard's internal expand/collapse behavior is unchanged. Only its outer wrapper styling changes.

- [ ] **Step 4: Verify**

- SJ list shows as a clean table-style container with column headers on desktop
- On mobile, cards render inside the container without the column headers
- Expanding a card still works
- Empty state shows correctly

- [ ] **Step 5: Commit**

```bash
cd sj-monitor
git add src/App.jsx src/components/SuratJalanCard.jsx
git commit -m "ui: restyle SJ list to table layout inside white container"
```

---

## Task 6: Build and deploy to Firebase Hosting

**Files:**
- No source file changes — build + deploy only

- [ ] **Step 1: Run production build**

```bash
cd sj-monitor && npm run build
```

Expected output ends with something like:
```
✓ built in Xs
dist/index.html        X kB
dist/assets/index-XXX.js   XXX kB
```

If there are TypeScript/lint errors, fix them before proceeding.

- [ ] **Step 2: Preview locally (optional sanity check)**

```bash
npm run preview
```

Open http://localhost:4173 — verify the floating dock, top bar, and Inter font all appear correctly on the production build.

- [ ] **Step 3: Deploy to Firebase Hosting**

```bash
firebase deploy --only hosting
```

Expected output ends with:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/...
Hosting URL: https://<your-project>.web.app
```

- [ ] **Step 4: Verify on live URL**

Open the Hosting URL in a mobile browser (or Chrome DevTools mobile emulation at 375px width). Confirm:
- Inter font loads
- No top gradient header
- Floating bottom dock visible and functional
- Stat cards are flat white
- SJ list renders in table-style container
- Dock does not obscure the last content row

- [ ] **Step 5: Final commit (tag the release)**

```bash
cd sj-monitor
git add -A
git commit -m "ui: deploy floating dock + readability redesign to Firebase Hosting"
```

---

## Self-Review Checklist

- [x] **Typography (Task 1):** Covered — Inter import in index.css, tailwind fontFamily extended
- [x] **Remove header (Task 3):** Covered — gradient header removed, minimal top bar added
- [x] **Floating dock (Task 4):** Covered — DOCK_ITEMS with role-gating, dock JSX, pb-24 on content
- [x] **StatCard flat style (Task 2):** Covered — VALUE_COLOR map, colored number instead of icon bg
- [x] **Table-style SJ list (Task 5):** Covered — wrapper replaced, column headers, SuratJalanCard props unchanged
- [x] **Company name removed:** Confirmed — header block deleted, appSettings.companyName not rendered in app
- [x] **Deploy (Task 6):** Covered — npm run build + firebase deploy steps
- [x] **Role-gating preserved:** DOCK_ITEMS filter uses same role arrays as the old tab nav
- [x] **pb-24 content padding:** Covered in Task 4 Step 5
- [x] **`Receipt` icon avoided:** Using `FileText` for Invoice tab (confirmed in lucide-react ^0.263)
- [x] **No placeholders or TBDs:** All steps have complete code
