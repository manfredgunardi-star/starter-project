# sj-monitor UI Design System — Liquid Glass

Aturan ini berlaku untuk komponen, halaman, dan elemen UI baru sampai user secara eksplisit menggantinya.

## Aesthetics

- Backdrop blur minimum 20px, preferensi 24–32px. Gunakan `backdrop-blur-xl` atau `backdrop-blur-2xl`.
- Border tipis transparan: `border border-white/20` atau ekuivalen 0.5px.
- Gunakan deep soft shadow seperti `shadow-2xl`.
- Card/panel memakai surface semi-transparan seperti `bg-white/10`, `bg-white/15`, atau `bg-black/10`.
- Hindari opaque flat background untuk glass card/panel.

```jsx
<div className="rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl p-6">
  {/* content */}
</div>
```

## Typography

- Font stack: `'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif`.
- Heading memakai tight tracking dan weight 600–700.
- Body memakai weight 400–500.
- Hindari light weight 300.

```jsx
<h1
  className="text-2xl font-bold tracking-tight"
  style={{ fontFamily: "'SF Pro Display', Inter, sans-serif" }}
>
  Judul Halaman
</h1>
```

## Motion

- Semua transition interaktif memakai Framer Motion spring, bukan CSS transition generik.
- Standard spring: `{ type: 'spring', stiffness: 150, damping: 20 }`.
- Elemen kecil: stiffness 200, damping 25.
- Elemen besar: stiffness 100, damping 20.
- Entry: opacity 0 ke 1 dan y 16 ke 0.
- Modal exit: opacity 1 ke 0 dan scale 1 ke 0.97.

```jsx
const springTransition = { type: 'spring', stiffness: 150, damping: 20 };

<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={springTransition}
>
  {/* content */}
</motion.div>
```

## Layout

- Navigation memakai floating pill, fixed, glass background, dan elevated shadow.
- Card/panel memakai radius minimal 24px; `rounded-3xl` adalah default.
- Pill button memakai `rounded-full`; rectangular button memakai `rounded-2xl`.
- Modal minimal `rounded-3xl`; input `rounded-2xl` dengan glass background.
- Gunakan padding lega, biasanya `p-5`/`p-6` dan `px-6 py-3`.

```jsx
<nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-3xl backdrop-blur-xl bg-white/15 border border-white/20 shadow-2xl flex gap-2">
  {/* navigation items */}
</nav>
```

## Component Checklist

- Glass background dengan backdrop blur minimal 20px.
- Border putih/transparan tipis.
- Deep soft shadow.
- SF Pro/Inter dan tight heading tracking.
- Framer Motion spring.
- Radius container minimal 24px.
- Floating pill untuk navigation yang relevan.
