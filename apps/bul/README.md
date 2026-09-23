# BUL — aplikasi operasional + akuntansi

## Menjalankan database lokal

Prasyarat: Docker Desktop menyala, Node ≥ 22.

```bash
cd apps/bul
npm install
npx supabase start      # pertama kali mengunduh image Docker (beberapa GB)
npm run db:reset        # hapus objek aplikasi & terapkan ulang semua migrasi
npm run test:db         # seluruh tes database
```

`npm run db:reset` dan tes hanya mau berjalan terhadap `127.0.0.1`/`localhost`.
Frontend ada di `apps/bul/web` (lihat README di sana).
Operasional produksi, backup, dan restore: [docs/runbook.md](docs/runbook.md).
