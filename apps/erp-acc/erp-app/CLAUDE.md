# CLAUDE.md — ERP-ACC

Instruksi Claude khusus `C:\Project\apps\erp-acc\erp-app`. Root `CLAUDE.md` tetap berlaku.

## Stack and Domain

React/Vite dengan Ant Design, Supabase Auth/Postgres/RLS/RPC, dan Vercel. Domain mencakup penjualan, pembelian, inventory, jurnal, kas/bank, invoice, payment, goods receipt/delivery, serta sales/purchase returns.

## Critical Invariants

- Debit/kredit setiap jurnal harus balance.
- Stock movement dan journal posting harus konsisten, atomic sejauh desain database, dan idempotent.
- Posted/closed transaction tidak boleh diubah atau dihapus tanpa flow reversal/cancel yang disetujui.
- Supabase RLS/RPC adalah security boundary; pengecekan UI saja tidak cukup.
- Migration harus additive/reversible bila layak, ditinjau terpisah, dan tidak dijalankan ke remote tanpa otorisasi.
- Frontend tidak boleh memakai service-role key.

## Protected Areas

Minta persetujuan user sebelum financial logic, stock valuation, posting, tax, reconciliation, schema, migration, RPC, RLS, auth, role, audit trigger, seed/master data, atau production environment berubah.

## Validation

```powershell
cd C:\Project\apps\erp-acc\erp-app
npm run lint
npm run build
```

Jalankan Playwright, RLS/RPC review, atau migration review sesuai scope. Production deployment dan remote migration dilarang dalam workflow standar.

## Collaboration

Satu implementer per worktree; reviewer read-only. Temuan financial/security yang belum disetujui menjadi `needs_user_decision`.
