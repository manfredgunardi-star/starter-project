# CLAUDE.md — sj-monitor

Instruksi Claude khusus `C:\Project\apps\sj-monitor`. Root `CLAUDE.md` tetap berlaku.

## Domain

Surat jalan, invoice, Harga Per Rute, uang muka, kas, laporan truk, payslip, ritasi, serta master rute/material/armada/supir.

## Critical Invariants

- Ikuti **Firestore Write Safety** di `docs/FIRESTORE-WRITE-SAFETY.md`.
- Koleksi rute bernama `rute`, bukan `route`; state setter yang dipakai adalah `setRuteList`.
- Enam role: `superadmin`, `admin_sj`, `admin_keuangan`, `admin_invoice`, `owner`, `reader`.
- `formatCurrency` harus didefinisikan atau di-import pada setiap file yang memakainya.
- `initializeFirestore` dan long-polling adalah keputusan kompatibilitas jaringan.
- `ENABLE_AUTO_UANG_JALAN_RECONCILE = false` dan guard seperti `didReconcileRef.current` tidak boleh dihapus tanpa approval.
- Jangan membuat loop write tanpa pagination/batas atau bulk write dari `useEffect` tanpa guard.
- Destructive touch/swipe action wajib memakai konfirmasi.

## Protected Areas

Minta persetujuan user sebelum mengubah `firestore.rules`, auth, Firebase initialization, role, schema, pricing, uang muka, formula uang, audit behavior, posted transaction, atau bulk import.

## UI

Gunakan Liquid Glass, SF Pro/Inter, Framer Motion spring, floating-pill navigation, dan rounded glass surfaces sesuai [UI Design System](docs/agent-policy/ui-design-system.md).

## Validation

Jalankan dari `apps/sj-monitor`:

```powershell
npm test
npm run lint
npm run build
```

`npm run smoketest` adalah staging deployment. Jalankan hanya jika task contract memiliki `staging_deploy: true` atau user meminta staging. Production deployment dilarang.

Saat menyusun task contract, nilai kebutuhan smoketest/staging secara sadar dan catat keputusan `true` atau `false`; jangan menganggap build lokal otomatis memerlukan staging.

## Collaboration

Satu implementer menulis pada satu worktree. Reviewer read-only menggunakan profile reviewer dan tidak mengubah source. Format JSON review tidak berlaku pada implementer biasa.
