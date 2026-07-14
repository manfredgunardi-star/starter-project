# Repository Map

## Root

Semua aplikasi berada dalam satu Git repository dengan root `C:\Project`. Folder `C:\Project\apps` bukan repository terpisah. Branch dan worktree dari aplikasi yang berbeda tetap berbagi object database dan branch registry yang sama.

## Empat Aplikasi

| Aplikasi | Root aplikasi | Stack | Backend dan hosting | Validasi utama |
|---|---|---|---|---|
| Surat Jalan Monitor | `apps/sj-monitor` | React, Vite, Tailwind, Firebase, Framer Motion | Firebase Auth, Firestore, Firebase Hosting | Vitest, ESLint, build |
| BUL Monitor | `apps/bul-monitor` | React, Vite, Tailwind, Firebase | Firebase Auth, Firestore, Firebase Hosting | build, manual scenario |
| BUL Accounting | `apps/bul-accounting` | React, Vite, Tailwind, Firebase, Recharts | Firebase Auth, Firestore, Firebase Hosting | Vitest, build |
| ERP-ACC | `apps/erp-acc/erp-app` | React, Vite, Ant Design, Supabase | Supabase Auth/Postgres/RLS/RPC, Vercel | ESLint, build, Playwright sesuai scope |

## Cross-App Boundary

`apps/bul-monitor` dan `apps/bul-accounting` bertukar data melalui kontrak yang didokumentasikan di `shared/bul-bridge`. Perubahan terhadap payload, collection, status, atau idempotency pada satu sisi harus ditinjau sebagai perubahan lintas aplikasi dan memerlukan task contract yang mencakup kedua sisi.

## Independent Environments

- Setiap aplikasi memiliki dependency dan environment configuration sendiri.
- Jalankan npm command dari root aplikasi yang sesuai.
- `.env` bersifat lokal dan tidak boleh dibaca ke output, diubah, atau di-commit tanpa kebutuhan yang disetujui.
- Firebase app tidak memberikan asumsi yang berlaku untuk ERP-ACC; ERP-ACC menggunakan Supabase dan Vercel.
