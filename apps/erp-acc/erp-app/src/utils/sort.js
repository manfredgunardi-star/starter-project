export function compareValues(a, b, type) {
  const aNull = a == null || a === ''
  const bNull = b == null || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  if (type === 'date') {
    return new Date(a) - new Date(b)
  }
  if (type === 'number') {
    return Number(a) - Number(b)
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
