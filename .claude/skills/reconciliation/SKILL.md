---
name: reconciliation
description: Use untuk analisa rekonsiliasi kas/bank di bul-accounting atau erp-acc - bandingkan saldo buku vs mutasi, identifikasi selisih. READ-ONLY, tidak menulis jurnal, tidak mengubah debit/kredit.
---

# Reconciliation (Kas/Bank) — READ-ONLY

## Guardrail (WAJIB)
- TIDAK menyentuh logika debit/kredit, COA, PPN/PPh, harga rute, uang muka.
- TIDAK menulis ke Firestore/Supabase. Hanya membaca & melaporkan.
- Untuk perubahan apa pun pada angka uang: STOP & minta user (lihat CLAUDE.md "Finance / Accounting Guardrails").

## Metodologi (boleh rujuk skill bawaan finance:reconciliation untuk template)
1. Ambil saldo GL akun kas/bank (KasBankPage / COA).
2. Ambil mutasi periode (transaksi kas/bank).
3. Cocokkan: tandai matched, unmatched-book, unmatched-statement.
4. Hitung selisih = saldo buku - saldo mutasi; jelaskan reconciling items.
5. Output laporan ringkas (tabel), BUKAN perubahan data.

## Modul terkait
- bul-accounting: KasBankPage.jsx, COAPage.jsx, JurnalPage.jsx
- erp-acc: laporan + rekening jurnal
