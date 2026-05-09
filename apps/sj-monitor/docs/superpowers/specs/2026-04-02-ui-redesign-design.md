# SJ Monitor — UI Redesign Design Spec

**Date:** 2026-04-02
**Scope:** `sj-monitor/src/App.jsx` + `sj-monitor/src/index.css`
**Goal:** Improve mobile/laptop usability, readability, and add a floating bottom dock navigation.

---

## Summary

Three targeted changes to the existing app, with no structural refactor of App.jsx:

1. **Remove the top gradient header** — replace with a minimal per-page title bar
2. **Replace tab navigation** with a fixed floating bottom dock
3. **Improve typography and readability** — Inter font, 16px base, better contrast

Deployment: `npm run build` → `firebase deploy --only hosting` (Firebase Hosting, `dist/` output).

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Navigation pattern | Bottom floating dock | Thumb-friendly on mobile, always visible |
| Header | Remove gradient header | Free screen space, cleaner look |
| Card style | Compact table-style | More rows visible, easier scanning |
| Typography | Inter (Google Fonts) | Best readability for dashboards |
| Dock position | Fixed bottom, pill shape | iOS-style, white/blur, centered |

---

## 1. Typography

**Add Inter to `index.css`:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
```

**Tailwind config** — extend `fontFamily.sans` to use Inter as the default:
```js
// tailwind.config.js
fontFamily: { sans: ['Inter', 'sans-serif'] }
```

**Readability rules applied across all content:**
- Body text: minimum `text-sm` (14px) — `text-base` (16px) preferred
- Muted/secondary text: `text-slate-500` (not lighter — maintains 4.5:1 contrast)
- Headings: `font-semibold` or `font-bold`, `text-slate-900`
- Line-height: `leading-relaxed` (1.625) on paragraph-length text

---

## 2. Remove Top Header

**What to remove:** The entire `<div className="bg-gradient-to-r from-blue-600 to-blue-800 ...">` block (~40 lines at line ~1991 of App.jsx).

**What replaces it:** A minimal sticky white top bar rendered per active tab. This is a single `<div>` at the top of the content area:

```jsx
<div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
  <h1 className="text-lg font-bold text-slate-900">{PAGE_TITLES[activeTab]}</h1>
  <div className="flex items-center gap-2 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-semibold">
    <UserIcon className="w-3 h-3" />
    {currentUser.name}
  </div>
</div>
```

Where `PAGE_TITLES` is a simple constant:
```js
const PAGE_TITLES = {
  'surat-jalan': 'Surat Jalan',
  'keuangan': 'Keuangan',
  'laporan-kas': 'Laporan Kas',
  'invoicing': 'Invoicing',
  'master-data': 'Master Data',
  'users': 'Kelola User',
  'settings': 'Settings',
};
```

**Logo/company name:** The `appSettings.companyName` and logo are no longer displayed — the header block that contained them is removed entirely. The page title bar shows the current tab name only. This is intentional to maximize reading space.

---

## 3. Floating Bottom Dock

**Remove:** The existing tab navigation `<div className="max-w-7xl mx-auto px-3 py-2 ...">` block (~70 lines, around line ~2037).

**Add:** A fixed bottom dock component rendered inside the main return, outside the content scroll area:

### Structure

```jsx
{/* Floating bottom dock */}
<nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg">
  <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-black/10 ring-1 ring-white/80 flex items-center justify-around px-2 py-2">
    {DOCK_ITEMS.map(item => (
      <button
        key={item.tab}
        onClick={() => setActiveTab(item.tab)}
        className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-colors duration-150 min-w-[52px] cursor-pointer ${
          activeTab === item.tab
            ? 'bg-blue-50'
            : 'hover:bg-slate-50'
        }`}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          activeTab === item.tab ? 'bg-blue-600' : ''
        }`}>
          <item.icon className={`w-[18px] h-[18px] ${
            activeTab === item.tab ? 'text-white' : 'text-slate-400'
          }`} />
        </div>
        <span className={`text-[10px] font-semibold ${
          activeTab === item.tab ? 'text-blue-600' : 'text-slate-400'
        }`}>
          {item.label}
        </span>
      </button>
    ))}
  </div>
</nav>
```

### Dock items (role-gated, same rules as current tabs)

| Tab | Icon (lucide-react) | Label | Roles |
|---|---|---|---|
| surat-jalan | `Package` | SJ | All |
| keuangan | `DollarSign` | Keuangan | superadmin, admin_keuangan, reader |
| laporan-kas | `FileText` | Laporan | All |
| invoicing | `FileText` | Invoice | superadmin, admin_invoice, reader |
| master-data | `Database` | Data | superadmin |
| users | `Users` | Users | superadmin |
| settings | `Settings` | Settings | superadmin |

> **Note:** superadmin sees 7 items. Other roles see 2–4. The dock naturally shrinks — no overflow needed.

### Content padding
Add `pb-24` (96px) to the main content wrapper so the last card is never hidden behind the dock:
```jsx
<div className="max-w-7xl mx-auto px-3 pb-24 sm:px-6">
```

---

## 4. Readability Improvements

### Surat Jalan list
Replace the current card-based SJ list with a table-style layout inside a white rounded container:

```jsx
<div className="bg-white rounded-2xl shadow-sm overflow-hidden">
  {/* Column headers */}
  <div className="grid grid-cols-[1fr_1.4fr_1fr_90px] px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
    <span>No. SJ</span>
    <span>Rute</span>
    <span>Supir</span>
    <span>Status</span>
  </div>
  {/* Rows */}
  {filteredSJ.map(sj => (
    <div key={sj.id} className="grid grid-cols-[1fr_1.4fr_1fr_90px] px-4 py-3 border-b border-slate-50 last:border-0 items-center hover:bg-slate-50 cursor-pointer transition-colors text-sm">
      <span className="font-bold text-slate-900">{sj.nomorSJ}</span>
      <span className="text-slate-500 text-xs">{sj.rute}</span>
      <span className="text-slate-500 text-xs">{sj.namaSupir}</span>
      <StatusBadge status={sj.status} />
    </div>
  ))}
</div>
```

**On mobile** (`< 640px`), collapse the grid to 2 columns (SJ number + status) — route and driver hidden or shown on tap/expand.

### Status badge component
```jsx
const STATUS_STYLES = {
  'dalam perjalanan': 'bg-orange-50 text-orange-600',
  'terkirim': 'bg-green-50 text-green-600',
  'masalah': 'bg-red-50 text-red-600',
  'menunggu': 'bg-slate-100 text-slate-500',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status?.toLowerCase()] ?? 'bg-slate-100 text-slate-500'}`}>
    {status}
  </span>
);
```

### StatCard component
Update `StatCard.jsx` — remove gradient backgrounds, use flat white card with colored number:
```jsx
// Before: bg-gradient-to-br from-blue-500 to-blue-600
// After:  bg-white border border-slate-100 shadow-sm, value color matches domain
```

### Emoji icons → Lucide icons
The current nav uses emoji (📦💵📑🧾). The dock uses Lucide React icons (already a dependency). Emoji icons in section headings (e.g. `📄 Invoice Management`) remain — they are content headings, not navigation icons.

---

## 5. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `< 640px` (mobile) | 2-col table (SJ num + status), dock full-width minus 32px margin |
| `640px – 1024px` (tablet/laptop) | 4-col table, dock centered, max-width 512px |
| `> 1024px` (desktop) | 4-col table, content max-w-7xl, dock max-w-lg centered |

The dock does **not** move to the top on desktop — it stays at the bottom per the chosen design.

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/index.css` | Add Inter import, set base font-size/line-height |
| `src/App.jsx` | Remove header block, remove tab nav block, add bottom dock, add page title bar, update SJ table layout, update StatCard usage |
| `src/components/StatCard.jsx` | Remove gradient, use flat white style |
| `tailwind.config.js` | Extend fontFamily.sans with Inter |

---

## 7. Out of Scope

- No structural refactor of App.jsx (monolith stays as-is)
- No changes to Firebase rules, auth, or data logic
- No changes to KeuanganManagement, InvoiceManagement, or other page content (layout only via padding/font)
- No dark mode

---

## 8. Deploy Steps

1. `cd sj-monitor && npm run build`
2. `firebase deploy --only hosting`

Verify at the Firebase Hosting URL after deploy.
