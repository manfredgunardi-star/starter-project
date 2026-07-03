# sj-monitor Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjalankan tiga fase optimasi sj-monitor (quick wins → jaring pengaman → refactor layer data) tanpa mengubah fungsionalitas, sesuai spec `docs/superpowers/specs/2026-07-03-sj-monitor-optimization-design.md`.

**Architecture:** App.jsx (4.198 baris) didekomposisi bertahap: komponen inline keluar dulu (byte-identik), lalu CRUD master data diganti satu factory dengan pola snapshot-as-source-of-truth, lalu 6 subscription Firestore pindah ke hooks per domain, terakhir handler domain pindah ke modul services dengan dependency injection. Setiap task divalidasi build + fingerprint E2E + smoke test staging.

**Tech Stack:** React 18 + Vite 7, Firebase 10 (Auth + Firestore), Vitest 4, ESLint 9 flat config, Tailwind 3.

**Referensi baris:** semua nomor baris mengacu ke `src/App.jsx` pada commit `5857b91`. Task C dikerjakan **bottom-up** (Modal dulu) supaya nomor baris di atasnya tidak bergeser. Selalu verifikasi anchor dengan grep sebelum memotong.

**Aturan keselamatan (berlaku semua task):**
- JANGAN sentuh: formula finansial (isi fungsi dipindah verbatim, tidak diedit), `firestore.rules`, `firebase-config.js`, `useAuth.js`, window query 12 bulan, skema/field Firestore.
- JANGAN test di URL production (`https://surat-jalan-monitor.web.app`). Staging only.
- JANGAN copy `.env.local` dari checkout utama ke worktree (itu config emulator — gotcha terdokumentasi).
- Commit message bahasa Inggris, conventional commits.

---

## Task 0: Setup lingkungan worktree

Worktree belum punya `node_modules` dan `.env*`. Checkout utama: `C:\Project\apps\sj-monitor`.

**Files:** tidak ada perubahan tracked (semua gitignored).

- [ ] **Step 0.1: Install dependencies**

```bash
cd apps/sj-monitor
npm ci
```

- [ ] **Step 0.2: Copy env staging (BUKAN .env.local)**

```bash
cp /c/Project/apps/sj-monitor/.env apps/sj-monitor/.env
cp /c/Project/apps/sj-monitor/.env.staging apps/sj-monitor/.env.staging
```

- [ ] **Step 0.3: Baseline hijau**

```bash
cd apps/sj-monitor && npm test && npm run lint && npm run build
```

Expected: semua exit 0. Jika baseline sudah merah, STOP dan laporkan ke user sebelum melanjutkan.

---

# FASE A — Quick Wins (peran: Optimizer)

## Task 1: Lazy-load xlsx di rejectionReportExport.js

`App.jsx` → `RejectionReport.jsx:4` → `rejectionReportExport.js:1` meng-import xlsx statis → ±400KB masuk bundle utama. Pola dynamic import sudah dipakai di `src/utils/excel.js:6`.

**Files:**
- Modify: `apps/sj-monitor/src/utils/rejectionReportExport.js`

- [ ] **Step 1.1: Catat bukti sebelum** — jalankan `npm run build`, catat dari output nama+ukuran chunk yang memuat xlsx (cari chunk terbesar; simpan angkanya untuk Task 2).

- [ ] **Step 1.2: Ubah file** — ganti seluruh isi `rejectionReportExport.js` menjadi:

```js
function escapeCell(value) {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRows(rows, columns) {
  return rows.map((row) => columns.map((c) => row[c.key] ?? ''));
}

export async function exportRejectionReportToExcel(rows, columns, filenamePrefix) {
  const XLSX = await import('xlsx');
  const headers = columns.map((c) => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...toRows(rows, columns)]);
  ws['!cols'] = columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ditolak');
  XLSX.writeFile(wb, `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportRejectionReportToCsv(rows, columns, filenamePrefix) {
  const headers = columns.map((c) => c.label);
  const lines = [headers, ...toRows(rows, columns)].map((cols) => cols.map(escapeCell).join(','));
  const BOM = '﻿';
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

Catatan: satu-satunya perubahan perilaku = `exportRejectionReportToExcel` jadi async. Pemanggil di `RejectionReport.jsx` memakai onClick fire-and-forget, aman. `BOM` ditulis sebagai `'﻿'` (sebelumnya literal karakter — pertahankan byte BOM di output CSV).

- [ ] **Step 1.3: Verifikasi** — `npm test && npm run lint && npm run build`. Expected: pass; di output build muncul chunk `xlsx-*.js` terpisah, dan chunk utama (index/App) mengecil dibanding Step 1.1.

- [ ] **Step 1.4: Commit**

```bash
git add apps/sj-monitor/src/utils/rejectionReportExport.js
git commit -m "perf(sj-monitor): lazy-load xlsx in rejection report export"
```

## Task 2: Baseline ukuran bundle

**Files:**
- Create: `docs/superpowers/notes/2026-07-03-sj-monitor-bundle-baseline.md`

- [ ] **Step 2.1:** `cd apps/sj-monitor && npm run build` — salin daftar chunk + ukuran (sebelum dari Step 1.1, sesudah dari build ini) ke file baseline dengan format tabel `chunk | sebelum | sesudah`.
- [ ] **Step 2.2: Commit** — `git add docs/... && git commit -m "docs(sj-monitor): record bundle size baseline"`

## Task 3: Nyalakan kembali PWA service worker — ⚠️ GATED

**PRASYARAT: konfirmasi eksplisit user** bahwa investigasi kuota write (Mei 2026) selesai dan SW boleh hidup lagi. Jika user tidak yakin → SKIP task ini, catat di notes, lanjut Fase B.

**Files:**
- Modify: `apps/sj-monitor/vite.config.js:12`

- [ ] **Step 3.1: Tanya user** (sekali, sebelum mulai): "Auto-reconcile sudah permanen disabled dan investigasi kuota selesai — SW PWA boleh dinyalakan lagi?"
- [ ] **Step 3.2: Edit** — di `vite.config.js` ganti:

```js
      // 2026-05-15: SW di-disable sementara untuk investigasi Firestore write quota.
      // selfDestroying=true men-generate SW yang unregister dirinya & clear cache.
      // Set false kembali setelah root cause ditemukan & diperbaiki.
      selfDestroying: true,
```

menjadi:

```js
      // 2026-07: SW diaktifkan kembali — root cause write quota (auto-reconcile)
      // sudah permanen disabled (ENABLE_AUTO_UANG_JALAN_RECONCILE = false).
      selfDestroying: false,
```

- [ ] **Step 3.3: Verifikasi** — `npm run build`; expected: `dist/sw.js` ter-generate berisi precache manifest (bukan self-destroying stub — cek tidak ada string `self-destroying`/`unregister` sebagai isi utama).
- [ ] **Step 3.4: Commit** — `git commit -m "feat(sj-monitor): re-enable PWA service worker after write-quota investigation"`

## ✅ CHECKPOINT A

- [ ] `npm test && npm run lint && npm run build` semua pass → `npm run smoketest` → cek manual `https://sj-monitor-staging.web.app` (login, buka tab SJ, export laporan penolakan jika ada datanya) → laporkan ke user, minta review (peran: Reviewer).

---

# FASE B — Jaring Pengaman

## Task 4: Perluas ESLint ke seluruh src/

`eslint.config.js` sudah men-target `src/**/*.{js,jsx}` — yang membatasi hanya script npm.

**Files:**
- Modify: `apps/sj-monitor/package.json` (script `lint`)
- Create: `docs/superpowers/notes/2026-07-03-sj-monitor-lint-triage.md`

- [ ] **Step 4.1:** Di `package.json` ganti `"lint": "eslint src/utils/ src/services/"` → `"lint": "eslint src/"`.
- [ ] **Step 4.2:** Jalankan `npm run lint`. Klasifikasikan output:
  - **Boleh langsung diperbaiki (mekanis):** unused import/variable (hapus atau prefix `_`), `no-undef` karena import hilang, duplikat key literal.
  - **JANGAN diperbaiki (catat saja):** apa pun yang mengubah logika/perilaku (mis. `no-fallthrough`, kondisi selalu-true, react-hooks/rules-of-hooks). Tulis daftarnya ke file triage.
- [ ] **Step 4.3:** Ulangi `npm run lint` sampai **0 error** (warning boleh tersisa — `prop-types` dan `no-unused-vars` memang level warn). Jika ada error yang tidak bisa dihilangkan tanpa perubahan perilaku → downgrade per-file via comment `/* eslint-disable-line <rule> */` + catat di triage, JANGAN ubah logika.
- [ ] **Step 4.4:** `npm test && npm run build` pass → commit: `chore(sj-monitor): extend lint coverage to all of src/`

## Task 5: Baseline E2E golden-flow fingerprint

Fingerprint render per tab, dipakai sebagai pembanding di setiap task Fase C. Teknik yang sama sukses dipakai di dekomposisi bul-monitor U1–U11.

**Files:**
- Create: `docs/superpowers/e2e-baselines/2026-07-03-sj-monitor-fingerprint.json`

- [ ] **Step 5.1:** Minta user kredensial akun **staging** role superadmin (perlu agar semua tab terlihat). Tanpa ini task berhenti.
- [ ] **Step 5.2:** Jalankan dev server terhubung DB staging: `cd apps/sj-monitor && npx vite --mode staging` (mode staging memuat `.env.staging`; JANGAN pakai `.env.local`).
- [ ] **Step 5.3:** Dengan browser tool (Playwright MCP / agent-browser): buka `http://localhost:5173`, login, lalu untuk **setiap tab** (`surat-jalan`, `invoicing`, `uang-muka`, `keuangan`, `laporan-kas`, `laporan-truk`, `payslip`, `master-data`, `users`, `settings`): tunggu data termuat (spinner "Memuat..." hilang), lalu evaluasi snippet ini **dua kali berturut-turut sampai hasilnya identik** (menghindari noise animasi framer-motion):

```js
(() => {
  const html = document.getElementById('root').innerHTML;
  let h = 0;
  for (let i = 0; i < html.length; i++) h = (Math.imul(h, 31) + html.charCodeAt(i)) | 0;
  return { len: html.length, hash: h };
})()
```

- [ ] **Step 5.4:** Simpan JSON `{ tab: { len, hash } }` + tanggal + catatan jumlah kartu SJ & teks StatSummary ke file baseline. Commit: `test(sj-monitor): capture E2E render fingerprint baseline`

**Catatan pemakaian saat Fase C:** data staging tidak boleh berubah di antara capture baseline dan pembanding. Jika hash mismatch, pertama re-capture baseline pada commit sebelum perubahan (`git stash` teknik terdokumentasi) untuk memastikan mismatch bukan karena data.

## ✅ CHECKPOINT B — laporkan hasil lint triage + baseline ke user.

---

# FASE C — Refactor Layer Data (peran: Engineer, urutan bottom-up)

**Resep ekstraksi byte-identik (dipakai Task 6–8):**
1. Verifikasi anchor: `grep -n "<anchor>" src/App.jsx` harus persis 1 hasil di baris yang diharapkan.
2. Salin rentang baris ke file baru: `sed -n '<start>,<end>p' src/App.jsx > src/components/<Nama>.jsx`
3. Tambahkan di ATAS file baru: import yang dibutuhkan; di BAWAH: `export default <Nama>;`
4. Cara menemukan import yang benar: `npx eslint src/components/<Nama>.jsx` → setiap error `no-undef` = identifier yang butuh import. Ambil sumber import dari header App.jsx (baris 1–47). Ulangi sampai 0 error `no-undef`.
5. Hapus rentang baris dari App.jsx: `sed -i '<start>,<end>d' src/App.jsx`, tambahkan `import <Nama> from './components/<Nama>.jsx';` di blok import App.jsx.
6. Bersihkan import App.jsx yang jadi unused (lihat `npm run lint`).
7. Validasi: `npm test && npm run lint && npm run build` pass → fingerprint tab terkait match baseline → commit.

## Task 6: C1a — Ekstrak Modal (baris 3067–4195)

**Files:**
- Create: `apps/sj-monitor/src/components/Modal.jsx`
- Modify: `apps/sj-monitor/src/App.jsx`

- [ ] **Step 6.1:** Anchor awal: `grep -n "^const Modal = ({ type, selectedItem" src/App.jsx` → expected `3067`. Anchor akhir: baris `4195` berisi `};` (baris terakhir sebelum baris kosong + `export default SuratJalanMonitor;`). Verifikasi: `sed -n '4193,4197p' src/App.jsx`.
- [ ] **Step 6.2–6.7:** Jalankan resep ekstraksi untuk rentang `3067,4195` → `src/components/Modal.jsx`. Dependensi yang pasti dibutuhkan (verifikasi tetap via eslint): `useState`/`useEffect`/`useMemo` dari react, `SearchableSelect`, `Pagination`/`PAGE_SIZE`/`clampPage`, `formatCurrency`, `isSJBelumInvoice`, ikon lucide yang direferensikan, helper tarif (cek `src/utils/tarifRuteHelpers.js`).
- [ ] **Step 6.8:** Fingerprint: tab `surat-jalan` match; buka modal "Tambah SJ" di dev staging, form render normal, TUTUP tanpa submit (hindari write). Commit: `refactor(sj-monitor): extract Modal component from App.jsx (verbatim)`

## Task 7: C1b — Ekstrak UsersManagement (baris 2937–3066)

- [ ] Sama seperti Task 6 dengan anchor `grep -n "^const UsersManagement" src/App.jsx` → expected `2937`, akhir `3066` (baris sebelum `const Modal`). File tujuan: `src/components/UsersManagement.jsx`. Fingerprint tab `users`. Commit: `refactor(sj-monitor): extract UsersManagement component from App.jsx (verbatim)`

## Task 8: C1c — Ekstrak SettingsManagement (baris 2520–2936, termasuk helper datetime)

- [ ] Sama seperti Task 6; rentang mencakup helper `isoToDatetimeLocal`/`datetimeLocalToIso` (2522–2532) yang hanya dipakai Settings — verifikasi dengan `grep -n "isoToDatetimeLocal\|datetimeLocalToIso" src/App.jsx` (semua kemunculan harus di dalam rentang; jika ada di luar, biarkan helper di App.jsx dan ekspor dari sana). Anchor: `grep -n "^const SettingsManagement" src/App.jsx` → expected `2534`. File tujuan: `src/components/SettingsManagement.jsx`. Fingerprint tab `settings`. Commit: `refactor(sj-monitor): extract SettingsManagement component from App.jsx (verbatim)`

## ✅ CHECKPOINT C1 — validasi penuh + `npm run smoketest` + user review. App.jsx kini ≈ 2.500 baris.

## Task 9: C2 — Factory CRUD master data + snapshot-as-source-of-truth

Mengganti 4 salinan handler (truck :265, supir :328, rute :386, material :458 — verifikasi rute/material berbentuk sama sebelum mulai) dengan satu factory. **Perubahan timing yang disepakati di spec:** UI master data update setelah echo `onSnapshot` (<1 dtk), bukan mutasi state manual.

**Files:**
- Create: `apps/sj-monitor/src/services/masterDataActions.js`
- Test: `apps/sj-monitor/src/services/__tests__/masterDataActions.test.js`
- Modify: `apps/sj-monitor/src/App.jsx`

- [ ] **Step 9.1: Tulis failing test dulu (TDD)** — buat file test:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firestoreService.js', () => ({
  upsertItemToFirestore: vi.fn().mockResolvedValue(undefined),
  softDeleteItemInFirestore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../config/firebase-config.js', () => ({ db: {} }));

import { upsertItemToFirestore, softDeleteItemInFirestore } from '../../firestoreService.js';
import { createMasterDataActions } from '../masterDataActions.js';

const makeActions = (overrides = {}) =>
  createMasterDataActions({
    collectionName: 'trucks',
    label: 'Truck',
    idPrefix: 'TRK',
    getUserName: () => 'Tester',
    onError: vi.fn(),
    ...overrides,
  });

beforeEach(() => vi.clearAllMocks());

describe('createMasterDataActions', () => {
  it('add: membuat id berprefix, isActive true, createdBy dari getUserName', async () => {
    await makeActions().add({ nomorPolisi: 'B 1 ABC' });
    const [, coll, payload] = upsertItemToFirestore.mock.calls[0];
    expect(coll).toBe('trucks');
    expect(payload.id).toMatch(/^TRK-/);
    expect(payload.isActive).toBe(true);
    expect(payload.createdBy).toBe('Tester');
    expect(payload.nomorPolisi).toBe('B 1 ABC');
  });

  it('update: updates.isActive false TIDAK tertimpa (regresi PR #53/#55)', async () => {
    await makeActions().update('TRK-1', { isActive: false, nama: 'X' });
    const [, , payload] = upsertItemToFirestore.mock.calls[0];
    expect(payload.isActive).toBe(false);
    expect(payload.updatedBy).toBe('Tester');
  });

  it('update: tanpa updates.isActive default ke true', async () => {
    await makeActions().update('TRK-1', { nama: 'X' });
    expect(upsertItemToFirestore.mock.calls[0][2].isActive).toBe(true);
  });

  it('softDelete: meneruskan user, fallback "system"', async () => {
    await makeActions().softDelete('TRK-1');
    expect(softDeleteItemInFirestore).toHaveBeenCalledWith({}, 'trucks', 'TRK-1', 'Tester');
    await makeActions({ getUserName: () => undefined }).softDelete('TRK-2');
    expect(softDeleteItemInFirestore).toHaveBeenLastCalledWith({}, 'trucks', 'TRK-2', 'system');
  });

  it('activate: reset deletedAt/deletedBy dan isActive true', async () => {
    await makeActions().activate('TRK-1');
    expect(upsertItemToFirestore.mock.calls[0][2]).toEqual({
      id: 'TRK-1', isActive: true, deletedAt: null, deletedBy: null,
    });
  });

  it('onError terpanggil saat write gagal', async () => {
    upsertItemToFirestore.mockRejectedValueOnce(new Error('net'));
    const onError = vi.fn();
    await makeActions({ onError }).add({ nama: 'X' });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Truck'));
  });
});
```

- [ ] **Step 9.2:** `npm test` → expected FAIL (`createMasterDataActions` belum ada).
- [ ] **Step 9.3: Implementasi** — buat `src/services/masterDataActions.js`:

```js
// Factory CRUD master data (trucks/supir/rute/material).
// Pola state: snapshot-as-source-of-truth — fungsi ini HANYA menulis ke
// Firestore; list di UI diperbarui oleh onSnapshot di useMasterData.
import { upsertItemToFirestore, softDeleteItemInFirestore } from '../firestoreService.js';
import { db } from '../config/firebase-config.js';

export const createMasterDataActions = ({ collectionName, label, idPrefix, getUserName, onError }) => {
  const add = async (data) => {
    const item = {
      id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: getUserName(),
    };
    try {
      await upsertItemToFirestore(db, collectionName, item);
    } catch (err) {
      console.error(`[add${label}] Firestore error:`, err);
      onError(`⚠️ Gagal menyimpan ${label} ke Firebase. Cek koneksi / Console (F12).`);
    }
  };

  const update = async (id, updates) => {
    // urutan spread PENTING: updates.isActive harus bisa menimpa default true
    // (fix PR #53/#55 — jangan diubah)
    const payload = { id, isActive: true, ...updates, updatedAt: new Date().toISOString(), updatedBy: getUserName() };
    try {
      await upsertItemToFirestore(db, collectionName, payload);
    } catch (err) {
      console.error(`[update${label}] Firestore error:`, err);
      onError(`⚠️ Gagal update ${label} ke Firebase. Cek koneksi / Console (F12).`);
    }
  };

  const softDelete = async (id) => {
    try {
      await softDeleteItemInFirestore(db, collectionName, id, getUserName() || 'system');
    } catch (err) {
      console.error(`[delete${label}] Firestore error:`, err);
      onError(`⚠️ Gagal menghapus ${label}. Cek koneksi / Console (F12).`);
    }
  };

  const activate = async (id) => {
    try {
      await upsertItemToFirestore(db, collectionName, { id, isActive: true, deletedAt: null, deletedBy: null });
    } catch (err) {
      console.error(`[activate${label}] Firestore error:`, err);
      onError(`⚠️ Gagal mengaktifkan ${label}. Cek koneksi / Console (F12).`);
    }
  };

  return { add, update, softDelete, activate };
};
```

- [ ] **Step 9.4:** `npm test` → expected PASS semua.
- [ ] **Step 9.5: Wiring App.jsx** — di dalam `SuratJalanMonitor`, ganti 16 handler (add/update/delete/activate × truck/supir/rute/material, baris ±265–530) dengan:

```js
const masterDataDeps = { getUserName: () => currentUser?.name, onError: setAlertMessage };
const truckActions = useMemo(() => createMasterDataActions({ collectionName: 'trucks', label: 'Truck', idPrefix: 'TRK', ...masterDataDeps }), [currentUser?.name]);
const supirActions = useMemo(() => createMasterDataActions({ collectionName: 'supir', label: 'Supir', idPrefix: 'SPR', ...masterDataDeps }), [currentUser?.name]);
const ruteActions = useMemo(() => createMasterDataActions({ collectionName: 'rute', label: 'Rute', idPrefix: 'RUT', ...masterDataDeps }), [currentUser?.name]);
const materialActions = useMemo(() => createMasterDataActions({ collectionName: 'material', label: 'Material', idPrefix: 'MAT', ...masterDataDeps }), [currentUser?.name]);
```

  Sebelum mengganti: `grep -n "idPrefix\|'MAT-\|'RUT-" src/App.jsx` — verifikasi prefix rute/material yang sebenarnya dipakai (ekspektasi `RUT`/`MAT`; samakan dengan kode lama, JANGAN ganti prefix). Fungsi `deleteTruck` dkk. yang membungkus `setConfirmDialog` tetap di App.jsx, tapi body-nya memanggil `truckActions.softDelete(id)` — teks pesan konfirmasi tidak berubah. Callsite lama (`onAddTruck={addTruck}` dll.) diarahkan ke fungsi baru dengan nama yang sama sehingga props ke `MasterDataPage`/`Modal` tidak berubah.
- [ ] **Step 9.6:** Hapus semua mutasi manual `setTruckList`/`setSupirList`/`setRuteList`/`setMaterialList` yang tadinya di handler; hapus setter tak terpakai dari destructuring `useMasterData()` — TAPI verifikasi dulu setter tidak dipakai di tempat lain: `grep -n "setTruckList\|setSupirList\|setRuteList\|setMaterialList" src/App.jsx`.
- [ ] **Step 9.7:** `npm test && npm run lint && npm run build` pass; fingerprint tab `master-data` match.
- [ ] **Step 9.8: Tes tulis manual di STAGING (bukan production)** — via dev `--mode staging`: tambah 1 truck dummy → muncul (via echo snapshot) → edit → nonaktifkan → aktifkan → soft-delete. Budget: ±5 write. Verifikasi juga item nonaktif tetap terlihat di Master Data (fitur `truckListAll`).
- [ ] **Step 9.9: Commit** — `refactor(sj-monitor): replace 4x master data CRUD copies with single factory (snapshot as source of truth)`

## ✅ CHECKPOINT C2 — smoketest + user review.

## Task 10: C3a — Pusatkan normalisasi ke utils/firestoreNormalize.js (TDD)

**Files:**
- Create: `apps/sj-monitor/src/utils/firestoreNormalize.js`
- Test: `apps/sj-monitor/src/utils/__tests__/firestoreNormalize.test.js`

- [ ] **Step 10.1: Failing test dulu:**

```js
import { describe, it, expect } from 'vitest';
import { getQueryStartISO, normalizeSJ, normalizeInvoice, isLiveRow } from '../firestoreNormalize.js';

describe('getQueryStartISO', () => {
  it('mengembalikan tanggal 1, 12 bulan lalu, format YYYY-MM-01', () => {
    expect(getQueryStartISO()).toMatch(/^\d{4}-\d{2}-01$/);
    const d = new Date(getQueryStartISO());
    const monthsAgo = (new Date().getFullYear() - d.getFullYear()) * 12 + (new Date().getMonth() - d.getMonth());
    expect(monthsAgo).toBe(12);
  });
});

describe('normalizeSJ', () => {
  it('fallback id ke docId dan tanggalSJ dari field legacy', () => {
    expect(normalizeSJ({ tglSJ: '2026-01-02' }, 'DOC1')).toMatchObject({ id: 'DOC1', tanggalSJ: '2026-01-02', isActive: true });
    expect(normalizeSJ({ id: 'SJ-9', tanggal: '2026-02-03', isActive: false }, 'DOC2')).toMatchObject({ id: 'SJ-9', tanggalSJ: '2026-02-03', isActive: false });
  });
});

describe('normalizeInvoice', () => {
  it('fallback tglInvoice dari field legacy', () => {
    expect(normalizeInvoice({ tanggalInvoice: '2026-03-04' }, 'D1')).toMatchObject({ id: 'D1', tglInvoice: '2026-03-04', isActive: true });
  });
});

describe('isLiveRow', () => {
  it('false untuk deletedAt atau isActive false', () => {
    expect(isLiveRow({ deletedAt: 'x' })).toBe(false);
    expect(isLiveRow({ isActive: false })).toBe(false);
    expect(isLiveRow({ isActive: true })).toBe(true);
    expect(isLiveRow({})).toBe(true);
  });
});
```

- [ ] **Step 10.2:** `npm test` → FAIL. **Step 10.3: Implementasi** (logika dipindah VERBATIM dari App.jsx:66, :1673, :1715, dan filter yang berulang):

```js
// Normalisasi row Firestore — dipindah verbatim dari App.jsx (commit 5857b91).

// Returns ISO date string for the 1st of the month, 12 months ago
export const getQueryStartISO = () => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - 12; // 0-indexed
  if (month < 0) { month += 12; year -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};

export const normalizeSJ = (row, docId) => {
  const id = row?.id || docId;
  const tanggalSJ = row?.tanggalSJ || row?.tglSJ || row?.tgl_sj || row?.tanggal || row?.date || "";
  return { ...(row || {}), id, tanggalSJ, isActive: row?.isActive !== false };
};

export const normalizeInvoice = (row, docId) => {
  const id = row?.id || docId;
  const tglInvoice = row?.tglInvoice || row?.tanggalInvoice || row?.tgl_invoice || "";
  return { ...(row || {}), id, tglInvoice, isActive: row?.isActive !== false };
};

export const isLiveRow = (x) => !x?.deletedAt && x?.isActive !== false;
```

- [ ] **Step 10.4:** `npm test` PASS → commit: `refactor(sj-monitor): centralize Firestore row normalization helpers with tests`

## Task 11: C3b — Pindahkan 6 subscription ke hooks per domain

**Files:**
- Create: `src/hooks/useSuratJalanData.js`, `src/hooks/useBiayaData.js`, `src/hooks/useInvoiceData.js`, `src/hooks/useUangMukaData.js`, `src/hooks/useTransaksiData.js`
- Modify: `apps/sj-monitor/src/App.jsx` (hapus useEffect subscription :1662–1810an, ganti dengan pemanggilan hooks)

Semua hook menerima `enabled` (= `authReady && !!firebaseUser && !!currentUser`) dan mengembalikan list + setter (setter masih dipakai handler sampai Task 12; jangan dihapus dulu). Isi callback snapshot dipindah VERBATIM. Contoh lengkap satu hook — empat lainnya mengikuti pola identik dengan koleksi/field/sort masing-masing persis seperti di App.jsx:

```js
// src/hooks/useSuratJalanData.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';
import { getQueryStartISO, normalizeSJ, isLiveRow } from '../utils/firestoreNormalize.js';

export const useSuratJalanData = (enabled, onFirstLoad) => {
  const [suratJalanList, setSuratJalanList] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    const qStartISO = getQueryStartISO();
    const unsub = onSnapshot(
      query(collection(db, 'surat_jalan'), where('tanggalSJ', '>=', qStartISO)),
      (snap) => {
        const list = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id)).filter(isLiveRow);
        list.sort((a, b) => (new Date(b?.tanggalSJ).getTime() || 0) - (new Date(a?.tanggalSJ).getTime() || 0));
        setSuratJalanList(list);
        if (onFirstLoad) onFirstLoad();
      });
    return () => { try { unsub(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { suratJalanList, setSuratJalanList };
};
```

- [ ] **Step 11.1:** Buat kelima hook. Ketentuan per hook (samakan persis dengan kode lama, cek App.jsx:1668–1792):
  - `useInvoiceData`: memuat DUA subscription (`invoice` + `invoices` legacy) + logika merge/dedup `byInvoiceNumber` verbatim (App.jsx:1726–1758), pakai `mergeById` dari `sjHelpers.js` dan `normalizeInvoice`.
  - `useUangMukaData` dan `useTransaksiData`: sertakan error callback `console.warn` + set list kosong (App.jsx:1771–1774, :1789–1792) verbatim.
  - `useBiayaData`: tanpa sort (kode lama tidak sort biaya — jangan menambahkan).
- [ ] **Step 11.2:** Di App.jsx: hapus useEffect subscription lama; panggil hooks; wire `onFirstLoad` ke `didFirstLoadRef` sesuai pemakaian lama (`grep -n "didFirstLoadRef" src/App.jsx` dulu untuk melihat semua konsumennya). Nama state (`suratJalanList` dst.) tidak berubah sehingga sisa App.jsx tidak perlu diedit.
- [ ] **Step 11.3:** `npm test && npm run lint && npm run build` pass; fingerprint SEMUA tab match baseline; commit: `refactor(sj-monitor): move Firestore subscriptions from App.jsx into per-domain hooks`

## ✅ CHECKPOINT C3 — smoketest + user review.

## Task 12: C4 — Pindahkan handler domain ke modul services (verbatim + DI)

Handler tersisa di App.jsx: SJ (`addSuratJalan` :1327, `updateSuratJalan`, `markAsGagal`, `restoreFromGagal`, `deleteSuratJalan`), Invoice (`addInvoice` :577, `deleteInvoice`), Uang Muka (:785, :821), Biaya (:1574, :1586), Transaksi (:197, :243), `addHistoryLog` (:147). **Berisi logika finansial — body dipindah verbatim, TIDAK diedit sama sekali.**

**Files (satu sub-task per file, commit terpisah):**
- Create: `src/services/sjActions.js`, `src/services/invoiceActions.js`, `src/services/uangMukaActions.js`, `src/services/biayaTransaksiActions.js`
- Modify: `apps/sj-monitor/src/App.jsx`

**Resep per domain:**
1. Identifikasi semua identifier luar yang di-closure oleh handler (state list, setter, `currentUser`, `setAlertMessage`, `addHistoryLog`, `setConfirmDialog`, util yang di-import).
2. Buat factory `create<Domain>Actions(deps)` yang menerima semua itu sebagai satu objek `deps`, dan kembalikan handler dengan **body verbatim** (hanya prefix `deps.` ATAU destructuring `const { ... } = deps;` di atas — pilih destructuring agar body benar-benar tidak berubah).
3. Di App.jsx: `const sjActions = createSjActions({ db, currentUser, suratJalanList, setSuratJalanList, uangMukaList, setUangMukaList, transaksiList, setTransaksiList, invoiceList, setInvoiceList, addHistoryLog, setAlertMessage, setConfirmDialog, ... });` (isi deps sesuai temuan langkah 1 — JANGAN dikira-kira, harus dari grep). Callsite (props ke pages/Modal) tetap nama lama: `addSuratJalan={sjActions.addSuratJalan}` dst.
4. `addHistoryLog` dipindah pertama (ke `sjActions` atau modul sendiri `src/services/historyLog.js`) karena dipakai lintas domain.

- [ ] **Step 12.1:** Domain SJ → `sjActions.js` → validasi penuh + fingerprint + commit `refactor(sj-monitor): move SJ handlers to sjActions service (verbatim)`
- [ ] **Step 12.2:** Domain Invoice → `invoiceActions.js` → commit `refactor(sj-monitor): move invoice handlers to invoiceActions service (verbatim)`
- [ ] **Step 12.3:** Domain Uang Muka → `uangMukaActions.js` → commit serupa.
- [ ] **Step 12.4:** Domain Biaya + Transaksi → `biayaTransaksiActions.js` → commit serupa.
- [ ] **Step 12.5: Tes tulis manual di STAGING** — satu putaran penuh: buat SJ → mark terkirim → tandai gagal → restore → buat invoice dari SJ → buat uang muka → buat transaksi → buat biaya → soft delete masing-masing. Budget ±20 write (aman). Cocokkan angka di StatSummary/Keuangan sebelum vs sesudah putaran.
- [ ] **Step 12.6:** Verifikasi target akhir: `wc -l src/App.jsx` → expected < 600 (jika 600–800, laporkan apa yang tersisa dan mengapa — jangan paksa ekstraksi yang tidak aman).

## ✅ CHECKPOINT C4 (FINAL) — `npm test && npm run lint && npm run build` + fingerprint semua tab + `npm run smoketest` + laporan akhir ke user (peran: Reviewer memvalidasi seluruh kriteria sukses spec §5).

---

## Kriteria Sukses (dari spec §5)

- [ ] App.jsx < 600 baris; tanpa komponen inline; tanpa subscription langsung.
- [ ] Nol duplikasi CRUD master data; satu pola state.
- [ ] Bundle utama tanpa xlsx.
- [ ] Fingerprint E2E identik sebelum vs sesudah untuk semua tab.
- [ ] Semua commit di branch worktree; PR dibuka per checkpoint sesuai keputusan user; TANPA deploy production.
