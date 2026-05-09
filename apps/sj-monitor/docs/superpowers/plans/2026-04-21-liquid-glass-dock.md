# Liquid Glass Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sj-monitor's existing inline top bar and bottom dock with two standalone Liquid Glass components (`TopBar.jsx` + `DockNav.jsx`) and update the page background to Dark Slate.

**Architecture:** Two new standalone components extracted from App.jsx. All state, role filtering, and business logic stays in App.jsx — components receive only what they need via props. Animations use Framer Motion spring physics throughout.

**Tech Stack:** React 18, Framer Motion (already installed), Lucide React (already installed), Tailwind CSS 3, inline styles for glass surfaces.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/TopBar.jsx` | **CREATE** | Sticky glass top bar: page title + user pill + logout |
| `src/components/DockNav.jsx` | **CREATE** | Floating pill dock: expanding active item, spring animations |
| `src/App.jsx` | **MODIFY** | Add imports, change bg, replace top bar JSX (L2432–2453), replace dock JSX (L2962–2995) |

---

## Task 1 — Create `TopBar.jsx`

**Files:**
- Create: `src/components/TopBar.jsx`

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/TopBar.jsx` with this exact content:

```jsx
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';

const PAGE_TITLES = {
  'surat-jalan':  'Surat Jalan',
  'keuangan':     'Keuangan',
  'laporan-kas':  'Laporan Kas',
  'laporan-truk': 'Laporan Truk',
  'payslip':      'Laporan Gaji',
  'invoicing':    'Invoicing',
  'uang-muka':    'Uang Muka',
  'master-data':  'Master Data',
  'users':        'Kelola User',
  'settings':     'Pengaturan',
};

export default function TopBar({ activeTab, currentUser, onLogout }) {
  const pageTitle = PAGE_TITLES[activeTab] ?? 'Monitoring SJ';
  const initials = (currentUser?.name ?? 'U').charAt(0).toUpperCase();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
      }}>
        {/* Page title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(56,189,248,0.75)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontFamily: "'SF Pro Display', Inter, sans-serif",
          }}>
            sj-monitor
          </span>
          <span style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
            fontFamily: "'SF Pro Display', Inter, sans-serif",
          }}>
            {pageTitle}
          </span>
        </div>

        {/* Right: user pill + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* User pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 9999,
            padding: '5px 10px',
          }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: 'white', fontWeight: 700 }}>
                {initials}
              </span>
            </div>
            <span style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.8)',
              fontWeight: 500,
              fontFamily: "'SF Pro Text', Inter, sans-serif",
            }}>
              {currentUser?.name ?? ''}
            </span>
          </div>

          {/* Logout button */}
          <motion.button
            onClick={onLogout}
            title="Keluar"
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} color="rgba(248,113,113,0.85)" />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}
```

- [ ] **Step 2: Verify file exists**

```bash
ls src/components/TopBar.jsx
```

Expected: file listed (no error).

---

## Task 2 — Create `DockNav.jsx`

**Files:**
- Create: `src/components/DockNav.jsx`

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/DockNav.jsx` with this exact content:

```jsx
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring', stiffness: 150, damping: 20 };

export default function DockNav({ items, activeTab, onTabChange }) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(15,23,42,0.75)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: '0.5px solid rgba(255,255,255,0.15)',
        borderRadius: 9999,
        padding: '8px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.tab;

        return (
          <motion.button
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            layout
            transition={spring}
            title={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isActive ? 6 : 0,
              background: isActive ? 'rgba(56,189,248,0.2)' : 'transparent',
              border: isActive ? '0.5px solid rgba(56,189,248,0.35)' : '0.5px solid transparent',
              borderRadius: 22,
              padding: isActive ? '6px 12px' : '6px 7px',
              cursor: 'pointer',
              boxShadow: isActive ? '0 2px 12px rgba(56,189,248,0.15)' : 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon
              size={isActive ? 15 : 20}
              color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <AnimatePresence>
              {isActive && (
                <motion.span
                  key="label"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={spring}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#bae6fd',
                    letterSpacing: '-0.02em',
                    fontFamily: "'SF Pro Text', Inter, sans-serif",
                    display: 'inline-block',
                    overflow: 'hidden',
                  }}
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}
```

- [ ] **Step 2: Verify file exists**

```bash
ls src/components/DockNav.jsx
```

Expected: file listed (no error).

---

## Task 3 — Update `App.jsx`

**Files:**
- Modify: `src/App.jsx` lines 1–31 (imports), 2432 (bg), 2434–2453 (top bar), 2962–2995 (dock)

- [ ] **Step 1: Add imports for Framer Motion, TopBar, and DockNav**

In `src/App.jsx`, find this block at the top (after line 31):

```js
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, User, Settings, Database, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

Add these three lines immediately **after** it:

```js
import { motion } from 'framer-motion';
import TopBar from './components/TopBar.jsx';
import DockNav from './components/DockNav.jsx';
```

- [ ] **Step 2: Change page background from light to Dark Slate**

Find (line 2432):
```jsx
    <div className="min-h-screen bg-gray-50">
```

Replace with:
```jsx
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
```

- [ ] **Step 3: Replace inline top bar with `<TopBar />`**

Find the entire block (lines 2434–2453):
```jsx
      {/* Minimal top bar */}
      {effectiveRole && (
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">
            {PAGE_TITLES[activeTab] ?? 'Monitoring SJ'}
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-semibold">
              <User className="w-3 h-3" />
              <span>{currentUser?.name ?? ''}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white transition-colors duration-150 shadow-sm"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
```

Replace with:
```jsx
      {/* Liquid Glass Top Bar */}
      {effectiveRole && (
        <TopBar
          activeTab={activeTab}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      )}
```

- [ ] **Step 4: Remove `PAGE_TITLES` from App.jsx (now lives in TopBar.jsx)**

Find and delete this block (lines 2405–2416):
```js
  const PAGE_TITLES = {
    'surat-jalan': 'Surat Jalan',
    'keuangan': 'Keuangan',
    'laporan-kas': 'Laporan Kas',
    'laporan-truk': 'Laporan Truk',
    'payslip': 'Laporan Gaji',
    'invoicing': 'Invoicing',
    'uang-muka': 'Uang Muka',
    'master-data': 'Master Data',
    'users': 'Kelola User',
    'settings': 'Pengaturan',
  };
```

> **Note:** If `PAGE_TITLES` is used anywhere else in App.jsx besides the old top bar, do NOT delete it. First run a search:
> ```bash
> grep -n "PAGE_TITLES" src/App.jsx
> ```
> If it appears only in the old top bar block you just replaced, it's safe to delete. If it appears elsewhere, keep it in App.jsx.

- [ ] **Step 5: Replace inline dock with `<DockNav />`**

Find the entire block (lines 2962–2995, adjusted after prior edits):
```jsx
      {/* Floating bottom dock */}
      {effectiveRole && (
        <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-lg">
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

Replace with:
```jsx
      {/* Liquid Glass Dock */}
      {effectiveRole && (
        <DockNav
          items={DOCK_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
```

- [ ] **Step 6: Remove unused `User` icon import if no longer referenced**

Check if `User` (from lucide-react) is still used elsewhere in App.jsx:

```bash
grep -n "\bUser\b" src/App.jsx
```

If the only match is the old top bar (already deleted), remove `User` from the lucide-react import line. If it's still used elsewhere, leave it.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/TopBar.jsx src/components/DockNav.jsx
git commit -m "feat: replace navbar with Liquid Glass DockNav and TopBar"
```

---

## Task 4 — Build Verification & Manual Test

**Files:**
- No changes — verification only.

- [ ] **Step 1: Run production build**

```bash
cd /c/Project/sj-monitor && npm run build
```

Expected: exits with `✓ built in` message, zero errors. If there are TypeScript/lint errors, fix them before proceeding.

- [ ] **Step 2: Start dev server and open browser**

```bash
npm run dev
```

Open `http://localhost:5173` (or the port shown in terminal).

- [ ] **Step 3: Manual test checklist**

Work through each item and confirm:

- [ ] Page background is dark slate (`#0f172a`) — no white/gray background visible
- [ ] TopBar is visible at the top, sticky — stays fixed when scrolling content
- [ ] TopBar shows app label `"sj-monitor"` in small sky-blue text above the page title
- [ ] TopBar page title updates correctly when switching tabs
- [ ] User name appears in the pill on the right of TopBar
- [ ] Logout button (red icon) works — clicking it logs out
- [ ] DockNav is visible at the bottom center, floating above content
- [ ] Active item shows icon + label in sky-blue expanding pill
- [ ] Inactive items show only icon in muted white
- [ ] Clicking a dock item switches the page and the expanding animation plays
- [ ] No content is hidden behind the dock at bottom of pages (padding `pb-24` still present)
- [ ] Role-based items: login as different roles and verify correct items appear in dock

- [ ] **Step 4: Commit final verification**

```bash
git add -p  # stage any small fixes found during testing
git commit -m "fix: post-build corrections for Liquid Glass dock"
```

Skip this step if no fixes were needed.
