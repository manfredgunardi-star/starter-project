function escapeCell(value) {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRows(rows, columns) {
  return rows.map((row) => columns.map((c) => row[c.key] ?? ''));
}

export async function exportRejectionReportToExcel(rows, columns, filenamePrefix) {
  const XLSX = await import('xlsx');
  const headers = columns.map((c) => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...toRows(rows, columns)]);
  ws['!cols'] = columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ditolak');
  XLSX.writeFile(wb, `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportRejectionReportToCsv(rows, columns, filenamePrefix) {
  const headers = columns.map((c) => c.label);
  const lines = [headers, ...toRows(rows, columns)].map((cols) => cols.map(escapeCell).join(','));
  const BOM = '﻿';
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
