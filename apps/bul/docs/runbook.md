# Runbook BUL

Semua langkah bertanda **[USER]** dijalankan pemilik, bukan agen.

## 1. Pengembangan lokal
```bash
cd apps/bul
npm install
npx supabase start
npm run db:reset && npm run test:db
cd web && cp .env.example .env.local   # isi anon key dari `npx supabase status`
npm install && npm run dev
```

## 2. Membuat project produksi [USER]
1. Supabase dashboard → org "Manfred's Organization" → New project **bul**, region Singapore, catat password DB di password manager.
2. Authentication → Sign In / Providers → Email: pastikan provider **Email** dalam keadaan ENABLED, dan hanya matikan "Allow new users to sign up" — kalau providernya ikut dimatikan, tidak ada seorang pun yang bisa login. URL Configuration → Site URL = URL Cloudflare Pages.
3. Terapkan migrasi dari laptop (setelah review):
   ```bash
   cd apps/bul
   npx supabase link --project-ref <ref-project-bul>
   npx supabase db push
   ```
4. Buat pengguna owner: Authentication → Users → Add user (auto confirm). Lalu SQL editor:
   ```sql
   update public.profil set peran = 'owner', aktif = true, nama = '<nama>' where email = '<email-owner>';
   ```
5. Staf: buat di Authentication → Users, lalu aktifkan & beri peran di menu **Pengguna** aplikasi.

## 3. Frontend Cloudflare Pages [USER]
- Workers & Pages → Create → Pages → hubungkan repo.
- Root directory `apps/bul/web`, build command `npm run build`, output `dist`.
- Environment variables (Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable/anon key project bul), `NODE_VERSION=22`.
- `public/_redirects` sudah menangani route SPA.

## 4. Backup malam [USER]
Secret GitHub (Settings → Secrets and variables → Actions):
| Secret | Isi |
|---|---|
| `BUL_DB_URL` | Connection string **Session pooler** (IPv4, port 5432) dari Supabase → Connect. |
| `BUL_BACKUP_PASSPHRASE` | Frasa sandi panjang; simpan juga di password manager. Tanpa ini backup tidak bisa dibuka. |
| `BUL_RCLONE_DRIVE_TOKEN` | JSON token dari `rclone config` (remote tipe drive, scope `drive.file`) di laptop. |
| `BUL_DRIVE_FOLDER_ID` | ID folder Drive "BUL-backup" (bagian akhir URL folder). |

Jalankan manual pertama kali: Actions → bul-backup → Run workflow. Workflow ini juga mencegah project Free di-pause karena tidak ada aktivitas.

## 5. Restore (uji tiap bulan) [USER]
```bash
gpg -d bul-YYYYMMDD-HHMM.dump.gpg > bul.dump
cd apps/bul && npx supabase start
pg_restore --no-owner --clean --if-exists -d postgresql://postgres:postgres@127.0.0.1:54322/postgres bul.dump
```
Periksa neraca di aplikasi lokal sama dengan produksi.

## 6. Menambah migrasi
- File baru `supabase/migrations/<timestamp>_<nama>.sql`, diakhiri `select internal.terapkan_hak_akses();`.
- Jalankan `npm run test:db` (termasuk gerbang keamanan) sebelum `db push`.
- Jangan pernah mengubah migrasi yang sudah di-push ke produksi.
