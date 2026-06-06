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

function extractQuotedProperty(objectSource, propertyName) {
  const pattern = new RegExp(
    `\\b${propertyName}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`,
    's'
  )
  const match = objectSource.match(pattern)
  return match ? match[2].replace(/\\(['"])/g, '$1') : null
}

function extractObjectLiterals(source) {
  const text = String(source)
  const objects = []
  const length = text.length
  let index = 0

  while (index < length) {
    const char = text[index]

    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      index += 1
      while (index < length) {
        const current = text[index]
        if (current === '\\') {
          index += 2
          continue
        }
        if (current === quote) {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (char === '/' && text[index + 1] === '/') {
      index += 2
      while (index < length && text[index] !== '\n') index += 1
      continue
    }

    if (char === '/' && text[index + 1] === '*') {
      index += 2
      while (index < length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }

    if (char === '{') {
      let depth = 1
      let cursor = index + 1
      let inString = null

      while (cursor < length && depth > 0) {
        const current = text[cursor]

        if (inString) {
          if (current === '\\') {
            cursor += 2
            continue
          }
          if (current === inString) {
            inString = null
          }
          cursor += 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          inString = current
          cursor += 1
          continue
        }

        if (current === '/' && text[cursor + 1] === '/') {
          cursor += 2
          while (cursor < length && text[cursor] !== '\n') cursor += 1
          continue
        }

        if (current === '/' && text[cursor + 1] === '*') {
          cursor += 2
          while (cursor < length && !(text[cursor] === '*' && text[cursor + 1] === '/')) cursor += 1
          cursor += 2
          continue
        }

        if (current === '{') depth += 1
        if (current === '}') depth -= 1
        cursor += 1
      }

      if (depth === 0) {
        objects.push(text.slice(index, cursor))
        index = cursor
        continue
      }
    }

    index += 1
  }

  return objects
}

function parseBuiltinAccounts(source) {
  const accounts = []
  for (const objectSource of extractObjectLiterals(source)) {
    const code = extractQuotedProperty(objectSource, 'code')
    const name = extractQuotedProperty(objectSource, 'name')
    if (!code || !name) continue

    const normalBalance = extractQuotedProperty(objectSource, 'normalBalance')
    accounts.push({
      code,
      name,
      normalBalance: normalBalance || inferNormalBalance(code),
    })
  }

  if (accounts.length === 0) {
    throw new Error('Tidak menemukan akun builtin pada source')
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
