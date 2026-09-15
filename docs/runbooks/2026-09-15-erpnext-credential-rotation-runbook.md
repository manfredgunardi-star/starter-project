# Runbook: Rotasi Kredensial ERPNext Produksi

**Untuk:** SirJarvis (eksekutor di VPS)
**Tanggal:** 2026-09-15
**Target:** VPS Hostinger `srv1696308` (187.77.112.171), `/opt/erpnext`, site `erpnext.local`
**Pola runbook:** ditiru dari `docs/runbooks/2026-08-11-erpnext-recovery-runbook.md` (branch
`claude/erpnext-v16-upgrade-analysis-be2cd3`, belum merge ke `main`)

---

## Konteks

ERPNext sudah **UP dan stabil 3 minggu** di atas custom image (`erpnext-custom:latest`) +
service `configurator` dari perbaikan struktural 2026-08-11. Perbaikan itu **tidak disentuh** di
runbook ini.

Yang tersisa adalah utang keamanan: tiga kredensial produksi masih plaintext di file yang sudah
tersebar lewat laporan Telegram sejak 2026-08-11 (mengulang pola insiden 2026-08-06), dan belum
pernah dirotasi meski disebut di beberapa sesi berturut-turut:

| # | Kredensial | Lokasi saat ini | Dipakai untuk |
|---|---|---|---|
| 1 | `DB_ROOT_PASSWORD` | `/opt/erpnext/.env` | Password root MariaDB |
| 2 | `ADMIN_PASSWORD` | `/opt/erpnext/.env` | Login user **Administrator** ERPNext |
| 3 | Password DB user site (`_ebde57cb5cf2199a`) | `site_config.json` (volume `erpnext_sites`) | Koneksi backend ↔ database |

Sekalian dikunci di file yang sama: `ALLOWED_HOSTS=*` di `.env` → daftar eksplisit
(`erpnext.local,localhost,127.0.0.1,erp.vibeakuntan.com`).

**Dua hal yang WAJIB dipahami sebelum eksekusi — kesalahan urutan di sini bisa mengunci akses ke
seluruh sistem:**

- **`DB_ROOT_PASSWORD` di `.env` tidak berlaku kalau langsung diedit.** `MYSQL_ROOT_PASSWORD`
  cuma dibaca MariaDB saat volume `db-data` kosong (first init). Volume ini sudah lama terisi.
  Password root yang **sesungguhnya berlaku** hanya berubah lewat `ALTER USER` langsung ke
  MariaDB yang sedang hidup. `.env` diupdate **setelahnya**, untuk dokumentasi — bukan mekanisme.
- **`ADMIN_PASSWORD` di `.env` sudah inert.** Variabel ini cuma dibaca skrip `bench install` saat
  site pertama kali dibuat. Site `erpnext.local` sudah lama ada. Rotasi yang sesungguhnya berlaku
  lewat `bench --site erpnext.local set-admin-password`.

---

## Aturan main

Baca ini sebelum mengetik perintah pertama.

0. **Jalankan seluruh runbook dalam SATU sesi shell yang sama (satu koneksi SSH persisten),
   dari Langkah 0 sampai Langkah 6 tanpa terputus.** Variabel seperti `$NEWROOTPW`, `$NEWSITEPW`,
   `$NEWADMINPW`, `$OLDROOTPW` dipakai lintas beberapa blok kode di Langkah berbeda. Kalau sesi
   shell terputus di tengah jalan, variabel hilang — baca ulang nilai LAMA dari file `.bak` (lihat
   Langkah 1), dan untuk nilai BARU yang sudah sempat digenerate tapi belum tercatat: nilai itu
   hilang permanen kalau belum ditulis ke `.env`/`site_config.json`, jadi ulangi generate password
   baru untuk kredensial yang belum sempat diverifikasi (gerbangnya belum lulus = belum berlaku).
1. **Setiap gerbang wajib disertai output perintah apa adanya.** Klaim "✅ Done" tanpa output
   dianggap belum dikerjakan.
2. **Gagal di gerbang mana pun = BERHENTI.** Laporkan, jangan lanjut, jangan berimprovisasi.
3. **Password baru HANYA dari generator** (`openssl rand -base64 24` atau setara). Jangan pernah
   dipilih manual.
4. **Password — lama maupun baru — tidak pernah ditulis plaintext** ke laporan, commit, chat,
   atau file selain lokasi resminya (`.env`, `site_config.json`). Baca dan simpan lewat variabel
   shell (`$VAR`), jangan `echo`/`cat`/`print` isinya ke terminal yang akan disalin ke laporan.
5. **Backup dulu sebelum mengubah apa pun.** `.env` dan `site_config.json`.
6. **Rotasi database SELALU: `ALTER USER` ke server yang hidup dulu, baru `.env`/config
   ditulis ulang supaya cocok dengan kenyataan.** Tidak pernah sebaliknya (lihat Gotcha di atas).
7. **Jangan sentuh image, jangan rebuild, jangan `docker compose down -v`.** Runbook ini tidak
   mengubah versi apa pun yang sedang jalan.
8. **Jangan `docker compose up -d --force-recreate`.** Cukup `docker compose up -d` biasa supaya
   Compose hanya me-recreate service yang konfigurasinya benar-benar berubah — bukan seluruh stack.
9. Setelah tiap kredensial dirotasi, **wajib uji dengan password BARU sebelum lanjut** ke
   kredensial berikutnya.
10. Password baru **wajib disimpan operator ke password manager** sebelum sesi terminal ditutup —
    lihat Langkah 7. Jangan diteruskan lewat Telegram/chat/email plaintext; itu persis penyebab
    task ini ada.

---

## Langkah 0 — Prasyarat & baseline

### 0a. Snapshot VPS

Snapshot dibuat **user** dari panel Hostinger. **Tunggu konfirmasi user bahwa snapshot sudah jadi
sebelum lanjut.** Runbook ini menyentuh password root database dan login admin produksi — kalau
urutan di Langkah 2/3 keliru dan tidak tertangkap gerbangnya, jalur pulih tercepat adalah restore
snapshot, bukan improvisasi lebih lanjut.

### 0b. Baseline sistem SEBELUM ada perubahan

```bash
cd /opt/erpnext && docker compose ps
```

**Gerbang:** nol container berstatus `Restarting`. `configurator` boleh `Exited (0)`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/method/ping
```

**Gerbang:** `200`.

> **STOP kalau baseline sudah tidak sehat.** Itu berarti ada masalah lain yang harus diselesaikan
> lebih dulu di luar scope runbook ini — jangan campur rotasi kredensial dengan pemulihan.

### 0c. Cari siapa yang benar-benar memakai `ALLOWED_HOSTS`

Jangan asumsikan — `.env` di sini punya sejarah variabel yang ternyata inert (lihat Gotcha
`ADMIN_PASSWORD`). Ada dua jalur berbeda yang membuat variabel `.env` sampai ke sebuah container:
referensi literal `${ALLOWED_HOSTS}` di `compose.yaml`, ATAU service itu punya `env_file: .env`
(atau setara) sehingga **seluruh** isi `.env` otomatis jadi environment variable di dalamnya tanpa
disebut literal sama sekali. Cek keduanya supaya tidak salah simpul (false negative):

```bash
cd /opt/erpnext && grep -n "ALLOWED_HOSTS" compose.yaml; echo ---; grep -n "env_file" compose.yaml
```

Catat: (a) service yang literal menyebut `ALLOWED_HOSTS`, dan (b) service yang punya `env_file`
mengarah ke `.env` — service tipe (b) tetap kandidat penerima variabel ini walau tidak muncul di
grep pertama.

**Gerbang:** minimal satu service teridentifikasi lewat salah satu dari dua grep di atas. Kalau
**keduanya** kosong (tidak ada referensi literal maupun `env_file`), catat temuan ini apa adanya
di laporan — berarti mengubah nilainya di `.env` murni dokumentasi, tidak mengubah perilaku apa
pun di container manapun, dan ini perlu ditindaklanjuti terpisah (bukan diperbaiki diam-diam di
runbook ini). **Jangan STOP** karena ini, lanjutkan runbook — tapi laporkan temuannya dengan jelas.

### 0d. Host pattern user MariaDB yang akan dirotasi

Password lama dibaca dari `.env`, tidak diketik manual:

```bash
cd /opt/erpnext && OLDROOTPW=$(grep '^DB_ROOT_PASSWORD=' .env | cut -d= -f2-) && docker compose exec -T db mariadb -u root -p"$OLDROOTPW" -e "SELECT User,Host FROM mysql.user WHERE User IN ('root','_ebde57cb5cf2199a');"
```

**Gerbang:** query berhasil (tidak ada `Access denied`), dan baris `User='root'` maupun
`User='_ebde57cb5cf2199a'` muncul dengan kolom `Host`-nya. **Catat kombinasi `user`@`host` yang
benar-benar ada** — ini dipakai persis di Langkah 2 dan 3, jangan diasumsikan `'%'` begitu saja.

---

## Langkah 1 — Backup

```bash
cd /opt/erpnext && cp .env .env.bak-20260915
```

```bash
docker compose exec -T backend cp sites/erpnext.local/site_config.json sites/erpnext.local/site_config.json.bak-20260915
```

**Gerbang:**

```bash
ls -l /opt/erpnext/.env.bak-20260915 && docker compose exec -T backend ls -l sites/erpnext.local/site_config.json.bak-20260915
```

Kedua file ada dan ukurannya bukan nol.

> `.env.bak-20260915` adalah satu-satunya tempat password root **lama** bisa dipulihkan setelah
> Langkah 2 — begitu `ALTER USER` jalan, MariaDB tidak lagi mengenali password lama sama sekali.

---

## Langkah 2 — Rotasi `DB_ROOT_PASSWORD` (root MariaDB, live)

### 2a. Bangkitkan password baru

```bash
NEWROOTPW=$(openssl rand -base64 24)
```

Jangan `echo $NEWROOTPW`.

### 2b. `ALTER USER` ke server yang hidup

Sesuaikan daftar `'root'@'<host>'` dengan hasil 0d — jalankan satu `ALTER USER` per baris `Host`
yang benar-benar ada untuk `User='root'`. Contoh kalau 0d menunjukkan `root@%` dan
`root@localhost`:

```bash
cd /opt/erpnext && docker compose exec -T db mariadb -u root -p"$OLDROOTPW" -e "ALTER USER 'root'@'%' IDENTIFIED BY '$NEWROOTPW'; ALTER USER 'root'@'localhost' IDENTIFIED BY '$NEWROOTPW'; FLUSH PRIVILEGES;"
```

**Gerbang:** perintah keluar tanpa error.

### 2c. Uji login dengan password BARU

```bash
docker compose exec -T db mariadb -u root -p"$NEWROOTPW" -e "SELECT 1;"
```

**Gerbang:** keluar baris `1`.

### 2d. Konfirmasi password LAMA sudah ditolak

```bash
docker compose exec -T db mariadb -u root -p"$OLDROOTPW" -e "SELECT 1;" ; echo "exit code: $?"
```

**Gerbang:** exit code **bukan** `0` (harus `Access denied`). Kalau exit `0`, `ALTER USER` gagal
diam-diam — **STOP dan lapor**, jangan lanjut ke Langkah 3 dengan asumsi root sudah dirotasi.

```bash
unset OLDROOTPW
```

---

## Langkah 3 — Rotasi password DB user site (`_ebde57cb5cf2199a`, live)

### 3a. Baca password lama dari `site_config.json` yang hidup

```bash
OLDSITEPW=$(docker compose exec -T backend python3 -c "import json;print(json.load(open('sites/erpnext.local/site_config.json'))['db_password'])")
```

### 3b. Bangkitkan password baru

```bash
NEWSITEPW=$(openssl rand -base64 24)
```

### 3c. `ALTER USER` — pakai host dari 0d, root password BARU dari Langkah 2

Hak akses user ini **tidak berubah**, hanya passwordnya — jangan jalankan ulang `GRANT`, itu
hanya perlu kalau grant-nya memang rusak (bukan kasus di sini).

```bash
cd /opt/erpnext && docker compose exec -T db mariadb -u root -p"$NEWROOTPW" -e "ALTER USER '_ebde57cb5cf2199a'@'%' IDENTIFIED BY '$NEWSITEPW'; FLUSH PRIVILEGES;"
```

(Ganti `'%'` kalau hasil 0d menunjukkan host lain untuk user ini.)

### 3d. Tulis password baru ke `site_config.json` lewat `bench`

Pakai `bench set-config`, bukan edit manual — supaya JSON tetap valid dan field lain tidak
tersentuh.

```bash
docker compose exec -T backend bench --site erpnext.local set-config db_password "$NEWSITEPW"
```

**Gerbang:** exit code `0`.

### 3e. Uji koneksi persis seperti backend melakukannya

```bash
docker compose exec -T backend python -c "import pymysql,json;c=json.load(open('sites/erpnext.local/site_config.json'));pymysql.connect(host='db',user=c['db_name'],password=c['db_password'],database=c['db_name']);print('DB OK')"
```

**Gerbang:** keluar `DB OK`.

```bash
unset OLDSITEPW
```

---

## Langkah 4 — Rotasi `ADMIN_PASSWORD` (login Administrator, live)

### 4a. Bangkitkan password baru

```bash
NEWADMINPW=$(openssl rand -base64 24)
```

### 4b. Set lewat `bench` — ini mekanisme yang SESUNGGUHNYA berlaku

```bash
cd /opt/erpnext && docker compose exec -T backend bench --site erpnext.local set-admin-password "$NEWADMINPW"
```

**Gerbang:** exit code `0`.

### 4c. Uji login dengan password BARU

```bash
curl -s -o /tmp/login-test.json -w "%{http_code}\n" -c /tmp/login-cookie.txt -X POST http://localhost:8080/api/method/login --data-urlencode "usr=Administrator" --data-urlencode "pwd=$NEWADMINPW"
```

**Gerbang:** HTTP `200` **dan** isi `/tmp/login-test.json` mengandung `"message":"Logged In"`
(cek dengan `grep -o '"message":"[^"]*"' /tmp/login-test.json`, jangan `cat` seluruh file kalau
tidak perlu).

```bash
rm -f /tmp/login-test.json /tmp/login-cookie.txt
```

---

## Langkah 5 — Sinkronkan `.env`, kunci `ALLOWED_HOSTS`, satu kali restart

Ketiga kredensial di atas **sudah live berlaku** di Langkah 2–4. Langkah ini hanya membuat `.env`
konsisten dengan kenyataan dan menerapkan `ALLOWED_HOSTS` — **satu siklus restart**, tidak ada
downtime terpisah untuk tiap perubahan.

### 5a. Tulis ulang `.env`

```bash
cd /opt/erpnext && sed -i \
  -e "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=${NEWROOTPW}|" \
  -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${NEWADMINPW}|" \
  -e "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=erpnext.local,localhost,127.0.0.1,erp.vibeakuntan.com|" \
  .env
```

**Gerbang:**

```bash
grep -E "^(DB_ROOT_PASSWORD|ADMIN_PASSWORD|ALLOWED_HOSTS)=" .env | sed 's/=.*/=<redacted>/'
```

Tiga baris muncul (nilainya jangan ditempel ke laporan — perintah di atas sudah menyembunyikannya).
`ALLOWED_HOSTS` harus persis daftar eksplisit, bukan `*`.

### 5b. Validasi sintaks compose sebelum apply

```bash
docker compose config > /dev/null && echo "COMPOSE OK"
```

**Gerbang:** `COMPOSE OK`.

### 5c. Apply — HANYA service yang konfigurasinya berubah

```bash
docker compose up -d
```

Tunggu 60 detik, lalu:

```bash
docker compose ps
```

**Gerbang:** nol container `Restarting`. Bandingkan service yang di-recreate dengan dugaan dari
0c — kalau ada service tak terduga yang ikut recreate, catat di laporan (bukan berarti gagal,
tapi perlu diketahui).

> `db` wajar ikut recreate karena `MYSQL_ROOT_PASSWORD` (dari `DB_ROOT_PASSWORD`) berubah di
> `.env` — ini **aman**: volume `db-data` tidak disentuh, dan password root yang sesungguhnya
> berlaku sudah dirotasi live di Langkah 2, jadi nilai baru di `.env` sudah cocok dengan kenyataan.

---

## Langkah 6 — Verifikasi akhir menyeluruh

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/method/ping
```

**Gerbang:** `200`.

```bash
docker compose exec -T backend python -c "import pymysql,json;c=json.load(open('sites/erpnext.local/site_config.json'));pymysql.connect(host='db',user=c['db_name'],password=c['db_password'],database=c['db_name']);print('DB OK')"
```

**Gerbang:** `DB OK` (membuktikan password site tetap berfungsi setelah `db` di-recreate).

```bash
curl -s -o /tmp/login-test2.json -w "%{http_code}\n" -c /tmp/login-cookie2.txt -X POST http://localhost:8080/api/method/login --data-urlencode "usr=Administrator" --data-urlencode "pwd=$NEWADMINPW"
```

**Gerbang:** `200` dan `"message":"Logged In"` — membuktikan admin login tetap berfungsi setelah
restart.

```bash
rm -f /tmp/login-test2.json /tmp/login-cookie2.txt
```

Kalau 0c menemukan service yang mengonsumsi `ALLOWED_HOSTS`:

```bash
docker compose exec -T <service_dari_0c> printenv ALLOWED_HOSTS
```

**Gerbang:** nilai keluar persis `erpnext.local,localhost,127.0.0.1,erp.vibeakuntan.com`. Ini
membuktikan environment variable-nya berubah di dalam container — **bukan** bukti bahwa aplikasi
benar-benar menegakkannya (itu tergantung apakah kode aplikasi/nginx membaca variabel ini).
Laporkan sebagai "env var confirmed, application-level enforcement unverified" — jangan diklaim
lebih dari itu.

```bash
unset NEWROOTPW NEWSITEPW NEWADMINPW
```

---

## Langkah 7 — Serahkan password baru ke operator

**Jangan tutup sesi terminal sebelum ini.** `unset` di Langkah 6 menghapus password baru dari
memori shell — kalau belum disimpan, satu-satunya salinan yang tersisa adalah:

- Root MariaDB baru: `.env` (`DB_ROOT_PASSWORD`)
- Admin ERPNext baru: `.env` (`ADMIN_PASSWORD`, nilai dokumentasi — sama dengan yang live)
- **Password DB user site baru TIDAK ada di `.env` sama sekali** (memang bukan lokasinya) — kalau
  belum dicatat operator sebelum variabel di-`unset`, harus dibaca ulang dari
  `site_config.json` lewat backend container.

Minta operator menyimpan ketiga password baru ke password manager **sekarang**, lewat jalur
terenkripsi — bukan Telegram, chat, atau email plaintext. Itu persis penyebab rotasi ini
diperlukan.

---

## Rollback

### Root MariaDB (Langkah 2) gagal sebelum 2d selesai

Kalau `$OLDROOTPW` masih ada di sesi shell yang sama, pakai itu. Kalau sesi sudah terputus (lihat
Aturan main #0), baca ulang dari backup:

```bash
cd /opt/erpnext && OLDROOTPW=$(grep '^DB_ROOT_PASSWORD=' .env.bak-20260915 | cut -d= -f2-) && docker compose exec -T db mariadb -u root -p"$NEWROOTPW" -e "ALTER USER 'root'@'%' IDENTIFIED BY '$OLDROOTPW'; FLUSH PRIVILEGES;"
```

Kalau `$NEWROOTPW` **juga** sudah hilang (2b sempat sukses tapi sesi terputus sebelum dicatat ke
mana pun): tidak ada jalan mundur lewat password — satu-satunya opsi adalah restore snapshot VPS
(lihat catatan di bawah), karena root MariaDB sekarang punya password yang tidak diketahui siapa
pun. Ini alasan Aturan main #0 mewajibkan satu sesi shell yang sama.

(Sesuaikan host sesuai 0d. Ini mengembalikan ke password lama yang sudah bocor — hanya untuk
memulihkan akses darurat; ulangi rotasi dari awal setelah akses pulih, jangan biarkan password
lama berlaku permanen.)

### Site DB user (Langkah 3) gagal setelah 3c tapi sebelum 3e sukses

```bash
cd /opt/erpnext && docker compose exec -T db mariadb -u root -p"$NEWROOTPW" -e "ALTER USER '_ebde57cb5cf2199a'@'%' IDENTIFIED BY '$OLDSITEPW'; FLUSH PRIVILEGES;"
docker compose exec -T backend bench --site erpnext.local set-config db_password "$OLDSITEPW"
```

Kalau `$OLDSITEPW` sudah hilang dari sesi, baca ulang dari backup container (Langkah 1):

```bash
OLDSITEPW=$(docker compose exec -T backend python3 -c "import json;print(json.load(open('sites/erpnext.local/site_config.json.bak-20260915'))['db_password'])")
```

### Admin (Langkah 4) — jangan rollback ke password lama

Password lama sudah bocor; rollback yang benar adalah **mengulang 4a-4c dengan password baru
lain**, bukan mengembalikan yang lama.

### `.env` / `ALLOWED_HOSTS` (Langkah 5) menyebabkan akses terkunci

```bash
cd /opt/erpnext && cp .env.bak-20260915 .env && docker compose up -d
```

Database tidak pernah di-`DROP`/`DELETE` sepanjang runbook ini, jadi tidak ada data yang perlu
dipulihkan — rollback di atas murni mengembalikan konfigurasi.

### Kegagalan katastrofik (password root hilang, tidak ada di mana pun)

Restore snapshot VPS dari panel Hostinger. **Hanya user yang boleh menjalankannya.** Tidak ada
snapshot khusus untuk task ini dibuat di runbook ini — konfirmasi ke user snapshot terbaru yang
tersedia sebelum eksekusi dimulai, sama seperti langkah 0a di runbook pemulihan 2026-08-11.

---

## Template laporan

Isi apa adanya. Kolom output tidak boleh kosong. **Jangan tempel nilai password di mana pun.**

```
Langkah 0a Snapshot VPS dikonfirmasi : ya/tidak
Langkah 0b Baseline ps/ping      : <output>
Langkah 0c ALLOWED_HOSTS service : <service yang ditemukan, atau "tidak direferensikan di compose.yaml/env_file">
Langkah 0d Host pattern root/site: <output SELECT User,Host>
Langkah 1  Backup                : <output ls -l, ukuran file>
Langkah 2c Root login BARU       : <output SELECT 1>
Langkah 2d Root login LAMA ditolak: <exit code>
Langkah 3e DB OK (site user baru): <output>
Langkah 4c Admin login BARU      : <HTTP code + message>
Langkah 5a .env tersinkron       : <3 baris ter-redact>
Langkah 5c compose ps            : <output penuh, service mana saja yang di-recreate>
Langkah 6  Ping setelah restart  : <HTTP code>
Langkah 6  DB OK setelah restart : <output>
Langkah 6  Admin login setelah restart: <HTTP code + message>
Langkah 6  ALLOWED_HOSTS di container: <output printenv, atau "tidak diverifikasi — 0c kosong">
Langkah 7  Password diserahkan ke operator: ya/tidak

Gerbang yang gagal        : <sebutkan, atau "tidak ada">
Yang tidak dikerjakan     : <sebutkan>
```

Kalau ada langkah yang dilewati atau diimprovisasi, tulis di "Yang tidak dikerjakan" — itu
informasi yang berguna, bukan kegagalan.
