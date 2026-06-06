'use strict'

const fs = require('node:fs')
const path = require('node:path')

function inferNormalBalance(code) {
  const value = String(code || '')

  if (value === '9100') return 'credit'
  if (value === '9110') return 'debit'

  const firstDigit = value.charAt(0)
  if (['1', '5', '6', '8'].includes(firstDigit)) return 'debit'
  if (['2', '3', '4', '7'].includes(firstDigit)) return 'credit'

  return 'debit'
}

function parseBuiltinAccounts(source) {
  const lines = String(source).split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.includes('export const COA = ['))
  if (startIndex === -1) {
    throw new Error('Tidak menemukan deklarasi COA')
  }

  const accounts = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line === ']') break
    if (!line.startsWith('{')) continue

    const codeMatch = line.match(/code:\s*"([^"]+)"/)
    const nameMatch = line.match(/name:\s*"([^"]+)"/)
    const balanceMatch = line.match(/normalBalance:\s*"([^"]+)"/)

    if (!codeMatch || !nameMatch) {
      throw new Error(`Gagal mem-parse akun builtin: ${line}`)
    }

    accounts.push({
      code: codeMatch[1],
      name: nameMatch[1],
      normalBalance: balanceMatch ? balanceMatch[1] : inferNormalBalance(codeMatch[1]),
    })
  }

  return accounts
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
    missing: false,
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
    missing: false,
  }
}

function buildAccountMap(builtinAccounts = loadBuiltinAccounts(), customAccounts = []) {
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
    if (account) {
      return {
        ...account,
        missing: false,
      }
    }
  }

  return {
    code: key,
    name: `[Akun tidak ditemukan: ${key}]`,
    normalBalance: inferNormalBalance(key),
    missing: true,
  }
}

module.exports = {
  inferNormalBalance,
  parseBuiltinAccounts,
  buildAccountMap,
  resolveAccount,
  loadBuiltinAccounts,
}
