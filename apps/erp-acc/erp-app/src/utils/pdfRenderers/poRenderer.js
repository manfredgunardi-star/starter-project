import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  A4,
  MARGIN,
  CONTENT,
  COLOR,
  FONT,
  formatCurrency,
  formatDate,
  formatDiscount,
  safeText,
  loadLogoDataUrl,
  drawCompanyHeader,
  drawDocTitle,
  drawDivider,
  drawSectionLabel,
  drawMetaRow,
  drawSignatureRow,
  drawPageFooter,
  drawContinuationHeader,
} from './shared.js'

const PO_STATUS_LABELS = {
  draft: 'DRAFT',
  sent: 'ISSUED',
  received: 'RECEIVED',
  partial: 'PARTIAL',
  cancelled: 'CANCELLED',
  closed: 'CLOSED',
}

export async function renderPOPdf(po, company) {
  const logoDataUrl = await loadLogoDataUrl(company?.logo_url)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const supplier = po?.supplier ?? {}
  const items = po?.purchase_order_items ?? []
  const statusLabel =
    PO_STATUS_LABELS[po?.status] ?? safeText(po?.status, 'DRAFT')
  const companyName = safeText(company?.name)
  const rightX = A4.width - MARGIN.right
  const leftX = MARGIN.left
  const midX = leftX + CONTENT.width * 0.52
  const currency = po?.currency ?? 'IDR'

  // ---------------------------------------------------------------------------
  // Page 1 Header
  // ---------------------------------------------------------------------------
  const headerEndY = drawCompanyHeader(doc, company, MARGIN.top, CONTENT.width * 0.55, logoDataUrl)
  const titleEndY = drawDocTitle(
    doc,
    { label: 'Purchase Order', number: po?.po_number, status: statusLabel, accentColor: COLOR.blue },
    MARGIN.top,
  )

  let y = Math.max(headerEndY, titleEndY, MARGIN.top + 60) + 8
  drawDivider(doc, y, COLOR.blue)
  y += 14

  // ---------------------------------------------------------------------------
  // Info Row: Vendor (left) + Meta table (right)
  // ---------------------------------------------------------------------------
  const leftColStartY = y
  const rightColX = midX + 8
  const rightColLabelX = rightColX
  const rightColValueX = rightX

  // Vendor block — left column
  drawSectionLabel(doc, 'Vendor', leftX, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.partyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(supplier.name), leftX, y)
  y += 13

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.partyMeta)
  doc.setTextColor(...COLOR.textSecondary)

  if (supplier.contact_person) {
    doc.text(safeText(supplier.contact_person), leftX, y)
    y += 10
  }

  if (supplier.address) {
    const addrLines = doc.splitTextToSize(String(supplier.address), midX - leftX - 8).slice(0, 3)
    addrLines.forEach((line) => {
      doc.text(line, leftX, y)
      y += 10
    })
  }

  if (supplier.phone) {
    doc.text(safeText(supplier.phone), leftX, y)
    y += 10
  }
  if (supplier.email) {
    doc.text(safeText(supplier.email), leftX, y)
    y += 10
  }
  if (supplier.npwp) {
    doc.text(`NPWP: ${supplier.npwp}`, leftX, y)
    y += 10
  }

  const leftColEndY = y

  // Meta table — right column
  let ry = leftColStartY

  ry = drawMetaRow(doc, 'PO Date', formatDate(po?.date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Required By', formatDate(po?.expected_delivery_date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Vendor Quote', safeText(po?.vendor_quote, null), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Buyer', safeText(po?.buyer_name ?? company?.signer_name, null), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Payment Terms', safeText(po?.payment_terms, null), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Currency', currency, rightColLabelX, rightColValueX, ry)

  y = Math.max(leftColEndY, ry) + 8

  // ---------------------------------------------------------------------------
  // Ship To section
  // ---------------------------------------------------------------------------
  drawSectionLabel(doc, 'Ship To', leftX, y)
  y += 10

  const shipName = safeText(company?.ship_to_name ?? company?.name)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.partyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(shipName, leftX, y)
  y += 13

  const shipAddress = company?.ship_to_address ?? company?.address
  if (shipAddress) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.partyMeta)
    doc.setTextColor(...COLOR.textSecondary)
    const shipLines = doc.splitTextToSize(String(shipAddress), CONTENT.width).slice(0, 3)
    shipLines.forEach((line) => {
      doc.text(line, leftX, y)
      y += 10
    })
  }

  y += 12

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
      formatCurrency(item?.quantity),
      safeText(item?.unit?.name, ''),
      formatCurrency(item?.unit_price),
      formatDiscount(item?.discount_percent),
      formatCurrency(item?.total),
    ]
  })

  autoTable(doc, {
    head: [['#', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT PRICE', 'DISC', 'AMOUNT']],
    body: tableBody,
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top + 56, bottom: MARGIN.bottom + 24 },
    theme: 'plain',
    columnStyles: {
      0: { cellWidth: 24, halign: 'left' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 36, halign: 'left' },
      4: { cellWidth: 64, halign: 'right' },
      5: { cellWidth: 32, halign: 'center', textColor: COLOR.textDisabled },
      6: { cellWidth: 80, halign: 'right' },
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
        drawContinuationHeader(doc, {
          companyName,
          docTitle: 'Purchase Order',
          docNumber: po?.po_number,
          accentColor: COLOR.blue,
        })
      }
    },
  })

  y = (doc.lastAutoTable?.finalY ?? y) + 12

  // ---------------------------------------------------------------------------
  // Totals block (right-aligned)
  // ---------------------------------------------------------------------------
  const subtotal = po?.subtotal ?? items.reduce((sum, item) => sum + (Number(item?.total) || 0), 0)
  const ppn = po?.tax_total ?? items.reduce((sum, item) => sum + (Number(item?.tax_amount) || 0), 0)
  const ppnRate = 11
  const total = po?.total ?? subtotal + ppn
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
  // Terms & Signatures
  // ---------------------------------------------------------------------------
  if (y + 160 > A4.height - MARGIN.bottom - 24) {
    doc.addPage()
    y = drawContinuationHeader(doc, {
      companyName,
      docTitle: 'Purchase Order',
      docNumber: po?.po_number,
      accentColor: COLOR.blue,
    })
    y += 8
  }

  drawSectionLabel(doc, 'Terms & Conditions', leftX, y)
  y += 10

  const termsText =
    po?.notes ||
    po?.terms ||
    'Vendor must reference this PO number on all invoices and shipping documents. Goods will be inspected upon receipt.'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.termsBody)
  doc.setTextColor(...COLOR.textSecondary)
  const termsLines = doc.splitTextToSize(String(termsText), CONTENT.width).slice(0, 4)
  termsLines.forEach((line) => {
    doc.text(line, leftX, y)
    y += 11
  })

  y += 14

  drawSignatureRow(
    doc,
    [
      {
        label: 'Requested by',
        name: null,
        role: 'Buyer',
      },
      {
        label: 'Approved by',
        name: company?.signer_name ?? null,
        role: company?.signer_title ?? 'Director',
      },
      {
        label: 'Acknowledged by',
        name: supplier?.name ?? null,
        role: 'Vendor',
      },
    ],
    y,
  )

  // ---------------------------------------------------------------------------
  // Page footers (all pages)
  // ---------------------------------------------------------------------------
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(doc, { docNumber: po?.po_number, pageNumber: i, totalPages })
  }

  return doc
}
