import { describe, it, expect } from 'vitest'
import { escapeCell } from '../reportSanitize'

describe('escapeCell', () => {
  it('prefixes dangerous leading chars with apostrophe', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1")
    expect(escapeCell('+cmd')).toBe("'+cmd")
    expect(escapeCell('-2')).toBe("'-2")
    expect(escapeCell('@x')).toBe("'@x")
    expect(escapeCell('\tTAB')).toBe("'\tTAB")
  })
  it('leaves safe strings and numbers untouched', () => {
    expect(escapeCell('1111 - Kas')).toBe('1111 - Kas')
    expect(escapeCell(15000)).toBe(15000)
    expect(escapeCell(null)).toBe(null)
  })
})
