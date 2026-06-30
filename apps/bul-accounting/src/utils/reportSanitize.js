// CWE-1236: neutralize Excel/CSV formula injection. Only affects string cells
// whose first char can trigger formula evaluation. Numbers pass through.
const DANGEROUS = ['=', '+', '-', '@', '\t', '\r']

export function escapeCell(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  return DANGEROUS.includes(value[0]) ? `'${value}` : value
}
