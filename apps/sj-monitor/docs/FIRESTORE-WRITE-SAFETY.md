# Firestore Write Safety — sj-monitor

> **Tujuan dokumen ini:** Mencegah app terblokir 24 jam akibat melebihi kuota 20.000 Firestore write/hari pada Firebase Spark plan.
>
> **Berlaku untuk:** Semua developer, agent AI (Claude, Codex, dll.), dan siapapun yang berkontribusi ke sj-monitor.

---

## Kenapa Ini Penting

Firebase Spark (free) membatasi **20.000 Firestore writes per hari**. Jika terlampaui:
- Seluruh app menjadi **read-only** selama 24 jam
- User tidak bisa membuat SJ, tandai terkirim, atau input keuangan
- Tidak ada cara mempercepat reset — harus tunggu 24 jam penuh

**Skenario nyata yang hampir terjadi:**
Kode `autoReconcileUangJalan` di `App.jsx` (saat ini `ENABLE_AUTO_UANG_JALAN_RECONCILE = false`) bisa menulis **1 dokumen per SJ** setiap kali listener Firestore update. Dengan 500 SJ dan 5 admin yang login bersamaan → **2.500 writes dalam hitungan detik**.

---

## Aturan Wajib

### ❌ DILARANG

| Larangan | Alasan |
|---|---|
| Smoke test di `https://surat-jalan-monitor.web.app` | Setiap klik CRUD = write ke production Firestore |
| Set `ENABLE_AUTO_UANG_JALAN_RECONCILE = true` tanpa safeguard | Bisa trigger ribuan writes seketika |
| Loop Firestore write di `useEffect` tanpa guard | Re-render → re-trigger → write loop tak terbatas |
| Bulk write tanpa batching atau pagination | N documents × M users = kuota habis cepat |
| Menjalankan Vitest tests yang menyentuh Firestore nyata | CI/CD bisa habiskan kuota harian |

### ✅ WAJIB

| Kewajiban | Cara |
|---|---|
| Testing di emulator | `npm run emulator` di terminal terpisah, lalu `npm run dev` |
| Guard `useEffect` write | Gunakan `useRef` flag atau cek `canWrite` sebelum write |
| Konfirmasi aksi destruktif | Tambahkan `requireConfirm: true` di swipe/touch actions |
| Build check sebelum deploy | `npm run build` — harus 0 error |
| Test check sebelum deploy | `npm test` — semua harus pass |

---

## Workflow Development Yang Aman

```
┌─────────────────────────────────────────────────────┐
│  DEVELOPMENT FLOW (Zero Production Writes)           │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Terminal 1:  npm run emulator                       │
│               → Firestore emulator berjalan di       │
│                 localhost:8080                        │
│                                                      │
│  Terminal 2:  npm run dev                            │
│               → App di localhost:5173                │
│               → Dengan VITE_USE_EMULATOR=true        │
│                 di .env.local, semua operasi         │
│                 Firestore ke emulator (lokal)        │
│                                                      │
│  Test aksi CRUD sepuasnya — 0 write ke production    │
│                                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SMOKE TEST PROTOCOL (Sebelum Setiap Deploy)         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. npm run emulator (start emulator)                │
│  2. npm run dev (buka localhost:5173)                │
│  3. Login, buat SJ, tandai terkirim, cek semua menu  │
│  4. npm run build  → harus 0 error                   │
│  5. npm test       → semua tests pass                │
│  6. firebase deploy --only hosting                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Peta Write Operations

### Per-aksi write count

| User Action | Firestore Calls | Write Count |
|---|---|---|
| **Buat Surat Jalan baru** | `setDoc(suratJalan)` | 1 |
| **Mark Terkirim** | `updateDoc` + `addHistoryLog` | 2 |
| **Tandai Gagal** | `updateDoc` + `addHistoryLog` | 2 |
| **Restore dari Gagal** | `updateDoc` + `addHistoryLog` | 2 |
| **Edit Terkirim** | `updateDoc` + `addHistoryLog` | 2 |
| **Buat Transaksi Keuangan** | `upsertItemToFirestore` | 1–2 |
| **Soft Delete** | `softDeleteItemInFirestore` | 1 |
| **Tambah Master Data** | `upsertItemToFirestore` | 1 |
| **Buat Invoice** | `setDoc(invoice)` | 1 |
| **Buat Uang Muka** | `setDoc(uangMuka)` | 1 |

### Estimasi Penggunaan Normal

| Skenario | Write/Hari |
|---|---|
| 1 admin input 20 SJ | ~20 |
| 15 SJ ditandai terkirim | ~30 |
| 5 transaksi keuangan | ~10 |
| Misc (edit, restore) | ~20 |
| **Total normal** | **~80–150** |
| **Alert threshold** | **15.000** |
| **Hard limit (Spark)** | **20.000** |

**Normal usage = <1% dari limit.** Hanya bug atau proses batch yang bisa mendekati limit.

---

## Kode Bahaya Yang Harus Diwaspadai

### 1. Auto-Reconcile (SAAT INI DISABLED)

```js
// apps/sj-monitor/src/App.jsx — baris 72
const ENABLE_AUTO_UANG_JALAN_RECONCILE = false;
// ⚠️ JANGAN set ke true tanpa prosedur di bawah
```

**Jika perlu mengaktifkan kembali, ikuti prosedur ini:**
1. Hitung dulu: `SELECT count(*) FROM suratJalan WHERE tidak punya transaksi`
2. Preview ke user: "Akan menulis N transaksi. Lanjut?"
3. Minta konfirmasi superadmin
4. Jalankan di luar jam operasional (sebelum jam 8 pagi atau setelah jam 9 malam)
5. Monitor Firebase Console selama proses berlangsung

### 2. useEffect Write Loop

```js
// ❌ POLA BERBAHAYA — jangan tiru
useEffect(() => {
  suratJalanList.forEach(sj => {
    updateDoc(sj.id, { processed: true }); // N writes setiap render!
  });
}, [suratJalanList]); // dependency berubah → loop

// ✅ POLA AMAN
const didRunRef = useRef(false);
useEffect(() => {
  if (didRunRef.current) return; // guard
  if (!canWrite) return;
  didRunRef.current = true;
  // ... operasi write sekali saja
}, [canWrite]);
```

### 3. Swipe/Touch Actions Tanpa Konfirmasi

```js
// ❌ POLA LAMA — mudah ter-trigger accidental
swipeActions.push({
  label: 'Tandai Gagal',
  onClick: () => onMarkGagal(suratJalan.id), // langsung write!
});

// ✅ POLA BARU (setelah fix)
swipeActions.push({
  label: 'Tandai Gagal',
  requireConfirm: true,
  confirmMessage: `Tandai "${suratJalan.nomorSJ}" sebagai gagal?`,
  onClick: () => onMarkGagal(suratJalan.id),
});
```

---

## Firebase Usage Monitoring

### Cara Cek Usage Harian

1. Buka [Firebase Console](https://console.firebase.google.com/project/surat-jalan-monitor/firestore/usage)
2. Pilih tab **"Usage"**
3. Lihat grafik **"Document writes"**
4. Alert budget: 15.000 writes/hari (email notifikasi)

### Warning Signs

| Indikator | Kemungkinan Penyebab |
|---|---|
| Writes > 1.000/hari padahal tidak ada operasi besar | Ada loop write di `useEffect` |
| Writes spike tiba-tiba | Auto-reconcile aktif atau bulk import |
| Writes naik bersamaan banyak user login | Flag reconcile masih `true` di production |

---

## Referensi

- [CLAUDE.md sj-monitor](../CLAUDE.md) — Deployment & Testing rules
- [firebase-config.js](../src/firebase-config.js) — Emulator connection setup
- [firebase.json](../firebase.json) — Emulator configuration
- [App.jsx baris 72](../src/App.jsx#L72) — `ENABLE_AUTO_UANG_JALAN_RECONCILE` flag
- [SwipeableRow.jsx](../src/components/SwipeableRow.jsx) — `requireConfirm` support
- [Firebase Spark Quotas](https://firebase.google.com/docs/firestore/quotas) — Official docs
