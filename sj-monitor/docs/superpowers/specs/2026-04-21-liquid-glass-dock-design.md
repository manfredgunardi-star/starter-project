# Liquid Glass Dock — Design Spec
**Date:** 2026-04-21
**Project:** sj-monitor
**Status:** Approved

---

## Overview

Replace the existing inline navigation in `App.jsx` with two standalone Liquid Glass components:
- `src/components/TopBar.jsx` — sticky top bar with glass surface
- `src/components/DockNav.jsx` — floating bottom center pill dock

Background halaman juga diganti ke Dark Slate gradient. Semua animasi menggunakan Framer Motion spring physics sesuai aturan di `CLAUDE.md`.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Dock position | Bottom center pill (fixed) |
| Item style | Expanding active item — aktif: icon + label pill; non-aktif: icon only |
| Color theme | Dark Slate + Sky Blue (`#0f172a` / `#38bdf8`) |
| Scope | TopBar + DockNav + background halaman |
| Implementation | Two separate components (DockNav.jsx + TopBar.jsx) |

---

## Component 1 — `TopBar.jsx`

### Props
```js
TopBar({ activeTab, currentUser, onLogout })
```

### Visual spec
- `position: sticky; top: 0; z-index: 50`
- Background: `rgba(15,23,42,0.6)` + `backdrop-filter: blur(24px)`
- Border bottom: `0.5px solid rgba(255,255,255,0.1)`
- Shadow: `0 4px 24px rgba(0,0,0,0.3)`
- Inner highlight: `0 1px 0 rgba(255,255,255,0.05) inset`

### Left side — page title
- App label kecil: `"sj-monitor"` — `text-xs font-semibold tracking-widest uppercase` warna `rgba(56,189,248,0.7)`
- Page title: ambil dari `PAGE_TITLES[activeTab]` — `text-[17px] font-bold tracking-tight text-white`

### Right side
- **User pill**: avatar lingkaran gradient `#38bdf8→#6366f1` berisi inisial, nama user teks kecil. Container: `bg-white/[0.08] border-white/15 rounded-full px-3 py-1.5`
- **Logout button**: icon `LogOut` dari lucide-react, `32×32px rounded-xl bg-white/[0.06] border-white/[0.12]`, warna icon `rgba(248,113,113,0.8)` — merah subtle

### Entry animation
```js
initial={{ opacity: 0, y: -8 }}
animate={{ opacity: 1, y: 0 }}
transition={{ type: "spring", stiffness: 150, damping: 20 }}
```

---

## Component 2 — `DockNav.jsx`

### Props
```js
DockNav({ items, activeTab, onTabChange })
```
`items` = array dari `DOCK_ITEMS` yang sudah difilter berdasarkan role (filtering tetap di App.jsx sebelum dikirim ke DockNav).

### Visual spec — container pill
- `position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 50`
- Background: `rgba(15,23,42,0.75)` + `backdrop-filter: blur(28px)`
- Border: `0.5px solid rgba(255,255,255,0.15)`
- Border radius: `9999px` (fully rounded pill)
- Shadow: `0 8px 40px rgba(0,0,0,0.5)`, inner glow: `0 1px 0 rgba(255,255,255,0.08) inset`
- Padding: `8px 14px`, gap antar item: `4px`

### Item — aktif (expanding pill)
```
background: rgba(56,189,248,0.2)
border: 0.5px solid rgba(56,189,248,0.35)
border-radius: 22px
padding: 6px 12px
box-shadow: 0 2px 12px rgba(56,189,248,0.15)
```
- Icon: warna `#38bdf8`, size `15×15`
- Label: `text-[11px] font-bold tracking-tight text-sky-200`
- Animasi expand menggunakan `<AnimatePresence>` + `motion.span` dengan `initial={{ width: 0, opacity: 0 }}` → `animate={{ width: "auto", opacity: 1 }}`

### Item — non-aktif (icon only)
```
padding: 6px 7px
border-radius: 14px
```
- Icon: warna `rgba(255,255,255,0.35)`, size `20×20`
- Hover: `background: rgba(255,255,255,0.06)` — transisi spring

### Item transition (tab switch)
```js
// Layout animation untuk expanding/collapsing
layout
transition={{ type: "spring", stiffness: 150, damping: 20 }}
```
Gunakan `layout` prop di tiap item agar pill mengembang/menyusut secara smooth saat tab berubah.

### Entry animation (dock muncul)
```js
initial={{ opacity: 0, y: 24, scale: 0.95 }}
animate={{ opacity: 1, y: 0, scale: 1 }}
transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.1 }}
```

---

## App.jsx Changes

### Background halaman
Ganti `className="min-h-screen bg-gray-50"` (baris ~2432) menjadi:
```jsx
<div className="min-h-screen" style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
```

### Replace inline top bar (baris 2434–2453)
Hapus JSX top bar existing, ganti dengan:
```jsx
<TopBar activeTab={activeTab} currentUser={currentUser} onLogout={handleLogout} />
```

### Replace inline dock (baris 2962–2995)
Hapus JSX dock existing, ganti dengan:
```jsx
<DockNav
  items={DOCK_ITEMS.filter(item => item.roles.includes(currentUser?.role))}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Imports yang perlu ditambah
```js
import { motion, AnimatePresence } from 'framer-motion';
import TopBar from './components/TopBar';
import DockNav from './components/DockNav';
```

---

## PAGE_TITLES tetap di App.jsx

`PAGE_TITLES` map (baris 2405–2416) tetap di App.jsx dan dikirim lewat prop `activeTab` ke TopBar — tidak perlu dipindah.

---

## File Changes Summary

| File | Action |
|---|---|
| `src/components/TopBar.jsx` | CREATE — baru |
| `src/components/DockNav.jsx` | CREATE — baru |
| `src/App.jsx` | EDIT — ganti bg, replace top bar JSX, replace dock JSX, tambah imports |

---

## Constraints & Guards

- **Jangan** pindah logika bisnis (DOCK_ITEMS, role filtering, PAGE_TITLES, handleLogout) ke komponen baru — semua tetap di App.jsx, cukup pass lewat props
- **Jangan** ubah `activeTab` state management — tetap di App.jsx
- Role-based filtering untuk DOCK_ITEMS tetap dilakukan di App.jsx sebelum dikirim ke DockNav
- `npm run build` harus pass tanpa error sebelum selesai

---

## Manual Test Checklist

- [ ] Semua tab di dock bisa diklik dan berpindah halaman
- [ ] Item aktif expand tampilkan label, item lain icon-only
- [ ] Animasi expanding/collapsing smooth (spring, tidak glitchy)
- [ ] TopBar menampilkan judul halaman yang benar setiap ganti tab
- [ ] User info dan tombol logout berfungsi
- [ ] Role-based filtering tetap bekerja (item tersembunyi sesuai role)
- [ ] Background dark slate muncul di seluruh halaman
- [ ] Tidak ada elemen konten yang tertutup dock di bagian bawah
