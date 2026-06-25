export function parsePeriod(label) {
  const match = /^(\d{2})\.(\d{4})$/.exec(String(label || '').trim());
  if (!match) {
    throw new Error('Period must use mm.yyyy format, for example 04.2026');
  }

  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error('Period month must be between 01 and 12');
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const previous = new Date(Date.UTC(year, month - 2, 1));

  return {
    label: `${String(month).padStart(2, '0')}.${year}`,
    year,
    month,
    periodStart: formatDate(start),
    periodEnd: formatDate(end),
    previousLabel: `${String(previous.getUTCMonth() + 1).padStart(2, '0')}.${previous.getUTCFullYear()}`
  };
}

export function outputRunId(timestamp = new Date().toISOString()) {
  return String(timestamp).slice(0, 10);
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
