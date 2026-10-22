# sj-tools

Tool tetap untuk **Hermes Agent** di VPS. Tool ini membuat rekap Surat Jalan dari sj-monitor (Firestore, **read-only**), menyimpannya sebagai Excel, lalu mengirim file itu langsung ke Telegram Memen. Hermes hanya menerima **ringkasan**.

- Login sebagai **user Firebase Auth biasa** (client SDK), sehingga `firestore.rules` sj-monitor tetap berlaku. Admin SDK dan service account tidak dipakai.
- Nama koleksi, query, dan format Excel ditulis tetap di kode. LLM hanya mengisi parameter.
- Latar belakang dan temuan lengkap (Fase 0) ada di catatan discovery **privat**, sengaja tidak di repo karena repo ini publik dan catatan itu memuat detail keamanan VPS. Salinan lokal: `C:\Project\_local\sj-tools\DISCOVERY.md` (folder `_local/` diabaikan git).

## Isi

| File | Fungsi |
|---|---|
| `src/rekap.js` | Validasi parameter, filter, susun xlsx (19 kolom seperti export di app + baris TOTAL), orkestrasi kirim + audit. Fungsi murni, dites. |
| `src/firebase.js` | Muat `.env`, login bot, query `surat_jalan` per halaman (maks 20.000 dokumen), uji tolak tulis. |
| `src/telegram.js` | `sendDocument` via Bot API (tidak bentrok dengan polling Hermes). Error jaringan dicoba ulang 1x setelah 3 detik; error HTTP tidak diulang. |
| `src/mcp-server.js` | MCP server stdio, satu tool: `rekap_pengiriman`. |
| `src/cli.js` | Entrypoint tanpa LLM untuk timer dan uji manual. |
| `test/` | `npm test` (node:test, tanpa jaringan dan tanpa `.env` asli). |

## Tool MCP `rekap_pengiriman`

| Parameter | Wajib | Keterangan |
|---|---|---|
| `tgl_awal` | ya | `YYYY-MM-DD`, tanggal SJ (`tanggalSJ`) awal, inklusif |
| `tgl_akhir` | ya | `YYYY-MM-DD`, inklusif. Tidak boleh di masa depan (WIB). Rentang ≤ 366 hari |
| `rute` | tidak | Cocok persis dengan `rute` (abaikan spasi tepi dan huruf besar/kecil) |
| `pt` | tidak | Cocok persis dengan `pt` |

- SJ ber-`deletedAt` dan SJ `isActive: false` (termasuk status **gagal**) tidak ikut, sama seperti di app.
- File `Rekap_SJ_<tgl_awal>_sd_<tgl_akhir>.xlsx` dikirim langsung dari memori ke `TELEGRAM_CHAT_ID`, tanpa file sementara di disk.
- Nilai yang dikembalikan ke Hermes:
  ```json
  {"periode":"2026-10-01 s/d 2026-10-15","filter":{"rute":null,"pt":null},"jumlah_sj":123,"total_uang_jalan":4560000,"nama_file":"Rekap_SJ_2026-10-01_sd_2026-10-15.xlsx","terkirim":true}
  ```
- Audit: setiap panggilan (MCP maupun CLI) ditulis ke `logs/audit.log` (JSON per baris): waktu, sumber, parameter, jumlah baris, dan status/error. Tanpa data SJ.

## Perintah CLI

```bash
node src/cli.js rekap --dari 2026-10-01 --sampai 2026-10-15 [--rute "NAMA"] [--pt "NAMA"]
node src/cli.js rekap --minggu-lalu      # Senin–Minggu minggu lalu (WIB)
node src/cli.js uji-tolak-tulis          # bukti rules: write bot ke surat_jalan harus ditolak
```

`uji-tolak-tulis` memanggil `updateDoc` ke dokumen `surat_jalan/uji-tolak-tulis-bot` yang **tidak ada**. Hasil yang diharapkan: `{"ditolak":true,"kode":"permission-denied"}`. Kalau rules ternyata mengizinkan, Firestore membalas `not-found` dan tidak ada dokumen yang dibuat, karena `updateDoc` tidak pernah membuat dokumen baru.

## Pengembangan lokal

```bash
npm ci
npm test
```

---

## Pemasangan di VPS

> Setiap langkah di bawah adalah **titik stop** (handoff §6): dijalankan hanya setelah Memen menyetujui. Contoh di sini memakai opsi yang disarankan di catatan discovery: user sistem `sjtools`. Untuk opsi root, ganti `/home/sjtools/sj-tools` dengan `/root/sj-tools` dan buang `runuser -u sjtools --` serta `User=sjtools`.

### 1. User dan kode

```bash
# di VPS (root)
useradd --system --create-home --home-dir /home/sjtools --shell /usr/sbin/nologin sjtools
```

```bash
# dari Windows (Git Bash): salin kode tanpa node_modules / .env / logs
tar --exclude=node_modules --exclude=.env --exclude=logs -czf - -C /c/Project/apps sj-tools | ssh vps-claude 'tar xzf - -C /home/sjtools && chown -R sjtools:sjtools /home/sjtools/sj-tools'
```

```bash
# di VPS (root)
cd /home/sjtools/sj-tools && runuser -u sjtools -- npm ci --omit=dev
```

### 2. `.env` (diisi Memen)

```bash
cp /home/sjtools/sj-tools/.env.example /home/sjtools/sj-tools/.env
nano /home/sjtools/sj-tools/.env
chown sjtools:sjtools /home/sjtools/sj-tools/.env && chmod 600 /home/sjtools/sj-tools/.env
```

### 3. Uji manual (kriteria 1 dan 4)

```bash
cd /home/sjtools/sj-tools
runuser -u sjtools -- node src/cli.js uji-tolak-tulis
runuser -u sjtools -- node src/cli.js rekap --dari 2026-10-01 --sampai 2026-10-15
```

### 4. Jadwal mingguan tanpa LLM (systemd, karena cron Ubuntu tidak mendukung TZ)

`/etc/systemd/system/sj-rekap-mingguan.service`

```ini
[Unit]
Description=sj-tools: rekap Surat Jalan minggu lalu ke Telegram
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=sjtools
Environment=HOME=/home/sjtools
WorkingDirectory=/home/sjtools/sj-tools
ExecStart=/usr/bin/node src/cli.js rekap --minggu-lalu
TimeoutStartSec=5min
```

`/etc/systemd/system/sj-rekap-mingguan.timer`

```ini
[Unit]
Description=Setiap Senin 07:30 WIB

[Timer]
OnCalendar=Mon *-*-* 07:30:00 Asia/Jakarta
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl start sj-rekap-mingguan.service      # uji sekali (kriteria 3)
journalctl -u sj-rekap-mingguan.service -n 20 --no-pager
systemctl enable --now sj-rekap-mingguan.timer # aktifkan jadwal (titik stop terpisah)
systemctl list-timers sj-rekap-mingguan.timer
```

### 5. Daftarkan ke Hermes (kriteria 2)

Format sudah diverifikasi dari `/root/hermes-agent/tools/mcp_tool.py` (Hermes v0.20.5). Backup dulu:

```bash
cp /root/.hermes/config.yaml /root/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)
```

Tambahkan key tingkat atas berikut ke `/root/.hermes/config.yaml`:

```yaml
mcp_servers:
  sj_tools:
    command: "/usr/sbin/runuser"
    args: ["-u", "sjtools", "--", "/usr/bin/node", "/home/sjtools/sj-tools/src/mcp-server.js"]
    cwd: "/home/sjtools/sj-tools"
    timeout: 180
    connect_timeout: 60
    tools:
      include: [rekap_pengiriman]
      prompts: false
      resources: false
```

Rahasia **tidak** ditaruh di `env:`; tool membaca `.env` miliknya sendiri. Setelah disimpan, kirim `/reload-mcp` ke bot Hermes di Telegram (tanpa restart gateway). Lalu uji: "rekap pengiriman 1–15 Oktober 2026". Yang diharapkan: file sama dengan hasil langkah 3 terkirim, dan balasan Hermes hanya berisi ringkasan.

Allowlist Telegram Hermes **sudah** `TELEGRAM_ALLOWED_USERS=<chat-id-memen>` (satu user), tidak perlu diubah. Nilai yang sama dipakai untuk `TELEGRAM_CHAT_ID` di `.env` sj-tools.

### Mencabut akses

- **Disable** akun bot di Firebase Authentication. Mengubah `isActive` di `users` tidak cukup, karena rules tidak memeriksanya.
- Hapus entri `sj_tools` dari `config.yaml`, lalu `/reload-mcp`.
- `systemctl disable --now sj-rekap-mingguan.timer`.
