# Firestore Write Quota Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hentikan pendarahan write quota Firestore project `surat-jalan-monitor` dalam 24 jam, identifikasi sumbernya via Cloud Audit Logs, lalu eliminasi dengan targeted fix.

**Architecture:** 4 fase berurutan — observabilitas (Fase 0) + quick mitigation (Fase 1) jalan paralel hari ini, lalu observasi 24-48 jam (Fase 2), lalu fix spesifik berdasar temuan (Fase 3). Mayoritas tindakan adalah konfigurasi console (GCP, Vercel, Firebase) dan dua perubahan kode kecil (workflow YAML, vite config).

**Tech Stack:** Firebase Firestore (Spark), GCP Cloud Audit Logs, GitHub Actions, Vercel, Vite + vite-plugin-pwa.

**Spec:** [docs/superpowers/specs/2026-05-15-firestore-write-quota-mitigation-design.md](../specs/2026-05-15-firestore-write-quota-mitigation-design.md)

**Legend:**
- `[USER]` — tindakan manual yang Anda lakukan di console (saya hanya guide).
- `[AGENT]` — bisa dieksekusi subagent / inline agent.
- **Model**: rekomendasi model Claude untuk task tersebut.
- **Effort**: estimasi waktu (XS <5m, S 5-15m, M 15-60m, L 1-3h).

---

## Task 1: Aktifkan Cloud Audit Logs (Fase 0)

**Aktor:** `[USER]`
**Model untuk guide:** Haiku
**Effort:** S (10 menit)

**Files:** none (manual GCP Console)

- [ ] **Step 1.1: Buka GCP Console untuk project**

Navigasi: https://console.cloud.google.com/iam-admin/audit?project=surat-jalan-monitor

- [ ] **Step 1.2: Cari Cloud Firestore API**

Di kolom filter "Filter services", ketik: `firestore`. Klik baris **Cloud Firestore API** (`firestore.googleapis.com`).

- [ ] **Step 1.3: Aktifkan Data Read + Data Write logs**

Panel kanan akan terbuka. Centang:
- ☑ **Admin Read** (default sudah on)
- ☑ **Data Read**
- ☑ **Data Write**

Klik **SAVE**.

- [ ] **Step 1.4: Verifikasi log mulai capture**

Buka Logs Explorer: https://console.cloud.google.com/logs/query?project=surat-jalan-monitor

Paste query:
```
resource.type="audited_resource"
protoPayload.serviceName="firestore.googleapis.com"
```

Set range "Last 1 hour" → klik **Run query**. Setelah ~5 menit, log entries pertama akan muncul. Jika kosong setelah 15 menit, kembali ke Step 1.3 — pastikan checkbox tersimpan.

- [ ] **Step 1.5: Konfirmasi ke agent**

Reply: "Audit logs sudah aktif" — agent lanjut ke Task 2.

---

## Task 2: Pause Bug-Hunter Cron

**Aktor:** `[AGENT]`
**Model:** Haiku
**Effort:** XS (3 menit)

**Files:**
- Modify: [.github/workflows/bug-hunter.yml:5-6](.github/workflows/bug-hunter.yml:5)

- [ ] **Step 2.1: Comment out blok schedule**

Edit baris 4-6 dari:
```yaml
on:
  # Nightly jam 02:00 WIB = 19:00 UTC hari sebelumnya
  schedule:
    - cron: '0 19 * * *'
```
menjadi:
```yaml
on:
  # PAUSED 2026-05-15 — investigasi Firestore write quota.
  # Re-enable setelah root cause ditemukan & diperbaiki.
  # schedule:
  #   - cron: '0 19 * * *'
```

- [ ] **Step 2.2: Verifikasi YAML masih valid**

Run dari root project:
```bash
cd C:/Project && python -c "import yaml; yaml.safe_load(open('.github/workflows/bug-hunter.yml'))" && echo "YAML OK"
```
Expected: `YAML OK`. Jika error, perbaiki indentasi.

- [ ] **Step 2.3: Commit**

```bash
cd C:/Project && git add .github/workflows/bug-hunter.yml && git commit -m "chore(ci): pause bug-hunter cron during Firestore quota investigation"
```

- [ ] **Step 2.4: Push**

```bash
cd C:/Project && git push origin claude/eloquent-antonelli-16bda0
```

(Branch saat ini adalah worktree `claude/eloquent-antonelli-16bda0`. Akan di-PR setelah semua Fase 1 selesai.)

---

## Task 3: Pasang Custom Alert di Firebase Console

**Aktor:** `[USER]`
**Model untuk guide:** Haiku
**Effort:** S (10 menit)

**Files:** none (manual Firebase Console)

- [ ] **Step 3.1: Buka Firebase Console — Usage and billing**

Navigasi: https://console.firebase.google.com/project/surat-jalan-monitor/usage

- [ ] **Step 3.2: Tab "Details & settings" → bagian Alerts**

Scroll ke section **Alerts** (di GCP juga bisa diakses via https://console.cloud.google.com/monitoring/alerting?project=surat-jalan-monitor).

- [ ] **Step 3.3: Buat Alert Policy baru**

Klik **CREATE POLICY**. Isi:
- **Metric:** `Firestore` → `Document writes` (atau di GCP Monitoring: `firestore.googleapis.com/document/write_count`).
- **Condition type:** Threshold.
- **Aggregator:** Sum, period **1 day**.
- **Threshold:** `> 5000`.
- **Notification channel:** Email ke `manfred.gunardi@gmail.com`.
- **Policy name:** `Firestore writes >5k/day — surat-jalan-monitor`.

Klik **SAVE**.

- [ ] **Step 3.4: (Optional) Pasang second alert untuk early warning**

Buat policy kedua dengan threshold `> 1000` dalam window **1 hour** — untuk deteksi spike mendadak. Notification channel sama.

- [ ] **Step 3.5: Konfirmasi ke agent**

Reply: "Alert sudah aktif" — agent lanjut ke Task 4.

---

## Task 4: Disable Service Worker via selfDestroying mode

**Aktor:** `[AGENT]` untuk code change + `[USER]` untuk redeploy verification.
**Model:** Sonnet (perlu reasoning untuk vite-plugin-pwa option)
**Effort:** M (20 menit)

**Files:**
- Modify: [apps/sj-monitor/vite.config.js:8](apps/sj-monitor/vite.config.js:8)

**Konteks:** `vite-plugin-pwa` punya opsi `selfDestroying: true` yang men-generate SW yang **otomatis unregister dirinya sendiri & clear cache pada visit berikutnya**. Ini cara resmi & paling bersih untuk menghapus SW dari client yang sudah meng-install. Tidak perlu manual unregister script.

- [ ] **Step 4.1: Tambah opsi selfDestroying di VitePWA config**

Edit [apps/sj-monitor/vite.config.js:8-10](apps/sj-monitor/vite.config.js:8) dari:
```js
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
```
menjadi:
```js
    VitePWA({
      // 2026-05-15: SW di-disable sementara untuk investigasi Firestore write quota.
      // selfDestroying=true men-generate SW yang unregister dirinya & clear cache.
      // Set false kembali setelah root cause ditemukan & diperbaiki.
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: [
```

- [ ] **Step 4.2: Build untuk verifikasi tidak error**

```bash
cd C:/Project/apps/sj-monitor && npm run build
```
Expected: build sukses, tidak ada error. Output akan menyebutkan `vite-plugin-pwa` generating self-destroying SW.

- [ ] **Step 4.3: Commit**

```bash
cd C:/Project && git add apps/sj-monitor/vite.config.js && git commit -m "fix(sj-monitor): self-destroy service worker to investigate Firestore write spike"
```

- [ ] **Step 4.4: Push**

```bash
cd C:/Project && git push origin claude/eloquent-antonelli-16bda0
```

- [ ] **Step 4.5: `[USER]` — Merge ke main & deploy**

Karena ini production fix urgent, buat PR cepat:
```bash
cd C:/Project && gh pr create --title "fix(sj-monitor): disable PWA SW to investigate Firestore write spike" --body "Lihat docs/superpowers/specs/2026-05-15-firestore-write-quota-mitigation-design.md"
```
Lalu merge & biarkan Vercel auto-deploy. Atau jika urgent dan boleh push langsung ke main, lakukan setelah konfirmasi build pass.

- [ ] **Step 4.6: `[USER]` — Verifikasi SW unregistered di production**

Setelah deploy live:
1. Buka URL production di browser yang punya SW lama ter-install (DevTools → Application → Service Workers).
2. Reload halaman.
3. Cek: SW status berubah jadi "redundant" atau hilang. Cache di "Cache Storage" terhapus.
4. Jika punya PWA installed di HP, buka app → tunggu update → close → buka kembali. SW akan self-destroy.

- [ ] **Step 4.7: Konfirmasi ke agent**

Reply: "SW disabled & verified di production" — agent siap monitor 24 jam (Task 6).

---

## Task 5: Audit Vercel Preview Deployments

**Aktor:** `[USER]`
**Model untuk guide:** Sonnet (perlu reasoning kalau ada finding aneh)
**Effort:** S (15 menit)

**Files:** none (manual Vercel dashboard)

- [ ] **Step 5.1: Buka Vercel deployments untuk project sj-monitor**

Navigasi: https://vercel.com/dashboard → pilih project sj-monitor → tab **Deployments**.

- [ ] **Step 5.2: Filter "Preview"**

Filter status: **Preview**. Lihat deployment yang masih **Ready** (live).

- [ ] **Step 5.3: Hapus preview lama yang tidak terpakai**

Untuk tiap preview > 7 hari yang tidak terkait PR aktif: klik `...` → **Delete Deployment**.

- [ ] **Step 5.4: Cek environment variable scope**

Project Settings → **Environment Variables** → cek tiap Firebase config var (`VITE_FIREBASE_*`):
- Kalau scope-nya **All Environments** (Production + Preview + Development) → preview ikut tulis ke project Firebase production yang sama.
- Idealnya: preview pakai Firebase project staging terpisah dengan env var khusus scope `Preview`.

- [ ] **Step 5.5: (Optional, follow-up jika scope bermasalah) Pisahkan env**

Kalau di Step 5.4 ditemukan preview share env production:
- **Short term:** ubah scope `VITE_FIREBASE_*` jadi **Production only**.
- **Long term:** buat Firebase project terpisah `sj-monitor-staging`, set env preview-only.

(Jika dipilih, ini ditambahkan ke Task 8 sebagai branch fix.)

- [ ] **Step 5.6: Konfirmasi ke agent**

Reply dengan temuan: jumlah preview lama yang dihapus, dan apakah env scope bermasalah.

---

## Task 6: Setup Daily Observation (Fase 2)

**Aktor:** `[USER]` daily check + `[AGENT]` analisis
**Model:** Sonnet (untuk analisis log)
**Effort:** M (15-30 menit/hari × 2 hari)

**Files:** none (observasi)

- [ ] **Step 6.1: `[USER]` — Hari ke-1 pagi (08:00 WIB), cek Firebase Console**

Navigasi: https://console.firebase.google.com/project/surat-jalan-monitor/firestore/usage

Catat angka:
- Reads 24h: `___`
- Writes 24h: `___`
- Deletes 24h: `___`

- [ ] **Step 6.2: `[USER]` — Export Cloud Audit Logs 24 jam terakhir**

Buka Logs Explorer: https://console.cloud.google.com/logs/query?project=surat-jalan-monitor

Query:
```
resource.type="audited_resource"
protoPayload.serviceName="firestore.googleapis.com"
protoPayload.methodName=~"Write|Commit"
timestamp>="2026-05-16T00:00:00Z"
```
(Adjust timestamp sesuai 24h terakhir.)

Klik **Download** → format **CSV** → simpan file `firestore-writes-day1.csv` di folder kerja.

- [ ] **Step 6.3: `[AGENT]` — Analisa CSV**

Agent membaca CSV dan men-summary:
- Top 5 `principalEmail` (siapa terbanyak nulis).
- Top 5 `resourceName` collection (apa terbanyak ditulis).
- Distribusi waktu (histogram per jam).
- Top 5 `callerIp`.
- Pola interval (regular vs bursty).

- [ ] **Step 6.4: Decision gate hari 1**

Berdasar jumlah writes 24h:
| Writes/24h | Aksi |
|---|---|
| `< 500` | ✅ Fase 1 berhasil — lanjut ke Task 9 (Fase 3 hardening + verifikasi) |
| `500 – 5.000` | ⚠️ Improvement signifikan tapi masih ada baseline tinggi — lanjut Task 7 (root cause analysis) |
| `> 5.000` | ❌ Fase 1 belum cukup — ulangi observasi hari 2 (Step 6.5) sambil identifikasi tersangka baru dari log |

- [ ] **Step 6.5: `[USER]` — Hari ke-2 (jika perlu)**

Ulangi Step 6.1-6.3 untuk 24 jam berikutnya. Bandingkan trend hari 1 vs hari 2.

---

## Task 7: Root Cause Identification

**Aktor:** `[AGENT]`
**Model:** Sonnet untuk analisa standar; eskalasi ke Opus jika ambigu
**Effort:** M (30-60 menit)

**Files:** baca-only — depends on findings

**Prerequisite:** Task 6 menghasilkan CSV log + summary.

- [ ] **Step 7.1: Klasifikasi sumber berdasar `principalEmail`**

Map dari summary Task 6.3:

| `principalEmail` pattern | Klasifikasi | Branch fix di Task 8 |
|---|---|---|
| Email user (mis. `manfred.gunardi@gmail.com`) | User-driven (login/loop) | Branch A |
| `firebase-adminsdk-*@surat-jalan-monitor.iam.gserviceaccount.com` | Service account / Cloud Function | Branch B |
| `service-*@gcp-sa-*.iam.gserviceaccount.com` | GCP managed service | Branch C |
| Empty / `anonymous` | Unauthenticated (rules bocor) | Branch D — **STOP, perlu approval user** |

- [ ] **Step 7.2: Klasifikasi sumber berdasar pola interval**

| Pola di histogram | Klasifikasi |
|---|---|
| Burst saat user login → cepat selesai | Login flow / SSO writes — Branch A1 |
| Reguler tiap 1-15 menit, 24/7 | Background job / SW persistensi — Branch B1 |
| Burst spesifik jam (mis. 02:00 WIB) | Cron — Branch B2 |
| Sustained tinggi 1-5 menit | Render loop di tab aktif — Branch A2 |

- [ ] **Step 7.3: Klasifikasi sumber berdasar `resourceName` collection**

Lihat collection terbanyak:
| Collection | Branch fix |
|---|---|
| `users/{uid}` | Branch A1 (SSO writes di useAuth) |
| `historyLog/*` | Branch A3 (audit log batching) |
| `settings/*` | Branch A4 (settings polling) |
| `suratJalan/*` atau business collections | Branch A5 (bulk import / loop di App.jsx) |
| Collection asing/tidak dikenal | Branch D (investigasi mendalam) |

- [ ] **Step 7.4: Tentukan branch Task 8**

Output Task 7: dokumen singkat (komentar di chat) berisi:
- Sumber utama (principalEmail + collection + pola).
- Branch Task 8 yang akan dieksekusi (A1/A2/A3/A4/A5/B1/B2/C/D).
- Confidence level (high/medium/low).

---

## Task 8: Targeted Fix (Branch berdasar Task 7)

**Aktor:** `[AGENT]` (kecuali Branch D)
**Model:** Sonnet untuk Branch A; Opus untuk Branch D atau ambigu
**Effort:** Variabel (S - L tergantung branch)

Hanya kerjakan **branch yang dipilih di Task 7.4**. Setiap branch berdiri sendiri.

### Branch A1: Hapus SSO single-session writes
**Effort:** M (30 menit)
**Files:** [apps/sj-monitor/src/hooks/useAuth.js:48-65](apps/sj-monitor/src/hooks/useAuth.js:48)

- [ ] **Step A1.1: Hapus blok activeSession setDoc**

Hapus baris 59-65 di [apps/sj-monitor/src/hooks/useAuth.js](apps/sj-monitor/src/hooks/useAuth.js):
```js
        const sessionId = generateSessionId();
        activeSessionIdRef.current = sessionId;
        await setDoc(userRef, {
          activeSessionId: sessionId,
          activeSessionAt: new Date().toISOString(),
          activeSessionUA: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }, { merge: true });
```

- [ ] **Step A1.2: Hapus dependency yang tidak terpakai**

Cek apakah `activeSessionIdRef` masih digunakan di subscriber onSnapshot. Kalau ya, sederhanakan: hilangkan check `activeSessionId !== activeSessionIdRef.current` (single-session enforcement) di baris 79-87.

- [ ] **Step A1.3: Hapus import generateSessionId jika tidak terpakai**

```bash
cd C:/Project && grep -rn "generateSessionId" apps/sj-monitor/src/
```
Kalau hanya ada di file ini, hapus import baris 6.

- [ ] **Step A1.4: Run tests**

```bash
cd C:/Project/apps/sj-monitor && npm test
```
Expected: PASS (test useAuth tidak ada saat ini, jadi minimal regression test config tetap pass).

- [ ] **Step A1.5: Build**

```bash
cd C:/Project/apps/sj-monitor && npm run build
```
Expected: build sukses.

- [ ] **Step A1.6: Commit**

```bash
cd C:/Project && git add apps/sj-monitor/src/hooks/useAuth.js && git commit -m "perf(sj-monitor): remove single-session SSO writes to reduce Firestore write quota"
```

### Branch A2: Render loop di komponen UI baru
**Effort:** L (1-3 jam)
**Files:** depends on bisect

- [ ] **Step A2.1: Identifikasi commit UI deploy 12 Mei**

```bash
cd C:/Project && git log --oneline --since="2026-05-11" --until="2026-05-13" -- apps/sj-monitor/src
```

- [ ] **Step A2.2: Bisect**

Untuk tiap commit dari output Step A2.1:
- Read komponen yang berubah.
- Cari `useEffect` dengan dependency object/array yang re-create tiap render (tanpa `useMemo`).
- Cari `setState` dipanggil dalam render path tanpa guard.

- [ ] **Step A2.3: Fix dependency**

Pattern umum: `useEffect(() => { ... }, [obj])` di mana `obj` di-create inline tiap render → wrap dengan `useMemo`. ATAU: ganti dengan dependency primitif (`obj.id`, `obj.updatedAt`).

- [ ] **Step A2.4: Verifikasi dengan React DevTools Profiler**

Jalankan dev mode (`npm run dev`), buka komponen, lihat re-render count di Profiler. Should stable.

- [ ] **Step A2.5: Commit**

```bash
cd C:/Project && git add apps/sj-monitor/src/ && git commit -m "fix(sj-monitor): break render loop in <ComponentName> causing Firestore write spike"
```

### Branch A3: Batch historyLog
**Effort:** L (1-2 jam)
**Files:** [apps/sj-monitor/src/firestoreService.js](apps/sj-monitor/src/firestoreService.js)

- [ ] **Step A3.1: Cari fungsi addHistoryLog**

```bash
cd C:/Project && grep -n "addHistoryLog\|historyLog" apps/sj-monitor/src/firestoreService.js
```

- [ ] **Step A3.2: Refactor ke batched mode**

Ubah dari "1 doc per event" menjadi "1 doc per (entity, hari)" dengan `arrayUnion`:
```js
import { arrayUnion } from 'firebase/firestore';

export async function addHistoryLog({ entityType, entityId, action, by, payload }) {
  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const docId = `${entityType}__${entityId}__${dateKey}`;
  await ensureAuthed();
  await setDoc(doc(db, 'historyLog', docId), {
    entityType, entityId, dateKey,
    entries: arrayUnion({ action, by, at: new Date().toISOString(), payload: sanitizeForFirestore(payload) }),
  }, { merge: true });
}
```

- [ ] **Step A3.3: Pastikan reader history menyesuaikan**

Cari komponen yang baca historyLog (`grep -rn historyLog apps/sj-monitor/src/components`). Update untuk meng-iterate `doc.entries[]` bukan satu-doc-per-event.

- [ ] **Step A3.4: Run tests + build**

```bash
cd C:/Project/apps/sj-monitor && npm test && npm run lint && npm run build
```

- [ ] **Step A3.5: Commit**

```bash
cd C:/Project && git add apps/sj-monitor/src/ && git commit -m "perf(sj-monitor): batch historyLog into 1 doc per entity per day"
```

### Branch A4: Settings polling
**Effort:** M (30-60 menit)
**Files:** [apps/sj-monitor/src/hooks/useSettings.js](apps/sj-monitor/src/hooks/useSettings.js)

- [ ] **Step A4.1: Ganti onSnapshot dengan polling localStorage**

Cari `onSnapshot(doc(db, 'settings', 'forceLogout')...` → ganti dengan `setInterval` 1 jam yang panggil `getDoc` + cache hasilnya di localStorage.

- [ ] **Step A4.2: Test, build, commit**

Sama pattern Branch A1.

### Branch A5: Bulk import / loop di App.jsx
**Effort:** L (1-3 jam)
**Files:** [apps/sj-monitor/src/App.jsx](apps/sj-monitor/src/App.jsx) (16 lokasi setDoc/updateDoc/addDoc)

Approach:
- [ ] Inventarisasi tiap call site dengan `grep -n "setDoc\|updateDoc\|addDoc\|writeBatch" apps/sj-monitor/src/App.jsx`.
- [ ] Untuk tiap call: trace caller. Cek apakah dipanggil di `useEffect` tanpa guard, atau di event handler yang loop.
- [ ] Khusus bulk import: pastikan pakai `writeBatch` (max 500 ops) instead of N kali `setDoc`.
- [ ] Test, build, commit.

### Branch B1/B2: Background job / Cron
**Effort:** M (15-30 menit)
**Files:** Cloud Functions config (jika ada) atau GitHub Actions / external cron

- [ ] **Step B1.1: List Cloud Functions**

```bash
cd C:/Project && firebase functions:list --project surat-jalan-monitor 2>&1 | head -40
```
(Atau via console: https://console.firebase.google.com/project/surat-jalan-monitor/functions)

- [ ] **Step B1.2: Disable function yang dicurigai**

Untuk tiap function dengan trigger schedule/pubsub yang menulis Firestore:
```bash
firebase functions:delete <functionName> --project surat-jalan-monitor
```
(Atau pause via console.)

- [ ] **Step B1.3: Konfirmasi turun di Fase 2 hari berikutnya**

### Branch C: GCP Managed Service
**Effort:** M (perlu konsultasi)
**Files:** none — kemungkinan integrasi GCP yang aktif (mis. BigQuery export, Backup Schedule)

- [ ] **Step C.1: Cek BigQuery export config & backup schedule**

GCP Console → Firestore → **Import/Export** & **Backups**. Kalau ada export reguler → biasanya tidak hitung ke write quota tapi worth checking.

- [ ] **Step C.2: STOP dan konsultasi user**

Branch ini ambigu — beri summary ke user, minta keputusan.

### Branch D: Anonymous / unauthenticated writes
**Effort:** M (30-60 menit) **— BUTUH APPROVAL USER**
**Files:** [apps/sj-monitor/firestore.rules](apps/sj-monitor/firestore.rules)

⚠️ **STOP**: Sesuai CLAUDE.md security guardrail, **JANGAN ubah `firestore.rules` tanpa approval user**.

- [ ] **Step D.1: Audit rules — read-only**

```bash
cd C:/Project && cat apps/sj-monitor/firestore.rules
```
Cari rule dengan `allow write: if true` atau `allow write: if request.auth == null`.

- [ ] **Step D.2: Buat ringkasan finding**

Beri ke user:
- Rule mana yang lebar.
- Bukti dari log: collection mana yang dapat anonymous write.
- Proposed fix.

- [ ] **Step D.3: TUNGGU APPROVAL USER**

Jangan commit perubahan apapun ke rules tanpa explicit "ya, fix" dari user.

---

## Task 9: Final Verification

**Aktor:** `[USER]` daily check + `[AGENT]` analisis
**Model:** Sonnet
**Effort:** M (15 menit/hari × 2 hari)

**Prerequisite:** Branch Task 8 yang dipilih sudah deployed.

- [ ] **Step 9.1: `[USER]` — Hari ke-1 setelah fix, cek Firebase Console**

Sama seperti Step 6.1. Catat writes 24h.

- [ ] **Step 9.2: Pass criteria**

| Writes/24h | Status |
|---|---|
| `< 500` | ✅ SUKSES — Task 10 |
| `500 – 2.000` | ⚠️ PARTIAL — kemungkinan butuh branch tambahan dari Task 8 |
| `> 2.000` | ❌ FAIL — kembali ke Task 7, klasifikasi ulang |

- [ ] **Step 9.3: `[USER]` — Hari ke-2, ulang Step 9.1**

Konfirmasi trend stabil (bukan one-day fluke).

---

## Task 10: Cleanup & Re-enable Disabled Features

**Aktor:** `[AGENT]`
**Model:** Sonnet
**Effort:** M (30 menit)

**Prerequisite:** Task 9 PASS dua hari berturut-turut.

- [ ] **Step 10.1: Re-enable bug-hunter cron**

Edit [.github/workflows/bug-hunter.yml](.github/workflows/bug-hunter.yml) — uncomment blok `schedule:` (revert Task 2).

```bash
cd C:/Project && git add .github/workflows/bug-hunter.yml && git commit -m "chore(ci): re-enable bug-hunter cron after quota investigation closed"
```

- [ ] **Step 10.2: Decide: re-enable PWA atau tetap disable?**

Pilihan:
- **Keep disabled** (selfDestroying tetap true) — kalau SW terbukti biang, lebih aman tanpa PWA sampai ada fix permanen.
- **Re-enable dengan fix** — kalau biang bukan SW, hapus `selfDestroying: true` (revert Task 4) lalu deploy.

Konfirmasi pilihan ke user sebelum commit.

- [ ] **Step 10.3: Tinggalkan Cloud Audit Logs ON permanen**

Audit logs adalah safety net. Jangan dimatikan. Custom alert (Task 3) juga tetap aktif.

- [ ] **Step 10.4: Update memory**

Tambah memory entry baru ke `MEMORY.md`:
```
- [Handoff: Firestore Write Quota Mitigation](handoff_firestore_quota_mitigation.md) — Sesi 2026-05-15: SELESAI — root cause: <hasil Task 7>, fix: <branch Task 8>, baseline turun dari 20k+ ke <X>/hari
```

- [ ] **Step 10.5: Tutup PR, merge ke main**

Buat PR final yang merangkum semua perubahan, atau PR per branch jika sudah ter-commit terpisah.

---

## Self-Review Checklist (Sebelum Eksekusi)

- ✅ Spec coverage: Semua 4 fase di spec ter-cover. Fase 0 = Task 1. Fase 1 = Task 2-5. Fase 2 = Task 6. Fase 3 = Task 7-8. Verification = Task 9-10.
- ✅ No placeholders: setiap step ada aksi konkret + kode/command.
- ✅ Type consistency: nama field/method konsisten (`activeSessionId`, `historyLog`, `selfDestroying`).
- ✅ Risk: tiap step ada rollback path (commit terpisah, env var reversible, code change minimal).
- ⚠️ Task 8 punya banyak branch — eksekusi hanya **branch yang dipilih Task 7.4**, bukan semuanya.

---

## Catatan Model & Effort Total

| Task | Aktor | Model | Effort | Cumulative |
|---|---|---|---|---|
| 1 | USER | Haiku (guide) | S | S |
| 2 | AGENT | Haiku | XS | S |
| 3 | USER | Haiku (guide) | S | M |
| 4 | AGENT+USER | Sonnet | M | M-L |
| 5 | USER | Sonnet (analisis) | S | L |
| 6 | USER+AGENT | Sonnet | M × 2 hari | L (+ wait 24-48h) |
| 7 | AGENT | Sonnet (Opus jika ambigu) | M | L |
| 8 | AGENT | Sonnet/Opus | M-L (per branch) | XL |
| 9 | USER+AGENT | Sonnet | M × 2 hari | XL (+ wait 24-48h) |
| 10 | AGENT | Sonnet | M | XL |

**Total wall-clock:** ~4-5 hari (mayoritas adalah waiting period observasi 24-48 jam × 2).
**Total active work:** ~4-8 jam tergantung branch Task 8.
