# iOS Mobile UI Overhaul — sj-monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **For Codex (OpenAI):** See "Codex Handover Notes" section at the top before starting. Each task is designed to be dispatched as a **separate agent**. Tasks must be executed in order — later tasks depend on components created in earlier tasks.

---

## Codex Handover Notes

### Recommended Model & Effort
| Task | Model | Effort |
|------|-------|--------|
| Task 1: SwipeableRow | gpt-4.1 | Medium |
| Task 2: ActionSheet | gpt-4.1 | Low |
| Task 3: StatSummary | gpt-4.1 | Low |
| Task 4: DockNav restructure | gpt-4.1 | High |
| Task 5: SuratJalanCard swipe | gpt-4.1 | Medium |
| Task 6–9: Page stat updates | gpt-4.1-mini | Low ×4 |

### Project Context
- **Location:** `C:\Project\apps\sj-monitor\`
- **Stack:** React 18, Vite, Tailwind CSS 3, Framer Motion 11, Lucide React
- **Commands:**
  - Dev: `cd apps/sj-monitor && npm run dev`
  - Build (required before done): `cd apps/sj-monitor && npm run build`
  - Tests: `cd apps/sj-monitor && npm test`
  - Lint: `cd apps/sj-monitor && npm run lint`
- **No TypeScript** — all files are `.jsx`
- **No new npm packages** — use only existing deps (Framer Motion already installed)

### Design Rules (MUST follow)
- Liquid Glass aesthetic: `backdropFilter: 'blur(24px)'`, `border: '0.5px solid rgba(255,255,255,0.15)'`
- Colors: primary `#38bdf8` (sky-400), success `#34c759`, danger `#ff3b30`, warning `#ff9500`
- Typography: `fontFamily: "'SF Pro Text', Inter, sans-serif"`
- Motion: `{ type: 'spring', stiffness: 300, damping: 28 }` — no CSS transitions except swipe drag
- Border radius: `rounded-2xl` (16px) for cards, `rounded-full` for pills/buttons
- Dark nav bg: `rgba(15,23,42,0.75)` with `backdropFilter: blur(28px)`

### Key Files Map
```
src/
├── App.jsx                    # Main app shell — DOCK_ITEMS array at line 1938, SJ stats at line 2135
├── components/
│   ├── DockNav.jsx            # Floating pill nav — MODIFY in Task 4
│   ├── StatCard.jsx           # Old stat card — KEEP file, add StatSummary alongside
│   ├── SuratJalanCard.jsx     # SJ list card — MODIFY in Task 5
│   ├── TopBar.jsx             # Header bar — DO NOT MODIFY this sprint
│   └── Pagination.jsx         # DO NOT MODIFY this sprint
└── pages/
    ├── InvoicePage.jsx        # Stats at line 180–208 — MODIFY in Task 7
    ├── UangMukaPage.jsx       # Stats at line 64–92 — MODIFY in Task 8
    └── KeuanganPage.jsx       # Stats at line 59–99 — MODIFY in Task 9
```

### Data Safety Rules (NEVER violate)
- Never hard-delete data — always `softDeleteItemInFirestore()`
- Never modify `firestore.rules`, `firebase-config.js`, or `useAuth.js`
- Never change financial logic (uangJalan, uangMuka, invoice pricing)

---

**Goal:** Overhaul shared mobile components to follow iOS UI patterns — swipe-to-reveal actions on cards, compact iOS Summary Row for stats, and 5-tab + "Lainnya" grid navigation.

**Architecture:** Create 3 new reusable components (`SwipeableRow`, `ActionSheet`, `StatSummary`), refactor 2 existing components (`DockNav`, `SuratJalanCard`), then update 4 pages to use the new `StatSummary`. All changes propagate automatically to every page because they share these components.

**Tech Stack:** React 18, Framer Motion 11 (spring animations), Tailwind CSS 3, Lucide React icons, touch events API (no new packages)

---

## File Structure

| Status | File | Responsibility |
|--------|------|----------------|
| CREATE | `src/components/SwipeableRow.jsx` | Touch swipe-to-reveal wrapper, reusable on any card |
| CREATE | `src/components/ActionSheet.jsx` | iOS-style bottom sheet for action menus |
| CREATE | `src/components/StatSummary.jsx` | iOS summary row — 2–4 stats in one compact card |
| MODIFY | `src/components/DockNav.jsx` | Add `primaryCount` prop + "Lainnya" grid overlay |
| MODIFY | `src/components/SuratJalanCard.jsx` | Wrap with SwipeableRow, compact layout |
| MODIFY | `src/App.jsx` | Replace StatCard grid (line 2135) + update DockNav call |
| MODIFY | `src/pages/InvoicePage.jsx` | Replace inline gradient blocks (line 180) with StatSummary |
| MODIFY | `src/pages/UangMukaPage.jsx` | Replace inline gradient blocks (line 64) with StatSummary |
| MODIFY | `src/pages/KeuanganPage.jsx` | Replace inline gradient blocks (line 59) with StatSummary |

---

## Task 1: SwipeableRow Component

**Files:**
- Create: `src/components/SwipeableRow.jsx`

### What It Does
Wraps any card content. On mobile, user swipes left to reveal colored action buttons. Tapping the backdrop snaps it back. No external gesture library — uses native `touchstart`/`touchmove`/`touchend`. On desktop (`hover:` capable), the component renders normally without swipe behavior.

- [ ] **Step 1: Create the component file**

```jsx
// src/components/SwipeableRow.jsx
import { useRef, useState, useCallback } from 'react';

/**
 * SwipeableRow — wraps children with left-swipe-to-reveal action buttons.
 *
 * Props:
 *   children   — the card content
 *   actions    — array of { label: string, icon: ReactNode, color: string, onClick: fn }
 *   disabled   — boolean, disables swipe (e.g. for desktop or when no actions apply)
 */
export default function SwipeableRow({ children, actions = [], disabled = false }) {
  const [translateX, setTranslateX] = useState(0);
  const startXRef = useRef(null);
  const startOffsetRef = useRef(0);
  const BUTTON_WIDTH = 72; // px per action button
  const maxReveal = actions.length * BUTTON_WIDTH;

  const handleTouchStart = useCallback((e) => {
    if (disabled || actions.length === 0) return;
    startXRef.current = e.touches[0].clientX;
    startOffsetRef.current = translateX; // capture current offset so swipe resumes from here
  }, [disabled, actions.length, translateX]);

  const handleTouchMove = useCallback((e) => {
    if (startXRef.current === null) return;
    const diff = e.touches[0].clientX - startXRef.current;
    const next = startOffsetRef.current + diff;
    // Clamp: cannot go positive (right) or past full reveal (left)
    setTranslateX(Math.min(0, Math.max(next, -maxReveal)));
  }, [maxReveal]);

  const handleTouchEnd = useCallback(() => {
    startXRef.current = null;
    // Snap: if more than half revealed, open fully; else close
    setTranslateX(prev =>
      prev < -(maxReveal / 2) ? -maxReveal : 0
    );
  }, [maxReveal]);

  const close = useCallback(() => setTranslateX(0), []);

  if (disabled || actions.length === 0) return <>{children}</>;

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Action buttons revealed on swipe */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          zIndex: 0,
        }}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { action.onClick(); close(); }}
            style={{
              width: BUTTON_WIDTH,
              background: action.color,
              color: 'white',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'SF Pro Text', Inter, sans-serif",
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Content — slides left on swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDraggingRef.current ? 'none' : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          position: 'relative',
          zIndex: 1,
          background: 'white',
        }}
      >
        {children}
      </div>

      {/* Tap-outside overlay to close */}
      {translateX < 0 && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 0 }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file was created**

```bash
ls apps/sj-monitor/src/components/SwipeableRow.jsx
```
Expected: file exists, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/sj-monitor/src/components/SwipeableRow.jsx
git commit -m "feat(sj-monitor): add SwipeableRow touch gesture component"
```

---

## Task 2: ActionSheet Component

**Files:**
- Create: `src/components/ActionSheet.jsx`

### What It Does
iOS-style bottom sheet that slides up from the bottom. Used for contextual menus (e.g., a "⋯" button on a user card). Uses Framer Motion for spring entry/exit. Renders a backdrop + sheet with action buttons + Cancel button at the bottom.

- [ ] **Step 1: Create the component file**

```jsx
// src/components/ActionSheet.jsx
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ActionSheet — iOS-style bottom action sheet.
 *
 * Props:
 *   open     — boolean, controls visibility
 *   onClose  — fn, called when backdrop or Cancel tapped
 *   title    — optional string, shown as small header above actions
 *   actions  — array of { label: string, icon?: ReactNode, destructive?: boolean, onClick: fn }
 */
export default function ActionSheet({ open, onClose, title, actions = [] }) {
  const spring = { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 200,
            }}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 201,
              padding: '0 12px 32px',
              fontFamily: "'SF Pro Text', Inter, sans-serif",
            }}
          >
            {/* Action group */}
            <div
              style={{
                background: 'rgba(249,249,249,0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16,
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              {title && (
                <div
                  style={{
                    padding: '12px 16px 8px',
                    fontSize: 12,
                    color: '#8e8e93',
                    textAlign: 'center',
                    borderBottom: '0.5px solid #e5e5ea',
                  }}
                >
                  {title}
                </div>
              )}
              {actions.map((action, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { action.onClick(); onClose(); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '15px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: i < actions.length - 1 ? '0.5px solid #e5e5ea' : 'none',
                    color: action.destructive ? '#ff3b30' : '#007aff',
                    fontSize: 17,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {action.icon && <span style={{ fontSize: 20 }}>{action.icon}</span>}
                  {action.label}
                </button>
              ))}
            </div>

            {/* Cancel button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                padding: '15px 20px',
                background: 'rgba(249,249,249,0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: 'none',
                borderRadius: 16,
                color: '#007aff',
                fontSize: 17,
                fontWeight: 600,
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify the file was created**

```bash
ls apps/sj-monitor/src/components/ActionSheet.jsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/sj-monitor/src/components/ActionSheet.jsx
git commit -m "feat(sj-monitor): add ActionSheet iOS-style bottom sheet component"
```

---

## Task 3: StatSummary Component

**Files:**
- Create: `src/components/StatSummary.jsx`

### What It Does
Replaces the current pattern of 2–4 full-width colored gradient blocks stacked vertically. Renders as a single white card with stats displayed side by side, separated by thin vertical dividers. Inspired by iOS Health/Stocks summary rows.

- [ ] **Step 1: Create the component file**

```jsx
// src/components/StatSummary.jsx

/**
 * StatSummary — iOS-style horizontal stats summary card.
 *
 * Props:
 *   title   — optional string, small uppercase label above the stats row
 *   stats   — array of { label: string, value: string|number, color?: string }
 *             color is a CSS color string, defaults to '#1c1c1e'
 *
 * Example:
 *   <StatSummary
 *     title="Invoice"
 *     stats={[
 *       { label: 'Total', value: 32, color: '#007aff' },
 *       { label: 'Belum Invoice', value: 1156, color: '#ff9500' },
 *       { label: 'Sudah Invoice', value: 143, color: '#34c759' },
 *     ]}
 *   />
 */
export default function StatSummary({ title, stats = [] }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 16,
        border: '0.5px solid rgba(255,255,255,0.4)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: '12px 0 10px',
        marginBottom: 12,
      }}
    >
      {title && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#8e8e93',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: 10,
            fontFamily: "'SF Pro Text', Inter, sans-serif",
          }}
        >
          {title}
        </p>
      )}
      <div style={{ display: 'flex' }}>
        {stats.map((stat, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              borderLeft: i > 0 ? '0.5px solid #e5e5ea' : 'none',
              padding: '0 8px',
            }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: stat.color ?? '#1c1c1e',
                lineHeight: 1,
                marginBottom: 4,
                fontFamily: "'SF Pro Display', Inter, sans-serif",
                letterSpacing: '-0.02em',
              }}
            >
              {stat.value}
            </p>
            <p
              style={{
                fontSize: 10,
                color: '#8e8e93',
                lineHeight: 1.3,
                fontFamily: "'SF Pro Text', Inter, sans-serif",
              }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file was created**

```bash
ls apps/sj-monitor/src/components/StatSummary.jsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/sj-monitor/src/components/StatSummary.jsx
git commit -m "feat(sj-monitor): add StatSummary iOS-style horizontal stats component"
```

---

## Task 4: Refactor DockNav — 5 Tabs + "Lainnya" Grid

**Files:**
- Modify: `src/components/DockNav.jsx`
- Read first: `src/App.jsx` lines 1938–1947 to understand current DOCK_ITEMS structure

### What It Changes
The current DockNav renders all items (up to 10) in one scrollable pill. This task splits items into:
- **Primary tabs** (first 4 in the filtered list per role): always visible in the pill
- **"Lainnya" tab**: 5th slot, always visible, opens a grid overlay of remaining items

The `items` array is already filtered by role in App.jsx before being passed to DockNav. This component just needs to split that filtered array into `primary[0..3]` and `more[4..]`.

The "Lainnya" grid is a modal overlay at the bottom of the screen (similar to iOS More tab).

- [ ] **Step 1: Read the current DockNav file completely**

Path: `src/components/DockNav.jsx` (123 lines total). Read the entire file before editing.

- [ ] **Step 2: Replace DockNav.jsx with the new implementation**

```jsx
// src/components/DockNav.jsx
import { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { MoreHorizontal, X } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useScrollDirection } from '../hooks/useScrollDirection.js';

export default function DockNav({ items, activeTab, onTabChange }) {
  const prefersReducedMotion = useReducedMotion();
  const hidden = useScrollDirection();
  const [moreOpen, setMoreOpen] = useState(false);

  const noMotion   = { duration: 0 };
  const spring     = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 };
  const layoutSpr  = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 };
  const labelSpr   = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 320, damping: 22, mass: 0.6 };
  const tapSpr     = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 600, damping: 28, mass: 0.5 };

  // Split: first 4 are primary, rest go into "Lainnya"
  const primaryItems = items.slice(0, 4);
  const moreItems    = items.slice(4);
  const hasMore      = moreItems.length > 0;
  const moreIsActive = moreItems.some(item => item.tab === activeTab);

  const handleTabChange = (tab) => {
    setMoreOpen(false);
    onTabChange(tab);
  };

  const NavButton = ({ item, isActive }) => {
    const Icon = item.icon;
    return (
      <motion.button
        type="button"
        onClick={() => handleTabChange(item.tab)}
        layout
        transition={layoutSpr}
        title={item.label}
        whileTap={{ scale: 0.85, transition: tapSpr }}
        style={{
          flexShrink: 0,
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
        <motion.div
          animate={{ color: isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)' }}
          transition={layoutSpr}
        >
          <Icon
            size={isActive ? 15 : 20}
            color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
            strokeWidth={isActive ? 2.5 : 2}
          />
        </motion.div>
        <AnimatePresence>
          {isActive && (
            <motion.span
              key="label"
              initial={{ width: 0, opacity: 0, x: -4 }}
              animate={{ width: 'auto', opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: -4 }}
              transition={labelSpr}
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
  };

  return (
    <>
      {/* "Lainnya" grid overlay */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              key="more-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMoreOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)' }}
            />
            <motion.div
              key="more-panel"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{
                position: 'fixed',
                bottom: 96,
                left: 16,
                right: 16,
                zIndex: 41,
                background: 'rgba(15,23,42,0.92)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 24,
                padding: 20,
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'SF Pro Text', Inter, sans-serif" }}>
                  Lainnya
                </span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <X size={14} color="rgba(255,255,255,0.6)" />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => handleTabChange(item.tab)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        background: isActive ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.06)',
                        border: isActive ? '0.5px solid rgba(56,189,248,0.4)' : '0.5px solid rgba(255,255,255,0.1)',
                        borderRadius: 16,
                        padding: '12px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={22} color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#bae6fd' : 'rgba(255,255,255,0.5)', fontFamily: "'SF Pro Text', Inter, sans-serif", textAlign: 'center', lineHeight: 1.2 }}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main pill nav */}
      <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, display: 'flex', justifyContent: 'center', zIndex: 50, pointerEvents: 'none' }}>
        <motion.nav
          className="scrollbar-hide"
          initial={{ opacity: 0, y: 32, scale: 0.92 }}
          animate={{ opacity: hidden ? 0 : 1, y: hidden ? 40 : 0, scale: hidden ? 0.88 : 1 }}
          transition={spring}
          style={{
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
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <LayoutGroup>
            {primaryItems.map((item) => (
              <NavButton key={item.tab} item={item} isActive={activeTab === item.tab} />
            ))}

            {/* "Lainnya" button — only shown when there are extra items */}
            {hasMore && (
              <motion.button
                type="button"
                onClick={() => setMoreOpen(prev => !prev)}
                layout
                transition={layoutSpr}
                title="Lainnya"
                whileTap={{ scale: 0.85, transition: tapSpr }}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: moreIsActive || moreOpen ? 6 : 0,
                  background: (moreIsActive || moreOpen) ? 'rgba(56,189,248,0.2)' : 'transparent',
                  border: (moreIsActive || moreOpen) ? '0.5px solid rgba(56,189,248,0.35)' : '0.5px solid transparent',
                  borderRadius: 22,
                  padding: (moreIsActive || moreOpen) ? '6px 12px' : '6px 7px',
                  cursor: 'pointer',
                  boxShadow: (moreIsActive || moreOpen) ? '0 2px 12px rgba(56,189,248,0.15)' : 'none',
                }}
              >
                <MoreHorizontal
                  size={moreIsActive || moreOpen ? 15 : 20}
                  color={(moreIsActive || moreOpen) ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={moreIsActive || moreOpen ? 2.5 : 2}
                />
                <AnimatePresence>
                  {(moreIsActive || moreOpen) && (
                    <motion.span
                      key="more-label"
                      initial={{ width: 0, opacity: 0, x: -4 }}
                      animate={{ width: 'auto', opacity: 1, x: 0 }}
                      exit={{ width: 0, opacity: 0, x: -4 }}
                      transition={labelSpr}
                      style={{ fontSize: 11, fontWeight: 700, color: '#bae6fd', letterSpacing: '-0.02em', fontFamily: "'SF Pro Text', Inter, sans-serif", display: 'inline-block', overflow: 'hidden' }}
                    >
                      Lainnya
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
          </LayoutGroup>
        </motion.nav>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Run the dev build to check for errors**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
```
Expected: `✓ built in` with no errors. If there are import errors, fix them (e.g., verify `MoreHorizontal` and `X` are available from `lucide-react`).

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/components/DockNav.jsx
git commit -m "feat(sj-monitor): refactor DockNav to 4 primary tabs + Lainnya grid"
```

---

## Task 5: Refactor SuratJalanCard — Swipe to Reveal

**Files:**
- Modify: `src/components/SuratJalanCard.jsx`
- Read: `src/components/SwipeableRow.jsx` (created in Task 1 — must exist)

### What It Changes
The current card has 3–4 action buttons always visible in a horizontal row, taking ~80px height. This task:
1. Wraps the card in `SwipeableRow`
2. Moves secondary actions (Tandai Gagal, Batalkan, Restore, Edit) to swipe-reveal
3. Keeps one primary action visible: "Tandai Terkirim" as a compact pill inside the card header
4. Keeps "Detail" as the card's tap-to-expand behavior (toggle already exists via `expanded` state)
5. Makes the card layout more compact — reduces padding on mobile

- [ ] **Step 1: Read the current SuratJalanCard.jsx completely**

Path: `src/components/SuratJalanCard.jsx` (190 lines). Read all before editing.

- [ ] **Step 2: Replace SuratJalanCard.jsx with the new implementation**

```jsx
// src/components/SuratJalanCard.jsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, Edit, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import SwipeableRow from './SwipeableRow.jsx';

const SuratJalanCard = ({
  suratJalan,
  biayaList,
  totalBiaya,
  currentUser,
  onUpdate,
  onMarkGagal,
  onRestore,
  onEditTerkirim,
  onDeleteBiaya,
  formatCurrency,
  getStatusColor,
  getStatusIcon
}) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  const canMarkTerkirim = () => {
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canMarkGagal = () => {
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canEdit = () => effectiveRole === 'superadmin' && suratJalan.status === 'terkirim';

  // Build swipe actions based on role + status
  const swipeActions = [];

  if (canEdit()) {
    swipeActions.push({
      label: 'Edit',
      icon: <Edit size={18} />,
      color: '#007aff',
      onClick: () => onEditTerkirim(suratJalan),
    });
  }

  if (canMarkGagal() && suratJalan.status !== 'gagal') {
    swipeActions.push({
      label: suratJalan.status === 'terkirim' ? 'Batalkan' : 'Gagal',
      icon: <XCircle size={18} />,
      color: '#ff3b30',
      onClick: () => onMarkGagal(suratJalan.id),
    });
  }

  if (effectiveRole === 'superadmin' && suratJalan.status === 'gagal') {
    swipeActions.push({
      label: 'Restore',
      icon: <RefreshCw size={18} />,
      color: '#34c759',
      onClick: () => onRestore(suratJalan.id),
    });
  }

  const tanggalSJ = suratJalan.tanggalSJ
    ? new Date(suratJalan.tanggalSJ).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    : '-';

  const tanggalTerkirim = suratJalan.tglTerkirim
    ? new Date(suratJalan.tglTerkirim).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    : null;

  return (
    <SwipeableRow actions={swipeActions}>
      <div
        style={{
          padding: '12px 14px',
          background: 'white',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Header row: nomor SJ + status badge + primary action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', fontFamily: "'SF Pro Display', Inter, sans-serif", letterSpacing: '-0.02em', truncate: true }}>
              {suratJalan.nomorSJ}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(suratJalan.status)}`}>
              {suratJalan.status}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Primary action: Tandai Terkirim — only show when applicable */}
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onUpdate(suratJalan); }}
                style={{
                  background: '#34c759',
                  color: 'white',
                  border: 'none',
                  borderRadius: 20,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer',
                  fontFamily: "'SF Pro Text', Inter, sans-serif",
                }}
              >
                <CheckCircle size={12} />
                Terkirim
              </button>
            )}
            {/* Expand/collapse chevron */}
            {expanded
              ? <ChevronUp size={16} color="#c7c7cc" />
              : <ChevronDown size={16} color="#c7c7cc" />
            }
          </div>
        </div>

        {/* Info row: tanggal · nomor polisi · PT */}
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8e8e93', fontFamily: "'SF Pro Text', Inter, sans-serif", flexWrap: 'wrap' }}>
          <span>{tanggalSJ}</span>
          <span>{suratJalan.nomorPolisi || '-'}</span>
          <span>{suratJalan.pt || '-'}</span>
        </div>

        {/* Route + driver */}
        <div style={{ marginTop: 4, fontSize: 13, color: '#3c3c43', fontFamily: "'SF Pro Text', Inter, sans-serif", display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
            {suratJalan.rute || '-'}
          </span>
          <span style={{ fontWeight: 600, color: '#007aff', flexShrink: 0 }}>
            {formatCurrency(suratJalan.uangJalan || 0)}
          </span>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #e5e5ea' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Supir', value: suratJalan.namaSupir || '-' },
                { label: 'Material', value: `${suratJalan.material || '-'} (${suratJalan.qtyIsi || 0} ${suratJalan.satuan || ''})` },
                ...(tanggalTerkirim ? [
                  { label: 'Tgl Terkirim', value: tanggalTerkirim },
                  { label: 'Qty Bongkar', value: `${suratJalan.qtyBongkar || 0} ${suratJalan.satuan || ''}` },
                ] : []),
                { label: 'Dibuat oleh', value: suratJalan.createdBy || '-' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: 10, color: '#8e8e93', marginBottom: 1 }}>{label}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e' }}>{value}</p>
                </div>
              ))}
            </div>
            {swipeActions.length > 0 && (
              <p style={{ marginTop: 10, fontSize: 10, color: '#c7c7cc', textAlign: 'center' }}>
                ← Geser kiri untuk aksi lainnya
              </p>
            )}
          </div>
        )}
      </div>
    </SwipeableRow>
  );
};

export default React.memo(SuratJalanCard, (prev, next) =>
  prev.suratJalan?.id === next.suratJalan?.id &&
  prev.suratJalan?.updatedAt === next.suratJalan?.updatedAt &&
  prev.suratJalan?.status === next.suratJalan?.status &&
  prev.totalBiaya === next.totalBiaya
);
```

- [ ] **Step 3: Run build to verify**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
```
Expected: `✓ built in` with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/components/SuratJalanCard.jsx
git commit -m "feat(sj-monitor): refactor SuratJalanCard with swipe-to-reveal actions"
```

---

## Task 6: App.jsx — Replace SJ StatCard Grid with StatSummary

**Files:**
- Modify: `src/App.jsx` lines ~2135–2160

### Context
At line 2135 of App.jsx there is:
```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
  <StatCard title="Total Surat Jalan" value={suratJalanList.length} icon={...} color="bg-blue-500" />
  <StatCard title="Pending" value={sjStatusCounts.pending} icon={...} color="bg-yellow-500" />
  <StatCard title="Terkirim" value={sjStatusCounts.terkirim} icon={...} color="bg-green-500" />
  <StatCard title="Gagal" value={sjStatusCounts.gagal} icon={...} color="bg-red-500" />
</div>
```

Replace this entire `<div className="grid...">` block with a single `<StatSummary>`.

- [ ] **Step 1: Add StatSummary import to App.jsx**

Find the line at the top of App.jsx that imports `StatCard`:
```jsx
import StatCard from './components/StatCard.jsx';
```
Add directly below it:
```jsx
import StatSummary from './components/StatSummary.jsx';
```

- [ ] **Step 2: Replace the StatCard grid block**

Find this block (starts around line 2135):
```jsx
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <StatCard
            title="Total Surat Jalan"
            value={suratJalanList.length}
            icon={<FileText className="w-6 h-6" />}
            color="bg-blue-500"
          />
          <StatCard
            title="Pending"
            value={sjStatusCounts.pending}
            icon={<Clock className="w-6 h-6" />}
            color="bg-yellow-500"
          />
          <StatCard
            title="Terkirim"
            value={sjStatusCounts.terkirim}
            icon={<CheckCircle className="w-6 h-6" />}
            color="bg-green-500"
          />
          <StatCard
            title="Gagal"
            value={sjStatusCounts.gagal}
            icon={<XCircle className="w-6 h-6" />}
            color="bg-red-500"
          />
        </div>
```

Replace with:
```jsx
        <StatSummary
          title="Surat Jalan"
          stats={[
            { label: 'Total', value: suratJalanList.length, color: '#007aff' },
            { label: 'Pending', value: sjStatusCounts.pending, color: '#ff9500' },
            { label: 'Terkirim', value: sjStatusCounts.terkirim, color: '#34c759' },
            { label: 'Gagal', value: sjStatusCounts.gagal, color: '#ff3b30' },
          ]}
        />
```

- [ ] **Step 3: Run build**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/App.jsx
git commit -m "feat(sj-monitor): replace SJ StatCard grid with StatSummary"
```

---

## Task 7: InvoicePage — Replace Gradient Blocks with StatSummary

**Files:**
- Modify: `src/pages/InvoicePage.jsx` lines 180–208

### Context
Lines 180–208 contain a `<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">` with three full-height gradient blocks (blue Total Invoice, orange Belum Terinvoice, green Sudah Terinvoice).

- [ ] **Step 1: Add StatSummary import to InvoicePage.jsx**

At the top of `src/pages/InvoicePage.jsx`, find the last `import` line and add:
```jsx
import StatSummary from '../components/StatSummary.jsx';
```

- [ ] **Step 2: Replace the gradient blocks**

Find this block (lines 180–208):
```jsx
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
          ...Total Invoice: {invoiceList.length}...
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 ...">
          ...Belum Terinvoice: {sjBelumTerinvoice.length}...
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 ...">
          ...Sudah Terinvoice: {sjTerinvoice.length}...
        </div>
      </div>
```

Replace with:
```jsx
      <StatSummary
        title="Invoice"
        stats={[
          { label: 'Total Invoice', value: invoiceList.length, color: '#007aff' },
          { label: 'Belum Invoice', value: sjBelumTerinvoice.length, color: '#ff9500' },
          { label: 'Sudah Invoice', value: sjTerinvoice.length, color: '#34c759' },
        ]}
      />
```

- [ ] **Step 3: Run build**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/pages/InvoicePage.jsx
git commit -m "feat(sj-monitor): replace InvoicePage gradient stat blocks with StatSummary"
```

---

## Task 8: UangMukaPage — Replace Gradient Blocks with StatSummary

**Files:**
- Modify: `src/pages/UangMukaPage.jsx` lines 64–92

### Context
Lines 64–92 contain `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">` with three gradient blocks (blue Total Entri, green Total Uang Muka, orange SJ Terkait).

- [ ] **Step 1: Add StatSummary import**

```jsx
import StatSummary from '../components/StatSummary.jsx';
```

- [ ] **Step 2: Replace the gradient blocks**

Find the block at lines 64–92:
```jsx
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 ...">
            ...Total Entri: {uangMukaList.length}...
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 ...">
            ...Total Uang Muka: {formatCurrency(uangMukaList.reduce(...))}...
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 ...">
            ...SJ Terkait: {Object.keys(umBySJ).length}...
          </div>
        </div>
```

Replace with:
```jsx
        <StatSummary
          title="Uang Muka"
          stats={[
            { label: 'Total Entri', value: uangMukaList.length, color: '#007aff' },
            { label: 'Total UM', value: formatCurrency(uangMukaList.reduce((sum, um) => sum + (um.jumlah || 0), 0)), color: '#34c759' },
            { label: 'SJ Terkait', value: Object.keys(umBySJ).length, color: '#ff9500' },
          ]}
        />
```

- [ ] **Step 3: Run build**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/pages/UangMukaPage.jsx
git commit -m "feat(sj-monitor): replace UangMukaPage gradient stat blocks with StatSummary"
```

---

## Task 9: KeuanganPage — Replace Gradient Blocks with StatSummary

**Files:**
- Modify: `src/pages/KeuanganPage.jsx` lines 59–99

### Context
Lines 59–99 contain `<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">` with three stat blocks: Total Pemasukan, Total Pengeluaran, Saldo Kas.

- [ ] **Step 1: Add StatSummary import**

```jsx
import StatSummary from '../components/StatSummary.jsx';
```

- [ ] **Step 2: Replace the stat blocks**

Find the block at lines ~59–99 that contains `Total Pemasukan`, `Total Pengeluaran`, `Saldo Kas`.

Read those lines first, then replace the entire `<div className="grid...">` wrapper and its three children with:
```jsx
        <StatSummary
          title="Kas"
          stats={[
            { label: 'Pemasukan', value: formatCurrency(totalPemasukan), color: '#34c759' },
            { label: 'Pengeluaran', value: formatCurrency(totalPengeluaran), color: '#ff3b30' },
            { label: 'Saldo', value: formatCurrency(saldoKas), color: saldoKas >= 0 ? '#007aff' : '#ff3b30' },
          ]}
        />
```

> **Note for Codex:** Read lines 59–99 of KeuanganPage.jsx first to confirm the exact variable names for `totalPemasukan`, `totalPengeluaran`, and `saldoKas`. They may be named differently (e.g., computed inline). Preserve the exact expressions used for the values.

- [ ] **Step 3: Run build AND lint**

```bash
cd apps/sj-monitor && npm run build 2>&1 | tail -20
cd apps/sj-monitor && npm run lint 2>&1 | tail -20
```
Both must pass with no errors.

- [ ] **Step 4: Run tests**

```bash
cd apps/sj-monitor && npm test 2>&1 | tail -20
```
Expected: all tests pass (exit code 0).

- [ ] **Step 5: Final commit**

```bash
git add apps/sj-monitor/src/pages/KeuanganPage.jsx
git commit -m "feat(sj-monitor): replace KeuanganPage gradient stat blocks with StatSummary"
```

---

## Completion Checklist

After all 9 tasks, verify:

- [ ] `npm run build` passes with no errors in `apps/sj-monitor/`
- [ ] `npm test` passes with no failures
- [ ] `npm run lint` passes with no errors on `src/utils/` and `src/services/`
- [ ] DockNav shows exactly 4 primary tabs + "Lainnya" button in the pill
- [ ] Tapping "Lainnya" opens a grid overlay with remaining tabs
- [ ] Swiping left on a SuratJalanCard reveals action buttons
- [ ] InvoicePage, UangMukaPage, KeuanganPage, and SJ tab all show StatSummary (no more tall gradient blocks)
- [ ] No console errors in browser dev tools
- [ ] No changes to `firestore.rules`, `firebase-config.js`, or `useAuth.js`

---

## Out of Scope (Do Not Touch)

- `TopBar.jsx` — no changes this sprint
- `LaporanKasPage.jsx`, `LaporanTrukPage.jsx`, `PayslipReport.jsx` — no stat block changes
- `MasterDataPage.jsx` user cards — separate sprint
- `firestore.rules`, `useAuth.js`, `firebase-config.js` — never touch
- Financial calculation logic in any file
