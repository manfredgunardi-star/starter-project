export function formatPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function isPeriodClosed(date, closedPeriods) {
  if (!closedPeriods || closedPeriods.length === 0) return false
  const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10)
  const key = d.slice(0, 7)
  return closedPeriods.includes(key)
}
