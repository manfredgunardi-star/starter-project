# Runbook: Pemulihan ERPNext v15 lewat Custom Image

**Untuk:** SirJarvis (eksekutor di VPS)
**Tanggal:** 2026-08-11
**Desain lengkap & alasan tiap keputusan:** `docs/superpowers/specs/2026-08-11-erpnext-custom-image-v15-design.md`
**Target:** VPS Hostinger `srv1696308` (187.77.112.171), `/opt/erpnext`, site `erpnext.local`

---

## Aturan main

Baca ini sebelum mengetik perintah pertama.

1. **Setiap gerbang wajib disertai output perintah apa adanya.** Jangan menulis "✅ Done"
   tanpa menempelkan output yang menghasilkannya. Klaim tanpa output dianggap belum
   dikerjakan.
2. **Gagal di gerbang mana pun = BERHENTI.** Laporkan, jangan lanjut ke langkah berikutnya,
   jangan berimprovisasi.
3. **Jangan sentuh database.** Nol `DELETE`, nol `UPDATE`, nol `DROP`. Tidak ada langkah di
   runbook ini yang mengubah isi data.
4. **Jangan `docker image prune`** sampai seluruh runbook selesai — image lama adalah jalur
   rollback tercepat.
5. **Jangan pakai `docker compose down -v`.** Flag `-v` menghapus volume, termasuk database.
6. **Jangan ketik password ke dalam perintah.** Semua perintah di bawah membaca kredensial
   dari `.env` atau `site_config.json`.
7. **Tidak ada stopgap.** Keputusan user: layanan dibiarkan down sampai perbaikan permanen
   selesai. Jangan clone app ke container berjalan sebagai tambal sementara.

---

## Langkah 0 — Diagnostik & prasyarat

### 0a. Snapshot VPS

Snapshot dibuat **user** dari panel Hostinger. Saat ini tidak ada snapshot aktif.
**Tunggu konfirmasi user bahwa snapshot sudah jadi sebelum lanjut.**

### 0b. Versi Docker

```bash
docker --version
```

**Gerbang:** Docker Engine ≥ **23.0**.

> **STOP kalau < 23.** Tidak ada jalur mundur — `images/layered/Containerfile` terbaru hanya
> mendukung `--mount=type=secret,id=apps_json`, dan `APPS_JSON_BASE64` sudah dihapus dari
> frappe_docker. Tindakannya: upgrade Docker Engine dulu, lalu ulangi runbook dari langkah 0.

### 0c. Ruang disk

```bash
df -h /var/lib/docker
```

**Gerbang:** minimal 20 GB bebas.

### 0d. Password DB yang sebenarnya dipakai site

```bash
docker run --rm -v erpnext_sites:/data alpine cat /data/erpnext.local/site_config.json
```

Jangan tempelkan isi file ini ke laporan — cukup konfirmasi field `db_name` dan `db_password` ada.

### 0e. Uji koneksi DB persis seperti backend melakukannya

```bash
cd /opt/erpnext && docker compose exec -T backend python -c "import pymysql,json;c=json.load(open('sites/erpnext.local/site_config.json'));pymysql.connect(host='db',user=c['db_name'],password=c['db_password'],database=c['db_name']);print('DB OK')"
```

**Gerbang:** keluar `DB OK`.

Kalau muncul `(1045, "Access denied...")`, jalankan 0f. Kalau `DB OK`, **lewati 0f**.

### 0f. Perbaiki grant DB — hanya jika 0e gagal

Password dibaca dari `site_config.json`, tidak diketik manual:

```bash
cd /opt/erpnext && SITEPW=$(docker run --rm -v erpnext_sites:/data alpine cat /data/erpnext.local/site_config.json | python3 -c "import sys,json;print(json.load(sys.stdin)['db_password'])") && docker compose exec -T db mariadb -u root -p"$(grep DB_ROOT_PASSWORD .env | cut -d= -f2)" -e "CREATE USER IF NOT EXISTS '_ebde57cb5cf2199a'@'%'; ALTER USER '_ebde57cb5cf2199a'@'%' IDENTIFIED BY '$SITEPW'; GRANT ALL PRIVILEGES ON \`_ebde57cb5cf2199a\`.* TO '_ebde57cb5cf2199a'@'%'; FLUSH PRIVILEGES;"
```

Lalu ulangi 0e sampai keluar `DB OK`.

---

## Langkah 1 — Backup konfigurasi

```bash
cd /opt/erpnext && cp compose.yaml compose.yaml.bak-20260811 && cp .env .env.bak-20260811
```

```bash
docker run --rm -v erpnext_sites:/data alpine cp /data/common_site_config.json /data/common_site_config.json.bak-20260811
```

**Gerbang:** ketiga file `.bak-20260811` ada.

```bash
ls -l /opt/erpnext/*.bak-20260811 && docker run --rm -v erpnext_sites:/data alpine ls -l /data/common_site_config.json.bak-20260811
```

### Catat image lama (jalur rollback)

```bash
docker images frappe/erpnext --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}"
```

**Gerbang:** `frappe/erpnext:v15.45.1` muncul. Kalau tidak ada, STOP — rollback cepat hilang.

---

## Langkah 2 — Siapkan `apps.json` dan frappe_docker

```bash
mkdir -p /opt/erpnext/build && cd /opt/erpnext/build && git clone --depth 1 https://github.com/frappe/frappe_docker
```

```bash
cat > /opt/erpnext/build/frappe_docker/apps.json <<'EOF'
[
  { "url": "https://github.com/frappe/erpnext", "branch": "v15.45.1" },
  { "url": "https://github.com/agile-technica/erpnext-indonesia-localization", "branch": "v1.4.1" }
]
EOF
```

> `frappe` **tidak** masuk `apps.json` — ia datang lewat build arg `FRAPPE_BRANCH`.

**Gerbang:** JSON valid.

```bash
python3 -m json.tool /opt/erpnext/build/frappe_docker/apps.json
```

---

## Langkah 3 — Build image (~20–40 menit di 2 vCPU)

```bash
cd /opt/erpnext/build/frappe_docker && docker build --no-cache --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe --build-arg=FRAPPE_BRANCH=v15.49.1 --secret=id=apps_json,src=apps.json --tag=vibeakuntan/erpnext:v15.49.1-id --file=images/layered/Containerfile .
```

**Gerbang:** exit code 0. Tempelkan ~15 baris terakhir output.

---

## Langkah 4 — Verifikasi isi image SEBELUM menyentuh produksi

Ini gerbang terpenting sebelum cutover. Build bisa "sukses" tapi menghasilkan image tanpa app
yang dimaksud — persis kegagalan yang sedang kita perbaiki.

```bash
docker run --rm vibeakuntan/erpnext:v15.49.1-id ls -1 apps
```

**Gerbang:** keluar **persis tiga baris** — `erpnext`, `erpnext_indonesia_localization`, `frappe`.

> STOP kalau `erpnext_indonesia_localization` tidak muncul. Jangan lanjut ke langkah 5.

Konfirmasi versi:

```bash
docker run --rm vibeakuntan/erpnext:v15.49.1-id cat apps/frappe/frappe/__init__.py | grep -m1 "__version__"
```

```bash
docker run --rm vibeakuntan/erpnext:v15.49.1-id cat apps/erpnext/erpnext/__init__.py | grep -m1 "__version__"
```

**Gerbang:** frappe `15.49.1`, erpnext `15.45.1`. Kalau berbeda, STOP dan lapor — asumsi versi
di desain meleset, dan `bench migrate` tidak lagi no-op.

---

## Langkah 5 — Perbarui `compose.yaml`

Ganti **semua** kemunculan `image: frappe/erpnext:v15.45.1` menjadi:

```yaml
    image: vibeakuntan/erpnext:v15.49.1-id
    pull_policy: never
```

Berlaku untuk service: `backend`, `frontend`, `websocket`, `queue-default`, `queue-short`,
`queue-long`, `scheduler`.

### 5a. Tambahkan service `configurator`

Sisipkan sebagai service pertama di bawah `services:`:

```yaml
  configurator:
    image: vibeakuntan/erpnext:v15.49.1-id
    pull_policy: never
    restart: on-failure
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    entrypoint: ["bash", "-c"]
    command:
      - >
        ls -1 apps > sites/apps.txt;
        bench set-config -g db_host $$DB_HOST;
        bench set-config -gp db_port $$DB_PORT;
        bench set-config -g redis_cache "redis://$$REDIS_CACHE";
        bench set-config -g redis_queue "redis://$$REDIS_QUEUE";
        bench set-config -g redis_socketio "redis://$$REDIS_QUEUE";
        bench set-config -gp socketio_port $$SOCKETIO_PORT;
    environment:
      DB_HOST: db
      DB_PORT: "3306"
      REDIS_CACHE: redis:6379/0
      REDIS_QUEUE: redis:6379/1
      SOCKETIO_PORT: "9000"
    volumes:
      - sites:/home/frappe/frappe-bench/sites
    networks:
      - erpnext-network
```

> `$$` disengaja — Compose meng-escape-nya menjadi `$` untuk shell di dalam container.

### 5b. Tambahkan dependensi ke `configurator`

Pada `backend`, `websocket`, `queue-default`, `queue-short`, `queue-long`, `scheduler`,
tambahkan di blok `depends_on` masing-masing:

```yaml
      configurator:
        condition: service_completed_successfully
```

`frontend` tidak perlu — ia sudah `depends_on: [backend, websocket]`.

### 5c. Tiga perapian

| Cari | Ganti |
|---|---|
| `image: redis:alpine` | `image: redis:8-alpine` |
| baris `MYSQL_DATABASE: _f4a1e28e28a8` | hapus |
| tiap blok `deploy:` / `restart_policy:` / `condition: always` | `restart: unless-stopped` |

Hapus juga baris `version: "3.8"` di paling atas.

### 5d. Validasi sintaks sebelum apply

```bash
cd /opt/erpnext && docker compose config > /dev/null && echo "COMPOSE OK"
```

**Gerbang:** keluar `COMPOSE OK`.

### 5e. Apply

```bash
cd /opt/erpnext && docker compose up -d --force-recreate
```

Tunggu 90 detik, lalu:

```bash
cd /opt/erpnext && docker compose ps
```

**Gerbang:** nol container berstatus `Restarting`. `configurator` boleh berstatus `Exited (0)` —
itu memang perilakunya.

Konfirmasi `apps.txt` sudah diregenerasi:

```bash
docker run --rm -v erpnext_sites:/data alpine cat /data/apps.txt
```

**Gerbang:** tiga baris, termasuk `erpnext_indonesia_localization`.

---

## Langkah 6 — Restart nginx (paling akhir)

nginx memegang IP backend basi. Langkah ini yang benar-benar menghapus 502.

```bash
cd /opt/erpnext && docker compose restart frontend
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/method/ping
```

**Gerbang:** `200`.

### Pemeriksaan pengaman `bench migrate`

Harus no-op karena versi image identik dengan yang diharapkan database.

```bash
cd /opt/erpnext && docker compose exec -T backend bench --site erpnext.local migrate
```

**Gerbang:** selesai tanpa error. Kalau ada patch yang benar-benar dijalankan, **STOP dan
lapor** — artinya asumsi versi meleset.

---

## Langkah 7 — Uji idempoten (gerbang sesungguhnya)

Inilah yang membuktikan akar masalah benar-benar hilang. Ulangi **dua kali**:

```bash
cd /opt/erpnext && docker compose down && docker compose up -d && sleep 90 && docker compose ps
```

**Gerbang:** setelah kedua siklus, nol container `Restarting`, dan:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/method/ping
```

masih `200`.

> Ingat: `down` tanpa `-v`. Jangan pernah tambahkan `-v`.

---

## Langkah 8 — Serahkan ke user untuk verifikasi data

Jangan tutup pekerjaan tanpa ini. Konteksnya: dashboard VibeAkuntan pernah menampilkan angka
yang salah tanpa gejala teknis apa pun — HTTP 200 tidak membuktikan pembukuan benar.

Minta user memeriksa **di layar**:

1. Login ke `erp.vibeakuntan.com` berhasil.
2. VibeAkuntan SPA di `erp.vibeakuntan.com/app` memuat data.
3. Menu Coretax / Faktur Pajak (dari Indonesia Localization) muncul dan bisa dibuka.
4. Angka Piutang & Kas/Bank di dashboard sama dengan sebelum insiden.

User sudah mengonfirmasi **nol transaksi** diinput antara 2026-08-10 21:00 dan sekarang, jadi
tidak ada data yang perlu diinput ulang.

---

## Rollback

Kalau langkah 5–7 gagal dan tidak bisa diselesaikan:

```bash
cd /opt/erpnext && cp compose.yaml.bak-20260811 compose.yaml && docker compose up -d --force-recreate
```

Ini mengembalikan ke keadaan sekarang (down, tapi terdefinisi) dalam ~1 menit. Database tidak
pernah disentuh sepanjang runbook, jadi tidak ada yang perlu di-restore.

Kegagalan katastrofik → restore snapshot VPS dari langkah 0a. **Hanya user yang boleh
menjalankannya**, dari panel Hostinger.

---

## Template laporan

Isi apa adanya. Kolom output tidak boleh kosong.

```
Langkah 0b Docker version : <output>
Langkah 0c Disk bebas     : <output>
Langkah 0e DB OK?         : <output>   (0f dijalankan? ya/tidak)
Langkah 1  Backup         : <output ls -l>
Langkah 2  apps.json      : <output json.tool>
Langkah 3  Build          : exit <code>, <15 baris terakhir>
Langkah 4  ls apps        : <output>
Langkah 4  Versi frappe   : <output>
Langkah 4  Versi erpnext  : <output>
Langkah 5d COMPOSE OK     : <output>
Langkah 5e compose ps     : <output penuh>
Langkah 5e apps.txt       : <output>
Langkah 6  HTTP code      : <output>
Langkah 6  bench migrate  : <output, sebut ada patch jalan atau tidak>
Langkah 7  Siklus 1       : <compose ps + HTTP code>
Langkah 7  Siklus 2       : <compose ps + HTTP code>

Gerbang yang gagal        : <sebutkan, atau "tidak ada">
Yang tidak dikerjakan     : <sebutkan>
```

Kalau ada langkah yang dilewati atau diimprovisasi, tulis di "Yang tidak dikerjakan" — itu
informasi yang berguna, bukan kegagalan.
