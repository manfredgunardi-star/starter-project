# Mobile-Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sj-monitor app fully usable on smartphones (360px-414px viewport) by adjusting Tailwind CSS classes — no structural rewrites, no new dependencies.

**Architecture:** Pure CSS-level changes using Tailwind's existing responsive prefixes (`sm:`, `md:`, `lg:`). Mobile-first approach: default classes target phones, `sm:` for tablets (640px+), `md:` for desktops (768px+). Navigation converted from horizontal tab bar to a horizontally-scrollable pill strip on mobile. Tables get horizontal scroll wrappers with tighter padding. Modals become full-screen drawers on phones.

**Tech Stack:** Tailwind CSS 3 (already installed), no new deps.

**Key design decisions:**
- No hamburger menu — the app has 3-7 tabs depending on role, a scrollable pill strip is simpler and more discoverable
- Tables stay as tables (not converted to card layouts) — users need to scan columns for comparison; horizontal scroll is the standard mobile pattern
- Modals go full-screen on mobile — forms with 7+ fields need the viewport height

---

### Task 1: Header — Compact for Mobile

**Files:**
- Modify: `src/App.jsx:1988-2030` (header JSX block)

The header currently shows logo + title + subtitle + username + role + logout button in a single row. On a 360px phone this overflows.

- [ ] **Step 1: Update the header layout classes**

Change the header block (around line 1988-2030 of App.jsx) from:

```jsx
<div className="max-w-7xl mx-auto px-4 py-4">
  <div className="flex justify-between items-center">
    <div className="flex items-center space-x-3">
```

To:

```jsx
<div className="max-w-7xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
  <div className="flex justify-between items-center gap-2">
    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
```

- [ ] **Step 2: Make the title text responsive**

Change:

```jsx
<h1 className="text-2xl font-bold">Monitoring Surat Jalan</h1>
<p className="text-blue-100 text-sm">Sistem Tracking & Monitoring Biaya</p>
```

To:

```jsx
<h1 className="text-base sm:text-2xl font-bold truncate">Monitoring Surat Jalan</h1>
<p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Sistem Tracking & Monitoring Biaya</p>
```

The subtitle is hidden on mobile (it's not essential info). The title shrinks to `text-base` and truncates if needed.

- [ ] **Step 3: Compact the user info and logout button**

Change the right side from:

```jsx
<div className="flex items-center space-x-4">
  <div className="text-right">
    <p className="font-semibold">{currentUser.name}</p>
    <p className="text-blue-100 text-sm capitalize">{effectiveRole}</p>
  </div>
  <button
    onClick={handleLogout}
    className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg flex items-center space-x-2 transition"
  >
    <LogOut className="w-4 h-4" />
    <span>Logout</span>
  </button>
</div>
```

To:

```jsx
<div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
  <div className="text-right hidden sm:block">
    <p className="font-semibold">{currentUser.name}</p>
    <p className="text-blue-100 text-sm capitalize">{effectiveRole}</p>
  </div>
  <button
    onClick={handleLogout}
    className="bg-blue-700 hover:bg-blue-600 p-2 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-2 transition"
    title={`${currentUser.name} (${effectiveRole}) - Logout`}
  >
    <LogOut className="w-4 h-4" />
    <span className="hidden sm:inline">Logout</span>
  </button>
</div>
```

On mobile: user name/role hidden, logout button is icon-only. The `title` attribute shows the info on long-press.

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Open Chrome DevTools → toggle device toolbar → select iPhone SE (375px).
Expected: Header fits in one row. Logo, truncated title, icon-only logout button visible. No horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "ui: make header responsive for mobile viewports"
```

---

### Task 2: Tab Navigation — Scrollable on Mobile

**Files:**
- Modify: `src/App.jsx:2036-2103` (tab navigation block)

Currently uses `flex-wrap gap-3` which makes tabs wrap to 2-3 rows on mobile, wasting vertical space. Change to a horizontally scrollable strip.

- [ ] **Step 1: Update tab container classes**

Change:

```jsx
<div className="max-w-7xl mx-auto px-6 py-4">
  <div className="flex flex-wrap gap-3 bg-white/80 backdrop-blur rounded-2xl p-3 shadow-sm">
```

To:

```jsx
<div className="max-w-7xl mx-auto px-3 py-2 sm:px-6 sm:py-4">
  <div className="flex gap-2 sm:gap-3 bg-white/80 backdrop-blur rounded-2xl p-2 sm:p-3 shadow-sm overflow-x-auto scrollbar-hide sm:flex-wrap">
```

- [ ] **Step 2: Make tab buttons compact on mobile**

For each tab button (there are up to 7), change the class pattern from:

```jsx
className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${...}`}
```

To:

```jsx
className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-sm sm:text-base font-medium flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0 ${...}`}
```

Apply this to ALL 7 tab buttons in the block. The key additions are `whitespace-nowrap flex-shrink-0` (prevent wrapping inside scroll container), smaller padding/text on mobile.

- [ ] **Step 3: Add scrollbar-hide utility to CSS**

Add to `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

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

- [ ] **Step 4: Verify visually**

DevTools → iPhone SE (375px).
Expected: Tabs are in a single scrollable row. Swiping left/right reveals more tabs. No scrollbar visible.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/index.css
git commit -m "ui: make tab navigation horizontally scrollable on mobile"
```

---

### Task 3: Content Container Padding

**Files:**
- Modify: `src/App.jsx:2108` (content wrapper)

- [ ] **Step 1: Reduce mobile padding**

Change:

```jsx
<div className="max-w-7xl mx-auto px-6 pb-10">
```

To:

```jsx
<div className="max-w-7xl mx-auto px-3 pb-6 sm:px-6 sm:pb-10">
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "ui: reduce content padding on mobile"
```

---

### Task 4: StatCard — Responsive Grid & Sizing

**Files:**
- Modify: `src/components/StatCard.jsx` (component)
- Modify: `src/App.jsx:2220` (grid wrapper)

- [ ] **Step 1: Update the StatCard component**

Replace the entire content of `src/components/StatCard.jsx`:

```jsx
// src/components/StatCard.jsx

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-xs sm:text-sm">{title}</p>
        <p className="text-xl sm:text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${color} p-2 sm:p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

export default StatCard;
```

- [ ] **Step 2: Update the grid wrapper in App.jsx**

Change:

```jsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
```

To:

```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
```

On mobile: 2 columns (4 stat cards in a 2x2 grid). On sm+: 4 columns.

- [ ] **Step 3: Verify visually**

DevTools → iPhone SE.
Expected: 4 stat cards arranged 2x2 on phone. Text is legible. No overflow.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatCard.jsx src/App.jsx
git commit -m "ui: responsive stat cards - 2-col grid on mobile"
```

---

### Task 5: SuratJalan Actions & Filters — Stack on Mobile

**Files:**
- Modify: `src/App.jsx:2248-2371` (actions bar + filter section)

- [ ] **Step 1: Update the action buttons section**

Change the action buttons container around line 2248:

```jsx
<div className="bg-white rounded-lg shadow-md p-4 mb-6">
  <div className="flex flex-wrap gap-3 items-center justify-between">
    <div className="flex gap-2 flex-wrap">
```

To:

```jsx
<div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-4 sm:mb-6">
  <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-between">
    <div className="flex gap-2 flex-wrap">
```

- [ ] **Step 2: Make action buttons compact on mobile**

For each action button (Tambah Surat Jalan, Download Template, Import Data, Download Rekapan), change from:

```jsx
className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
```

To:

```jsx
className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base transition"
```

Apply this pattern to all 4 action buttons in the block. Also hide the label text on very small screens for the secondary buttons (Download Template, Import Data):

For "Download Template" button, change `<span>Download Template</span>` to:
```jsx
<span className="hidden sm:inline">Download Template</span>
<span className="sm:hidden">Template</span>
```

For "Import Data" button, change `<span>Import Data</span>` to:
```jsx
<span className="hidden sm:inline">Import Data</span>
<span className="sm:hidden">Import</span>
```

- [ ] **Step 3: Make filter buttons compact**

For the status filter buttons (Semua, Pending, Terkirim, Gagal), change from:

```jsx
className={`px-4 py-2 rounded-lg transition ${...}`}
```

To:

```jsx
className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base transition ${...}`}
```

Apply to all 4 filter buttons.

- [ ] **Step 4: Update the date filter grid**

Change:

```jsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
```

To:

```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 items-end">
```

This gives date fields a 2x2 grid on mobile instead of stacking 4 items vertically.

- [ ] **Step 5: Verify visually**

DevTools → iPhone SE.
Expected: Buttons fit without overflow. Filter grid is 2x2 on mobile. Short button labels visible.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "ui: compact action buttons and filters for mobile"
```

---

### Task 6: SuratJalanCard — Mobile Layout

**Files:**
- Modify: `src/components/SuratJalanCard.jsx`

The card currently has a side-by-side layout (info left, buttons right) that breaks on mobile because buttons have `whitespace-nowrap` and force horizontal overflow.

- [ ] **Step 1: Stack the card layout on mobile**

Change the outer card layout (around line 43):

```jsx
<div className="flex items-start justify-between mb-4">
  <div className="flex-1">
```

To:

```jsx
<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-4">
  <div className="flex-1 min-w-0">
```

- [ ] **Step 2: Make the header text responsive**

Change:

```jsx
<h3 className="text-xl font-bold text-gray-800">{suratJalan.nomorSJ}</h3>
```

To:

```jsx
<h3 className="text-lg sm:text-xl font-bold text-gray-800 truncate">{suratJalan.nomorSJ}</h3>
```

- [ ] **Step 3: Make the detail grid responsive**

Change:

```jsx
<div className="grid grid-cols-2 gap-4 text-sm">
```

To:

```jsx
<div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
```

Also change the second grid (in the expanded detail section):

```jsx
<div className="grid grid-cols-2 gap-3 text-sm">
```

To:

```jsx
<div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
```

- [ ] **Step 4: Make action buttons horizontal on mobile**

Change the button container:

```jsx
<div className="flex flex-col space-y-2 ml-4">
```

To:

```jsx
<div className="flex flex-wrap gap-2 sm:flex-col sm:gap-2 sm:ml-4">
```

On mobile: buttons wrap horizontally below the card info. On desktop: vertical stack on the right.

- [ ] **Step 5: Make buttons compact**

For each action button, change from:

```jsx
className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
```

To:

```jsx
className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
```

Apply this pattern to ALL action buttons in the card (Tandai Terkirim, Edit, Tandai Gagal, Batalkan, Restore, Detail). Change all `px-4 py-2` to `px-3 py-1.5 sm:px-4 sm:py-2` and all `text-sm` to `text-xs sm:text-sm`.

- [ ] **Step 6: Update card container padding**

Change:

```jsx
<div className="p-6">
```

To:

```jsx
<div className="p-4 sm:p-6">
```

- [ ] **Step 7: Verify visually**

DevTools → iPhone SE.
Expected: Card info stacks vertically. Buttons are below card content in a horizontal wrap. Text is legible.

- [ ] **Step 8: Commit**

```bash
git add src/components/SuratJalanCard.jsx
git commit -m "ui: responsive SuratJalanCard - stacked layout on mobile"
```

---

### Task 7: Modal — Full-Screen on Mobile

**Files:**
- Modify: `src/App.jsx:3906-3908` (Modal component wrapper)

- [ ] **Step 1: Update the modal container**

Change:

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className={`bg-white rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'max-w-2xl' : 'max-w-md'} w-full p-6 max-h-[90vh] overflow-y-auto`}>
```

To:

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
  <div className={`bg-white rounded-t-2xl sm:rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'sm:max-w-2xl' : 'sm:max-w-md'} w-full p-4 sm:p-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto`}>
```

On mobile: modal slides up from bottom (like a bottom sheet), full width, rounded top corners, 95vh max height. On sm+: centered modal as before.

- [ ] **Step 2: Make the form grid responsive inside addSJ modal**

Change the `grid grid-cols-2 gap-4` grids inside the addSJ form (around lines 3916 and 3992):

```jsx
<div className="grid grid-cols-2 gap-4">
```

To:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
```

Apply to BOTH grid instances in the addSJ modal form.

- [ ] **Step 3: Make the markTerkirim info grid responsive**

Change (around line 4032):

```jsx
<div className="grid grid-cols-2 gap-3 text-sm">
```

To:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
```

- [ ] **Step 4: Make the modal title responsive**

Change:

```jsx
<h2 className="text-2xl font-bold text-gray-800 mb-4">
```

To:

```jsx
<h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">
```

- [ ] **Step 5: Verify visually**

DevTools → iPhone SE.
Expected: Modal appears from bottom, full-width, scrollable. Form fields stack to single column. Title is smaller.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "ui: bottom-sheet modal on mobile, responsive form grids"
```

---

### Task 8: Alert & Confirm Dialogs — Mobile Sizing

**Files:**
- Modify: `src/App.jsx:2496-2539` (alert + confirm dialogs)
- Modify: `src/pages/LoginPage.jsx:93-109` (login alert)

- [ ] **Step 1: Update alert dialog in App.jsx**

Change (around line 2497):

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
```

To:

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
  <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl sm:max-w-md w-full p-4 sm:p-6">
```

- [ ] **Step 2: Update confirm dialog in App.jsx**

Change (around line 2516):

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
```

To:

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
  <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl sm:max-w-md w-full p-4 sm:p-6">
```

- [ ] **Step 3: Update login alert dialog**

In `src/pages/LoginPage.jsx`, change (around line 94):

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
```

To:

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
  <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl sm:max-w-md w-full p-4 sm:p-6">
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/pages/LoginPage.jsx
git commit -m "ui: bottom-sheet dialogs on mobile"
```

---

### Task 9: LoginPage — Mobile Polish

**Files:**
- Modify: `src/pages/LoginPage.jsx`

- [ ] **Step 1: Update login container padding and title**

Change:

```jsx
<div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
```

To:

```jsx
<div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-md">
```

Change the title:

```jsx
<h2 className="text-3xl font-bold text-gray-800">Monitoring Surat Jalan</h2>
```

To:

```jsx
<h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Monitoring Surat Jalan</h2>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LoginPage.jsx
git commit -m "ui: responsive login page padding and title"
```

---

### Task 10: AlertBanner — Mobile Compact

**Files:**
- Modify: `src/components/AlertBanner.jsx`

- [ ] **Step 1: Update banner layout**

Replace the entire content of `src/components/AlertBanner.jsx`:

```jsx
// src/components/AlertBanner.jsx
import { Clock } from 'lucide-react';

const AlertBanner = ({ banner }) => {
  if (!banner) return null;
  return (
    <div className="bg-amber-400 text-amber-900 px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between shadow">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-semibold text-xs sm:text-sm">
          Logout otomatis dalam{' '}
          <strong>{banner.minutesRemaining} menit</strong>
          {banner.reason ? ` — ${banner.reason}` : ''}.
          Simpan pekerjaan Anda.
        </span>
      </div>
      <span className="text-xs font-mono opacity-75 ml-2 sm:ml-4 flex-shrink-0 hidden sm:inline">
        {banner.scheduledAtLocal}
      </span>
    </div>
  );
};

export default AlertBanner;
```

On mobile: smaller padding/text, timestamp hidden (saves horizontal space). Shortened text ("Segera simpan" → "Simpan").

- [ ] **Step 2: Commit**

```bash
git add src/components/AlertBanner.jsx
git commit -m "ui: compact alert banner on mobile"
```

---

### Task 11: LaporanKasPage — Responsive Tables & Cards

**Files:**
- Modify: `src/pages/LaporanKasPage.jsx`

- [ ] **Step 1: Update filter grid**

Change:

```jsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
```

To:

```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
```

- [ ] **Step 2: Update summary stat cards**

Change the summary cards grid:

```jsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
```

To:

```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
```

For each of the 4 summary cards, change `p-6` to `p-3 sm:p-6` and `text-2xl` to `text-lg sm:text-2xl` and `text-4xl` to `text-2xl sm:text-4xl`:

For example, the "Total Kas Masuk" card:

```jsx
<div className="bg-green-600 text-white rounded-lg p-3 sm:p-6">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-green-100 text-xs sm:text-sm">Total Kas Masuk</p>
      <p className="text-lg sm:text-2xl font-bold">{formatCurrency(totalKasMasuk)}</p>
    </div>
    <div className="text-2xl sm:text-4xl opacity-75">⬆️</div>
  </div>
</div>
```

Apply the same pattern to all 4 summary cards (red/blue/gray).

- [ ] **Step 3: Update PT recap cards grid**

Change:

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
```

To:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
```

- [ ] **Step 4: Tighten table cell padding**

For ALL tables in the file (there are 3), change the cell classes. Find all occurrences of:

```jsx
className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
```

Replace with:

```jsx
className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
```

And for all data cells, find:

```jsx
className="px-4 py-3 text-sm text-gray-900"
```

Replace with:

```jsx
className="px-2 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-gray-900"
```

Also change the right-aligned amount cells similarly. Find all occurrences of:

```jsx
className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
```

Replace with:

```jsx
className="px-2 py-2 sm:px-4 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
```

And find all amount data cells like:

```jsx
className="px-4 py-3 text-sm text-right text-green-700 font-semibold"
```

Replace with:

```jsx
className="px-2 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-right text-green-700 font-semibold"
```

(Same for `text-red-700` variant.)

- [ ] **Step 5: Update section container padding**

For all `bg-white rounded-xl shadow-sm p-6` containers in the file, change to `p-3 sm:p-6`.

- [ ] **Step 6: Verify visually**

DevTools → iPhone SE.
Expected: Filter grid is 2x2. Summary cards are 2x2 with smaller text. Tables are scrollable with tighter padding. All text legible.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LaporanKasPage.jsx
git commit -m "ui: responsive tables and cards in LaporanKasPage"
```

---

### Task 12: SearchableSelect — Touch-Friendly

**Files:**
- Modify: `src/components/SearchableSelect.jsx`

- [ ] **Step 1: Increase touch target size for options**

Change the dropdown option class:

```jsx
className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
  option[valueKey] === value ? 'bg-blue-100 font-semibold' : ''
}`}
```

To:

```jsx
className={`px-3 py-3 sm:py-2 cursor-pointer hover:bg-blue-50 ${
  option[valueKey] === value ? 'bg-blue-100 font-semibold' : ''
}`}
```

The `py-3` on mobile ensures a 44px minimum touch target (recommended by Apple/Google).

- [ ] **Step 2: Increase max dropdown height on mobile**

Change:

```jsx
<div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
```

To:

```jsx
<div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 sm:max-h-60 overflow-hidden">
```

And change the inner scrollable:

```jsx
<div className="overflow-y-auto max-h-48">
```

To:

```jsx
<div className="overflow-y-auto max-h-60 sm:max-h-48">
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchableSelect.jsx
git commit -m "ui: touch-friendly SearchableSelect dropdown"
```

---

### Task 13: Inline Components in App.jsx — Quick Mobile Fixes

**Files:**
- Modify: `src/App.jsx` — the inline components (KeuanganManagement, MasterDataManagement, UsersManagement, InvoiceManagement, SettingsManagement)

These are still inline in App.jsx. Rather than extracting them (that's a different plan), apply quick responsive fixes to each.

- [ ] **Step 1: Find and update all `grid-cols-1 md:grid-cols-` patterns**

Search App.jsx for `grid-cols-1 md:grid-cols-` and add the `sm:` breakpoint where appropriate:

- `grid-cols-1 md:grid-cols-2` → `grid-cols-1 sm:grid-cols-2` (for 2-col layouts)
- `grid-cols-1 md:grid-cols-3` → `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` (for 3-col layouts)
- `grid-cols-1 md:grid-cols-4` → `grid-cols-2 sm:grid-cols-4` (for stat-like grids)

- [ ] **Step 2: Find and update all table cell padding**

Search App.jsx for `px-4 py-3` in table cells (th/td). Apply the same pattern as Task 11:

- Headers: `px-2 py-2 sm:px-4 sm:py-3`
- Data cells: add `text-xs sm:text-sm` if not already present

- [ ] **Step 3: Find and update all `p-6` section containers**

Search App.jsx for `shadow-md p-6` and `shadow-sm p-6` in section wrappers. Change to `p-3 sm:p-6`.

- [ ] **Step 4: Verify visually**

Check each tab on iPhone SE:
- Keuangan: table scrollable, readable
- Master Data: cards/tables readable
- Users: table readable
- Invoicing: table readable
- Settings: forms single-column on mobile

Expected: No horizontal overflow on any tab.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "ui: responsive grids, tables, and padding across all inline components"
```

---

## Verification Checklist

After all 13 tasks, verify on these devices in Chrome DevTools:

1. **iPhone SE (375px)** — smallest common phone
2. **iPhone 14 (390px)** — standard modern phone  
3. **iPad Mini (768px)** — tablet breakpoint boundary
4. **Desktop (1280px+)** — no regression

For each device, check:
- [ ] Login page: form fits, no horizontal scroll
- [ ] Header: all elements visible, no overflow
- [ ] Tab nav: scrollable on phone, wrapped on tablet+
- [ ] Surat Jalan tab: cards readable, buttons tappable
- [ ] Keuangan tab: table scrollable
- [ ] Laporan Kas: all sections readable
- [ ] Invoicing tab: table scrollable
- [ ] Master Data: all sub-sections accessible
- [ ] Settings: forms usable
- [ ] Modals: full-screen on phone, centered on desktop
- [ ] Dialogs: bottom-sheet on phone
