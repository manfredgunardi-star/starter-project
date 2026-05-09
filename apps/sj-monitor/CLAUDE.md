# sj-monitor — Project-Specific Instructions

These instructions apply **only to sj-monitor** and override or extend the root `CLAUDE.md` where they conflict.

---

## UI/UX Design System — Liquid Glass (PERMANENT)

> These design rules are **permanent** until the user explicitly says to stop or replace them.
> Apply them consistently to every new component, page, and UI element built in this project.

### 1. Aesthetics — Liquid Glass

- **Backdrop blur**: minimum `20px`, preferably `24px–32px`. Use `backdrop-filter: blur(24px)` or Tailwind `backdrop-blur-xl` / `backdrop-blur-2xl`.
- **Borders**: thin `0.5px` white/translucent borders. Use `border border-white/20` or inline `border: 0.5px solid rgba(255,255,255,0.2)`.
- **Shadows**: deep soft shadows, e.g. `shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)` or Tailwind `shadow-2xl`.
- **Background**: semi-transparent glass surfaces using `bg-white/10`, `bg-white/15`, or `bg-black/10` on dark backgrounds.
- **No opaque flat backgrounds** for cards/panels — always prefer translucent glass layers.

```jsx
// Standard glass card pattern
<div className="rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl p-6">
  ...
</div>
```

### 2. Typography — SF Pro + Inter

- **Font stack**: `'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif`
- **Letter spacing**: tight — use `-tracking-tight` (`letter-spacing: -0.025em`) for headings, `tracking-normal` for body.
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold). Avoid 300/light.
- Tailwind config already sets Inter as fallback. Use `font-sans` which resolves to Inter.
- For display headings, add inline style `fontFamily: "'SF Pro Display', Inter, sans-serif"`.

```jsx
<h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'SF Pro Display', Inter, sans-serif" }}>
  Judul Halaman
</h1>
```

### 3. Motion — Spring Physics (Framer Motion)

- **All transitions** use Framer Motion with spring physics. No CSS transitions or plain `animate`.
- **Standard spring config**: `{ type: "spring", stiffness: 150, damping: 20 }`
- For subtle/small elements: `{ type: "spring", stiffness: 200, damping: 25 }`
- For large/heavy elements: `{ type: "spring", stiffness: 100, damping: 20 }`
- **Entry animations**: fade + translateY upward (`y: 16 → 0, opacity: 0 → 1`)
- **Exit animations**: fade + scale down (`scale: 0.97 → 1, opacity: 0 → 1`)

```jsx
import { motion } from 'framer-motion';

const springTransition = { type: "spring", stiffness: 150, damping: 20 };

// Standard entry animation
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={springTransition}
>
  ...
</motion.div>

// Modal/overlay entry
<motion.div
  initial={{ opacity: 0, scale: 0.97 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.97 }}
  transition={springTransition}
>
  ...
</motion.div>
```

### 4. Layout — Floating Pill Navigation & Rounded Surfaces

- **Navigation bars**: "Floating Pill" style — centered, `rounded-3xl` (48px), elevated with glass background and shadow, floating above content with `fixed` positioning.
- **Cards & Panels**: `rounded-2xl` (16px) to `rounded-3xl` (48px). Use 24px–32px as default: `rounded-[28px]` or `rounded-3xl`.
- **Buttons**: `rounded-full` for pill buttons, `rounded-2xl` for rectangular.
- **Modals/Dialogs**: `rounded-3xl` minimum.
- **Input fields**: `rounded-2xl`, with glass background.
- **Spacing**: generous padding — `p-5` or `p-6` for cards, `px-6 py-3` for buttons.

```jsx
// Floating Pill Nav example
<nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-3xl backdrop-blur-xl bg-white/15 border border-white/20 shadow-2xl flex gap-2">
  ...
</nav>
```

---

## Tailwind Config Notes

`tailwind.config.cjs` is already extended with:
- `borderRadius.3xl = 48px`
- `backdropBlur.xs/sm/md/lg/xl/2xl` custom levels

Use these classes freely.

---

## Implementation Checklist (for every new UI component)

Before considering a component "done", verify:
- [ ] Glass background with backdrop-blur ≥ 20px
- [ ] Thin 0.5px white/translucent border
- [ ] Deep soft shadow (shadow-2xl or custom)
- [ ] SF Pro / Inter typography with tight tracking on headings
- [ ] All animations use Framer Motion spring (stiffness: 150, damping: 20)
- [ ] Rounded corners ≥ 24px for containers (rounded-3xl or rounded-[28px])
- [ ] Navigation uses Floating Pill pattern if applicable
