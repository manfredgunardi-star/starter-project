import { escapeCell } from './reportSanitize'

// Build a 2D array-of-arrays from a ReportModel (header + columns + rows), all string/number cells sanitized.
export function modelToAoa(model) {
  const aoa = []
  aoa.push([model.title])
  aoa.push([model.periodLabel])
  aoa.push([])
  // Column header row only for table reports (statement reports use blank column labels)
  const hasLabels = model.columns.some(c => c.label)
  if (hasLabels) aoa.push(model.columns.map(c => c.label))
  model.rows.forEach(r => {
    if (r.type === 'spacer') { aoa.push([]); return }
    aoa.push(model.columns.map(c => escapeCell(r.cells[c.key] ?? '')))
  })
  return aoa
}

async function buildSheet(XLSX, model) {
  const ws = XLSX.utils.aoa_to_sheet(modelToAoa(model))
  ws['!cols'] = model.columns.map((c, i) => ({ wch: i === 0 ? 40 : 18 }))
  return ws
}

const sheetName = (model) => model.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31)

export async function exportReportToExcel(model) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, await buildSheet(XLSX, model), sheetName(model))
  XLSX.writeFile(wb, `${model.title.replace(/\s+/g, '_')}.xlsx`)
}

export async function exportAllToExcel(models, periodLabel = '') {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const m of models) XLSX.utils.book_append_sheet(wb, await buildSheet(XLSX, m), sheetName(m))
  XLSX.writeFile(wb, `Laporan_Keuangan${periodLabel ? '_' + periodLabel : ''}.xlsx`)
}

import { formatCurrency } from './accounting'

const ROW_STYLE = {
  heading: { fontStyle: 'bold', fillColor: [240, 240, 240] },
  subtotal: { fontStyle: 'bold' },
  total: { fontStyle: 'bold', fillColor: [235, 104, 32], textColor: 255 },
  detail: {},
}

function modelToPdfBody(model) {
  return model.rows.filter(r => r.type !== 'spacer').map(r =>
    model.columns.map(c => {
      const raw = r.cells[c.key]
      const txt = c.isCurrency && typeof raw === 'number' ? formatCurrency(raw) : String(raw ?? '')
      return { content: txt, styles: { halign: c.align, ...(ROW_STYLE[r.type] || {}) } }
    }))
}

async function newDoc() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return new jsPDF('portrait', 'mm', 'a4')
}

function renderSection(doc, model, startY) {
  doc.setFontSize(12); doc.text(model.title, 105, startY, { align: 'center' })
  doc.setFontSize(9); doc.text(model.periodLabel, 105, startY + 5, { align: 'center' })
  doc.autoTable({ body: modelToPdfBody(model), startY: startY + 9, theme: 'plain', styles: { fontSize: 7, cellPadding: 1.5 } })
  return doc.lastAutoTable.finalY
}

export async function exportReportToPdf(model) {
  const doc = await newDoc()
  renderSection(doc, model, 15)
  doc.save(`${model.title.replace(/\s+/g, '_')}.pdf`)
}

export async function exportAllToPdf(models, periodLabel = '') {
  const doc = await newDoc()
  models.forEach((m, i) => {
    if (i > 0) doc.addPage()
    renderSection(doc, m, 15)
  })
  doc.save(`Laporan_Keuangan${periodLabel ? '_' + periodLabel : ''}.pdf`)
}
