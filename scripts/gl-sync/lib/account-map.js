'use strict'

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function inferNormalBalance(code) {
  const value = String(code || '')

  if (value === '9110') return 'debit'
  if (value === '9100') return 'credit'

  const firstDigit = value.charAt(0)
  if (['1', '5', '6', '8'].includes(firstDigit)) return 'debit'
  if (['2', '3', '4', '7', '9'].includes(firstDigit)) return 'credit'

  return 'debit'
}

function parseBuiltinAccounts(source) {
  const transformedSource = String(source)
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ')

  const sandbox = {
    globalThis: {},
  }

  vm.runInNewContext(
    `${transformedSource}\n;globalThis.__builtinAccounts = COA`,
    sandbox,
    { timeout: 1000 }
  )

  const accounts = sandbox.globalThis.__builtinAccounts
  if (!Array.isArray(accounts)) {
    throw new Error('COA source tidak menghasilkan array akun')
  }

  return accounts.map((account) => ({
    code: String(account.code),
    name: String(account.name),
    normalBalance: account.normalBalance || inferNormalBalance(account.code),
  }))
}

function findRepoRoot(startDir) {
  let currentDir = path.resolve(startDir)
  while (true) {
    const candidate = path.join(
      currentDir,
      'apps',
      'bul-accounting',
      'src',
      'data',
      'chartOfAccounts.js'
    )
    if (fs.existsSync(candidate)) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error('Tidak menemukan apps/bul-accounting/src/data/chartOfAccounts.js dari __dirname')
    }
    currentDir = parentDir
  }
}

function loadBuiltinAccounts() {
  const repoRoot = findRepoRoot(__dirname)
  const chartPath = path.join(repoRoot, 'apps', 'bul-accounting', 'src', 'data', 'chartOfAccounts.js')
  const source = fs.readFileSync(chartPath, 'utf8')
  return parseBuiltinAccounts(source)
}

function normalizeCustomAccount(account) {
  return {
    code: String(account.code),
    name: String(account.name || ''),
    parent: account.parent || null,
    level: account.level ?? 2,
    type: account.type || 'detail',
    normalBalance: account.normalBalance || inferNormalBalance(account.code),
    custom: true,
    firestoreId: account.id,
    inactive: account.status === 'inactive',
  }
}

function normalizeBuiltinAccount(account) {
  return {
    code: String(account.code),
    name: String(account.name || ''),
    parent: account.parent || null,
    level: account.level ?? 2,
    type: account.type || 'detail',
    normalBalance: account.normalBalance || inferNormalBalance(account.code),
    custom: false,
    inactive: false,
  }
}

function buildAccountMap(customAccounts = [], builtinAccounts = loadBuiltinAccounts()) {
  const map = new Map()

  for (const builtinAccount of builtinAccounts) {
    map.set(builtinAccount.code, normalizeBuiltinAccount(builtinAccount))
  }

  for (const customAccount of customAccounts) {
    if (customAccount.status === 'deleted') continue
    map.set(String(customAccount.code), normalizeCustomAccount(customAccount))
  }

  return map
}

function resolveAccount(code, accountMap) {
  const key = String(code)
  if (accountMap && typeof accountMap.get === 'function') {
    const account = accountMap.get(key)
    if (account) return account
  }

  return {
    code: key,
    name: `[Akun tidak ditemukan: ${key}]`,
    parent: null,
    level: 2,
    type: 'detail',
    normalBalance: inferNormalBalance(key),
    custom: false,
    inactive: false,
  }
}

module.exports = {
  inferNormalBalance,
  parseBuiltinAccounts,
  buildAccountMap,
  resolveAccount,
  loadBuiltinAccounts,
}
