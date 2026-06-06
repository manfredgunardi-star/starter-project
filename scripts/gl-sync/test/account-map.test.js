const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  inferNormalBalance,
  parseBuiltinAccounts,
  buildAccountMap,
  resolveAccount,
  loadBuiltinAccounts,
} = require('../lib/account-map')

const chartPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'apps',
  'bul-accounting',
  'src',
  'data',
  'chartOfAccounts.js'
)

test('parseBuiltinAccounts reads code, name, and normalBalance from source chartOfAccounts.js', () => {
  const source = fs.readFileSync(chartPath, 'utf8')
  const accounts = parseBuiltinAccounts(source)

  assert.ok(accounts.length > 0)
  assert.deepStrictEqual(accounts.find((account) => account.code === '1111'), {
    code: '1111',
    name: 'Kas Kecil',
    normalBalance: 'debit',
  })
  assert.deepStrictEqual(accounts.find((account) => account.code === '1130'), {
    code: '1130',
    name: 'Cadangan Kerugian Piutang',
    normalBalance: 'credit',
  })
})

test('parseBuiltinAccounts returns native plain objects that pass deepStrictEqual on sample data', () => {
  const source = fs.readFileSync(chartPath, 'utf8')
  const accounts = parseBuiltinAccounts(source)
  const sample = accounts.find((account) => account.code === '1111')

  assert.deepStrictEqual(sample, {
    code: '1111',
    name: 'Kas Kecil',
    normalBalance: 'debit',
  })
})

test('buildAccountMap accepts builtin accounts first and custom accounts second', () => {
  const builtinAccounts = [
    { code: '1111', name: 'Kas Kecil', normalBalance: 'debit' },
    { code: '1112', name: 'Bank BCA Operasional', normalBalance: 'debit' },
    { code: '1113', name: 'Bank Mandiri Operasional', normalBalance: 'debit' },
  ]
  const customAccounts = [
    { code: '1111', name: 'Kas Kecil Custom Aktif', status: 'active' },
    { code: '1112', name: 'Bank BCA Nonaktif', status: 'inactive' },
    { code: '1113', name: 'Bank Mandiri Dihapus', status: 'deleted' },
    { code: '9900', name: 'Akun Baru', status: 'active', normalBalance: 'credit' },
  ]

  const map = buildAccountMap(builtinAccounts, customAccounts)

  assert.equal(map.get('1111').name, 'Kas Kecil Custom Aktif')
  assert.equal(map.get('1111').inactive, false)
  assert.equal(map.get('1112').name, 'Bank BCA Nonaktif')
  assert.equal(map.get('1112').inactive, true)
  assert.equal(map.has('1113'), true)
  assert.equal(map.get('1113').name, 'Bank Mandiri Operasional')
  assert.equal(map.get('9900').normalBalance, 'credit')
  assert.equal(map.get('9900').custom, true)
})

test('resolveAccount returns minimal fallback object with missing true', () => {
  const map = buildAccountMap(
    [{ code: '1111', name: 'Kas Kecil', normalBalance: 'debit' }],
    []
  )

  const resolved = resolveAccount('9999', map)

  assert.deepStrictEqual(resolved, {
    code: '9999',
    name: '[Akun tidak ditemukan: 9999]',
    normalBalance: 'debit',
    missing: true,
  })
})

test('resolveAccount exposes missing false for known accounts', () => {
  const map = buildAccountMap(
    [{ code: '1111', name: 'Kas Kecil', normalBalance: 'debit' }],
    []
  )

  const resolved = resolveAccount('1111', map)

  assert.equal(resolved.missing, false)
  assert.equal(resolved.code, '1111')
  assert.equal(resolved.name, 'Kas Kecil')
})

test('inferNormalBalance follows account code groups and known exceptions', () => {
  assert.equal(inferNormalBalance('1111'), 'debit')
  assert.equal(inferNormalBalance('2134'), 'credit')
  assert.equal(inferNormalBalance('9110'), 'debit')
  assert.equal(inferNormalBalance('9000'), 'debit')
  assert.equal(inferNormalBalance('9100'), 'credit')
})

test('loadBuiltinAccounts reads the repository chart of accounts relative to __dirname', () => {
  const accounts = loadBuiltinAccounts()

  assert.ok(accounts.some((account) => account.code === '1111'))
  assert.equal(accounts.find((account) => account.code === '1111').name, 'Kas Kecil')
})
