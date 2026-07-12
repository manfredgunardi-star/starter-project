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

import { modelToAoa } from '../reportRenderers'

const model = {
  id: 'x', title: 'T', periodLabel: 'P',
  columns: [{ key: 'label', label: '', align: 'left' }, { key: 'amount', label: '', align: 'right', isCurrency: true }],
  rows: [
    { type: 'heading', cells: { label: '=DANGER', amount: '' } },
    { type: 'detail', cells: { label: 'Kas', amount: 100 } },
  ],
}

describe('modelToAoa', () => {
  it('produces title/period header rows then column + data rows, sanitized', () => {
    const aoa = modelToAoa(model)
    expect(aoa[0][0]).toBe('T')
    expect(aoa[1][0]).toBe('P')
    // dangerous heading cell escaped
    const flat = aoa.flat()
    expect(flat).toContain("'=DANGER")
    expect(flat).toContain(100)
  })
})
