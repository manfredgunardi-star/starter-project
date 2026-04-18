function safeFileName(value) {
  return String(value || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function exportRowsToExcel({ fileName, sheetName = 'Report', rows }) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${safeFileName(fileName)}.xlsx`);
}

export async function exportRowsToPdf({ fileName, title, subtitle, columns, rows }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.default;
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  document.setFontSize(16);
  document.text(title, 40, 44);
  if (subtitle) {
    document.setFontSize(10);
    document.text(subtitle, 40, 62);
  }

  autoTable(document, {
    startY: subtitle ? 78 : 64,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => row[column.key] ?? '')),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [0, 122, 255] },
  });

  document.save(`${safeFileName(fileName)}.pdf`);
}
