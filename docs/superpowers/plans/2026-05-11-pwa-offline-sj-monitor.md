# PWA + Firestore Offline — sj-monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert sj-monitor menjadi installable Progressive Web App dengan Firestore offline
persistence, sehingga supir/admin tetap bisa menggunakan app tanpa koneksi internet dan
perubahan ter-sync otomatis saat terhubung kembali.

**Architecture:** Tambahkan `vite-plugin-pwa` untuk menghasilkan Service Worker dan Web App
Manifest. Aktifkan Firestore `persistentLocalCache()` di `firebase-config.js` untuk offline
read/write dengan auto-sync. Tambahkan `useOnlineStatus` hook dan `OfflineIndicator` component
untuk memberi tahu user tentang status koneksi.

**Tech Stack:** `vite-plugin-pwa` 0.21+, `@vite-pwa/assets-generator` 1.0+, Firebase 10
`persistentLocalCache` + `persistentMultipleTabManager`, React 18, Vitest 4 + Testing Library

---

## File Map

| Action | Path | Tanggung Jawab |
|--------|------|----------------|
| Modify | `apps/sj-monitor/package.json` | Tambah `vite-plugin-pwa`, `@vite-pwa/assets-generator` dev deps |
| Modify | `apps/sj-monitor/vite.config.js` | Import + konfigurasi `VitePWA` plugin dengan manifest dan Workbox |
| Create | `apps/sj-monitor/public/pwa-source.svg` | Source icon untuk asset generator |
| Create | `apps/sj-monitor/public/pwa-192x192.png` | PWA icon 192px (auto-generated) |
| Create | `apps/sj-monitor/public/pwa-512x512.png` | PWA icon 512px (auto-generated) |
| Create | `apps/sj-monitor/public/apple-touch-icon-180x180.png` | iOS home screen icon (auto-generated) |
| Create | `apps/sj-monitor/public/maskable-icon-512x512.png` | Maskable icon Android (auto-generated) |
| Create | `apps/sj-monitor/public/favicon.ico` | Favicon (auto-generated) |
| Modify | `apps/sj-monitor/src/config/firebase-config.js` | Aktifkan Firestore offline persistence |
| Create | `apps/sj-monitor/src/config/__tests__/firebase-config.test.js` | Test offline persistence config |
| Create | `apps/sj-monitor/src/hooks/useOnlineStatus.js` | Hook deteksi online/offline |
| Create | `apps/sj-monitor/src/hooks/__tests__/useOnlineStatus.test.js` | Test hook |
| Create | `apps/sj-monitor/src/components/OfflineIndicator.jsx` | Banner saat offline |
| Create | `apps/sj-monitor/src/components/__tests__/OfflineIndicator.test.jsx` | Test component |
| Modify | `apps/sj-monitor/src/App.jsx` | Mount `<OfflineIndicator />` di root layout |

---

## Task 1: Install Dependencies

> **Model:** `claude-haiku-4-5` | **Effort:** low (< 10 min)

**Files:**
- Modify: `apps/sj-monitor/package.json`

- [ ] **Step 1: Install vite-plugin-pwa dan assets generator**

```bash
cd apps/sj-monitor && npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

Expected output: kedua package ter-install tanpa error. Verifikasi:

```bash
cd apps/sj-monitor && node -e "require.resolve('vite-plugin-pwa'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 2: Verifikasi package.json**

Pastikan `package.json` sekarang punya kedua entry ini di `devDependencies`:

```json
"@vite-pwa/assets-generator": "^1.0.0",
"vite-plugin-pwa": "^0.21.0"
```

(versi pastinya bisa berbeda tapi prefix `^` harus ada)

- [ ] **Step 3: Commit**

```bash
cd apps/sj-monitor && git add package.json package-lock.json
git commit -m "feat(pwa): install vite-plugin-pwa and assets-generator"
```

---

## Task 2: Create Source SVG Icon

> **Model:** `claude-haiku-4-5` | **Effort:** low (< 10 min)

**Files:**
- Create: `apps/sj-monitor/public/pwa-source.svg`

- [ ] **Step 1: Buat folder public (jika belum ada)**

```bash
cd apps/sj-monitor && mkdir -p public
```

- [ ] **Step 2: Tulis file SVG source icon**

Buat file `apps/sj-monitor/public/pwa-source.svg` dengan konten berikut (ikon truk
logistik di atas background gelap):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="#0f172a"/>

  <!-- Badan truk (box) -->
  <rect x="60" y="168" width="256" height="200" rx="16" fill="#38bdf8"/>

  <!-- Kabin truk -->
  <path d="M316 200 L316 368 L432 368 L432 296 L380 200 Z" fill="#7dd3fc"/>

  <!-- Jendela kabin -->
  <path d="M324 216 L360 216 L392 280 L324 280 Z" fill="#0f172a" opacity="0.6"/>

  <!-- Roda kiri -->
  <circle cx="136" cy="376" r="44" fill="#1e293b" stroke="#38bdf8" stroke-width="14"/>
  <circle cx="136" cy="376" r="16" fill="#38bdf8"/>

  <!-- Roda kanan -->
  <circle cx="368" cy="376" r="44" fill="#1e293b" stroke="#38bdf8" stroke-width="14"/>
  <circle cx="368" cy="376" r="16" fill="#38bdf8"/>

  <!-- Garis dokumen di badan truk -->
  <rect x="100" y="220" width="140" height="12" rx="6" fill="#0f172a" opacity="0.4"/>
  <rect x="100" y="248" width="100" height="12" rx="6" fill="#0f172a" opacity="0.4"/>
  <rect x="100" y="276" width="120" height="12" rx="6" fill="#0f172a" opacity="0.4"/>
</svg>
```

- [ ] **Step 3: Verifikasi file terbuat**

```bash
ls apps/sj-monitor/public/pwa-source.svg
```

Expected: file ada, tidak error.

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/public/pwa-source.svg
git commit -m "feat(pwa): add source SVG icon for PWA asset generation"
```

---

## Task 3: Generate PWA Icons

> **Model:** `claude-haiku-4-5` | **Effort:** low (< 10 min)

**Files:**
- Create: `apps/sj-monitor/public/pwa-192x192.png`
- Create: `apps/sj-monitor/public/pwa-512x512.png`
- Create: `apps/sj-monitor/public/apple-touch-icon-180x180.png`
- Create: `apps/sj-monitor/public/maskable-icon-512x512.png`
- Create: `apps/sj-monitor/public/favicon.ico`

- [ ] **Step 1: Jalankan assets generator**

```bash
cd apps/sj-monitor && npx pwa-assets-generator --preset minimal-2023 public/pwa-source.svg
```

Expected output: generator membuat beberapa file PNG dan ICO di folder `public/`.

- [ ] **Step 2: Verifikasi semua icon ter-generate**

```bash
ls apps/sj-monitor/public/
```

Expected: harus ada minimal file-file berikut:
- `pwa-192x192.png`
- `pwa-512x512.png`
- `apple-touch-icon-180x180.png`
- `maskable-icon-512x512.png`
- `favicon.ico`

Jika `maskable-icon-512x512.png` tidak ada, rename `pwa-512x512.png` ke
`maskable-icon-512x512.png` sambil mempertahankan salinan aslinya:

```bash
cd apps/sj-monitor && cp public/pwa-512x512.png public/maskable-icon-512x512.png
```

- [ ] **Step 3: Commit**

```bash
git add apps/sj-monitor/public/
git commit -m "feat(pwa): add generated PWA icons (192, 512, apple-touch, maskable)"
```

---

## Task 4: Enable Firestore Offline Persistence (TDD)

> **Model:** `claude-sonnet-4-6` | **Effort:** medium (20–30 min)

**Files:**
- Create: `apps/sj-monitor/src/config/__tests__/firebase-config.test.js`
- Modify: `apps/sj-monitor/src/config/firebase-config.js`

**Context:** Firebase SDK 10+ menggunakan `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`
sebagai pengganti `enableIndexedDbPersistence()` yang sudah deprecated. Kita perlu pass ini
ke `initializeFirestore` via opsi `localCache`. File `firebase-config.js` sekarang memanggil
`initializeFirestore` tanpa `localCache` sama sekali.

- [ ] **Step 1: Tulis failing test**

Buat file `apps/sj-monitor/src/config/__tests__/firebase-config.test.js`:

```javascript
// Node environment (default) - no jsdom needed
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

let mockInitializeFirestore;
let mockPersistentLocalCache;
let mockPersistentMultipleTabManager;

beforeEach(() => {
  vi.resetModules();

  mockPersistentMultipleTabManager = vi.fn(() => ({ _mock: 'multiTabManager' }));
  mockPersistentLocalCache = vi.fn((opts) => ({ _mock: 'persistentCache', ...opts }));
  mockInitializeFirestore = vi.fn(() => ({ _mock: 'firestoreInstance' }));

  vi.doMock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({ _mock: 'app' })),
  }));

  vi.doMock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ _mock: 'auth' })),
    setPersistence: vi.fn(() => Promise.resolve()),
    browserLocalPersistence: { _mock: 'localPersistence' },
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
  }));

  vi.doMock('firebase/firestore', () => ({
    initializeFirestore: mockInitializeFirestore,
    persistentLocalCache: mockPersistentLocalCache,
    persistentMultipleTabManager: mockPersistentMultipleTabManager,
    doc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    collection: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    onSnapshot: vi.fn(),
    writeBatch: vi.fn(),
  }));

  vi.doMock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({ _mock: 'functions' })),
    httpsCallable: vi.fn(() => vi.fn()),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('firebase-config: Firestore offline persistence', () => {
  it('calls persistentMultipleTabManager() untuk multi-tab support', async () => {
    await import('../firebase-config.js');
    expect(mockPersistentMultipleTabManager).toHaveBeenCalledTimes(1);
  });

  it('calls persistentLocalCache() dengan tabManager dari persistentMultipleTabManager', async () => {
    await import('../firebase-config.js');
    expect(mockPersistentLocalCache).toHaveBeenCalledWith(
      expect.objectContaining({ tabManager: expect.objectContaining({ _mock: 'multiTabManager' }) })
    );
  });

  it('calls initializeFirestore dengan localCache option', async () => {
    await import('../firebase-config.js');
    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        localCache: expect.objectContaining({ _mock: 'persistentCache' }),
      })
    );
  });

  it('tetap pass experimentalAutoDetectLongPolling: true ke initializeFirestore', async () => {
    await import('../firebase-config.js');
    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ experimentalAutoDetectLongPolling: true })
    );
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: test gagal dengan pesan seperti `expected persistentLocalCache to have been called`.

- [ ] **Step 3: Update firebase-config.js agar import dan gunakan persistentLocalCache**

Edit `apps/sj-monitor/src/config/firebase-config.js`. Ubah baris import firestore dari:

```javascript
import { initializeFirestore } from 'firebase/firestore';
```

Menjadi:

```javascript
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
```

Lalu ubah blok `initializeFirestore` dari:

```javascript
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
```

Menjadi:

```javascript
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: semua 4 test di `firebase-config.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/config/firebase-config.js \
        apps/sj-monitor/src/config/__tests__/firebase-config.test.js
git commit -m "feat(pwa): enable Firestore persistentLocalCache for offline support"
```

---

## Task 5: Create useOnlineStatus Hook (TDD)

> **Model:** `claude-sonnet-4-6` | **Effort:** medium (20–30 min)

**Files:**
- Create: `apps/sj-monitor/src/hooks/__tests__/useOnlineStatus.test.js`
- Create: `apps/sj-monitor/src/hooks/useOnlineStatus.js`

**Context:** Hook ini menggunakan `navigator.onLine` sebagai nilai awal dan listen ke event
`window.online`/`window.offline` untuk update real-time. Test butuh jsdom karena memakai
`window` dan `navigator`.

- [ ] **Step 1: Tulis failing test**

Buat file `apps/sj-monitor/src/hooks/__tests__/useOnlineStatus.test.js`:

```javascript
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { useOnlineStatus } from '../useOnlineStatus.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOnlineStatus', () => {
  it('returns true saat navigator.onLine adalah true', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('returns false saat navigator.onLine adalah false', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('berubah jadi false saat event "offline" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('berubah jadi true saat event "online" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });

  it('melepas event listeners saat unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: error `Cannot find module '../useOnlineStatus.js'`.

- [ ] **Step 3: Implementasi hook**

Buat file `apps/sj-monitor/src/hooks/useOnlineStatus.js`:

```javascript
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: semua 5 test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/hooks/useOnlineStatus.js \
        apps/sj-monitor/src/hooks/__tests__/useOnlineStatus.test.js
git commit -m "feat(pwa): add useOnlineStatus hook for online/offline detection"
```

---

## Task 6: Create OfflineIndicator Component (TDD)

> **Model:** `claude-sonnet-4-6` | **Effort:** medium (20–30 min)

**Files:**
- Create: `apps/sj-monitor/src/components/__tests__/OfflineIndicator.test.jsx`
- Create: `apps/sj-monitor/src/components/OfflineIndicator.jsx`

**Context:** Component ini renders `null` saat online, dan banner amber saat offline.
Menggunakan `useOnlineStatus`. Test perlu jsdom dan Testing Library.

- [ ] **Step 1: Tulis failing test**

Buat file `apps/sj-monitor/src/components/__tests__/OfflineIndicator.test.jsx`:

```javascript
// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import OfflineIndicator from '../OfflineIndicator.jsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineIndicator', () => {
  it('tidak merender apapun saat online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('merender banner offline saat navigator.onLine false', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/offline/i);
  });

  it('banner muncul saat event "offline" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('banner hilang saat event "online" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('banner memuat teks info sync', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/sync/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: error `Cannot find module '../OfflineIndicator.jsx'`.

- [ ] **Step 3: Implementasi component**

Buat file `apps/sj-monitor/src/components/OfflineIndicator.jsx`:

```jsx
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 py-2 px-4 text-white text-sm font-semibold shadow-lg"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>Offline — data tersimpan lokal, akan sync saat terhubung kembali</span>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: semua 5 test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/components/OfflineIndicator.jsx \
        apps/sj-monitor/src/components/__tests__/OfflineIndicator.test.jsx
git commit -m "feat(pwa): add OfflineIndicator component with role=alert"
```

---

## Task 7: Configure vite-plugin-pwa

> **Model:** `claude-sonnet-4-6` | **Effort:** medium (25–35 min)

**Files:**
- Modify: `apps/sj-monitor/vite.config.js`

**Context:** `VitePWA` plugin perlu dikonfigurasi dengan:
- `registerType: 'autoUpdate'` — SW diperbarui otomatis tanpa prompt
- `manifest` — metadata app (nama, warna, icon) untuk installability
- `workbox.globPatterns` — asset yang di-precache saat install
- `workbox.runtimeCaching` — strategi caching untuk request ke Firebase APIs

Strategi `NetworkFirst` untuk Firestore: coba jaringan dulu, fallback ke cache jika offline.

- [ ] **Step 1: Update vite.config.js dengan VitePWA**

Ganti seluruh konten `apps/sj-monitor/vite.config.js` dengan:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: 'Surat Jalan Monitor',
        short_name: 'SJ Monitor',
        description: 'Tracking surat jalan, invoice, dan keuangan logistik',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Firebase Firestore REST API — NetworkFirst: coba jaringan, fallback cache
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google APIs lainnya (auth token, etc) — StaleWhileRevalidate
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'googleapis-cache',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Firebase Functions
            urlPattern: /^https:\/\/.*\.cloudfunctions\.net\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cloud-functions-cache',
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    setupFiles: ['./src/test-setup.js'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
          ],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
```

- [ ] **Step 2: Verifikasi config dapat diparsing Vite**

```bash
cd apps/sj-monitor && npx vite build --mode development 2>&1 | tail -10
```

Expected: build selesai tanpa error. Folder `dist/` ter-generate.

- [ ] **Step 3: Verifikasi file SW dan manifest ada di dist/**

```bash
ls apps/sj-monitor/dist/ | grep -E "sw|manifest|workbox"
```

Expected: ada `sw.js`, `manifest.webmanifest`, dan mungkin `workbox-*.js`.

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/vite.config.js
git commit -m "feat(pwa): configure VitePWA plugin with manifest and Workbox caching"
```

---

## Task 8: Integrate OfflineIndicator into App Layout

> **Model:** `claude-haiku-4-5` | **Effort:** low (< 10 min)

**Files:**
- Modify: `apps/sj-monitor/src/App.jsx` (sekitar baris 35–36, bagian import)
- Modify: `apps/sj-monitor/src/App.jsx` (sekitar baris 2536–2540, bagian return)

**Context:** `App.jsx` adalah komponen root. `OfflineIndicator` harus dirender SEBELUM
`TopBar` agar tampil di atas segalanya (z-index 60 vs TopBar yang lebih rendah).

- [ ] **Step 1: Tambahkan import OfflineIndicator di App.jsx**

Cari baris import `TopBar` di `apps/sj-monitor/src/App.jsx`:

```javascript
import TopBar from './components/TopBar.jsx';
```

Tambahkan baris import baru SETELAH baris tersebut:

```javascript
import TopBar from './components/TopBar.jsx';
import OfflineIndicator from './components/OfflineIndicator.jsx';
```

- [ ] **Step 2: Mount OfflineIndicator di return JSX**

Di dalam `return` App, cari div container paling luar (sekitar baris 2537):

```jsx
return (
  <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
    {/* Liquid Glass Top Bar + Section Banner */}
    {effectiveRole && (
```

Tambahkan `<OfflineIndicator />` SEBELUM `{effectiveRole && (`:

```jsx
return (
  <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
    <OfflineIndicator />

    {/* Liquid Glass Top Bar + Section Banner */}
    {effectiveRole && (
```

- [ ] **Step 3: Jalankan semua tests untuk memastikan tidak ada regresi**

```bash
cd apps/sj-monitor && npm test -- --reporter=verbose
```

Expected: SEMUA test PASS, tidak ada yang fail.

- [ ] **Step 4: Commit**

```bash
git add apps/sj-monitor/src/App.jsx
git commit -m "feat(pwa): mount OfflineIndicator in App root layout"
```

---

## Task 9: Build Verification & PWA Audit

> **Model:** `claude-haiku-4-5` | **Effort:** low (< 15 min)

**Files:** Tidak ada perubahan — hanya verifikasi.

- [ ] **Step 1: Jalankan production build**

```bash
cd apps/sj-monitor && npm run build 2>&1
```

Expected: build selesai dengan `✓ built in X.XXs`. Tidak boleh ada error.

- [ ] **Step 2: Verifikasi artefak PWA**

```bash
ls apps/sj-monitor/dist/
```

Expected: harus ada:
- `sw.js` (service worker)
- `manifest.webmanifest`
- `workbox-*.js` (Workbox runtime)
- `pwa-192x192.png`
- `pwa-512x512.png`
- `apple-touch-icon-180x180.png`

- [ ] **Step 3: Cek manifest.webmanifest valid**

```bash
cat apps/sj-monitor/dist/manifest.webmanifest
```

Expected output berisi JSON dengan `name`, `short_name`, `icons`, `display: "standalone"`.

- [ ] **Step 4: Verifikasi sw.js ada referensi ke workbox dan manifest**

```bash
grep -c "workbox" apps/sj-monitor/dist/sw.js && \
grep -c "manifest.webmanifest" apps/sj-monitor/dist/sw.js
```

Expected: keduanya mengembalikan angka > 0.

- [ ] **Step 5: Jalankan seluruh test suite sekali lagi**

```bash
cd apps/sj-monitor && npm test
```

Expected: exit code 0.

- [ ] **Step 6: Commit final**

```bash
git add apps/sj-monitor/dist/ 2>/dev/null || true
git commit -m "feat(pwa): Phase 1 complete — PWA installable + Firestore offline persistence"
```

---

## Checklist Spec Coverage

| Requirement | Task |
|---|---|
| App installable di HP (manifest + icons) | Task 2, 3, 7 |
| Service Worker untuk offline shell | Task 7 |
| Firestore offline read/write dengan auto-sync | Task 4 |
| UI indicator saat offline | Task 6 |
| Hook `useOnlineStatus` reusable | Task 5 |
| Semua test pass | Task 4–6, 9 |
| Build production sukses | Task 9 |

## Catatan Pasca-Deploy

Setelah deploy ke Firebase Hosting:
1. Buka Chrome di Android → buka URL → tunggu prompt "Tambahkan ke layar utama"
2. Install, buka dari homescreen → cek status bar standalone (tanpa URL bar browser)
3. Matikan WiFi → buka app → verifikasi data masih tampil dan banner amber muncul
4. Nyalakan kembali WiFi → verifikasi banner hilang dan perubahan offline ter-sync
