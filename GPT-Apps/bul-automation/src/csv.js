export function toDelimited(rows, delimiter = ';') {
  return rows.map((row) => row.map((value) => escapeCell(value, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}

function escapeCell(value, delimiter) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
