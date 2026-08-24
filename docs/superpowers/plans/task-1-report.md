# Task 1 Report: Helper piutang bersih + jalur tulis approve

**Status:** DONE

## Commits

- `187dc5b`: `fix(bul-accounting): record net receivable after uang jalan on bridge invoices`

## Test Summary

All tests pass:

```
Test Files  9 passed (9)
Tests  87 passed (87)
```

- `invoiceAmounts.test.js`: 10 test ✓ (resolvePiutangNet + describeInvoiceGross)
- `integrationInvoiceNet.test.js`: 3 test ✓ (approveIntegrationItem jalur invoice)
- Existing 74 test di folder `__tests__/`: tetap pass (no regresi)

## Build Summary

```
✓ built in 18.07s
```

Build sukses tanpa error. Warning tentang chunk size adalah config issue yang sudah ada sebelumnya dan bukan blocker.

## Implementation Details

### File Created
1. **`apps/bul-accounting/src/utils/invoiceAmounts.js`** (47 baris)
   - `resolvePiutangNet(item)`: Resolves net receivable dengan fallback chain
     - Prioritas: `piutangNet` (jika number finite) → `totalNilai - totalUJ` → `totalNilai`
     - Mengembalikan 0 untuk input kosong
   - `describeInvoiceGross(invoice)`: Returns `{ gross, uj }` untuk rincian display
     - Null jika tidak ada `totalUJ` atau `amountGross` belum di-backfill
   - Modul murni: tanpa I/O, tanpa firebase import, bisa dipakai ulang di runner backfill

2. **`apps/bul-accounting/src/utils/__tests__/invoiceAmounts.test.js`** (120 baris)
   - 6 test untuk `resolvePiutangNet` mencakup: fallback chain, nilai negatif, input kosong
   - 4 test untuk `describeInvoiceGross` mencakup: rincian ada, manual invoice, backfill pending

3. **`apps/bul-accounting/src/utils/__tests__/integrationInvoiceNet.test.js`** (80 baris)
   - 3 test untuk `approveIntegrationItem` jalur invoice:
     - Menyimpan amount bersih (7844060) bukan bruto (12324060)
     - Fallback ke selisih manual saat piutangNet tidak ada
     - Menyimpan totalUJ 0 untuk invoice tanpa uang jalan

### File Modified
1. **`apps/bul-accounting/src/utils/integrationUtils.js`**
   - Import: `import { resolvePiutangNet } from './invoiceAmounts'`
   - Blok invoice (line 108-125): Ubah saveInvoice call untuk menulis 3 field:
     - `amount: resolvePiutangNet(item)` — net receivable
     - `amountGross: Number(item.totalNilai) || 0` — bruto
     - `totalUJ: Number(item.totalUJ) || 0` — potongan uang jalan
   - Tambah komentar Bahasa Indonesia menjelaskan alasan perubahan

## Self-Review

1. **Correctness**: Logic resolvePiutangNet sesuai spec D2 (fallback chain urutan persis)
2. **Type checking**: Cek `typeof item?.piutangNet === 'number'` sebelum `Number.isFinite()` untuk menangani `null`
3. **Coverage**: Test mencakup edge case (null, NaN, negatif, kosong)
4. **Integration**: Mock di test file menggunakan vi.mock untuk isolasi sempurna
5. **Naming**: Indonesian untuk comment/pesan, English untuk commit (sesuai convention)
6. **No breaking changes**: Field baru ditambah, jalur lama tidak dihapus; existing test tetap pass

## Known Limitations

- File `integrationUtils.js` masih memakai "tentative" logic di tempat lain (misalnya handling `pelangganData`), tetapi Task 1 scope hanya modify blok invoice (line 108-125) sesuai spec
- Backfill runner (Task 4) belum ada; Task 1 murni untuk alur approve forward-going
- Perubahan ini tidak menyentuh jurnal atau COA, hanya subledger `invoices.amount`

## Next Steps

- Task 1 ready for review by `sonnet` reviewer
- After approval: Task 2 (tampilkan rincian di halaman Penjualan) dapat dimulai
- Task 3-4 menunggu Task 1 approval (dependency: import dari invoiceAmounts.js)

---

**Generated:** 2026-08-24  
**Implementer:** Claude Haiku 4.5  
**Branch:** `claude/bul-accounting-journal-docs-fb16b0`
