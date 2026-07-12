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

const SI_STATUS_LABELS = {
  draft: 'DRAFT',
  posted: 'UNPAID',
  partial: 'PARTIAL PAID',
  paid: 'PAID',
  cancelled: 'CANCELLED',
}

export async function renderInvoicePdf(invoice, company) {
  const logoDataUrl = await loadLogoDataUrl(company?.logo_url)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const customer = invoice?.customer ?? {}
  const items = invoice?.items ?? []
  const statusLabel =
    SI_STATUS_LABELS[invoice?.status] ?? safeText(invoice?.status, 'DRAFT')
  const companyName = safeText(company?.name)
  const rightX = A4.width - MARGIN.right
  const leftX = MARGIN.left
  const midX = leftX + CONTENT.width * 0.52
  const currency = invoice?.currency ?? 'IDR'

  // ---------------------------------------------------------------------------
  // Page 1 Header
  // ---------------------------------------------------------------------------
  const headerEndY = drawCompanyHeader(doc, company, MARGIN.top, CONTENT.width * 0.55, logoDataUrl)
  const titleEndY = drawDocTitle(
    doc,
    {
      label: 'Sales Invoice',
      number: invoice?.invoice_number,
      status: statusLabel,
      accentColor: COLOR.red,
    },
    MARGIN.top,
  )

  let y = Math.max(headerEndY, titleEndY, MARGIN.top + 60) + 8
  drawDivider(doc, y, COLOR.red)
  y += 14

  // ---------------------------------------------------------------------------
  // Info Row: Bill To (left) + Meta table (right)
  // ---------------------------------------------------------------------------
  const leftColStartY = y
  const rightColX = midX + 8
  const rightColLabelX = rightColX
  const rightColValueX = rightX

  // Bill To block — left column
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

  // Meta table — right column
  let ry = leftColStartY

  ry = drawMetaRow(doc, 'Invoice Date', formatDate(invoice?.date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(doc, 'Due Date', formatDate(invoice?.due_date), rightColLabelX, rightColValueX, ry)
  ry = drawMetaRow(
    doc,
    'Reference SO',
    safeText(invoice?.sales_order_number, null),
    rightColLabelX,
    rightColValueX,
    ry,
    { empty: !invoice?.sales_order_number },
  )
  ry = drawMetaRow(
    doc,
    'Reference DO',
    safeText(invoice?.goods_delivery_number, null),
    rightColLabelX,
    rightColValueX,
    ry,
    { empty: !invoice?.goods_delivery_number },
  )
  ry = drawMetaRow(doc, 'Payment Terms', safeText(invoice?.payment_terms, null), rightColLabelX, rightColValueX, ry)
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
    styles: { cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, overflow: 'visible' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'left' },
      1: { cellWidth: 'auto', overflow: 'linebreak' },
      2: { cellWidth: 52, halign: 'right' },
      3: { cellWidth: 30, halign: 'left' },
      4: { cellWidth: 62, halign: 'right' },
      5: { cellWidth: 28, halign: 'center', textColor: COLOR.textDisabled },
      6: { cellWidth: 84, halign: 'right' },
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
          docTitle: 'Sales Invoice',
          docNumber: invoice?.invoice_number,
          accentColor: COLOR.red,
        })
      }
    },
  })

  y = (doc.lastAutoTable?.finalY ?? y) + 12

  // ---------------------------------------------------------------------------
  // Totals block (right-aligned)
  // ---------------------------------------------------------------------------
  const subtotal =
    invoice?.subtotal ?? items.reduce((sum, item) => sum + (Number(item?.total) || 0), 0)
  const ppn = invoice?.tax_total ?? items.reduce((sum, item) => sum + (Number(item?.tax_amount) || 0), 0)
  const ppnRate = 11
  const total = invoice?.total ?? subtotal + ppn
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

  // Red 1.5pt line above total
  doc.setDrawColor(...COLOR.red)
  doc.setLineWidth(1.5)
  doc.line(totalsLeftX, y, rightX, y)
  y += 12

  // Total row
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.grandTotal)
  doc.setTextColor(...COLOR.red)
  doc.text('Total', totalsLeftX, y)
  doc.text(`${currency} ${formatCurrency(total)}`, rightX, y, { align: 'right' })
  y += 16

  // Potongan Uang Muka + Potongan Retur + Kredit Diterapkan + Sisa Tagih (jika ada potongan)
  const advanceDeduction = Number(invoice?.advance_deduction_amount) || 0
  const returnCredit = Number(invoice?.return_credit_amount) || 0
  const creditApplied = Number(invoice?.credit_applied_amount) || 0
  const totalDeductions = advanceDeduction + returnCredit + creditApplied
  if (totalDeductions > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.totalLabel)
    doc.setTextColor(...COLOR.textSecondary)
    if (advanceDeduction > 0) {
      doc.text('Potongan Uang Muka', totalsLeftX, y)
      doc.setFontSize(FONT.totalValue)
      doc.setTextColor(...COLOR.textPrimary)
      doc.text(`${currency} (${formatCurrency(advanceDeduction)})`, rightX, y, { align: 'right' })
      y += 14
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FONT.totalLabel)
      doc.setTextColor(...COLOR.textSecondary)
    }
    if (returnCredit > 0) {
      doc.text('Potongan Retur', totalsLeftX, y)
      doc.setFontSize(FONT.totalValue)
      doc.setTextColor(...COLOR.textPrimary)
      doc.text(`${currency} (${formatCurrency(returnCredit)})`, rightX, y, { align: 'right' })
      y += 14
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FONT.totalLabel)
      doc.setTextColor(...COLOR.textSecondary)
    }
    if (creditApplied > 0) {
      doc.text('Kredit Diterapkan', totalsLeftX, y)
      doc.setFontSize(FONT.totalValue)
      doc.setTextColor(...COLOR.textPrimary)
      doc.text(`${currency} (${formatCurrency(creditApplied)})`, rightX, y, { align: 'right' })
      y += 14
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT.totalLabel)
    doc.setTextColor(...COLOR.textPrimary)
    doc.text('Sisa Tagih', totalsLeftX, y)
    doc.text(`${currency} ${formatCurrency(total - totalDeductions)}`, rightX, y, { align: 'right' })
    y += 16
  }

  // ---------------------------------------------------------------------------
  // Payment Info + Terms & Conditions + Signatures
  // ---------------------------------------------------------------------------
  if (y + 180 > A4.height - MARGIN.bottom - 24) {
    doc.addPage()
    y = drawContinuationHeader(doc, {
      companyName,
      docTitle: 'Sales Invoice',
      docNumber: invoice?.invoice_number,
      accentColor: COLOR.red,
    })
    y += 8
  }

  // 2-column layout: Payment Info (left) | Terms & Conditions (right)
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

  // --- RIGHT: Terms & Conditions ---
  drawSectionLabel(doc, 'Terms & Conditions', rightColXTwo, y)
  let rightY = y + 10

  const notesText = invoice?.notes ?? ''
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

  // Signature row — 2 columns, 70% width
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
      docNumber: invoice?.invoice_number,
      pageNumber: i,
      totalPages,
    })
  }

  return doc
}
