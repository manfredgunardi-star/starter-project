# Firestore Write Quota Mitigation — Design

- **Tanggal:** 2026-05-15
- **Project:** `surat-jalan-monitor` (Firebase Spark / free tier)
- **Konteks:** Quota write Firestore (20.000/hari) terlampaui pada 13–14 Mei 2026 (~20k+ writes/hari). Tim tidak dapat login. Spike muncul **tanpa** aktivitas user (jawaban brainstorm no.3).
- **Constraint utama:** Tetap di Spark plan, tidak boleh upgrade ke Blaze.

## Latar Belakang

Hasil brainstorm singkat:
- Hanya 2 user aktif/hari × 2 tab = baseline write seharusnya **<100/hari**. Spike ke 20.000+ = faktor 200×, mustahil dijelaskan oleh user-driven path.
- Spike mulai 13 Mei = persis **setelah deploy UI** 12 Mei.
- App memiliki **PWA + service worker** (handoff PWA sj-monitor) — service worker dapat membuat tab/PWA lama tetap menulis di background tanpa user interaction.
- AI bug-hunter pipeline ([.github/workflows/bug-hunter.yml](../../../.github/workflows/bug-hunter.yml)) terjadwal 02:00 WIB tapi **hanya jalan jika ada issue ber-label `bug` + `ai-fixable`**. Test files menggunakan mock penuh ([apps/sj-monitor/src/config/__tests__/firebase-config.test.js](../../../apps/sj-monitor/src/config/__tests__/firebase-config.test.js)). Probabilitas rendah sebagai biang.
- Hot spot user-driven yang sudah teridentifikasi (untuk follow-up Opsi B):
  - SSO single-session writes di [apps/sj-monitor/src/hooks/useAuth.js:48-65](../../../apps/sj-monitor/src/hooks/useAuth.js:48) — fire setiap auth state change.
  - `historyLog` granular (1 event = 1 write) — diperintahkan CLAUDE.md tapi user mengizinkan kompresi.

## Pendekatan Terpilih: Opsi A — Diagnose Dulu

Dipilih dibanding Opsi B (hardening code) atau Opsi C (migrasi storage) karena:
- Fakta "tim belum login tapi quota habis" mustahil dijelaskan tanpa data observasi.
- Memperbaiki code path user-driven (B) tanpa tahu sumber non-user dapat **gagal total**.
- Migrasi arsitektural (C) terlalu mahal untuk app dengan 2 user/hari.

Opsi B & C ditahan sampai akar ditemukan dari Fase 2.

## Tujuan & Success Criteria

**Tujuan:**
1. **Hentikan pendarahan** dalam 24 jam supaya tim bisa kerja besok pagi.
2. **Identifikasi sumber 20k+ writes/hari** yang fire tanpa user.
3. **Eliminasi sumber** dengan fix targeted.

**Success criteria:**
- Hari operasional normal: **<500 writes/hari** Firestore (margin aman terhadap quota 20.000).
- Tidak ada write spike misterius >1.000/jam tanpa aktivitas user.
- Cloud Audit Logs jalan terus sebagai early warning system permanen.

**Out of scope:**
- Opsi B (hardening code) — eksekusi setelah Fase 2 jika diperlukan.
- Opsi C (migrasi storage) — ditahan.
- Perubahan `firestore.rules` (perlu approval terpisah per CLAUDE.md guardrails).

## Arsitektur 4 Fase

```
Fase 0 (hari ini, ~30 menit) — paralel dengan Fase 1
  └─ Aktifkan Cloud Audit Logs di GCP Console

Fase 1 (hari ini, ~1 jam) — prioritas tertinggi
  ├─ Matikan tersangka utama satu-per-satu (semua reversible)
  └─ Pasang custom alert di Firebase Console

Fase 2 (24–48 jam)
  └─ Observasi log: siapa nulis, ke mana, kapan, dari mana

Fase 3 (setelah data masuk, durasi bervariasi)
  └─ Targeted fix sumber spesifik
```

**Logika urutan:** Fase 1 dieksekusi paralel dengan Fase 0 supaya tim bisa kerja besok. Fase 0 dipasang lebih dulu agar saat Fase 1 jalan, kita sudah punya log baseline untuk membandingkan "before/after disable".

## Fase 0 — Aktifkan Cloud Audit Logs

**Aktor:** User (akses GCP Console untuk project `surat-jalan-monitor`).

**Langkah:**
1. GCP Console → project `surat-jalan-monitor` → **IAM & Admin → Audit Logs**.
2. Cari service: **Cloud Firestore API** (`firestore.googleapis.com`).
3. Centang **Data Read** + **Data Write** untuk "Default" log type.
4. Save. Audit log mulai capture (gratis di tier dasar; retention 30 hari default).
5. Buka **Logs Explorer** → query berikut:

   ```
   resource.type="audited_resource"
   protoPayload.serviceName="firestore.googleapis.com"
   protoPayload.methodName=~"Write|Commit|Update"
   ```

6. Filter time range: **last 24 hours**, sort by timestamp.

**Output yang dapat dianalisis:**
- `protoPayload.authenticationInfo.principalEmail` → siapa (user / service account / anonymous).
- `protoPayload.resourceName` → collection/dokumen yang ditulis.
- `protoPayload.requestMetadata.callerIp` → IP asal.
- Pola interval: regular (tiap N menit) → cron / SW; bursty → user / loop.

**Risiko:** Tidak ada (read-only observability).

## Fase 1 — Quick Mitigation

Berurutan dari paling tersangka & paling reversible. Jika langkah 1 sudah cukup menurunkan write rate (terlihat di Fase 2), langkah berikutnya tidak perlu di-rollback — semua tetap aman.

**Urutan eksekusi: 1 → 4 → 2 → 3** (alert dipasang sebelum SW di-disable supaya kita langsung tahu efeknya).

### 1. Pause Bug-Hunter cron (5 menit, low risk)

- File: [.github/workflows/bug-hunter.yml](../../../.github/workflows/bug-hunter.yml)
- Comment-out blok `schedule:` (baris 5-6).
- Manual trigger via `workflow_dispatch` tetap berfungsi.
- Commit + push.
- **Rollback:** uncomment blok.

### 4. Custom alert Firebase Console (10 menit)

- Firebase Console → project `surat-jalan-monitor` → **Usage and billing → Alerts**.
- Set threshold: **5.000 writes/hari** → email ke pemilik project.
- **Tujuan:** kalau setelah Fase 1 masih ada spike, tahu sebelum quota habis.

### 2. Disable Service Worker di production (10 menit, MEDIUM risk)

- Tambah kill switch di SW registration (umumnya di [apps/sj-monitor/src/main.jsx](../../../apps/sj-monitor/src/main.jsx) atau file PWA setup):
  ```js
  if (import.meta.env.VITE_SW_DISABLED !== 'true') {
    // existing SW registration
  }
  ```
- Tambah unregister hook supaya client lama membersihkan SW yang sudah ter-install:
  ```js
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()));
  }
  ```
- Set `VITE_SW_DISABLED=true` di Vercel environment variables (production scope).
- Redeploy.
- **Risiko:** offline mode hilang sementara — acceptable karena tim mostly online.
- **Rollback:** unset env var, redeploy. Hapus unregister hook.

### 3. Audit Vercel preview deployments (15 menit)

- Vercel dashboard → Deployments → filter "Preview" yang masih live.
- Hapus preview lama yang tidak terpakai.
- Verifikasi `vercel.json` & env var scope: pastikan preview tidak share `.env.production` Firebase config. Idealnya preview menulis ke project Firebase staging terpisah (saat ini `.firebaserc` punya `staging` yang sama dengan `default`).

## Fase 2 — Observasi (24–48 jam)

**Yang dilakukan:** sistem berjalan tanpa code change tambahan.

**Daily check-in (pagi 08:00 WIB):**
- Firebase Console → cek total writes 24 jam terakhir.
- Cloud Logs Explorer dengan query Fase 0 → export CSV → analisis bersama.

**Yang dianalisis:**

| Pola di log | Kemungkinan biang |
|---|---|
| `principalEmail = anonymous` | Unauthenticated writes (rules bocor) |
| `principalEmail = bot/CI service account` | CI/automation menulis ke prod |
| Interval reguler tiap N detik/menit | Cron / service worker background sync |
| Burst saat user aktif | Render loop di code |
| Dominan di 1 collection | Hot spot spesifik (mis. `historyLog`) |

**Decision gate setelah 24 jam:**
- Write rate **<500/hari** → Fase 1 berhasil → langsung Fase 3 untuk hardening permanen (Opsi B subset).
- Write rate **masih >5.000/hari** → analisis log → identifikasi sumber → balik ke Fase 1 dengan tersangka baru.

## Fase 3 — Targeted Fix

Fix spesifik tergantung temuan Fase 2. Template branching:

| Biang ditemukan | Fix |
|---|---|
| Service worker background sync | Hapus background sync registration di SW; bersihkan IndexedDB queue |
| Render loop di komponen UI baru | Bisect commit 12 Mei (UI deploy) → identifikasi komponen → tambah `useMemo` / fix dependency |
| `useAuth` SSO writes berlebihan | Eksekusi Opsi B langkah 1 (hapus single-session writes di [apps/sj-monitor/src/hooks/useAuth.js:48-65](../../../apps/sj-monitor/src/hooks/useAuth.js:48)) |
| `historyLog` hot spot | Eksekusi Opsi B langkah 2 (batch ke 1 doc/hari/entity dengan `arrayUnion`) |
| Vercel preview menulis ke prod | Pisahkan env: preview pakai Firebase project staging terpisah |
| Anonymous writes (rules bocor) | Audit `firestore.rules` — **stop dan minta approval user** sesuai CLAUDE.md guardrails |

**Verifikasi:** setelah fix, observasi 24 jam tambahan untuk memastikan write rate stabil <500/hari. Custom alert di Fase 1 langkah 4 tetap aktif sebagai safety net permanen.

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Disable SW memutus offline mode | Tim mostly online; kill switch reversible via env var |
| Bug-hunter cron pause melewatkan auto-fix | Manual trigger tetap bisa; pause hanya temporary sampai sumber ketemu |
| Audit log tier dasar punya retention 30 hari | Cukup untuk investigasi; export CSV jika butuh archive |
| Anonymous write ditemukan = `firestore.rules` bocor | **Tidak boleh fix tanpa approval user** (CLAUDE.md security guardrail) |

## Catatan untuk Implementasi

- Semua langkah Fase 1 reversible — tidak menyentuh business logic, financial logic, atau audit trail.
- Tidak ada perubahan `firestore.rules`, Firebase Auth, atau financial calculations dalam scope ini.
- Tidak ada modifikasi schema Firestore.
- Spec ini hanya design — implementasi step-by-step dijabarkan di plan terpisah (writing-plans).
