## Task 2: Tampilkan rincian bruto dan uang jalan di halaman Penjualan

**Status:** DONE

**Commits:**
- `252991b` — feat(bul-accounting): show gross and uang jalan breakdown on sales invoices

**Test summary:**
```
 Test Files  10 passed (10)
      Tests  100 passed (100)
   Duration  3.73s
```
All tests passing. No regressions detected.

**Build summary:**
```
✓ built in 8.33s
```
Build successful. Chunk size warnings are pre-existing (not caused by this task).

**Self-review:**

Implementasi Task 2 selesai sempurna sesuai rencana:

1. ✓ **Step 1 — Import:** Tambahkan `import { describeInvoiceGross } from '../utils/invoiceAmounts'` setelah blok import kasAccounts.

2. ✓ **Step 2 — Modal pembayaran:** Sisipkan rincian bruto/UJ setelah blok "Total tagihan" (baris ~220):
   - Menampilkan: "Bruto [jumlah] − uang jalan ([jumlah])" dalam text-xs text-brand-500
   - Conditional: hanya tampil jika `describeInvoiceGross(invoice)` return non-null

3. ✓ **Step 3 — Kartu invoice:** Sisipkan rincian bruto/UJ setelah span amount di list invoice (baris ~435):
   - Menampilkan: "Bruto [jumlah] − UJ [jumlah]" dalam text-xs text-gray-500
   - Conditional: hanya tampil jika `describeInvoiceGross(inv)` return non-null

**Catatan teknis:**
- Kedua rincian menggunakan helper `describeInvoiceGross()` dari Task 1, yang mengembalikan `null` untuk:
  - Invoice manual tanpa uang jalan (totalUJ ≤ 0)
  - Invoice bridge yang belum di-backfill (amountGross tidak terisi)
- Ini memastikan rincian hanya tampil untuk invoice yang benar-benar punya potongan uang jalan dan sudah di-backfill.
- Helper murni, tanpa I/O — aman untuk dipanggil berulang kali di render React.

**Next:** Ready for review. Task 3 dapat dimulai setelah review lolos.
