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
  const properties = parseDirectProperties(objectSource)
  if (!Object.prototype.hasOwnProperty.call(properties, propertyName)) return null
  const value = properties[propertyName]
  return typeof value === 'string' ? value : null
}

function stripComments(source) {
  const text = String(source)
  let output = ''
  let index = 0
  let inString = null

  while (index < text.length) {
    const current = text[index]

    if (inString) {
      output += current
      if (current === '\\') {
        if (index + 1 < text.length) {
          output += text[index + 1]
          index += 2
          continue
        }
      } else if (current === inString) {
        inString = null
      }
      index += 1
      continue
    }

    if (current === '"' || current === "'" || current === '`') {
      inString = current
      output += current
      index += 1
      continue
    }

    if (current === '/' && text[index + 1] === '/') {
      index += 2
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }

    if (current === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }

    output += current
    index += 1
  }

  return output
}

function extractNullableStringProperty(objectSource, propertyName) {
  const properties = parseDirectProperties(objectSource)
  if (!Object.prototype.hasOwnProperty.call(properties, propertyName)) return undefined
  return properties[propertyName] === null ? null : properties[propertyName]
}

function extractNumericProperty(objectSource, propertyName) {
  const properties = parseDirectProperties(objectSource)
  if (!Object.prototype.hasOwnProperty.call(properties, propertyName)) return undefined
  return typeof properties[propertyName] === 'number' ? properties[propertyName] : undefined
}

function splitTopLevelEntries(objectSource) {
  const text = stripComments(String(objectSource)).trim()
  const body = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text
  const entries = []
  let start = 0
  let depth = 0
  let inString = null

  for (let index = 0; index < body.length; index += 1) {
    const current = body[index]

    if (inString) {
      if (current === '\\') {
        index += 1
        continue
      }
      if (current === inString) {
        inString = null
      }
      continue
    }

    if (current === '"' || current === "'" || current === '`') {
      inString = current
      continue
    }

    if (current === '{' || current === '[' || current === '(') {
      depth += 1
      continue
    }

    if (current === '}' || current === ']' || current === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (current === ',' && depth === 0) {
      const entry = body.slice(start, index).trim()
      if (entry) entries.push(entry)
      start = index + 1
    }
  }

  const finalEntry = body.slice(start).trim()
  if (finalEntry) entries.push(finalEntry)
  return entries
}

function parseDirectProperties(objectSource) {
  const properties = {}
  for (const entry of splitTopLevelEntries(objectSource)) {
    const colonIndex = entry.indexOf(':')
    if (colonIndex === -1) continue

    const key = entry.slice(0, colonIndex).trim()
    const rawValue = entry.slice(colonIndex + 1).trim()
    if (!key) continue

    if (/^null$/i.test(rawValue)) {
      properties[key] = null
      continue
    }

    if (/^-?\d+$/.test(rawValue)) {
      properties[key] = Number(rawValue)
      continue
    }

    const quotedMatch = rawValue.match(/^(['"])((?:\\.|(?!\1).)*)\1$/s)
    if (quotedMatch) {
      properties[key] = quotedMatch[2].replace(/\\(['"])/g, '$1')
    }
  }

  return properties
}

function extractObjectLiterals(source) {
  const text = String(source)
  const objects = []
  const length = text.length
  let index = 0
  const stack = []

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
      stack.push(index)
      index += 1
      continue
    }

    if (char === '}') {
      const start = stack.pop()
      if (start !== undefined) {
        objects.push(text.slice(start, index + 1))
      }
      index += 1
      continue
    }

    index += 1
  }

  return objects
}

function parseBuiltinAccounts(source) {
  const accounts = []
  for (const objectSource of extractObjectLiterals(source)) {
    const properties = parseDirectProperties(objectSource)
    const code = properties.code
    const name = properties.name
    if (!code || !name) continue

    const account = {
      code,
      name,
      normalBalance: typeof properties.normalBalance === 'string' ? properties.normalBalance : inferNormalBalance(code),
    }

    const parent = Object.prototype.hasOwnProperty.call(properties, 'parent') ? properties.parent : undefined
    if (parent !== undefined) account.parent = parent

    const level = Object.prototype.hasOwnProperty.call(properties, 'level') ? properties.level : undefined
    if (level !== undefined) account.level = level

    const type = Object.prototype.hasOwnProperty.call(properties, 'type') ? properties.type : undefined
    if (type !== undefined) account.type = type

    accounts.push(account)
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
  const normalized = {
    code: String(account.code),
    name: String(account.name || ''),
    normalBalance: account.normalBalance || inferNormalBalance(account.code),
    custom: false,
    inactive: false,
    missing: false,
  }

  if (Object.prototype.hasOwnProperty.call(account, 'parent')) {
    normalized.parent = account.parent
  }
  if (Object.prototype.hasOwnProperty.call(account, 'level')) {
    normalized.level = account.level
  }
  if (Object.prototype.hasOwnProperty.call(account, 'type')) {
    normalized.type = account.type
  }

  return normalized
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
