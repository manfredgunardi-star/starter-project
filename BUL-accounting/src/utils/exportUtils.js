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

export function exportNeracaToExcel(data, endDate, companyName = 'PT. Jasa Pengiriman') {
  const rows = []
  rows.push({ A: companyName })
  rows.push({ A: 'LAPORAN NERACA (POSISI KEUANGAN)' })
  rows.push({ A: `Per ${endDate}` })
  rows.push({})

  // ASET
  rows.push({ A: 'ASET', B: '' })
  rows.push({ A: 'Aset Lancar', B: '' })
  data.aset.filter(a => a.code.startsWith('11')).forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  const totalAsetLancar = data.aset.filter(a => a.code.startsWith('11')).reduce((s, a) => s + a.balance, 0)
  rows.push({ A: 'Total Aset Lancar', B: totalAsetLancar })
  rows.push({})

  rows.push({ A: 'Aset Tidak Lancar', B: '' })
  data.aset.filter(a => a.code.startsWith('12')).forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  const totalAsetTidakLancar = data.aset.filter(a => a.code.startsWith('12')).reduce((s, a) => s + a.balance, 0)
  rows.push({ A: 'Total Aset Tidak Lancar', B: totalAsetTidakLancar })
  rows.push({ A: 'TOTAL ASET', B: data.totalAset })
  rows.push({})

  // KEWAJIBAN & EKUITAS
  rows.push({ A: 'KEWAJIBAN', B: '' })
  data.kewajiban.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Kewajiban', B: data.totalKewajiban })
  rows.push({})

  rows.push({ A: 'EKUITAS', B: '' })
  data.ekuitas.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: '  Laba Tahun Berjalan', B: data.labaBerjalan })
  rows.push({ A: 'Total Ekuitas', B: data.totalEkuitas })
  rows.push({ A: 'TOTAL KEWAJIBAN & EKUITAS', B: data.totalKewajiban + data.totalEkuitas })

  const ws = XLSX.utils.json_to_sheet(rows, { header: ['A', 'B'], skipHeader: true })
  ws['!cols'] = [{ wch: 45 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Neraca')
  XLSX.writeFile(wb, `Neraca_${endDate}.xlsx`)
}

export function exportLabaRugiToExcel(data, startDate, endDate, companyName = 'PT. Jasa Pengiriman') {
  const rows = []
  rows.push({ A: companyName })
  rows.push({ A: 'LAPORAN LABA RUGI' })
  rows.push({ A: `Periode: ${startDate} s/d ${endDate}` })
  rows.push({})

  rows.push({ A: 'PENDAPATAN USAHA', B: '' })
  data.pendapatanUsaha.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Pendapatan Usaha', B: data.totalPendapatanUsaha })
  rows.push({})

  rows.push({ A: 'BEBAN POKOK PENDAPATAN', B: '' })
  data.hpp.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Beban Pokok Pendapatan', B: data.totalHPP })
  rows.push({ A: 'LABA KOTOR', B: data.labaKotor })
  rows.push({})

  rows.push({ A: 'BEBAN OPERASIONAL', B: '' })
  data.bebanOperasional.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Beban Operasional', B: data.totalBebanOperasional })
  rows.push({ A: 'LABA OPERASIONAL', B: data.labaOperasional })
  rows.push({})

  rows.push({ A: 'PENDAPATAN LAIN-LAIN', B: '' })
  data.pendapatanLain.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Pendapatan Lain-lain', B: data.totalPendapatanLain })

  rows.push({ A: 'BEBAN LAIN-LAIN', B: '' })
  data.bebanLain.forEach(a => {
    if (a.balance !== 0) rows.push({ A: `  ${a.code} - ${a.name}`, B: a.balance })
  })
  rows.push({ A: 'Total Beban Lain-lain', B: data.totalBebanLain })
  rows.push({})
  rows.push({ A: 'LABA BERSIH', B: data.labaBersih })

  const ws = XLSX.utils.json_to_sheet(rows, { header: ['A', 'B'], skipHeader: true })
  ws['!cols'] = [{ wch: 45 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Laba Rugi')
  XLSX.writeFile(wb, `LabaRugi_${startDate}_${endDate}.xlsx`)
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

export function exportNeracaToPDF(data, endDate, companyName = 'PT. Jasa Pengiriman') {
  const doc = new jsPDF('portrait', 'mm', 'a4')

  doc.setFontSize(14)
  doc.text(companyName, 105, 15, { align: 'center' })
  doc.setFontSize(11)
  doc.text('LAPORAN NERACA', 105, 22, { align: 'center' })
  doc.setFontSize(9)
  doc.text(`Per ${endDate}`, 105, 28, { align: 'center' })

  const rows = []

  rows.push([{ content: 'ASET', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }])
  data.aset.forEach(a => {
    if (a.balance !== 0) rows.push([`  ${a.code} - ${a.name}`, formatCurrency(a.balance)])
  })
  rows.push([{ content: 'TOTAL ASET', styles: { fontStyle: 'bold' } }, { content: formatCurrency(data.totalAset), styles: { fontStyle: 'bold', halign: 'right' } }])
  rows.push(['', ''])

  rows.push([{ content: 'KEWAJIBAN', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }])
  data.kewajiban.forEach(a => {
    if (a.balance !== 0) rows.push([`  ${a.code} - ${a.name}`, formatCurrency(a.balance)])
  })
  rows.push([{ content: 'Total Kewajiban', styles: { fontStyle: 'bold' } }, { content: formatCurrency(data.totalKewajiban), styles: { fontStyle: 'bold', halign: 'right' } }])

  rows.push([{ content: 'EKUITAS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }])
  data.ekuitas.forEach(a => {
    if (a.balance !== 0) rows.push([`  ${a.code} - ${a.name}`, formatCurrency(a.balance)])
  })
  rows.push(['  Laba Tahun Berjalan', formatCurrency(data.labaBerjalan)])
  rows.push([{ content: 'TOTAL KEWAJIBAN & EKUITAS', styles: { fontStyle: 'bold' } }, { content: formatCurrency(data.totalKewajiban + data.totalEkuitas), styles: { fontStyle: 'bold', halign: 'right' } }])

  doc.autoTable({
    body: rows,
    startY: 34,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50, halign: 'right' } }
  })

  doc.save(`Neraca_${endDate}.pdf`)
}

export function exportLabaRugiToPDF(data, startDate, endDate, companyName = 'PT. Jasa Pengiriman') {
  const doc = new jsPDF('portrait', 'mm', 'a4')

  doc.setFontSize(14)
  doc.text(companyName, 105, 15, { align: 'center' })
  doc.setFontSize(11)
  doc.text('LAPORAN LABA RUGI', 105, 22, { align: 'center' })
  doc.setFontSize(9)
  doc.text(`Periode: ${startDate} s/d ${endDate}`, 105, 28, { align: 'center' })

  const rows = []

  const addSection = (title, items, total, totalLabel) => {
    rows.push([{ content: title, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }])
    items.forEach(a => {
      if (a.balance !== 0) rows.push([`  ${a.code} - ${a.name}`, formatCurrency(a.balance)])
    })
    rows.push([{ content: totalLabel, styles: { fontStyle: 'bold' } }, { content: formatCurrency(total), styles: { fontStyle: 'bold', halign: 'right' } }])
  }

  addSection('PENDAPATAN USAHA', data.pendapatanUsaha, data.totalPendapatanUsaha, 'Total Pendapatan Usaha')
  addSection('BEBAN POKOK PENDAPATAN', data.hpp, data.totalHPP, 'Total HPP')
  rows.push([{ content: 'LABA KOTOR', styles: { fontStyle: 'bold', fillColor: [220, 240, 220] } }, { content: formatCurrency(data.labaKotor), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 240, 220] } }])
  addSection('BEBAN OPERASIONAL', data.bebanOperasional, data.totalBebanOperasional, 'Total Beban Operasional')
  rows.push([{ content: 'LABA OPERASIONAL', styles: { fontStyle: 'bold' } }, { content: formatCurrency(data.labaOperasional), styles: { fontStyle: 'bold', halign: 'right' } }])
  addSection('PENDAPATAN LAIN-LAIN', data.pendapatanLain, data.totalPendapatanLain, 'Total Pendapatan Lain')
  addSection('BEBAN LAIN-LAIN', data.bebanLain, data.totalBebanLain, 'Total Beban Lain')
  rows.push([{ content: 'LABA BERSIH', styles: { fontStyle: 'bold', fillColor: [220, 230, 250] } }, { content: formatCurrency(data.labaBersih), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 230, 250] } }])

  doc.autoTable({
    body: rows,
    startY: 34,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50, halign: 'right' } }
  })

  doc.save(`LabaRugi_${startDate}_${endDate}.pdf`)
}
