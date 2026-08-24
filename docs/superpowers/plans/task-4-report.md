## Task 4: Runner backfill Firestore

**Status:** DONE

**Commits:**
- `e6e2760` — `feat(scripts): add dry-run-first backfill runner for net receivable`
  - Adds `scripts/bul-accounting-backfill/package.json`
  - Adds `scripts/bul-accounting-backfill/index.js`
  - Adds `scripts/bul-accounting-backfill/README.md`

**Syntax check:** `node --check scripts/bul-accounting-backfill/index.js` — exit code 0, no output (sintaks valid, sesuai ekspektasi plan).

**Test summary:** `npm test` di `apps/bul-accounting` — 11 test files, 113 tests, semua PASS. Tidak ada regresi. Task 4 tidak menambah test baru karena runner adalah lapisan I/O yang sengaja tidak diuji langsung (sesuai catatan plan); logika murni tetap tercakup oleh 13 test case Task 3 di dalam suite tersebut.

**Self-review:**
- Ketiga file dibuat persis sesuai kode di plan (`docs/superpowers/plans/2026-08-24-bul-accounting-ar-net-uang-jalan.md`, Task 4 Step 1–4) — tidak ada improvisasi.
- `index.js` meng-import `planInvoiceAmountFix` langsung dari `../../apps/bul-accounting/src/utils/invoiceAmountBackfill.js` — tidak menduplikasi logika perencanaan.
- `DRY_RUN` default `true` (`process.env.DRY_RUN !== 'false'`); hanya menjadi `false` bila environment variable eksplisit di-set `'false'`.
- `git status` sebelum dan sesudah commit dikonfirmasi: hanya `scripts/bul-accounting-backfill/` yang berubah. Tidak ada perubahan pada `apps/bul-monitor`, `apps/bul-accounting/src/**`, `firestore.rules`, atau `chartOfAccounts.js`.
- **Konfirmasi eksplisit: script (`node index.js` / `npm start`) TIDAK PERNAH dijalankan.** Validasi terbatas pada `node --check` (verifikasi sintaks, tidak eksekusi) dan `npm test` di `apps/bul-accounting` (test suite murni Task 3, tidak menyentuh script runner ini). Tidak ada kredensial Firestore yang digunakan atau tersedia di lingkungan ini.
- Warning git saat commit terkait normalisasi LF→CRLF (`core.autocrlf`) — kosmetik saja, tidak memengaruhi isi file atau perilaku script.

**Next:** Ready for review. Task 5 (dokumentasi kontrak bridge di `shared/bul-bridge/README.md`) akan didispatch terpisah setelah Task 4 disetujui.
