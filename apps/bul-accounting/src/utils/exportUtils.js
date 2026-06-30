import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { formatCurrency, formatDate } from './accounting'

// ===== EXPORT TO EXCEL =====
export function exportToExcel(data, columns, filename = 'export') {
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map(c => c.key) })

  // Set column headers
  columns.forEach((col, i) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: i })
    ws[cell].v = col.label
  })

  // Auto-width
  ws['!cols'] = columns.map(col => ({ wch: Math.max(col.label.length, 15) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportJournalsToExcel(journals, filename = 'Jurnal_Umum') {
  const rows = []
  journals.forEach(j => {
    j.lines?.forEach((line, idx) => {
      rows.push({
        Tanggal: idx === 0 ? j.date : '',
        'No. Jurnal': idx === 0 ? j.id?.slice(0, 8) : '',
        Keterangan: idx === 0 ? j.description : '',
        Truck: idx === 0 ? (j.truckId || '-') : '',
        'Kode Akun': line.accountCode,
        Debit: line.debit || 0,
        Kredit: line.credit || 0
      })
    })
    rows.push({}) // Empty row separator
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 15 },
    { wch: 12 }, { wch: 18 }, { wch: 18 }
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ===== EXPORT TO PDF =====
export function exportToPDF(title, headers, rows, filename = 'export', orientation = 'portrait') {
  const doc = new jsPDF(orientation, 'mm', 'a4')
  
  doc.setFontSize(14)
  doc.text(title, 14, 20)
  doc.setFontSize(8)
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 27)

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 32,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [235, 104, 32], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      [headers.length - 1]: { halign: 'right' },
      [headers.length - 2]: { halign: 'right' }
    }
  })

  doc.save(`${filename}.pdf`)
}

