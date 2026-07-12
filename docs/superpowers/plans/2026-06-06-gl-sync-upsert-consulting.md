# BUL-Accounting General Ledger Upsert and Consultant Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah sinkronisasi BUL-Accounting menjadi incremental upsert General Ledger yang benar dan menyediakan tab analisis konsultan yang dihitung dari kondisi Firestore terkini.

**Architecture:** Pisahkan transformasi data murni dari akses Firestore dan Google Sheets agar seluruh aturan dapat diuji dengan Node.js built-in test runner. General Ledger melakukan upsert berdasarkan `Journal ID` lengkap dengan row deletion descending, sedangkan tab laporan turunan menggunakan full refresh harian. Entry point tetap `scripts/gl-sync/index.js` dan workflow production tidak dijalankan oleh implementasi ini.

**Tech Stack:** Node.js 20 CommonJS, `node:test`, `@google-cloud/firestore`, Google Sheets API v4, GitHub Actions.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/gl-sync/lib/account-map.js` | Parse COA bawaan, gabungkan COA custom, dan lookup nama/saldo normal |
| `scripts/gl-sync/lib/general-ledger.js` | Schema dan row builder General Ledger serta perhitungan row deletion |
| `scripts/gl-sync/lib/consultant-reports.js` | Builder seluruh tab analisis konsultan |
| `scripts/gl-sync/lib/sheet-operations.js` | Operasi Google Sheets terinjeksi: ensure sheet/header, replace, append, upsert |
| `scripts/gl-sync/index.js` | Query Firestore, orkestrasi mode daily/full sync, logging |
| `scripts/gl-sync/test/account-map.test.js` | Test account lookup |
| `scripts/gl-sync/test/general-ledger.test.js` | Test schema, flat rows, soft delete, dan deletion request |
| `scripts/gl-sync/test/consultant-reports.test.js` | Test tab analisis konsultan |
| `scripts/gl-sync/test/sheet-operations.test.js` | Test dry run, migration guard, replace, dan upsert |
| `scripts/gl-sync/test/sync-runner.test.js` | Test orkestrasi end-to-end dengan fake Firestore/Sheets |
| `scripts/gl-sync/README.md` | Runbook dry run, full sync migrasi, daily upsert, dan validasi |
| `.github/workflows/gl-sync.yml` | Penjelasan input workflow dan perintah test |

## Subagent Allocation

| Task | Role / Model Class | Effort | Reason |
|---|---|---:|---|
| Task 1 | Fast implementation model | Medium | Pure parsing dan lookup dengan kontrak terisolasi |
| Task 2 | Standard implementation model | High | Integrasi schema, Google Sheets row deletion, dan migration guard |
| Task 3 | Standard implementation model | High | Banyak perhitungan laporan yang harus konsisten dan mudah diaudit |
| Task 4 | Most capable implementation model | High | Orkestrasi lintas Firestore, Sheets, full sync, daily sync, dan dry run |
| Task 5 | Most capable review/fix model | High | Audit lintas requirement, regresi, dan kesiapan rollout |

Setiap task wajib melalui:

1. implementer subagent dengan TDD;
2. spec-compliance reviewer;
3. code-quality reviewer;
4. perbaikan dan re-review sampai disetujui.

### Task 1: Account Map and Test Harness

**Files:**
- Create: `scripts/gl-sync/lib/account-map.js`
- Create: `scripts/gl-sync/test/account-map.test.js`
- Modify: `scripts/gl-sync/package.json`

- [ ] **Step 1: Add the Node test command**

Ubah scripts pada `scripts/gl-sync/package.json` menjadi:

```json
"scripts": {
  "start": "node index.js",
  "test": "node --test test/*.test.js"
}
```

- [ ] **Step 2: Write failing account-map tests**

Tambahkan test yang membuktikan:

```js
test('parseBuiltinAccounts reads code, name, and normal balance', () => {
  const source = `export const COA = [
    { code: "1111", name: "Kas Kecil", type: "detail", normalBalance: "debit" },
    { code: "4100", name: "Pendapatan Usaha", type: "detail", normalBalance: "credit" },
  ]`
  assert.deepEqual(parseBuiltinAccounts(source), [
    { code: '1111', name: 'Kas Kecil', normalBalance: 'debit' },
    { code: '4100', name: 'Pendapatan Usaha', normalBalance: 'credit' },
  ])
})

test('custom active and inactive accounts override builtin names', () => {
  const map = buildAccountMap(
    [{ code: '1111', name: 'Kas Kecil', normalBalance: 'debit' }],
    [{ code: '1111', name: 'Kas Operasional', status: 'active' }, { code: '9999', name: 'Deleted', status: 'deleted' }]
  )
  assert.equal(map.get('1111').name, 'Kas Operasional')
  assert.equal(map.has('9999'), false)
})

test('resolveAccount returns an explicit missing-account label', () => {
  assert.deepEqual(resolveAccount('9998', new Map()), {
    code: '9998',
    name: '[Akun tidak ditemukan: 9998]',
    normalBalance: 'debit',
    missing: true,
  })
})
```

- [ ] **Step 3: Run tests and confirm RED**

Run: `npm test`

Expected: FAIL karena `lib/account-map.js` belum tersedia.

- [ ] **Step 4: Implement account parsing and lookup**

Export fungsi berikut:

```js
function inferNormalBalance(code) {
  return ['2', '3', '4', '7'].includes(String(code).charAt(0)) ? 'credit' : 'debit'
}

function parseBuiltinAccounts(source) {
  const accounts = []
  const objectPattern = /\{[^{}]*code:\s*["']([^"']+)["'][^{}]*name:\s*["']([^"']+)["'][^{}]*\}/g
  for (const match of source.matchAll(objectPattern)) {
    const normal = match[0].match(/normalBalance:\s*["'](debit|credit)["']/)?.[1]
    accounts.push({ code: match[1], name: match[2], normalBalance: normal || inferNormalBalance(match[1]) })
  }
  return accounts
}
```

`buildAccountMap()` harus mengabaikan custom account `status === "deleted"` dan custom account harus menimpa kode bawaan yang sama. `loadBuiltinAccounts()` membaca `apps/bul-accounting/src/data/chartOfAccounts.js` relatif terhadap root repo.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm test`

Expected: seluruh test Task 1 PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/gl-sync/package.json scripts/gl-sync/lib/account-map.js scripts/gl-sync/test/account-map.test.js
git commit -m "feat(gl-sync): add account lookup service"
```

### Task 2: Flat General Ledger and Incremental Upsert

**Files:**
- Create: `scripts/gl-sync/lib/general-ledger.js`
- Create: `scripts/gl-sync/lib/sheet-operations.js`
- Create: `scripts/gl-sync/test/general-ledger.test.js`
- Create: `scripts/gl-sync/test/sheet-operations.test.js`

- [ ] **Step 1: Write failing General Ledger row tests**

Test harus membuktikan satu baris jurnal menghasilkan satu baris flat dengan seluruh metadata:

```js
test('buildGLRows repeats metadata and uses line keterangan as Deskripsi', () => {
  const rows = buildGLRows([journal], accountMap, '06/06/2026 00.00.00')
  assert.equal(rows.length, 2)
  assert.equal(rows[0][1], 'journal-full-id')
  assert.equal(rows[0][3], 1)
  assert.equal(rows[0][5], 'Penyusutan HINO B 9999')
  assert.equal(rows[0][8], 'Penyusutan Truck')
  assert.equal(rows[1][5], 'Akumulasi penyusutan HINO B 9999')
  assert.equal(rows[1][11], 'Aktif')
})

test('buildGLRows keeps deleted journals with Dihapus status', () => {
  const rows = buildGLRows([{ ...journal, status: 'deleted' }], accountMap, syncTime)
  assert.ok(rows.every(row => row[11] === 'Dihapus'))
})
```

Header harus persis:

```js
[
  'Tanggal', 'Journal ID', 'No. Jurnal', 'Urutan Baris', 'Jenis Jurnal',
  'Deskripsi', 'Truck', 'Kode Akun', 'Nama Akun', 'Debit (Rp)', 'Kredit (Rp)',
  'Status', 'Dibuat Oleh', 'Dibuat Pada', 'Terakhir Diubah', 'Waktu Sync (WIB)'
]
```

- [ ] **Step 2: Write failing deletion-request tests**

```js
test('buildJournalDeleteRequests groups matching rows and deletes descending', () => {
  const requests = buildJournalDeleteRequests(existingRows, new Set(['j-a', 'j-b']), 123)
  assert.deepEqual(requests.map(r => r.deleteDimension.range), [
    { sheetId: 123, dimension: 'ROWS', startIndex: 5, endIndex: 7 },
    { sheetId: 123, dimension: 'ROWS', startIndex: 1, endIndex: 3 },
  ])
})
```

Indeks Google Sheets bersifat zero-based dan header pada row 1 tidak boleh terhapus.

- [ ] **Step 3: Write failing sheet-operation tests**

Test fake Sheets API untuk membuktikan:

- daily sync dengan header lama melempar error yang meminta `FULL_SYNC`;
- `FULL_SYNC` memperbarui header, membersihkan data, lalu append seluruh row;
- daily upsert membaca existing rows, menghapus baris jurnal terdampak, lalu append versi terbaru;
- `DRY_RUN` tidak memanggil method write, clear, batchUpdate, atau append;
- sheet yang belum ada dibuat sebelum header ditulis.

- [ ] **Step 4: Run tests and confirm RED**

Run: `npm test`

Expected: FAIL karena modul General Ledger dan sheet operations belum tersedia.

- [ ] **Step 5: Implement General Ledger pure functions**

`buildGLRows(journals, accountMap, syncTimestamp)` harus:

- tidak menambah separator;
- memakai ID dokumen lengkap dari `_docId || id`;
- memakai `line.keterangan || ""` sebagai Deskripsi;
- memakai `line.truckId || journal.truckId || "-"`;
- resolve nama akun melalui `resolveAccount`;
- mengulang metadata di setiap row;
- mempertahankan angka debit/kredit sebagai number atau string kosong untuk nol.

`buildJournalDeleteRequests()` harus menemukan `Journal ID` pada kolom kedua, menggabungkan row berurutan, dan menghasilkan delete request descending.

- [ ] **Step 6: Implement injected Sheet operations**

Export:

```js
async function ensureSheetsAndHeaders({ sheets, spreadsheetId, schemas, fullSync, dryRun })
async function replaceSheet({ sheets, spreadsheetId, sheetName, rows, dryRun })
async function upsertGeneralLedger({ sheets, spreadsheetId, rows, journalIds, sheetId, dryRun })
```

Semua write harus melewati guard `dryRun`. `ensureSheetsAndHeaders` harus membandingkan header saat ini dengan schema; mismatch pada General Ledger daily sync wajib error, sedangkan `fullSync` boleh memperbarui header.

- [ ] **Step 7: Run tests and confirm GREEN**

Run: `npm test`

Expected: seluruh test Task 1-2 PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add scripts/gl-sync/lib/general-ledger.js scripts/gl-sync/lib/sheet-operations.js scripts/gl-sync/test/general-ledger.test.js scripts/gl-sync/test/sheet-operations.test.js
git commit -m "feat(gl-sync): upsert flat general ledger rows"
```

### Task 3: Consultant Report Builders

**Files:**
- Create: `scripts/gl-sync/lib/consultant-reports.js`
- Create: `scripts/gl-sync/test/consultant-reports.test.js`

Task ini menghasilkan schema dan baris untuk sheet `Review Jurnal`, `Trial Balance Bulanan`, `Laba Rugi Bulanan`, `Neraca Bulanan`, `Aging Piutang`, `Profitabilitas Truck`, `Daftar Aset`, dan `Rekonsiliasi Kas Bank`.

- [ ] **Step 1: Write failing review and trial-balance tests**

Test `buildJournalReviewRows()` untuk jurnal tidak balance, akun hilang, keterangan kosong, deleted, dan duplikat potensial.

Test `buildMonthlyTrialBalanceRows()` dengan transaksi Januari dan Februari:

```js
assert.deepEqual(febCash, [
  '2026-02', '1111', 'Kas Kecil', 'debit',
  1000000, 250000, 100000, 1150000,
])
```

- [ ] **Step 2: Write failing financial and operational report tests**

Tambahkan test untuk:

- `buildMonthlyIncomeStatementRows()` hanya menghitung akun 4/5/6/7/8;
- `buildMonthlyBalanceSheetRows()` hanya menghitung akun 1/2/3 dan membawa saldo kumulatif;
- `buildAgingReceivableRows()` menghitung payments, outstanding, umur, dan bucket;
- `buildTruckProfitabilityRows()` mengelompokkan revenue, expense, dan tanpa truck;
- `buildAssetRows()` menghitung estimasi akumulasi penyusutan dan nilai buku;
- `buildCashBankReconciliationRows()` menghitung saldo berjalan per akun `111*`.

- [ ] **Step 3: Run tests and confirm RED**

Run: `npm test`

Expected: FAIL karena `lib/consultant-reports.js` belum tersedia.

- [ ] **Step 4: Implement report schemas and builders**

Export `CONSULTANT_SCHEMAS` serta seluruh builder. Semua builder angka laporan wajib terlebih dahulu memfilter:

```js
const postedJournals = journals.filter(journal => journal.status === 'posted')
```

Setiap builder mengembalikan array baris dengan urutan kolom yang persis sama dengan schema sheet terkait. Gunakan helper internal yang sama untuk flatten journal lines agar perhitungan konsisten. Sorting harus deterministik berdasarkan bulan/tanggal, kode akun, Journal ID, dan urutan baris.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm test`

Expected: seluruh test Task 1-3 PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/gl-sync/lib/consultant-reports.js scripts/gl-sync/test/consultant-reports.test.js
git commit -m "feat(gl-sync): add consultant accounting sheets"
```

### Task 4: Firestore and Sheets Orchestration

**Files:**
- Modify: `scripts/gl-sync/index.js`
- Create: `scripts/gl-sync/test/sync-runner.test.js`
- Modify: `.github/workflows/gl-sync.yml`
- Create: `scripts/gl-sync/README.md`

- [ ] **Step 1: Write failing orchestration tests**

Gunakan dependency injection untuk fake `db`, `sheets`, `clock`, dan `logger`. Test minimal:

```js
test('daily sync upserts union of created and audited journal ids', async () => {
  const result = await createSyncRunner(fakeDependencies).run({ fullSync: false, dryRun: false })
  assert.deepEqual(result.upsertedJournalIds.sort(), ['created-id', 'deleted-id', 'updated-id'])
})

test('daily sync refreshes consultant sheets even when no journals changed', async () => {
  await createSyncRunner(fakeDependenciesWithoutActivity).run({ fullSync: false, dryRun: false })
  assert.ok(replacedSheets.includes('Aging Piutang'))
})

test('dry run performs reads and transformations without any Sheets writes', async () => {
  await createSyncRunner(fakeDependencies).run({ fullSync: true, dryRun: true })
  assert.equal(fakeSheets.writeCalls.length, 0)
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test`

Expected: FAIL karena entry point belum mengekspor runner terinjeksi.

- [ ] **Step 3: Refactor Firestore queries into injected helpers**

Implementasikan query:

- created journals pada range WIB;
- audit entries update/delete pada range WIB;
- current journal documents berdasarkan union ID;
- seluruh journals, `coa`, `invoices`, `assets`, dan `trucks` untuk laporan;
- seluruh audit entries pada full sync.

Daily sync tidak boleh hanya mencari `updatedAt`; audit log adalah sumber ID jurnal perubahan agar kompatibel dengan data historis.

- [ ] **Step 4: Implement orchestration**

`createSyncRunner(dependencies).run({ fullSync, dryRun })` harus:

1. menentukan tanggal/range;
2. memuat COA bawaan dan custom;
3. memastikan seluruh sheet/header;
4. pada full sync, replace General Ledger dan Audit Log;
5. pada daily sync, upsert union jurnal baru/diubah/dihapus dan append Audit Log;
6. full refresh seluruh consultant sheets dari jurnal `posted` dan collection terkait;
7. append `_sync_log` kecuali dry run;
8. mengembalikan summary terstruktur untuk test dan log.

`main()` hanya membuat dependency production dari environment lalu memanggil runner.

- [ ] **Step 5: Update workflow and runbook**

Workflow harus menjalankan `npm test` sebelum `node index.js`. Ubah deskripsi input `full_sync` menjadi migrasi/pemulihan schema General Ledger.

Runbook harus memuat perintah:

```bash
npm test
GOOGLE_SPREADSHEET_ID=<id> FIREBASE_PROJECT_ID=bul-accounting DRY_RUN=true FULL_SYNC=true node index.js
```

Jelaskan bahwa production rollout pertama wajib `dry_run + full_sync`, ditinjau, lalu `full_sync` manual. Jangan menjalankan production workflow dari implementasi.

- [ ] **Step 6: Run tests and syntax checks**

Run:

```bash
npm test
node --check index.js
Get-ChildItem lib -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Expected: seluruh test PASS dan seluruh syntax check exit 0.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/gl-sync/index.js scripts/gl-sync/test/sync-runner.test.js scripts/gl-sync/README.md .github/workflows/gl-sync.yml
git commit -m "feat(gl-sync): orchestrate journal upserts and report refresh"
```

### Task 5: Final Audit, Regression Hardening, and Rollout Readiness

**Files:**
- Modify if audit finds defects: `scripts/gl-sync/**`
- Modify if audit finds omissions: `scripts/gl-sync/README.md`

- [ ] **Step 1: Audit implementation against design**

Buat checklist eksplisit dan verifikasi:

- Deskripsi selalu `line.keterangan`;
- Nama Akun berasal dari COA gabungan;
- metadata diulang setiap row;
- full Journal ID menjadi upsert key;
- deleted journal tetap terlihat;
- daily sync mencakup create/update/delete;
- General Ledger legacy schema ditolak pada daily sync;
- all historical data dapat dimigrasikan dengan `FULL_SYNC`;
- consultant sheets hanya menghitung `posted`;
- dry run tidak menulis;
- production workflow tidak dijalankan.

- [ ] **Step 2: Add regression tests for every audit defect**

Untuk setiap defect yang ditemukan, tulis test gagal terlebih dahulu, jalankan untuk memastikan RED, lalu perbaiki minimal dan pastikan GREEN.

- [ ] **Step 3: Run complete verification**

Run:

```bash
cd scripts/gl-sync
npm test
node --check index.js
Get-ChildItem lib -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
git status --short
```

Expected:

- seluruh test PASS;
- syntax checks exit 0;
- `git diff --check` tanpa output;
- status hanya memuat perubahan yang terkait plan atau bersih setelah commit.

- [ ] **Step 4: Perform independent final code review**

Reviewer paling capable harus memeriksa seluruh diff dari base branch sampai HEAD untuk correctness, data safety, dry-run safety, Google Sheets index semantics, serta missing tests. Critical dan Important findings wajib diperbaiki dan direview ulang.

- [ ] **Step 5: Commit audit fixes**

Jika audit menghasilkan perubahan:

```bash
git add scripts/gl-sync .github/workflows/gl-sync.yml
git commit -m "fix(gl-sync): address final sync audit findings"
```

- [ ] **Step 6: Verify branch one final time**

Run:

```bash
cd scripts/gl-sync
npm test
node --check index.js
Get-ChildItem lib -Filter *.js | ForEach-Object { node --check $_.FullName }
git -C ../.. diff --check main...HEAD
```

Expected: seluruh verifikasi exit 0.
