import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  A4,
  MARGIN,
  CONTENT,
  COLOR,
  FONT,
  formatCurrency,
  formatQuantity,
  formatDate,
  safeText,
  loadLogoDataUrl,
  drawCompanyHeader,
  drawDivider,
  drawSectionLabel,
  drawMetaRow,
  drawSignatureRow,
  drawPageFooter,
  drawContinuationHeader,
} from './shared.js'

function drawProformaWatermark(doc) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(90)
  doc.setTextColor(228, 234, 252)
  doc.text('PROFORMA', A4.width / 2, A4.height / 2, { angle: 35, align: 'center' })
  doc.setTextColor(...COLOR.textPrimary)
  doc.setFont('helvetica', 'normal')
}

export async function renderProformaPdf(proforma, company) {
  const logoDataUrl = await loadLogoDataUrl(company?.logo_url)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  drawProformaWatermark(doc)

  const customer = proforma?.customer ?? {}
  const items = proforma?.items ?? []
  const companyName = safeText(company?.name)
  const rightX = A4.width - MARGIN.right
  const leftX = MARGIN.left
  const midX = leftX + CONTENT.width * 0.52
  const currency = proforma?.currency ?? 'IDR'

  // ---------------------------------------------------------------------------
  // Page 1 Header
  // ---------------------------------------------------------------------------
  const headerEndY = drawCompanyHeader(doc, company, MARGIN.top, CONTENT.width * 0.55, logoDataUrl)
  // Custom title block: 2-line label to prevent charSpace overflow with long text.
  // drawDocTitle uses withCharSpace(2) internally — for 26-char label that adds ~52pt
  // extra width which overflows page right edge. We split into 2 short lines instead.
  let titleY = MARGIN.top
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.docLabel)
  doc.setTextColor(...COLOR.blue)
  doc.text('PROFORMA INVOICE', rightX, titleY, { align: 'right', charSpace: 1.5 })
  titleY += 13
  doc.text('PENJUALAN', rightX, titleY, { align: 'right', charSpace: 1.5 })
  titleY += 13
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.docNumber)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(proforma?.proforma_number), rightX, titleY, { align: 'right' })
  const titleEndY = titleY + 10

  let y = Math.max(headerEndY, titleEndY, MARGIN.top + 60) + 8
  drawDivider(doc, y, COLOR.blue)
  y += 14

  // ---------------------------------------------------------------------------
  // Info Row: Bill To (left) + Meta table (right)
  // ---------------------------------------------------------------------------
  const leftColStartY = y
  const rightColX = midX + 8
  const rightColLabelX = rightColX
  const rightColValueX = rightX

  // Bill To block - left column
  drawSectionLabel(doc, 'Bill To', leftX, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.partyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(customer.name), leftX, y)
  y += 13

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.partyMeta)
  doc.setTextColor(...COLOR.textSecondary)

  if (customer.contact_person) {
    doc.text(safeText(customer.contact_person), leftX, y)
    y += 10
  }

  if (customer.address) {
    const addrLines = doc.splitTextToSize(String(customer.address), midX - leftX - 8).slice(0, 3)
    addrLines.forEach((line) => {
      doc.text(line, leftX, y)
      y += 10
    })
  }

  if (customer.phone) {
    doc.text(safeText(customer.phone), leftX, y)
    y += 10
  }
  if (customer.email) {
    doc.text(safeText(customer.email), leftX, y)
    y += 10
  }
  if (customer.npwp) {
    doc.text(`NPWP: ${customer.npwp}`, leftX, y)
    y += 10
  }

  const leftColEndY = y

  // Meta table - right column
  let ry = leftColStartY

  ry = drawMetaRow(doc, 'Proforma Date', formatDate(proforma?.date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Valid Until', formatDate(proforma?.valid_until), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(
    doc,
    'Reference SO',
    safeText(proforma?.sales_order?.so_number, null),
    rightColLabelX,
    rightColValueX,
    ry,
    { empty: !proforma?.sales_order?.so_number },
  )
  ry = drawMetaRow(doc, 'Payment Terms', safeText(proforma?.payment_terms, null), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Currency', currency, rightColLabelX, rightColValueX, ry)

  y = Math.max(leftColEndY, ry) + 20

  // ---------------------------------------------------------------------------
  // Items Table
  // ---------------------------------------------------------------------------
  const tableBody = items.map((item, idx) => {
    const productName = item?.product?.name ?? ''
    const sku = item?.product?.sku ?? ''
    const descLines = [safeText(productName)]
    if (sku) descLines.push(`SKU: ${sku}`)

    return [
      String(idx + 1).padStart(2, '0'),
      descLines.join('\n'),
      formatQuantity(item?.quantity),
      safeText(item?.unit?.name, ''),
      formatCurrency(item?.unit_price),
      formatCurrency(item?.total),
    ]
  })

  autoTable(doc, {
    head: [['#', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT PRICE', 'AMOUNT']],
    body: tableBody,
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top + 56, bottom: MARGIN.bottom + 24 },
    theme: 'plain',
    styles: { cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, overflow: 'visible' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'left' },
      1: { cellWidth: 'auto', overflow: 'linebreak' },
      2: { cellWidth: 56, halign: 'right' },
      3: { cellWidth: 32, halign: 'left' },
      4: { cellWidth: 66, halign: 'right' },
      5: { cellWidth: 88, halign: 'right' },
    },
    headStyles: {
      fontSize: FONT.tableHeader,
      fontStyle: 'normal',
      textColor: COLOR.textMuted,
      fillColor: false,
      lineWidth: { bottom: 1.5 },
      lineColor: COLOR.borderDark,
    },
    bodyStyles: {
      fontSize: FONT.tableCell,
      textColor: COLOR.textPrimary,
      lineWidth: { bottom: 0.5 },
      lineColor: COLOR.borderLight,
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawProformaWatermark(doc)
        drawContinuationHeader(doc, {
          companyName,
          docTitle: 'Proforma Invoice',
          docNumber: proforma?.proforma_number,
          accentColor: COLOR.blue,
        })
      }
    },
  })

  y = (doc.lastAutoTable?.finalY ?? y) + 12

  // ---------------------------------------------------------------------------
  // Totals block (right-aligned)
  // ---------------------------------------------------------------------------
  const subtotal =
    proforma?.subtotal ?? items.reduce((sum, item) => sum + (Number(item?.total) || 0), 0)
  const ppn = proforma?.tax_total ?? items.reduce((sum, item) => sum + (Number(item?.tax_amount) || 0), 0)
  const ppnRate = 11
  const total = proforma?.total ?? subtotal + ppn
  const totalsLeftX = rightX - 240

  // Thin border-light line above subtotal
  doc.setDrawColor(...COLOR.borderLight)
  doc.setLineWidth(0.5)
  doc.line(totalsLeftX, y, rightX, y)
  y += 10

  // Subtotal row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.totalLabel)
  doc.setTextColor(...COLOR.textSecondary)
  doc.text('Subtotal', totalsLeftX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.totalValue)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(`${currency} ${formatCurrency(subtotal)}`, rightX, y, { align: 'right' })
  y += 14

  // PPN row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.totalLabel)
  doc.setTextColor(...COLOR.textSecondary)
  doc.text(`PPN ${ppnRate}%`, totalsLeftX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.totalValue)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(`${currency} ${formatCurrency(ppn)}`, rightX, y, { align: 'right' })
  y += 10

  // Blue 1.5pt line above total
  doc.setDrawColor(...COLOR.blue)
  doc.setLineWidth(1.5)
  doc.line(totalsLeftX, y, rightX, y)
  y += 12

  // Total row
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.grandTotal)
  doc.setTextColor(...COLOR.blue)
  doc.text('Total', totalsLeftX, y)
  doc.text(`${currency} ${formatCurrency(total)}`, rightX, y, { align: 'right' })
  y += 16

  // ---------------------------------------------------------------------------
  // Payment Info + Catatan + Signatures
  // ---------------------------------------------------------------------------
  if (y + 180 > A4.height - MARGIN.bottom - 24) {
    doc.addPage()
    drawProformaWatermark(doc)
    y = drawContinuationHeader(doc, {
      companyName,
      docTitle: 'Proforma Invoice Penjualan',
      docNumber: proforma?.proforma_number,
      accentColor: COLOR.blue,
    })
    y += 8
  }

  // 2-column layout: Payment Info (left) | Catatan (right)
  const twoColWidth = (CONTENT.width - 20) / 2
  const leftColX = leftX
  const rightColXTwo = leftX + twoColWidth + 20

  // --- LEFT: Payment Information ---
  drawSectionLabel(doc, 'Payment Information', leftColX, y)
  let leftY = y + 10

  const hasBank =
    company?.bank_name ||
    company?.bank_account_number ||
    company?.bank_account_name ||
    company?.bank_swift

  if (hasBank) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textSecondary)

    if (company?.bank_name) {
      doc.text(`Bank: ${company.bank_name}`, leftColX, leftY)
      leftY += 11
    }
    if (company?.bank_account_number) {
      doc.text(`Account No: ${company.bank_account_number}`, leftColX, leftY)
      leftY += 11
    }
    if (company?.bank_account_name) {
      doc.text(`Account Name: ${company.bank_account_name}`, leftColX, leftY)
      leftY += 11
    }
    if (company?.bank_swift) {
      doc.text(`SWIFT: ${company.bank_swift}`, leftColX, leftY)
      leftY += 11
    }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textDisabled)
    doc.text('— belum dikonfigurasi —', leftColX, leftY)
    leftY += 11
  }

  const leftEndY = leftY

  // --- RIGHT: Catatan ---
  drawSectionLabel(doc, 'Catatan', rightColXTwo, y)
  let rightY = y + 10

  const notesText = proforma?.notes ?? ''
  if (notesText) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.termsBody)
    doc.setTextColor(...COLOR.textSecondary)
    const notesLines = doc.splitTextToSize(String(notesText), twoColWidth).slice(0, 4)
    notesLines.forEach((line) => {
      doc.text(line, rightColXTwo, rightY)
      rightY += 11
    })
  }

  const rightEndY = rightY

  y = Math.max(leftEndY, rightEndY) + 16

  // Signature row - 2 columns, 70% width
  drawSignatureRow(
    doc,
    [
      {
        label: 'Prepared by',
        name: null,
        role: 'Finance',
      },
      {
        label: 'Authorized by',
        name: company?.signer_name || null,
        role: company?.signer_title || 'Director',
      },
    ],
    y,
    { totalWidth: CONTENT.width * 0.7 },
  )

  // ---------------------------------------------------------------------------
  // Page footers (all pages)
  // ---------------------------------------------------------------------------
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(doc, {
      docNumber: proforma?.proforma_number,
      pageNumber: i,
      totalPages,
    })
  }

  return doc
}
