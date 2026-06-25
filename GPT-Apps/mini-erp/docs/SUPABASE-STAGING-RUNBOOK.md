# Supabase Staging Runbook

Tanggal: 2026-04-18

## Prasyarat

- Supabase project staging sudah dibuat.
- Supabase CLI atau `psql` tersedia di mesin yang akan menjalankan migration.
- User owner pertama sudah dibuat lewat Supabase Auth.

## Migration

Jalankan migration berurutan:

1. `supabase/migrations/202604180001_initial_erp_schema.sql`
2. `supabase/migrations/202604180002_bootstrap_company_seed.sql`
3. `supabase/migrations/202604180003_accounting_rpcs.sql`
4. `supabase/migrations/202604180004_journal_line_soft_deactivate.sql`
5. `supabase/migrations/202604180005_server_side_table_audit.sql`
6. `supabase/migrations/202604180006_harden_company_member_invites.sql`

Jika memakai Supabase CLI:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

Jika memakai `psql`:

```bash
psql "<staging-database-url>" -f supabase/migrations/202604180001_initial_erp_schema.sql
psql "<staging-database-url>" -f supabase/migrations/202604180002_bootstrap_company_seed.sql
psql "<staging-database-url>" -f supabase/migrations/202604180003_accounting_rpcs.sql
psql "<staging-database-url>" -f supabase/migrations/202604180004_journal_line_soft_deactivate.sql
psql "<staging-database-url>" -f supabase/migrations/202604180005_server_side_table_audit.sql
psql "<staging-database-url>" -f supabase/migrations/202604180006_harden_company_member_invites.sql
```

## Frontend Staging Env

Isi env berikut untuk menjalankan React app memakai Supabase sebagai backend utama:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Jika dua env tersebut kosong, app tetap fallback ke Firebase jika Firebase env ada, atau demo `localStorage` jika tidak ada backend remote.

## Playwright Staging

Staging test Supabase akan otomatis skip kecuali env berikut tersedia:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_E2E_EMAIL=<owner-email>
SUPABASE_E2E_PASSWORD=<owner-password>
```

Jalankan:

```bash
npx playwright test tests/e2e/supabase-staging.spec.js --project=chromium-desktop
```

## Netlify Draft Deploy

Repo sudah memiliki `netlify.toml` untuk Vite SPA:

- build command: `npm run build`
- publish directory: `dist`
- SPA fallback: `/* -> /index.html`

Set env di Netlify UI untuk deploy preview/branch deploy:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Kedua env di atas aman untuk browser karena memakai Supabase anon key dan RLS tetap membatasi akses data. Jangan masukkan database password atau Supabase personal access token ke env frontend.

Untuk staging yang memakai Netlify Edge/Functions:

```bash
STAGING_BASIC_AUTH_USERNAME=<shared-staging-username>
STAGING_BASIC_AUTH_PASSWORD=<shared-staging-password>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Batasi `SUPABASE_SERVICE_ROLE_KEY` hanya ke scope Netlify Functions/runtime server-side. Jangan berikan ke build frontend.

## User & Role Invite

UI `User & Role` menyimpan membership lewat:

- Netlify Function `/api/admin/company-members` jika tersedia.
- RPC `save_company_member()` sebagai fallback untuk user/profile yang sudah ada.

Flow invite server-side:

1. Browser mengirim Supabase user JWT ke Netlify Function.
2. Function memvalidasi caller punya `users:manage`.
3. Function memakai service role hanya di server untuk membuat invite Auth user jika profile belum ada.
4. Function memanggil RPC `save_company_member()` memakai JWT caller, sehingga role guard dan proteksi owner terakhir tetap ditegakkan oleh database.

## Credential Rotation

Setelah credential pernah dibagikan di chat atau tiket kerja:

1. Revoke Supabase personal access token dari Dashboard Account Tokens, lalu buat token baru hanya saat perlu menjalankan CLI.
2. Reset password database dari Supabase Project Dashboard > Database Settings.
3. Sign out akun staging test dari semua session, lalu ganti password user test dari Supabase Auth.
4. Update hanya secret store yang benar-benar membutuhkan credential baru. Jangan tulis token, database password, atau password test ke repo.
5. Jalankan `supabase link` ulang jika CLI lokal kehilangan akses setelah token/password diganti.

## Bootstrap Company

Login sebagai user owner pertama lewat app/Supabase client, lalu panggil:

```sql
select public.bootstrap_company('DEMO', 'Demo Company');
```

Function ini membuat:

- `profiles` untuk user login.
- `companies`.
- `company_members` dengan role `owner`.
- COA default: Kas, Bank, Hutang Usaha, Modal, Pendapatan, Beban Operasional.
- Cost center default.
- Satuan dan kategori produk starter.

## Smoke Test Reporting

Setelah `bootstrap_company` mengembalikan `company_id`, buka:

`supabase/tests/staging_reporting_smoke.sql`

Ganti `REPLACE_WITH_COMPANY_ID` dengan UUID company staging, lalu jalankan query. Query tersebut memastikan Excel/Power Query bisa membaca:

- `reporting.vw_journal_lines`
- `reporting.vw_buku_besar`
- `reporting.vw_trial_balance`
- `reporting.vw_profit_loss`
- `reporting.vw_balance_sheet`

## Catatan Keamanan

- Jangan pakai role database `postgres` untuk Excel.
- Untuk tahap awal, Excel sebaiknya membaca lewat Supabase API dengan JWT user agar RLS tetap berlaku.
- Jika nanti membuat database user khusus Excel, beri akses hanya ke schema `reporting`, bukan tabel `public`.
