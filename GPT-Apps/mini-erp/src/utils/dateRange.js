export function isWithinDateRange(value, startDate, endDate) {
  const date = String(value || '');
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function dateRangeLabel(startDate, endDate) {
  if (startDate && endDate) return `${startDate} s.d. ${endDate}`;
  if (startDate) return `Mulai ${startDate}`;
  if (endDate) return `Sampai ${endDate}`;
  return 'Semua periode';
}
