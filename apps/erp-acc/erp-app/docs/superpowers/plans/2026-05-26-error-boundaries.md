# Error Boundaries for Lazy Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan React Error Boundary di sekeliling semua lazy-loaded routes agar chunk JS yang gagal dimuat (network timeout, 404 setelah deploy) tidak menyebabkan halaman blank/crash — melainkan menampilkan UI fallback yang actionable.

**Architecture:** Buat satu class component `RouteErrorBoundary` (React Error Boundary harus berupa class component — tidak ada hooks equivalent yang built-in). Wrap `<Suspense>` di `App.jsx` dengan komponen ini. Gunakan AntD `Result` untuk UI fallback agar konsisten dengan design system yang ada.

**Tech Stack:** React 19, Ant Design 6, Vite 8. Tidak ada test framework (Playwright only) — verifikasi via `npm run build` + manual smoke test.

---

## Model & Effort

| Task | Model | Estimasi |
|------|-------|----------|
| T1: Create RouteErrorBoundary + integrate App.jsx | **Claude Haiku** (mekanis, 2 file, spec lengkap) | ~10 menit |

**Total: 1 task, all Claude — tidak memerlukan Codex/SQL.**

---

## File Map

| File | Aksi |
|------|------|
| `src/components/layout/RouteErrorBoundary.jsx` | **Create** — class component error boundary |
| `src/App.jsx` | **Modify** — import RouteErrorBoundary, wrap Suspense |

---

## Task 1: Create RouteErrorBoundary + Integrate App.jsx

**Model:** Claude Haiku  
**Files:**
- Create: `src/components/layout/RouteErrorBoundary.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Buat file `src/components/layout/RouteErrorBoundary.jsx`**

Isi file lengkap:

```jsx
import { Component } from 'react'
import { Button, Result } from 'antd'

/**
 * Error Boundary untuk menangkap chunk-load failures pada lazy-loaded routes.
 * React Error Boundary HARUS berupa class component.
 *
 * Dipasang di sekeliling <Suspense> di App.jsx. Menampilkan UI fallback
 * yang actionable saat chunk JS gagal dimuat (mis. network error, deploy baru).
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log untuk debugging — bisa diganti Sentry di masa depan
    console.error('[RouteErrorBoundary] Chunk gagal dimuat:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Importing a module script failed')

      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Result
            status="warning"
            title="Halaman gagal dimuat"
            subTitle={
              isChunkError
                ? 'Aplikasi baru saja diperbarui. Muat ulang untuk mendapatkan versi terbaru.'
                : (this.state.error?.message || 'Terjadi kesalahan saat memuat halaman.')
            }
            extra={[
              <Button
                type="primary"
                key="reload"
                onClick={() => window.location.reload()}
              >
                Muat Ulang
              </Button>,
              <Button
                key="home"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.href = '/'
                }}
              >
                Kembali ke Dashboard
              </Button>,
            ]}
          />
        </div>
      )
    }

    return this.props.children
  }
}
```

- [ ] **Step 2: Modifikasi `src/App.jsx` — tambah import dan wrap Suspense**

Tambah import `RouteErrorBoundary` setelah baris import `RoleGuard`:

```js
// Baris lama (baris 9):
import RoleGuard from './components/layout/RoleGuard'

// Ganti dengan:
import RoleGuard from './components/layout/RoleGuard'
import RouteErrorBoundary from './components/layout/RouteErrorBoundary'
```

Kemudian wrap `<Suspense>` yang ada di dalam `AppContent()` dengan `<RouteErrorBoundary>`.

Cari blok ini di `AppContent` (sekitar baris 106):

```jsx
    return (
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><Spin size="large" description="Memuat..." /></div>}>
        <Routes>
```

Ganti dengan:

```jsx
    return (
      <RouteErrorBoundary>
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><Spin size="large" description="Memuat..." /></div>}>
          <Routes>
```

Dan tutup tag `</RouteErrorBoundary>` setelah `</Suspense>`:

```jsx
        </Suspense>
      </RouteErrorBoundary>
    )
```

- [ ] **Step 3: Verifikasi build**

```bash
cd C:\Project\apps\erp-acc\erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error. Jika ada TypeScript/linting error terkait class component, pastikan `Component` diimport dari `'react'` (bukan named import dari subpath).

- [ ] **Step 4: Smoke test manual**

```bash
npm run dev
```

Buka browser → navigasi ke beberapa halaman (Dashboard, Sales Order, Products). Semua harus load normal. Tidak ada perubahan visual — ErrorBoundary hanya aktif saat terjadi error.

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/layout/RouteErrorBoundary.jsx \
        apps/erp-acc/erp-app/src/App.jsx
git commit -m "feat(erp-acc): add RouteErrorBoundary for lazy-loaded chunk failures"
```

---

## Self-Review

**Spec coverage:**
- ✅ Error boundary menangkap chunk-load failures → `RouteErrorBoundary` dengan `getDerivedStateFromError`
- ✅ UI fallback actionable → AntD `Result` + tombol Muat Ulang + Kembali ke Dashboard
- ✅ Pesan yang benar untuk chunk error vs error lain → `isChunkError` detection
- ✅ Log untuk debugging → `componentDidCatch` dengan `console.error`
- ✅ Konsisten dengan design system → AntD `Result` dan `Button`

**Placeholder scan:** Tidak ada TBD, TODO, atau "implement later".

**Type consistency:** `RouteErrorBoundary` dipakai di Task 1 Step 2 dengan nama yang sama persis.
