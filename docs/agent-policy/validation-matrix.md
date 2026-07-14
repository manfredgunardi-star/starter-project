# Validation Matrix

Validasi dijalankan dari root aplikasi yang benar. Catat command, exit code, dan ringkasan hasil. Kegagalan baseline dibedakan dari regresi task.

| Aplikasi | Root | Minimum local validation | Conditional validation |
|---|---|---|---|
| sj-monitor | `apps/sj-monitor` | `npm test`, `npm run lint`, `npm run build` | `npm run smoketest` hanya jika `staging_deploy: true` atau user meminta staging |
| bul-monitor | `apps/bul-monitor` | `npm run build` | Manual scenario pada flow yang berubah; test baru untuk pure logic bila layak |
| bul-accounting | `apps/bul-accounting` | `npm test`, `npm run build` | Manual finance regression jika scope menyentuh flow finansial yang sudah disetujui |
| ERP-ACC | `apps/erp-acc/erp-app` | `npm run lint`, `npm run build` | Playwright, RLS/RPC review, atau migration review sesuai scope |

## Global Checks

- `git diff --check` harus tidak menghasilkan error.
- `git status --short` hanya boleh menampilkan file task yang disengaja.
- Reviewer harus memeriksa committed diff terhadap task contract.
- Dokumentasi/permission-only task tidak memerlukan build semua aplikasi jika tidak menyentuh source atau package manifest; validator khusus task dan whitespace check tetap wajib.

## Staging Boundary

Staging adalah external mutation. Staging bukan bagian otomatis dari `npm run build`. Command staging hanya dijalankan setelah task contract atau user memberikan izin. Production deployment tetap dilarang dalam workflow agen standar.
