# Setup di Laptop Baru

Langkah memulihkan workspace ini dari nol.

1. Install prasyarat: Git, Node 18+, Claude Code CLI, GitHub CLI (`gh`).
2. Clone repo:
   ```bash
   git clone https://github.com/manfredgunardi-star/starter-project.git
   cd starter-project
   ```
3. Install dependency tiap app:
   ```bash
   cd apps/sj-monitor && npm install && cd ../..
   cd apps/bul-monitor && npm install && cd ../..
   cd apps/bul-accounting && npm install && cd ../..
   cd apps/erp-acc/erp-app && npm install && cd ../../..
   ```
4. Pulihkan `.env` tiap app dari password manager (lihat `apps/<app>/.env.example` untuk daftar variabel).
   File env yang ada per 20 Jul 2026 (semua gitignored — wajib dibackup terpisah):
   - `apps/sj-monitor`: `.env`, `.env.local`, `.env.staging`
   - `apps/bul-monitor`: `.env`
   - `apps/bul-accounting`: (belum ada `.env`, hanya `.env.example`)
   - `apps/erp-acc/erp-app`: `.env`, `.env.test`
5. Pulihkan folder `_local/` (keys, dll) dari snapshot beku / secret manager. Lihat `_local/SECRETS.md`.
6. Proyek lama (jika diperlukan): `git checkout archive/side-projects-2026-06`.
7. Claude Code: pasang plugin yang dipakai. Folder auto-memory `~/.claude/projects/...` dibawa manual bila perlu.

## Verifikasi
```bash
cd apps/sj-monitor && npm run build   # harus sukses
```
