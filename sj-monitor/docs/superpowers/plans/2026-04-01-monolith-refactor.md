# Monolith Refactor: Break Up App.jsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 6,045-line `App.jsx` monolith into focused files (utils, hooks, components, pages) and add React Router for proper URL-based navigation — while keeping the app working at every step.

**Architecture:** Extract layer by layer — pure utils first, then hooks, then components, then pages, then wire React Router last. After each task run `npm run dev` and verify the app loads in the browser before committing. The existing `firestoreService.js` and `masterdataService.js` already have some utilities — consolidate rather than duplicate.

**Tech Stack:** React 18, Vite, Firebase 10, Tailwind CSS, `react-router-dom` v6.

---

## Task 1: Add React Router and create the folder structure

**Files:**
- Modify: `package.json`
- Create dirs: `src/utils/`, `src/hooks/`, `src/components/`, `src/pages/`
- Modify: `src/main.jsx`

- [ ] **Step 1: Install react-router-dom**

```bash
cd "C:/project/sj-monitor"
npm install react-router-dom@6
```

Expected: `react-router-dom` appears in `node_modules`, `package.json` updated.

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p src/utils src/hooks src/components src/pages
```

- [ ] **Step 3: Wrap app in BrowserRouter in main.jsx**

Read `src/main.jsx` first. It likely looks like:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Change it to:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 4: Verify app still starts**

```bash
npm run dev
```

Open browser at `http://localhost:5173`. App should load and login should work.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.jsx
git commit -m "chore: install react-router-dom, add BrowserRouter"
```

---

## Task 2: Extract pure utility functions

**Files:**
- Create: `src/utils/currency.js`
- Create: `src/utils/session.js`
- Create: `src/utils/sjHelpers.js`
- Create: `src/utils/excel.js`
- Modify: `src/App.jsx` — replace inline definitions with imports

These functions are defined at the top of `App.jsx` (lines 8–211). They have no React or Firestore dependencies — pure functions.

- [ ] **Step 1: Create `src/utils/currency.js`**

```js
// src/utils/currency.js

export const formatCurrency = (amount) => {
  const n = Number(amount || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
};

export const formatTanggalID = (value) => {
  if (!value) return '-';
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return String(value);
  }
};
```

- [ ] **Step 2: Create `src/utils/session.js`**

```js
// src/utils/session.js

export const generateSessionId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};
```

- [ ] **Step 3: Create `src/utils/sjHelpers.js`**

```js
// src/utils/sjHelpers.js

export const isSJTerinvoice = (sj) => {
  const statusInvoice = String(sj?.statusInvoice || '').toLowerCase();
  return statusInvoice === 'terinvoice' || !!sj?.invoiceId || !!sj?.invoiceNo;
};

export const isSJBelumInvoice = (sj) =>
  String(sj?.status || '').toLowerCase() === 'terkirim' && !isSJTerinvoice(sj);

export const mergeById = (a = [], b = []) => {
  const m = new Map();
  [...a, ...b].forEach((x) => {
    if (!x) return;
    const id = String(x.id ?? '');
    if (!id) return;
    const prev = m.get(id);
    if (!prev) {
      m.set(id, x);
      return;
    }
    const prevTs = String(prev.updatedAt || prev.createdAt || '');
    const nextTs = String(x.updatedAt || x.createdAt || '');
    if (nextTs > prevTs) m.set(id, x);
  });
  return Array.from(m.values());
};
```

- [ ] **Step 4: Create `src/utils/excel.js`**

```js
// src/utils/excel.js
import * as XLSX from 'xlsx';

export const downloadSJRecapToExcel = (suratJalanList = [], options = {}) => {
  const { startDate = '', endDate = '', dateField = 'tanggalSJ' } = options || {};

  const normDate = (v) => {
    if (!v) return '';
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    try { return new Date(v).toISOString().slice(0, 10); } catch { return ''; }
  };

  const start = normDate(startDate);
  const end = normDate(endDate);
  const rows = (Array.isArray(suratJalanList) ? suratJalanList : [])
    .filter((sj) => sj?.isActive !== false)
    .filter((sj) => {
      const d = normDate(sj?.[dateField]);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    })
    .map((sj, i) => ({
      No: i + 1,
      'Nomor SJ': sj?.nomorSJ || '',
      'Tanggal SJ': normDate(sj?.tanggalSJ),
      'Tanggal Terkirim': normDate(sj?.tglTerkirim),
      PT: sj?.pt || '',
      Supir: sj?.namaSupir || sj?.supir || '',
      'Nomor Polisi': sj?.nomorPolisi || '',
      Rute: sj?.rute || '',
      Material: sj?.material || '',
      'Qty Isi': Number(sj?.qtyIsi || 0),
      'Qty Bongkar': Number(sj?.qtyBongkar || 0),
      Satuan: sj?.satuan || '',
      'Uang Jalan': Number(sj?.uangJalan || 0),
      Status: sj?.status || '',
      'Status Invoice': sj?.statusInvoice || 'belum',
      'Dibuat Oleh': sj?.createdBy || '',
      'Dibuat Tanggal': normDate(sj?.createdAt),
      'Diupdate Oleh': sj?.updatedBy || '',
      'Diupdate Tanggal': normDate(sj?.updatedAt),
    }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 24 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Surat Jalan');
  const startLabel = start || 'all';
  const endLabel = end || 'all';
  XLSX.writeFile(wb, `Rekap_Surat_Jalan_${dateField}_${startLabel}_${endLabel}.xlsx`);
};
```

- [ ] **Step 5: Update `src/App.jsx` — replace inline definitions with imports**

At the top of `App.jsx`, after the existing Firebase/React imports (around line 6), add:

```js
import { formatCurrency, formatTanggalID } from './utils/currency.js';
import { generateSessionId } from './utils/session.js';
import { isSJTerinvoice, isSJBelumInvoice, mergeById } from './utils/sjHelpers.js';
import { downloadSJRecapToExcel } from './utils/excel.js';
```

Then delete the following inline definitions from `App.jsx` (they are now in utils):
- `generateSessionId` — lines 8–13
- `formatCurrency` — lines 16–23
- `formatTanggalID` — lines 26–39
- `downloadSJRecapToExcel` — lines 41–101
- `mergeById` — lines 188–204
- `isSJTerinvoice` — lines 206–209
- `isSJBelumInvoice` — line 211

Keep in `App.jsx` for now (they depend on Firestore):
- `resolveSuratJalanDocRef` — lines 103–121
- `sanitizeForFirestore` — lines 124–156
- `upsertItemToFirestore` — lines 159–168
- `softDeleteItemInFirestore` — lines 170–185

- [ ] **Step 6: Verify app runs**

```bash
npm run dev
```

Open browser. Login, create a test SJ, check no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/ src/App.jsx
git commit -m "refactor: extract pure utility functions to src/utils/"
```

---

## Task 3: Consolidate Firestore service layer

**Files:**
- Modify: `src/firestoreService.js` — add the two missing functions
- Modify: `src/App.jsx` — remove inline duplicates, import from firestoreService.js

`firestoreService.js` already exports `sanitizeForFirestore`, `upsertItemToFirestore`, `softDeleteItemInFirestore`. We just need to add `resolveSuratJalanDocRef` and then update App.jsx to use the service file instead of its own inline copies.

- [ ] **Step 1: Add `resolveSuratJalanDocRef` to `src/firestoreService.js`**

Append this to the end of `src/firestoreService.js`:

```js
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
// Note: add these to the existing import at the top of the file if not already there

export const resolveSuratJalanDocRef = async (db, sjId) => {
  const businessId = String(sjId || '').trim();
  if (!businessId) return null;

  const directRef = doc(db, 'surat_jalan', businessId);
  try {
    const snap = await getDoc(directRef);
    if (snap.exists()) return directRef;
  } catch {}

  try {
    const qs = await getDocs(query(collection(db, 'surat_jalan'), where('id', '==', businessId)));
    if (!qs.empty) return qs.docs[0].ref;
  } catch {}

  return null;
};
```

Note: The original `resolveSuratJalanDocRef` in App.jsx uses a module-level `db` reference. In this version, `db` is passed as a parameter for testability.

- [ ] **Step 2: Update `src/App.jsx` — use firestoreService.js**

Replace the existing import line for firestoreService (if any) with:

```js
import {
  sanitizeForFirestore,
  upsertItemToFirestore,
  softDeleteItemInFirestore,
  resolveSuratJalanDocRef,
} from './firestoreService.js';
```

Then delete from `App.jsx`:
- `resolveSuratJalanDocRef` — approximately lines 103–121
- `sanitizeForFirestore` — approximately lines 124–156
- `upsertItemToFirestore` — approximately lines 159–168
- `softDeleteItemInFirestore` — approximately lines 170–185

Find all calls to `resolveSuratJalanDocRef(sjId)` in App.jsx and change them to `resolveSuratJalanDocRef(db, sjId)` (adding `db` as first argument).

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Test: create an SJ, mark it delivered, create an invoice. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/firestoreService.js src/App.jsx
git commit -m "refactor: consolidate Firestore service functions into firestoreService.js"
```

---

## Task 4: Extract `useAuth` hook

**Files:**
- Create: `src/hooks/useAuth.js`
- Modify: `src/App.jsx` — replace auth state + effects with hook call

The auth logic lives in `SuratJalanMonitor` (the main component), starting at line ~1117. It covers:
- `onAuthStateChanged` listener
- User profile bootstrap (first login)
- Session management (single active session per account)
- `handleLogin` / `handleLogout` / `executeForcedLogout` handlers
- Force logout subscription is handled separately in `useSettings` (Task 8)

- [ ] **Step 1: Create `src/hooks/useAuth.js`**

```js
// src/hooks/useAuth.js
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase-config';
import { generateSessionId } from '../utils/session.js';
import { upsertItemToFirestore } from '../firestoreService.js';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState('');
  const activeSessionIdRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (typeof unsubUser === 'function') {
        try { unsubUser(); } catch (_) {}
        unsubUser = null;
      }

      setFirebaseUser(user || null);

      if (!user) {
        setCurrentUser(null);
        activeSessionIdRef.current = null;
        setAuthReady(true);
        setIsLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const email = user.email || '';
          const username = email.includes('@') ? email.split('@')[0] : (user.displayName || 'user');
          await setDoc(userRef, {
            username,
            name: user.displayName || username,
            email,
            role: 'reader',
            isActive: true,
            createdAt: new Date().toISOString(),
            createdBy: 'self-bootstrap',
          }, { merge: true });
        }

        const sessionId = generateSessionId();
        activeSessionIdRef.current = sessionId;
        await setDoc(userRef, {
          activeSessionId: sessionId,
          activeSessionAt: new Date().toISOString(),
          activeSessionUA: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }, { merge: true });

        unsubUser = onSnapshot(doc(db, 'users', user.uid), (d) => {
          if (!isMountedRef.current) return;
          const data = d.data() || {};

          const activeId = data.activeSessionId;
          if (activeId && activeSessionIdRef.current && activeId !== activeSessionIdRef.current) {
            if (isMountedRef.current) setAlertMessage('Sesi Anda berakhir karena akun ini login di perangkat lain.');
            activeSessionIdRef.current = null;
            signOut(auth).catch(() => {});
            return;
          }

          if (data.isActive === false) {
            if (isMountedRef.current) setAlertMessage('Akun Anda dinonaktifkan. Hubungi administrator.');
            signOut(auth).catch(() => {});
            return;
          }

          if (isMountedRef.current) {
            setCurrentUser({
              id: user.uid,
              username: data.username || (user.email ? user.email.split('@')[0] : ''),
              name: data.name || user.displayName || data.username || 'User',
              role: data.role || 'reader',
              email: user.email || data.email || '',
              isActive: data.isActive !== false,
            });
          }
        });

        if (isMountedRef.current) {
          setAlertMessage('');
          setAuthReady(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Auth bootstrap error:', err);
        if (isMountedRef.current) {
          setAlertMessage(`Auth error: ${err?.message || 'Unknown error'}`);
          setCurrentUser(null);
          setAuthReady(true);
          setIsLoading(false);
        }
      }
    });

    return () => {
      try { if (typeof unsubUser === 'function') unsubUser(); } catch (_) {}
      unsubAuth();
    };
  }, []);

  const handleLogin = async (username, password) => {
    try {
      const u = (username || '').trim();
      const p = (password || '').trim();
      if (!u || !p) {
        setAlertMessage('Username/Email dan Password wajib diisi.');
        return;
      }
      const email = u.includes('@') ? u : `${u}@app.local`;
      await signInWithEmailAndPassword(auth, email, p);
      setAlertMessage('');
    } catch (err) {
      const code = err?.code || '';
      if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
        setAlertMessage('Login gagal: password salah / akun tidak ditemukan.');
      } else if (code.includes('auth/user-disabled')) {
        setAlertMessage('Login gagal: akun dinonaktifkan.');
      } else {
        setAlertMessage(`Login gagal: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (err) { console.error('Logout error:', err); }
    finally {
      setCurrentUser(null);
      setFirebaseUser(null);
    }
  };

  return {
    currentUser,
    firebaseUser,
    authReady,
    isLoading,
    alertMessage,
    setAlertMessage,
    handleLogin,
    handleLogout,
  };
};
```

- [ ] **Step 2: Use `useAuth` in `App.jsx`**

In `SuratJalanMonitor`, replace the auth state declarations and the auth `useEffect` (lines ~1067–1222) with:

```jsx
// At the top of SuratJalanMonitor:
import { useAuth } from './hooks/useAuth.js';

const SuratJalanMonitor = () => {
  const {
    currentUser, firebaseUser, authReady, isLoading, alertMessage, setAlertMessage,
    handleLogin, handleLogout,
  } = useAuth();

  // Remove the now-replaced state lines:
  // const [currentUser, setCurrentUser] = useState(null);       -- REMOVE
  // const [firebaseUser, setFirebaseUser] = useState(null);     -- REMOVE
  // const [authReady, setAuthReady] = useState(false);          -- REMOVE
  // const [isLoading, setIsLoading] = useState(true);           -- REMOVE
  // const [alertMessage, setAlertMessage] = useState('');       -- REMOVE (now from hook)
  // const activeSessionIdRef = useRef(null);                    -- REMOVE
  // const isMountedRef = useRef(true);                          -- REMOVE
  // useEffect for isMountedRef                                  -- REMOVE
  // The entire onAuthStateChanged useEffect                     -- REMOVE
  // handleLogin function                                        -- REMOVE
  // handleLogout function                                       -- REMOVE
  // executeForcedLogout stays here for now (uses other state)

  // Keep existing lines for everything else...
```

Also move `executeForcedLogout` to `useAuth` later or leave it in `SuratJalanMonitor` — it's okay to leave it for now since it depends on `forceLogoutExecutedRef` and `showModal`.

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Login, browse all tabs. Check no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAuth.js src/App.jsx
git commit -m "refactor: extract auth logic into useAuth hook"
```

---

## Task 5: Extract `useMasterData` hook

**Files:**
- Create: `src/hooks/useMasterData.js`
- Modify: `src/App.jsx` — replace four master data subscriptions with hook

The master data subscriptions load trucks, supir (drivers), rute (routes), material. `masterdataService.js` already has `subscribeMasterCollection`. This hook just wires up four subscriptions.

- [ ] **Step 1: Create `src/hooks/useMasterData.js`**

```js
// src/hooks/useMasterData.js
import { useState, useEffect } from 'react';
import { subscribeMasterCollection } from '../masterdataService.js';

export const useMasterData = () => {
  const [truckList, setTruckList] = useState([]);
  const [supirList, setSupirList] = useState([]);
  const [ruteList, setRuteList] = useState([]);
  const [materialList, setMaterialList] = useState([]);

  useEffect(() => {
    const unsubs = [
      subscribeMasterCollection('trucks', setTruckList),
      subscribeMasterCollection('supir', setSupirList),
      subscribeMasterCollection('rute', setRuteList),
      subscribeMasterCollection('material', setMaterialList),
    ];
    return () => unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
  }, []);

  return { truckList, supirList, ruteList, materialList };
};
```

- [ ] **Step 2: Use `useMasterData` in `App.jsx`**

In `SuratJalanMonitor`, replace:
```jsx
const [truckList, setTruckList] = useState([]);
const [supirList, setSupirList] = useState([]);
const [ruteList, setRuteList] = useState([]);
const [materialList, setMaterialList] = useState([]);
```
And the four `onSnapshot` useEffects that populate these (search for `onSnapshot(collection(db, "trucks")` etc.) with:

```jsx
import { useMasterData } from './hooks/useMasterData.js';

// Inside SuratJalanMonitor:
const { truckList, supirList, ruteList, materialList } = useMasterData();
```

- [ ] **Step 3: Verify & commit**

```bash
npm run dev
```

Open master data tab. All lists should still load. Then:

```bash
git add src/hooks/useMasterData.js src/App.jsx
git commit -m "refactor: extract master data subscriptions into useMasterData hook"
```

---

## Task 6: Extract `useUsers` hook

**Files:**
- Create: `src/hooks/useUsers.js`
- Modify: `src/App.jsx`

The users subscription and management (addUser, updateUser) currently lives in `SuratJalanMonitor`. Only the superadmin uses it.

- [ ] **Step 1: Create `src/hooks/useUsers.js`**

```js
// src/hooks/useUsers.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';
import { createUserWithRoleFn } from '../config/firebase-config.js';
import { upsertItemToFirestore } from '../firestoreService.js';

export const useUsers = ({ currentUser, setAlertMessage }) => {
  const [usersList, setUsersList] = useState([]);

  // Only subscribe if user is superadmin
  const isSuperadmin = currentUser?.role === 'superadmin';

  useEffect(() => {
    if (!isSuperadmin) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')));
      setUsersList(rows);
    });
    return () => unsub();
  }, [isSuperadmin]);

  const addUser = async (data) => {
    const username = (data?.username || '').trim();
    const password = (data?.password || '').trim();
    const name = (data?.name || '').trim();
    const role = (data?.role || '').trim();

    if (!username || !password || !name || !role) {
      setAlertMessage('Username, Password, Nama Lengkap, dan Role harus diisi!');
      return false;
    }

    try {
      const result = await createUserWithRoleFn({ username, password, name, role });
      if (result?.data?.ok) {
        setAlertMessage(`User "${name}" berhasil dibuat dengan email ${result.data.email}.`);
        return true;
      }
      setAlertMessage('Gagal membuat user. Coba lagi.');
      return false;
    } catch (err) {
      if (err?.code === 'functions/already-exists') {
        setAlertMessage('Username sudah digunakan. Gunakan username lain.');
      } else if (err?.code === 'functions/permission-denied') {
        setAlertMessage('Akses ditolak. Hanya superadmin yang dapat menambah user.');
      } else {
        setAlertMessage(`Gagal membuat user: ${err?.message || 'Unknown error'}`);
      }
      return false;
    }
  };

  const updateUser = async (id, updates) => {
    const updatedUser = usersList.find((u) => u.id === id);
    if (!updatedUser) return;

    const patched = {
      ...updatedUser,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || 'system',
    };

    setUsersList((prev) =>
      prev.map((u) => (u.id === id ? patched : u))
        .sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')))
    );

    try {
      await upsertItemToFirestore(db, 'users', patched);
    } catch (e) {
      console.error('updateUser -> Firestore failed', e);
      setAlertMessage('Gagal update user ke Firebase. Perubahan tersimpan di cache lokal.');
    }
  };

  return { usersList, addUser, updateUser };
};
```

- [ ] **Step 2: Use `useUsers` in `App.jsx`**

In `SuratJalanMonitor`:
- Remove `const [usersList, setUsersList] = useState([]);`
- Remove the `onSnapshot(collection(db, "users"), ...)` useEffect
- Remove the `addUser` and `updateUser` functions
- Add at the top of the component body:

```jsx
import { useUsers } from './hooks/useUsers.js';

// inside SuratJalanMonitor:
const { usersList, addUser, updateUser } = useUsers({ currentUser, setAlertMessage });
```

- [ ] **Step 3: Verify & commit**

```bash
npm run dev
```

Visit Users tab (as superadmin). List, add, and edit users should work.

```bash
git add src/hooks/useUsers.js src/App.jsx
git commit -m "refactor: extract users management into useUsers hook"
```

---

## Task 7: Extract `useSettings` hook

**Files:**
- Create: `src/hooks/useSettings.js`
- Modify: `src/App.jsx`

Settings includes the app settings document and the force-logout scheduler logic.

- [ ] **Step 1: Create `src/hooks/useSettings.js`**

```js
// src/hooks/useSettings.js
import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase-config.js';

export const useSettings = ({ currentUser, setAlertMessage, onForcedLogout }) => {
  const [appSettings, setAppSettings] = useState({
    companyName: '',
    logoUrl: '',
    loginFooterText: 'Masuk untuk mengakses dashboard monitoring',
  });
  const [forceLogoutConfig, setForceLogoutConfig] = useState(null);
  const [forceLogoutBanner, setForceLogoutBanner] = useState(null);

  const shownWarningThresholdsRef = useRef(new Set());
  const prevForceLogoutScheduledAtRef = useRef(null);
  const forceLogoutExecutedRef = useRef(false);

  // App settings subscription
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'app'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setAppSettings({
          companyName: data.companyName || '',
          logoUrl: data.logoUrl || '',
          loginFooterText: data.loginFooterText || 'Masuk untuk mengakses dashboard monitoring',
        });
      }
    });
    return () => unsub();
  }, []);

  // Force logout subscription
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'settings', 'forceLogout'), (d) => {
      const data = d.exists() ? d.data() : {};
      setForceLogoutConfig(data);
    });
    return () => unsub();
  }, [currentUser]);

  // Force logout timer
  useEffect(() => {
    if (!forceLogoutConfig?.scheduledAt || !currentUser) {
      setForceLogoutBanner(null);
      return;
    }

    const scheduledAt = forceLogoutConfig.scheduledAt;
    if (scheduledAt !== prevForceLogoutScheduledAtRef.current) {
      prevForceLogoutScheduledAtRef.current = scheduledAt;
      forceLogoutExecutedRef.current = false;
      shownWarningThresholdsRef.current = new Set();
    }

    const tick = () => {
      const now = Date.now();
      const target = new Date(scheduledAt).getTime();
      const msRemaining = target - now;
      const minutesRemaining = Math.ceil(msRemaining / 60000);

      if (msRemaining <= 0) {
        if (!forceLogoutExecutedRef.current) {
          forceLogoutExecutedRef.current = true;
          setForceLogoutBanner(null);
          setDoc(doc(db, 'settings', 'forceLogout'), { executedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
          signOut(auth).catch(() => {});
          if (typeof onForcedLogout === 'function') onForcedLogout();
        }
        return;
      }

      const thresholds = [60, 30, 15, 10, 5, 1];
      thresholds.forEach((t) => {
        if (minutesRemaining <= t && !shownWarningThresholdsRef.current.has(t)) {
          shownWarningThresholdsRef.current.add(t);
        }
      });

      setForceLogoutBanner({
        minutesRemaining,
        reason: forceLogoutConfig.reason || '',
        scheduledAtLocal: new Date(scheduledAt).toLocaleString('id-ID'),
      });
    };

    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [forceLogoutConfig, currentUser, onForcedLogout]);

  const saveSettings = async (newSettings) => {
    try {
      await setDoc(doc(db, 'settings', 'app'), newSettings, { merge: true });
      setAlertMessage('Pengaturan berhasil disimpan.');
    } catch (err) {
      setAlertMessage(`Gagal menyimpan pengaturan: ${err?.message || 'Unknown error'}`);
    }
  };

  const saveForceLogout = async (config) => {
    try {
      await setDoc(doc(db, 'settings', 'forceLogout'), config, { merge: true });
      setAlertMessage('Force logout dijadwalkan.');
    } catch (err) {
      setAlertMessage(`Gagal menyimpan force logout: ${err?.message}`);
    }
  };

  return { appSettings, forceLogoutConfig, forceLogoutBanner, saveSettings, saveForceLogout };
};
```

- [ ] **Step 2: Use `useSettings` in `App.jsx`**

In `SuratJalanMonitor`, replace:
- `const [appSettings, setAppSettings] = useState(...)` — REMOVE
- `const [forceLogoutConfig, setForceLogoutConfig] = useState(null)` — REMOVE
- `const [forceLogoutBanner, setForceLogoutBanner] = useState(null)` — REMOVE
- All force-logout refs (`shownWarningThresholdsRef`, `prevForceLogoutScheduledAtRef`, `forceLogoutExecutedRef`) — REMOVE
- The settings `onSnapshot` useEffect — REMOVE
- The force-logout `onSnapshot` useEffect — REMOVE
- The force-logout timer `useEffect` — REMOVE

Add:
```jsx
import { useSettings } from './hooks/useSettings.js';

// inside SuratJalanMonitor:
const { appSettings, forceLogoutConfig, forceLogoutBanner, saveSettings, saveForceLogout } = useSettings({
  currentUser,
  setAlertMessage,
  onForcedLogout: () => { setShowModal(false); },
});
```

- [ ] **Step 3: Verify & commit**

```bash
npm run dev
```

Check settings tab loads, company name shows on login screen.

```bash
git add src/hooks/useSettings.js src/App.jsx
git commit -m "refactor: extract settings and force logout into useSettings hook"
```

---

## Task 8: Extract small UI components

**Files:**
- Create: `src/components/SearchableSelect.jsx`
- Create: `src/components/StatCard.jsx`
- Create: `src/components/AlertBanner.jsx`
- Modify: `src/App.jsx`

These are small, self-contained components with no business logic dependencies.

- [ ] **Step 1: Create `src/components/SearchableSelect.jsx`**

Copy lines 217–286 from `App.jsx`. Add import at top and export at bottom:

```jsx
// src/components/SearchableSelect.jsx
import React, { useState } from 'react';
import { Search } from 'lucide-react';

const SearchableSelect = ({ options, value, onChange, placeholder, label, displayKey = 'name', valueKey = 'id' }) => {
  // ... paste lines 218-285 from App.jsx exactly ...
};

export default SearchableSelect;
```

- [ ] **Step 2: Create `src/components/StatCard.jsx`**

```jsx
// src/components/StatCard.jsx
import React from 'react';

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-sm">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${color} p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

export default StatCard;
```

- [ ] **Step 3: Create `src/components/AlertBanner.jsx`**

This is the force-logout warning banner. Find where `forceLogoutBanner` is rendered in `SuratJalanMonitor` (search for `forceLogoutBanner.minutesRemaining`) and extract it:

```jsx
// src/components/AlertBanner.jsx
import React from 'react';
import { AlertCircle } from 'lucide-react';

const AlertBanner = ({ banner }) => {
  if (!banner) return null;
  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 mb-4 rounded flex items-start space-x-3">
      <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">
          Sistem akan logout otomatis dalam {banner.minutesRemaining} menit
        </p>
        {banner.reason && <p className="text-sm mt-1">Alasan: {banner.reason}</p>}
        <p className="text-sm">Dijadwalkan: {banner.scheduledAtLocal}</p>
      </div>
    </div>
  );
};

export default AlertBanner;
```

Adjust the JSX to match exactly what `App.jsx` renders for the banner. Search for `forceLogoutBanner` in App.jsx to find the exact markup.

- [ ] **Step 4: Update `App.jsx` imports**

Add at top of `App.jsx`:
```jsx
import SearchableSelect from './components/SearchableSelect.jsx';
import StatCard from './components/StatCard.jsx';
import AlertBanner from './components/AlertBanner.jsx';
```

Delete the inline `SearchableSelect` (lines ~217–286), `StatCard` (lines ~5017–5029), and replace the inline banner JSX with `<AlertBanner banner={forceLogoutBanner} />`.

- [ ] **Step 5: Verify & commit**

```bash
npm run dev
```

Check the SJ list renders (StatCard, SearchableSelect in modals), no console errors.

```bash
git add src/components/ src/App.jsx
git commit -m "refactor: extract SearchableSelect, StatCard, AlertBanner components"
```

---

## Task 9: Extract `SuratJalanCard` component

**Files:**
- Create: `src/components/SuratJalanCard.jsx`
- Modify: `src/App.jsx`

`SuratJalanCard` is at lines 5031–5208 in `App.jsx`. It receives props and has no direct Firestore calls — clean to extract.

- [ ] **Step 1: Create `src/components/SuratJalanCard.jsx`**

```jsx
// src/components/SuratJalanCard.jsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Edit, Trash2, Eye } from 'lucide-react';

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
  getStatusIcon,
}) => {
  // Paste lines 5045-5207 from App.jsx exactly here
};

export default SuratJalanCard;
```

The exact body of `SuratJalanCard` runs from line 5045 to the closing `};` around line 5208. Copy it as-is and add the missing icon imports (CheckCircle, XCircle, etc. — check which icons are used in the component body).

- [ ] **Step 2: Update `App.jsx`**

Add import:
```jsx
import SuratJalanCard from './components/SuratJalanCard.jsx';
```

Delete the inline `SuratJalanCard` definition (lines 5031–5208).

- [ ] **Step 3: Verify & commit**

```bash
npm run dev
```

SJ list should render normally with expand/collapse working.

```bash
git add src/components/SuratJalanCard.jsx src/App.jsx
git commit -m "refactor: extract SuratJalanCard into its own component"
```

---

## Task 10: Extract `LoginPage`

**Files:**
- Create: `src/pages/LoginPage.jsx`
- Modify: `src/App.jsx`

`LoginScreen` is at lines 4908–5015. Simple presentation component.

- [ ] **Step 1: Create `src/pages/LoginPage.jsx`**

```jsx
// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { Package } from 'lucide-react';

const LoginPage = ({ onLogin, alertMessage, setAlertMessage, appSettings }) => {
  // Paste lines 4909-5014 from App.jsx exactly here
};

export default LoginPage;
```

- [ ] **Step 2: Update `App.jsx`**

Add import:
```jsx
import LoginPage from './pages/LoginPage.jsx';
```

Replace usage of `<LoginScreen ...>` with `<LoginPage ...>` and delete the inline `LoginScreen` definition (lines 4908–5015).

- [ ] **Step 3: Verify & commit**

```bash
npm run dev
```

Log out and verify login page renders with company logo/name.

```bash
git add src/pages/LoginPage.jsx src/App.jsx
git commit -m "refactor: extract LoginScreen into LoginPage component"
```

---

## Task 11: Extract remaining large page components

**Files:**
- Create: `src/pages/LaporanKasPage.jsx` (from App.jsx lines 289–752)
- Create: `src/pages/InvoicePage.jsx` (from App.jsx lines 752–1067)
- Create: `src/pages/MasterDataPage.jsx` (from App.jsx lines 3750–4173)
- Create: `src/pages/SettingsPage.jsx` (from App.jsx lines 4185–4588)
- Create: `src/pages/KeuanganPage.jsx` (from App.jsx lines 4588–4781)
- Create: `src/pages/UsersPage.jsx` (from App.jsx lines 4781–4908)
- Modify: `src/App.jsx`

**Pattern for each page (repeat for all 6 below):**

### LaporanKasPage

```jsx
// src/pages/LaporanKasPage.jsx
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { formatCurrency } from '../utils/currency.js';

const LaporanKasPage = ({ suratJalanList, transaksiList }) => {
  // Paste lines 290-751 from App.jsx — the full LaporanKas body
  // Replace all `formatCurrency(` calls that come from props with the imported one
};

export default LaporanKasPage;
```

Note: `LaporanKas` currently receives `formatCurrency` as a prop — after extraction, import it directly from `../utils/currency.js` and remove it from props.

### InvoicePage

```jsx
// src/pages/InvoicePage.jsx
import React, { useState } from 'react';
import { FileText, Plus, Edit, Trash2, Eye, CheckCircle } from 'lucide-react';
import { formatCurrency, formatTanggalID } from '../utils/currency.js';
import { isSJBelumInvoice } from '../utils/sjHelpers.js';

const InvoicePage = ({
  invoiceList,
  suratJalanList,
  currentUser,
  onAddInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onViewInvoice,
}) => {
  // Paste lines 753-1066 from App.jsx
};

export default InvoicePage;
```

### MasterDataPage

```jsx
// src/pages/MasterDataPage.jsx
import React, { useState } from 'react';
import { FileText, Plus, Edit, Trash2, Truck } from 'lucide-react';

const MasterDataPage = ({
  truckList, supirList, ruteList, materialList, currentUser,
  onAddTruck, onEditTruck, onDeleteTruck,
  onAddSupir, onEditSupir, onDeleteSupir,
  onAddRute, onEditRute, onDeleteRute,
  onAddMaterial, onEditMaterial, onDeleteMaterial,
  onDownloadTemplate, onImportData,
}) => {
  // Paste lines 3751-4172 from App.jsx
};

export default MasterDataPage;
```

### SettingsPage

```jsx
// src/pages/SettingsPage.jsx
import React, { useState } from 'react';

const SettingsPage = ({
  appSettings,
  forceLogoutConfig,
  currentUser,
  onSaveSettings,
  onSaveForceLogout,
}) => {
  // Paste lines 4186-4587 from App.jsx
};

export default SettingsPage;
```

### KeuanganPage

```jsx
// src/pages/KeuanganPage.jsx
import React, { useState } from 'react';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatTanggalID } from '../utils/currency.js';

const KeuanganPage = ({
  transaksiList,
  currentUser,
  onAddTransaksi,
  onDeleteTransaksi,
}) => {
  // Paste lines 4589-4780 from App.jsx
};

export default KeuanganPage;
```

### UsersPage

```jsx
// src/pages/UsersPage.jsx
import React from 'react';
import { Users, Plus, Edit, UserCheck, UserX } from 'lucide-react';
import { formatTanggalID } from '../utils/currency.js';

const UsersPage = ({
  usersList,
  currentUser,
  onAddUser,
  onEditUser,
  onToggleActive,
}) => {
  // Paste lines 4782-4906 from App.jsx
};

export default UsersPage;
```

- [ ] **Step 1: Create all 6 page files** (with content from App.jsx as described above)

- [ ] **Step 2: Update `App.jsx` — add imports, replace usages, delete inline definitions**

Add at top of App.jsx:
```jsx
import LaporanKasPage from './pages/LaporanKasPage.jsx';
import InvoicePage from './pages/InvoicePage.jsx';
import MasterDataPage from './pages/MasterDataPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import KeuanganPage from './pages/KeuanganPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
```

Find where each component is rendered in the JSX (inside the tab switch) and replace inline usage:
- `<LaporanKas ...>` → `<LaporanKasPage ...>`
- `<InvoiceManagement ...>` → `<InvoicePage ...>`
- `<MasterDataManagement ...>` → `<MasterDataPage ...>`
- `<SettingsManagement ...>` → `<SettingsPage ...>`
- `<KeuanganManagement ...>` → `<KeuanganPage ...>`
- `<UsersManagement ...>` → `<UsersPage ...>`

Delete the six inline component definitions from App.jsx.

- [ ] **Step 3: Verify each page as you go**

After adding each page file, run `npm run dev` and click to that tab. Fix any import/prop errors before moving to the next page.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ src/App.jsx
git commit -m "refactor: extract all tab pages into src/pages/"
```

---

## Task 12: Add URL-based routing

**Files:**
- Modify: `src/App.jsx` — replace `activeTab` state with `<Routes>` + `<Route>`
- No new files needed

By now App.jsx is the main shell component. The tab content is rendered with `{activeTab === 'X' && <XPage />}` pattern. We replace this with React Router `<Routes>`.

- [ ] **Step 1: Update App.jsx routing**

Replace the tab-based rendering. Find the JSX section that looks like:

```jsx
{activeTab === 'surat-jalan' && <SuratJalanSection ... />}
{activeTab === 'keuangan' && <KeuanganPage ... />}
{activeTab === 'laporan' && <LaporanKasPage ... />}
{activeTab === 'invoice' && <InvoicePage ... />}
{activeTab === 'master-data' && <MasterDataPage ... />}
{activeTab === 'users' && <UsersPage ... />}
{activeTab === 'settings' && <SettingsPage ... />}
```

Replace with:

```jsx
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Inside the authenticated layout:
<Routes>
  <Route path="/surat-jalan" element={<SuratJalanSection ... />} />
  <Route path="/keuangan" element={<KeuanganPage ... />} />
  <Route path="/laporan" element={<LaporanKasPage ... />} />
  <Route path="/invoice" element={<InvoicePage ... />} />
  <Route path="/master-data" element={<MasterDataPage ... />} />
  <Route path="/users" element={<UsersPage ... />} />
  <Route path="/settings" element={<SettingsPage ... />} />
  <Route path="*" element={<Navigate to="/surat-jalan" replace />} />
</Routes>
```

- [ ] **Step 2: Update tab navigation to use `useNavigate`**

Replace tab click handlers:
```jsx
// Before:
onClick={() => setActiveTab('keuangan')}

// After:
const navigate = useNavigate();
// ...
onClick={() => navigate('/keuangan')}
```

Replace active tab highlight checks:
```jsx
// Before:
activeTab === 'keuangan'

// After (import useLocation):
import { useLocation } from 'react-router-dom';
const location = useLocation();
location.pathname === '/keuangan'
```

- [ ] **Step 3: Remove `activeTab` state**

Delete `const [activeTab, setActiveTab] = useState('surat-jalan')` from `SuratJalanMonitor`.

- [ ] **Step 4: Verify all tabs have working URLs**

```bash
npm run dev
```

Open browser. Navigate to each tab. The URL should update to `/surat-jalan`, `/keuangan`, etc. Browser back/forward should work. Direct URL access (e.g. type `/invoice` in address bar) should load that tab.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: replace tab state with React Router URL-based routing"
```

---

## Task 13: Final cleanup — slim App.jsx to a shell

**Files:**
- Modify: `src/App.jsx` — only the main shell, auth guard, layout, modal should remain

- [ ] **Step 1: Audit remaining code in App.jsx**

After Tasks 2–12, App.jsx should contain only:
- Import statements
- `SuratJalanMonitor` component — the main shell with:
  - Hook calls (`useAuth`, `useMasterData`, `useUsers`, `useSettings`)
  - `showModal` / `modalType` / `selectedItem` state
  - The large `Modal` component (can be extracted later in Phase 3)
  - Data handler functions passed down as props (addSJ, updateSJ, etc.)
  - The authenticated layout with sidebar + `<Routes>`
  - The `<LoginPage>` redirect for unauthenticated users
- The `Modal` component inline (600–700 lines still — leave for a future task)

- [ ] **Step 2: Check file line count**

```bash
wc -l src/App.jsx
```

After all extractions, target is under 2,500 lines (down from 6,045).

- [ ] **Step 3: Fix any remaining lint/console issues**

```bash
npm run build
```

Fix any warnings that appear in the build output.

- [ ] **Step 4: Final commit**

```bash
git add src/App.jsx
git commit -m "refactor: App.jsx slimmed to shell after full component extraction"
```

---

## Verification Checklist

After all tasks:

- [ ] `wc -l src/App.jsx` shows < 2,500 lines (down from 6,045)
- [ ] `ls src/utils/` shows: `currency.js`, `session.js`, `sjHelpers.js`, `excel.js`
- [ ] `ls src/hooks/` shows: `useAuth.js`, `useMasterData.js`, `useUsers.js`, `useSettings.js`
- [ ] `ls src/components/` shows: `SearchableSelect.jsx`, `StatCard.jsx`, `AlertBanner.jsx`, `SuratJalanCard.jsx`
- [ ] `ls src/pages/` shows: `LoginPage.jsx`, `LaporanKasPage.jsx`, `InvoicePage.jsx`, `MasterDataPage.jsx`, `SettingsPage.jsx`, `KeuanganPage.jsx`, `UsersPage.jsx`
- [ ] `npm run build` completes with no errors
- [ ] Login works
- [ ] All tabs navigate with URL changes (e.g., `/surat-jalan`, `/keuangan`)
- [ ] Browser back/forward button navigates between tabs
- [ ] Creating, editing, deleting a Surat Jalan works
- [ ] Creating an invoice works
- [ ] Settings tab saves and reflects changes
- [ ] No `console.log` leaking Firebase config
