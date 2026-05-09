import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'

export function formatDate(date) {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy', { locale: id })
}

export function formatDateInput(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function formatDateTime(date) {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy HH:mm', { locale: id })
}

export function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function toISOString(date) {
  if (!date) return null
  return typeof date === 'string' ? date : date.toISOString()
}
