# CLAUDE.md — bul-accounting

Instruksi Claude khusus `C:\Project\apps\bul-accounting`. Root `CLAUDE.md` tetap berlaku.

## Domain

Aplikasi accounting internal untuk COA, jurnal, kas/bank, penjualan, biaya, pelanggan, supplier, aset, armada, recurring journal, year-end closing, dan laporan GL/cost center.

## Critical Invariants

- Setiap jurnal wajib balance: total Debit harus sama dengan total Kredit.
- Jurnal per baris memiliki Keterangan, Truck, dan Karyawan.
- Truck dan Karyawan adalah dua dimensi cost center.
- Angka rupiah disimpan sebagai number dan hanya diformat saat render.
- `initializeFirestore`/long-polling adalah keputusan kompatibilitas jaringan.
- Periksa RBAC di UI dan Firestore rules, listener cleanup, race condition, error handling, dan akurasi export Excel.

## Protected Financial Areas

Minta persetujuan user sebelum mengubah COA/mapping, debit-kredit, tax, reconciliation, closing, posting, formula uang, schema, rules, auth, role, audit behavior, atau master data.

## Validation

```powershell
cd C:\Project\apps\bul-accounting
npm test
npm run build
```

Production deployment dilarang. Staging hanya jika task contract menetapkan `staging_deploy: true` atau user meminta.

## Collaboration

Satu implementer per worktree; reviewer read-only. Temuan financial harus menjadi `needs_user_decision` jika task contract tidak memuat approval eksplisit.
