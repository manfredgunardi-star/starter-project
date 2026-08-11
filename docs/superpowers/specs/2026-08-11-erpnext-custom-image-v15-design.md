# Desain: Custom Image ERPNext v15 untuk VPS `/opt/erpnext`

**Tanggal:** 2026-08-11
**Status:** Disetujui user, menunggu eksekusi
**Sistem:** ERPNext di VPS Hostinger `srv1696308` (187.77.112.171), `erp.vibeakuntan.com`
**Eksekutor:** SirJarvis (lihat runbook di `docs/runbooks/2026-08-11-erpnext-recovery-runbook.md`)

---

## 1. Latar: apa yang rusak dan kenapa

ERPNext down (HTTP 502) sejak percobaan upgrade v15 → v16 pada 2026-08-10/11.

Analisis ini dibuat dari data produksi langsung (Hostinger MCP, read-only): status container,
log 300-baris per service, isi `compose.yaml`, metrik VPS, dan daftar backup — bukan dari
laporan pihak ketiga.

### 1.1 Akar masalah: apps diinstall ke container yang fana

`compose.yaml` di `/opt/erpnext` hanya me-mount dua volume:

```
volumes:
  - sites:/home/frappe/frappe-bench/sites
  - logs:/home/frappe/frappe-bench/logs
```

Direktori `/home/frappe/frappe-bench/apps/` **tidak** punya volume. Source code app hidup di
dalam layer image. Apa pun yang di-`git clone` ke container yang sedang berjalan akan hilang
begitu container di-recreate.

`erpnext_indonesia_localization` dulu diinstall dengan cara itu. Berfungsi selama container
tidak pernah disentuh. Namanya tercatat permanen di dua tempat yang memang persisten:
`sites/apps.txt` (volume `sites`) dan tabel `tabInstalled Application` (database).

Saat container diganti — v15 → v16 → kembali ke image stock v15 — source code lenyap, tapi
kedua catatan itu tetap menyebutnya. Setiap proses Frappe memanggil `setup_module_map()` →
`importlib.import_module('erpnext_indonesia_localization')` → `ModuleNotFoundError` → proses
mati → `restart: always` → crash-loop.

Bukti dari log worker produksi:

```
frappe/__init__.py line 257, in init
  setup_module_map(...)
frappe/__init__.py line 1497, in get_module_list
  return get_file_items(get_app_path(app_name, "modules.txt"))
ModuleNotFoundError: No module named 'erpnext_indonesia_localization'
```

Kegagalan install tiga tema (`saas_theme`, `frappe_theme_studio`, `solvronix_desk`) di v16
adalah gejala penyakit yang sama, bukan penyakit terpisah.

### 1.2 Mengapa `configurator` adalah perbaikan strukturalnya

Compose resmi frappe_docker punya service `configurator` yang jalan di setiap boot:

```
ls -1 apps > sites/apps.txt;
bench set-config -g db_host $$DB_HOST;
...
```

Baris pertama meregenerasi `sites/apps.txt` dari isi `apps/` yang sebenarnya. Compose
tulis-tangan di `/opt/erpnext` tidak memilikinya. Dengan `configurator`, `apps.txt` selalu
turunan dari image — sumber kebenaran jadi tunggal, dan kelas kegagalan ini menjadi mustahil,
bukan sekadar lebih jarang.

### 1.3 Kerusakan turunan

| # | Gejala | Sebab |
|---|---|---|
| A | Worker & scheduler crash-loop | §1.1 |
| B | `(1045, "Access denied for user '_ebde57cb5cf2199a'@'172.18.0.5'")` | Grant DB tidak sinkron dengan `site_config.json` setelah restore. Berhenti muncul setelah restart 00:32 — status perlu diverifikasi ulang, bukan diasumsikan sudah beres |
| C | 502 walau backend "Up" | nginx memegang IP backend basi (`172.18.0.5`) selama 80 menit. Perlu restart `frontend` **setelah** backend sehat |

### 1.4 Yang terbukti **tidak** bersalah

- **RAM/swap/disk.** RAM stabil 3,3–3,9 GB dari 8 GB, disk 43 GB dari 100 GB, uptime 71 hari
  tanpa reboot. Nol OOM.
- **Upgrade v16 itu sendiri.** Migrate berhasil, semua patch lewat, HTTP 200. Yang membunuh
  sistem adalah tiga eksperimen tema di produksi setelahnya.
- **Python 3.14 di host.** Container memakai Python 3.11 dari image (terkonfirmasi di path
  traceback `env/lib/python3.11/`).
- **MariaDB 10.6.** Sanggup menjalankan migrasi v16 — terbukti.

---

## 2. Tujuan & non-tujuan

**Tujuan:** ERPNext v15 pulih, dan `docker compose up -d` berapa kali pun **selalu**
menghasilkan sistem utuh.

**Ukuran keberhasilan bukan HTTP 200.** Itu gejala. Ukurannya: `docker compose down` lalu
`up -d`, dua kali berturut-turut, nol container berstatus `Restarting`.

**Non-tujuan (sengaja dikecualikan, masing-masing pekerjaan terpisah):**

- Upgrade ke v16
- Instalasi tema apa pun
- Migrasi ke struktur compose resmi frappe_docker
- Operasi apa pun terhadap isi database
- Rotasi kredensial
- Tuning `GUNICORN_WORKERS` (saat ini 4 di `.env`; 2 vCPU lebih cocok 2–3)

---

## 3. Keputusan arsitektur

### D1 — Pertahankan `compose.yaml` tulis-tangan

Jangan migrasi ke compose resmi frappe_docker sekarang.

Volume `erpnext_sites` dan `erpnext_db-data` terikat pada nama project `erpnext` yang berasal
dari path `/opt/erpnext`. Migrasi struktur compose berisiko volume ter-rebind ke nama baru.
Database yang "hilang" saat outage adalah skenario terburuk yang bisa kita ciptakan sendiri.
Radius ledakan minimum sekarang; rapikan setelah sistem sehat.

### D2 — Pin semua versi ke keadaan yang database harapkan

Database hasil restore berasal dari backup `20260810_210020`, yaitu keadaan
frappe v15.49.1 + erpnext v15.45.1 + eil v1.4.1.

`apps.json`:

```json
[
  { "url": "https://github.com/frappe/erpnext", "branch": "v15.45.1" },
  { "url": "https://github.com/agile-technica/erpnext-indonesia-localization", "branch": "v1.4.1" }
]
```

Frappe framework lewat build arg `FRAPPE_BRANCH=v15.49.1`.

Nilai `FRAPPE_BRANCH` dipakai Containerfile untuk **dua hal sekaligus** — tag image
`frappe/base` + `frappe/build`, dan git ref pada `bench init --frappe-branch`:

```dockerfile
FROM ${FRAPPE_IMAGE_PREFIX}/build:${FRAPPE_BRANCH} AS builder
...
bench init ... --frappe-branch=${FRAPPE_BRANCH} --frappe-path=${FRAPPE_PATH}
```

Terverifikasi ada (2026-08-11):

| Artefak | Status |
|---|---|
| `frappe/base:v15.49.1` (Docker Hub) | ada |
| `frappe/build:v15.49.1` (Docker Hub) | ada |
| git tag `frappe/frappe@v15.49.1` | ada |
| git tag `frappe/erpnext@v15.45.1` | ada |
| git tag `agile-technica/erpnext-indonesia-localization@v1.4.1` | ada |
| Repo EIL publik (HTTP 200 anonim) | ya — tidak perlu token |

**Konsekuensi penting: pemulihan ini nol migrasi schema.** Versi app di image identik dengan
yang diharapkan database, jadi tidak ada patch yang jalan dan tidak ada perubahan struktur
tabel. `bench migrate` hanya berperan sebagai pemeriksaan pengaman yang seharusnya no-op.

### D3 — Tambahkan service `configurator`

Perbaikan permanen sesuai §1.2. Meregenerasi `sites/apps.txt` dari isi image di setiap boot,
dan menulis `db_host` / `redis_*` / `socketio_port` ke `common_site_config.json`.

Seluruh service Frappe lain memperoleh:

```yaml
depends_on:
  configurator:
    condition: service_completed_successfully
```

### D4 — Rapikan tiga utang teknis, tidak lebih

| Perubahan | Alasan |
|---|---|
| `redis:alpine` → `redis:8-alpine` | Pin ke major yang **sedang berjalan** (Redis 8.10.0). Menurunkan ke `redis:7` akan gagal memuat RDB tulisan Redis 8 |
| Hapus `MYSQL_DATABASE: _f4a1e28e28a8` | DB sisa site lama; site sebenarnya `_ebde57cb5cf2199a`. Hanya berefek saat volume kosong, tapi menyesatkan |
| `deploy.restart_policy` → `restart: unless-stopped` | `deploy.*` adalah kunci Swarm. `unless-stopped` juga mencegah crash-loop menyala sendiri setelah reboot |

`version: "3.8"` dihapus (diabaikan Compose v2). Image kustom diberi `pull_policy: never`
karena dibangun lokal dan tidak ada di registry.

### D5 — Backend nyala dulu, nginx paling akhir

Sesuai §1.3-C. Urutan restart adalah bagian dari desain, bukan detail eksekusi.

### D6 — Nol operasi terhadap database

Laporan awal mengusulkan pembersihan `tabInstalled Application`, `tabModule Def`, dan
`tabWorkspace`. **Ditolak.**

`erpnext_indonesia_localization` berisi Coretax XML exporter, faktur pajak, dan Indonesia
Taxes and Charges — data pajak riil. Menghapus jejaknya dari database untuk memperbaiki
masalah *source code* berarti menukar bug operasional dengan kerusakan data pajak.

Arahnya dibalik: **source code dikembalikan agar cocok dengan database**, bukan sebaliknya.

---

## 4. Urutan eksekusi & gerbang verifikasi

Gagal di gerbang mana pun = berhenti, jangan lanjut.

| # | Langkah | Gerbang |
|---|---|---|
| 0 | Snapshot VPS manual; cek `docker --version` ≥ 23.0 | Snapshot ada; Docker ≥ 23 |
| 1 | Backup `compose.yaml` + `.env` + `common_site_config.json` | File `.bak` ada |
| 2 | Tulis `apps.json`, clone frappe_docker | `jq . apps.json` valid |
| 3 | Build image (~20–40 menit) | Build exit 0 |
| 4 | **Verifikasi isi image sebelum dipakai** | `ls apps` persis: `frappe`, `erpnext`, `erpnext_indonesia_localization` |
| 5 | Edit compose (D2–D4), `up -d --force-recreate` | Nol container `Restarting` |
| 6 | Restart `frontend` | `curl` → HTTP 200 |
| 7 | **Uji idempoten:** `down` lalu `up -d`, dua kali | Tetap sehat — *ini gerbang sesungguhnya* |
| 8 | Verifikasi data oleh user di layar | Login, SPA `/app`, menu Coretax, angka Piutang & Kas/Bank |

Langkah 8 tidak bisa digantikan pemeriksaan teknis: dashboard VibeAkuntan pernah menampilkan
angka salah tanpa gejala teknis apa pun. HTTP 200 tidak membuktikan pembukuan benar.

Langkah 4 sengaja mendahului apa pun yang menyentuh produksi: build bisa "sukses" tapi
menghasilkan image tanpa app yang dimaksud — persis kegagalan yang sedang diperbaiki.

**Keputusan user:** tidak ada stopgap. Layanan dibiarkan down sampai perbaikan permanen
selesai; tidak ada clone app ke container berjalan sebagai tambal sementara.

---

## 5. Rollback

Ketiganya sudah tersedia sebelum langkah pertama dijalankan.

1. **Image lama masih di disk.** Jangan `docker image prune`. Kembalikan tag di compose,
   `up -d --force-recreate` → balik ke keadaan sekarang dalam ~1 menit.
2. **`compose.yaml.bak`** mengembalikan konfigurasi persis.
3. **Snapshot VPS** dari langkah 0, untuk kegagalan katastrofik.

Database tidak disentuh di seluruh rencana ini, jadi backup Frappe berperan sebagai jaring
pengaman pasif — bukan bagian dari alur.

Titik pulih tingkat VPS yang terverifikasi ada (kalau semuanya gagal):

| Backup ID | Waktu UTC | Waktu WIB |
|---|---|---|
| `47583237` | 2026-08-09 10:16 | 09 Agu 17:16 |
| `46647175` | 2026-08-02 00:04 | 02 Agu 07:04 |

Restore VPS mengembalikan **seluruh** VPS (ERPNext, VibeAkuntan, dan lima stack Docker lain)
dan hanya boleh dijalankan user dari panel Hostinger.

---

## 6. Risiko

| Risiko | Mitigasi |
|---|---|
| Docker < 23 → `--secret` gagal | Dicek di langkah 0. **Tidak ada jalur mundur:** `images/layered/Containerfile` terbaru hanya mendukung `--mount=type=secret,id=apps_json`; `APPS_JSON_BASE64` sudah dihapus. Tindakannya upgrade Docker Engine, lalu ulangi |
| Build 40 menit dengan ERPNext tetap down | Diterima secara eksplisit oleh user |
| Image ter-build tanpa app yang dimaksud | Gerbang langkah 4 |
| Disk penuh saat build | ~56 GB bebas dari 100 GB — cukup |
| Grant DB (§1.3-B) ternyata masih rusak | Didiagnosis di langkah 0 sebelum build; diperbaiki dengan password dibaca dari `site_config.json`, bukan diketik manual |
| `bench migrate` ternyata tidak no-op | **Berhenti dan lapor.** Menandakan asumsi versi di D2 meleset — jangan diterobos |

---

## 7. Pekerjaan lanjutan (di luar scope, jangan dikerjakan bersamaan)

Berurut prioritas:

1. **Rotasi kredensial.** `/opt/erpnext/.env` memuat `DB_ROOT_PASSWORD` dan `ADMIN_PASSWORD`
   polos, dan keduanya sudah tersebar lewat file laporan di Telegram. Mengulang pola insiden
   2026-08-06.
2. **`ALLOWED_HOSTS=*`** di `.env`, disertai komentar "RESTRICT IN PRODUCTION" yang tidak
   pernah dikerjakan.
3. **Upgrade v16** lewat stack staging terpisah (port 8081), bukan di produksi. `pyproject.toml`
   EIL menyatakan `frappe = ">=14.0.0,<17.0.0"` — v16 *dideklarasikan* kompatibel, tapi itu
   deklarasi yang divalidasi bench secara numerik, bukan bukti bahwa app-nya berjalan.
4. **Tema navy gelap** (Zahir/Accurate/Jurnal.id): lewat Custom CSS di Website Theme, atau di
   VibeAkuntan SPA yang sudah punya token aksen `#1B3A5B`. Tiga tema pihak ketiga sudah gagal,
   dua di antaranya merusak produksi.
5. **Tuning `GUNICORN_WORKERS`** 4 → 2–3 untuk 2 vCPU.
6. **Verifikasi Python 3.14 host** tidak menggeser `python3` sistem (bisa merusak `apt`).

---

## 8. Catatan dampak

ERPNext down berarti **VibeAkuntan SPA di `erp.vibeakuntan.com/app` juga mati** — proxy Express
di `/opt/vibeakuntan-app/` bergantung penuh pada API ERPNext ini. Dua sistem, satu perbaikan.
