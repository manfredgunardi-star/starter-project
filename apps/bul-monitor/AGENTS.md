# AGENTS.md — bul-monitor

Instruksi Codex khusus `C:\Project\apps\bul-monitor`. Root `AGENTS.md` tetap berlaku.

## Domain and Integration

BUL Monitor menangani surat jalan dan monitoring pengiriman PT Bangun Usaha Lancar. Aplikasi bertukar data dengan `bul-accounting` melalui kontrak `shared/bul-bridge`; perubahan payload/status/idempotency harus mencakup kedua sisi.

## Critical Invariants

- Master collection wajib memakai prefix `bul_*`, termasuk `bul_supir`, `bul_rute`, `bul_material`, dan `bul_trucks`.
- `initializeFirestore` dengan long-polling adalah keputusan kompatibilitas jaringan.
- RBAC harus konsisten di UI dan Firestore rules.
- `onSnapshot` listener harus memiliki cleanup.
- Operasi tulis harus memiliki error handling dan tidak boleh menciptakan double-submit/race tanpa guard.

## Protected Areas

Minta persetujuan user sebelum schema/field, `firestore.rules`, auth, role, Firebase initialization, bridge contract, bulk import, audit behavior, posted status, atau formula uang berubah.

## Validation

```powershell
cd C:\Project\apps\bul-monitor
npm run build
```

Tambahkan manual scenario untuk flow yang berubah. Production deployment dilarang. Staging hanya jika task contract menetapkan `staging_deploy: true` atau user meminta.

## Collaboration

Satu implementer per worktree; reviewer read-only. Format JSON review hanya digunakan oleh agen yang berperan sebagai reviewer, bukan implementer.
