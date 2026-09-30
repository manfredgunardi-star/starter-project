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
2. Authentication → Sign In / Providers → Email: pastikan provider **Email** dalam keadaan ENABLED, dan hanya matikan "Allow new users to sign up" — kalau providernya ikut dimatikan, tidak ada seorang pun yang bisa login. URL Configuration → Site URL = URL Cloudflare Pages **persis, tanpa titik atau garis miring di akhir** (di go-live pernah terisi `http://localhost:3000`, lalu `https://bul-c2r.pages.dev.` dengan titik nyasar). Redirect URLs = `<url>/**`.
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
Prosedur ini sudah dijalankan dan lulus pada 2026-09-30. Restore diarahkan ke **database baru** (`bul_restore`) di Supabase lokal, bukan ke database dev, jadi tidak ada `--clean` yang menimpa apa pun. Contoh untuk Windows cmd.exe dengan Docker Desktop menyala dan `npx supabase start` sudah jalan (container `supabase_db_bul`). `pg_restore` tidak perlu dipasang: dipakai yang ada di dalam container (PG 17).

1. Unduh `bul-YYYYMMDD-HHMM.dump.gpg` dari folder Drive `BUL-backup` ke `Downloads`. Ukurannya harus sama dengan yang tercatat di log workflow.
2. Buka enkripsi. `gpg` bawaan Git tidak ada di PATH cmd.exe, jadi pakai path lengkap. Passphrase = isi secret `BUL_BACKUP_PASSPHRASE`:
   ```
   "C:\Program Files\Git\usr\bin\gpg.exe" --pinentry-mode loopback -d -o %USERPROFILE%\Downloads\bul.dump %USERPROFILE%\Downloads\bul-YYYYMMDD-HHMM.dump.gpg
   ```
3. Restore ke database baru. Satu-satunya galat yang wajar adalah `schema "public" already exists`:
   ```
   docker cp %USERPROFILE%\Downloads\bul.dump supabase_db_bul:/tmp/bul.dump && docker exec supabase_db_bul psql -U postgres -c "create database bul_restore" && docker exec supabase_db_bul pg_restore --no-owner -U postgres -d bul_restore /tmp/bul.dump
   ```
4. Bandingkan dengan produksi memakai query yang **sama persis** di kedua sisi (lokal lewat `psql -d bul_restore`, produksi lewat SQL Editor Supabase). Jumlah baris per tabel harus sama:
   ```sql
   select table_name, (xpath('/row/c/text()', query_to_xml('select count(*) as c from ' || quote_ident(table_schema) || '.' || quote_ident(table_name), false, true, '')))[1]::text::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
   ```
   Lalu sidik jari nilai uangnya. Keempat kolom harus identik dan `total_debit` sama dengan `total_kredit`:
   ```sql
   select count(*) as baris, sum(debit) as total_debit, sum(kredit) as total_kredit, md5(string_agg(jurnal_id::text || '|' || urutan || '|' || akun_kode || '|' || debit || '|' || kredit, ',' order by jurnal_id, urutan)) as hash from public.jurnal_baris;
   ```
   Kalau ada transaksi baru sesudah waktu backup, angka produksi boleh lebih besar, tidak boleh lebih kecil.
5. **Bersihkan.** `bul.dump` yang sudah didekripsi berisi data keuangan tanpa enkripsi:
   ```
   docker exec supabase_db_bul psql -U postgres -c "drop database bul_restore" && docker exec supabase_db_bul rm /tmp/bul.dump && del %USERPROFILE%\Downloads\bul.dump
   ```

## 6. Menambah migrasi
- File baru `supabase/migrations/<timestamp>_<nama>.sql`, diakhiri `select internal.terapkan_hak_akses();`.
- Jalankan `npm run test:db` (termasuk gerbang keamanan) sebelum `db push`.
- Jangan pernah mengubah migrasi yang sudah di-push ke produksi.

## 7. Data uji di produksi [USER]
Jurnal di BUL tidak bisa dihapus: trigger `trg_jurnal_tetap` dan `trg_jurnal_baris_tetap` menolaknya (`Jurnal tidak boleh dihapus; gunakan jurnal pembalik`). Data uji dibersihkan dengan **pembatalan lewat aplikasi**, bukan SQL. Urutannya dari belakang ke depan, karena invoice tidak bisa dibatalkan selagi ada pembayaran aktif:
1. Menu **Pembayaran** → Batal. Alasan wajib diisi.
2. Menu **Invoice** → Batalkan.
3. Menu **Surat Jalan** → Batal.

Setelah itu semua akun kembali bersaldo 0. Buktinya: Neraca kembali persis ke saldo awal, dan query ini tidak mengembalikan baris selain saldo awal:
```sql
select akun_kode, sum(debit - kredit) as saldo_debit_positif from public.jurnal_baris group by akun_kode having sum(debit - kredit) <> 0 order by akun_kode;
```
Sisa yang tidak hilang: jurnal asli dan jurnal pembaliknya tetap ada sebagai riwayat, dan penghitung nomor urut (`nomor_urut`) sudah maju. Nomor invoice otomatis berikutnya tidak mulai dari 001. Kolom **Nomor** di form invoice bisa diisi manual (indeks unik hanya berlaku untuk invoice berstatus `terbit`, jadi nomor milik invoice yang sudah dibatalkan boleh dipakai lagi).

Uji siklus penuh sebelum transaksi asli (2026-09-30): SJ → selesai → invoice → pembayaran → Neraca dan Laba Rugi, lalu batalkan semuanya. Perilaku yang perlu diketahui:
- Upah supir mengikuti aturan upah (bisa tetap per SJ atau per satuan). Komisi ritase pengurus ikut terposting otomatis saat SJ selesai (Dr 5180 / Cr 2125).
- PPh final 0,5% (PP 55) dicatat sebagai **beban** (akun 6251), bukan pajak dibayar di muka.
- Invoice ditolak bila total uang jalan melebihi subtotal (`supabase/migrations/20260918000500_invoice.sql`: "Total uang jalan ... melebihi subtotal"). Rute dengan tarif × muatan kecil harus punya qty cukup.

## 8. Saldo awal [USER]
Hanya satu saldo awal aktif. Salah isi: **Saldo Awal → Batalkan untuk posting ulang**, lalu posting lagi.
- Isi dari neraca akuntan pada tanggal batas (bawaan `31-12-2025`). Kas, bank, dan piutang bernilai 0 bila transaksi pertama perusahaan baru sesudah tanggal itu.
- Rugi/laba tahun sebelum tanggal batas masuk ke **3210 Saldo Laba Ditahan**, bukan **3220 Laba/Rugi Tahun Berjalan**. Neraca menghitung laba tahun berjalan sendiri dari transaksi (`laporan.sql`), jadi mengisinya di 3220 membuat baris "tahun berjalan" ganda.
- Karena riwayat sesudah tanggal batas tidak ikut, Neraca sesudah tanggal itu belum mencerminkan kas, bank, dan piutang yang sebenarnya sampai riwayatnya diimpor (fitur Impor) atau saldo awal diposting ulang pada tanggal go-live.
- Pelanggan dan supir hanya diisi pada baris piutang dan hutang upah. Piutang lama per invoice ditambahkan di bagian **Rincian piutang lama** setelah saldo awal diposting, dan totalnya harus sama dengan baris Piutang Usaha di jurnal saldo awal.
