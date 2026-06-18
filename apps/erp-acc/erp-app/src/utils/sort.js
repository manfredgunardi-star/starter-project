export function compareValues(a, b, type = 'string', direction = 'asc') {
  // Handle null/undefined
  if (a == null && b == null) return 0
  if (a == null) return direction === 'asc' ? 1 : -1
  if (b == null) return direction === 'asc' ? -1 : 1

  let comparison = 0

  if (type === 'string') {
    const aStr = String(a).toLowerCase()
    const bStr = String(b).toLowerCase()
    comparison = aStr.localeCompare(bStr)
  } else if (type === 'number') {
    comparison = Number(a) - Number(b)
  } else if (type === 'date') {
    const aDate = new Date(a).getTime()
    const bDate = new Date(b).getTime()
    comparison = aDate - bDate
  }

  return direction === 'desc' ? -comparison : comparison
}
