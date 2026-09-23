# BUL web

```bash
cp .env.example .env.local   # isi dari `npx supabase status` di apps/bul
npm install
npm run dev                  # http://localhost:5173
npm test
npm run build
```

Semua penulisan data lewat `panggilRpc` (`src/lib/rpc.js`). Uang dikirim sebagai string.
