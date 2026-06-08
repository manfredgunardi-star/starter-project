/**
 * shared.js — Shared PDF rendering helpers for jsPDF-based renderers.
 *
 * All drawing functions receive a jsPDF `doc` instance as first argument.
 * This file does NOT import jsPDF; callers pass the doc instance.
 *
 * ES module: named exports only, no default export.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A4 page dimensions in points (pt) */
export const A4 = { width: 595.28, height: 841.89 }

/** Page margins in points */
export const MARGIN = { top: 40, right: 40, bottom: 40, left: 40 }

/** Usable content area derived from A4 and MARGIN */
export const CONTENT = {
  width: A4.width - MARGIN.left - MARGIN.right,   // 515.28
  height: A4.height - MARGIN.top - MARGIN.bottom, // 761.89
}

/** Brand colors as [R, G, B] arrays (0–255) */
export const COLOR = {
  blue:           [37,  99,  235],
  red:            [220, 38,  38],
  textPrimary:    [17,  17,  17],
  textSecondary:  [102, 102, 102],
  textMuted:      [153, 153, 153],
  textDisabled:   [187, 187, 187],
  borderLight:    [240, 240, 240],
  borderMedium:   [221, 221, 221],
  borderDark:     [30,  41,  59],
  white:          [255, 255, 255],
}

/** Font sizes in points */
export const FONT = {
  companyName:  11,
  companyMeta:  8.5,
  docLabel:     8.5,
  docNumber:    18,
  statusBadge:  7.5,
  sectionLabel: 7,
  partyName:    10.5,
  partyMeta:    8.5,
  metaLabel:    8.5,
  metaValue:    8.5,
  tableHeader:  7.5,
  tableCell:    8.5,
  itemName:     9.5,
  itemMeta:     8,
  totalLabel:   8.5,
  totalValue:   8.5,
  grandTotal:   10.5,
  termsTitle:   7,
  termsBody:    8.5,
  sigLabel:     7.5,
  sigName:      9,
  sigRole:      8,
  pageFooter:   7.5,
}

// ---------------------------------------------------------------------------
// Formatters (pure, no doc dependency)
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount in Indonesian locale.
 * @param {number|string|null} amount
 * @param {string} prefix  Optional currency prefix, e.g. 'Rp'
 * @returns {string}
 */
export function formatCurrency(amount, prefix = '') {
  const n = Number(amount)
  if (amount == null || isNaN(n)) return prefix ? `${prefix} 0` : '0'
  const formatted = n.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return prefix ? `${prefix} ${formatted}` : formatted
}

/**
 * Format a quantity in Indonesian locale, preserving up to 2 decimal places.
 *
 * Unlike formatCurrency (which rounds to whole numbers), quantities can be
 * fractional (e.g. 5813.97 m³) and must keep their decimals on the PDF to
 * match what is shown on screen.
 *
 * @param {number|string|null} amount
 * @returns {string}
 */
export function formatQuantity(amount) {
  const n = Number(amount)
  if (amount == null || isNaN(n)) return '0'
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/**
 * Format an ISO date string for display.
 * @param {string|null} dateStr
 * @param {Intl.DateTimeFormatOptions} opts  Override/extend default options
 * @returns {string}
 */
export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  })
}

/**
 * Format a discount percentage.
 * Returns '-' for zero/null values.
 * @param {number|string|null} pct
 * @returns {string}
 */
export function formatDiscount(pct) {
  if (pct == null || pct === 0 || pct === '0') return '-'
  return `${pct}%`
}

/**
 * Return a safe string value, using fallback for null/undefined/empty.
 * @param {any} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeText(value, fallback = '—') {
  if (value == null || value === '') return fallback
  return String(value)
}

// ---------------------------------------------------------------------------
// Drawing helpers — internal utilities
// ---------------------------------------------------------------------------

/**
 * Split text to fit within maxWidth using jsPDF's splitTextToSize.
 * @param {object} doc
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function splitText(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text ?? ''), maxWidth)
}

/**
 * Temporarily apply charSpace, run fn, then reset to 0.
 * @param {object} doc
 * @param {number} charSpace
 * @param {Function} fn
 */
function withCharSpace(doc, charSpace, fn) {
  doc.setCharSpace(charSpace)
  fn()
  doc.setCharSpace(0)
}

// ---------------------------------------------------------------------------
// Drawing functions
// ---------------------------------------------------------------------------

/**
 * Load a logo URL as a base64 data URL for use in jsPDF.
 * Returns null silently if the URL is empty or the fetch fails.
 * @param {string|null} url
 * @returns {Promise<string|null>}
 */
export async function loadLogoDataUrl(url) {
  if (!url) return null
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Draw the company header block (logo + company info).
 *
 * Layout:
 *   [24×24 logo] | name (bold 11pt)
 *                | address (wrapped, max 2 lines, 8.5pt)
 *                | phone + email (8.5pt)
 *                | NPWP (8.5pt)
 *
 * @param {object} doc          jsPDF instance
 * @param {object} company      { name, address, phone, email, npwp, logo_url }
 * @param {number} startY       Top Y for this block
 * @param {number} maxWidth     Max width available (used for text wrapping)
 * @param {string|null} logoDataUrl  Pre-fetched base64 data URL for logo (optional)
 * @returns {number}            Y position after the header block
 */
export function drawCompanyHeader(doc, company, startY, maxWidth, logoDataUrl = null) {
  const logoSize = 24
  const logoX = MARGIN.left
  const logoY = startY
  const textX = logoX + logoSize + 8
  const textMaxW = maxWidth - logoSize - 8

  // Logo: use real image if available, else placeholder box with first letter
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, logoX, logoY, logoSize, logoSize)
  } else {
    doc.setDrawColor(...COLOR.borderMedium)
    doc.setFillColor(...COLOR.borderLight)
    doc.rect(logoX, logoY, logoSize, logoSize, 'FD')
    const letter = (company?.name ?? 'C').charAt(0).toUpperCase()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLOR.textPrimary)
    const letterW = doc.getTextWidth(letter)
    doc.text(letter, logoX + (logoSize - letterW) / 2, logoY + 16)
  }

  let y = startY

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.companyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(company?.name), textX, y + 8)
  y += 12

  // Address — wrap to maxWidth, show max 2 lines
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.companyMeta)
  doc.setTextColor(...COLOR.textSecondary)
  if (company?.address) {
    const lines = splitText(doc, company.address, textMaxW).slice(0, 2)
    lines.forEach((line) => {
      doc.text(line, textX, y + 4)
      y += 10
    })
  }

  // Phone + email on one line
  const contactParts = []
  if (company?.phone) contactParts.push(company.phone)
  if (company?.email) contactParts.push(company.email)
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), textX, y + 4)
    y += 10
  }

  // NPWP
  if (company?.npwp) {
    doc.text(`NPWP: ${company.npwp}`, textX, y + 4)
    y += 10
  }

  // Ensure we clear the logo height
  const bottomOfLogo = startY + logoSize + 4
  return Math.max(y, bottomOfLogo)
}

/**
 * Draw the document title block (right-aligned: label, number, status badge).
 *
 * @param {object} doc
 * @param {object} opts  { label, number, status, accentColor }
 *   accentColor: RGB array, e.g. COLOR.blue
 * @param {number} startY
 * @returns {number}  Y position after the badge
 */
export function drawDocTitle(doc, opts, startY) {
  const { label = '', number = '', status = '', accentColor = COLOR.blue } = opts
  const rightX = A4.width - MARGIN.right
  let y = startY

  // Label — uppercase, letter-spaced, accent color
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.docLabel)
  doc.setTextColor(...accentColor)
  withCharSpace(doc, 2, () => {
    const labelText = String(label).toUpperCase()
    doc.text(labelText, rightX, y, { align: 'right' })
  })
  y += 16

  // Document number — 18pt bold black
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.docNumber)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(number), rightX, y, { align: 'right' })
  y += 10

  // Status badge
  if (status) {
    const statusText = String(status).toUpperCase()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT.statusBadge)
    doc.setTextColor(...accentColor)

    withCharSpace(doc, 1.5, () => {
      const badgeW = doc.getTextWidth(statusText) + 24  // was + 16
      const badgePadV = 4
      const badgeH = FONT.statusBadge + badgePadV * 2
      const badgeX = rightX - badgeW

      // Border
      doc.setDrawColor(...accentColor)
      doc.setFillColor(...COLOR.white)
      doc.roundedRect(badgeX, y, badgeW, badgeH, 2, 2, 'FD')

      // Text (vertically centered in badge)
      doc.text(statusText, rightX - 8, y + badgePadV + FONT.statusBadge - 1, { align: 'right' })
      y += badgeH + 4
    })
  }

  return y
}

/**
 * Draw a full-width horizontal divider line.
 *
 * @param {object} doc
 * @param {number} y
 * @param {number[]} color  RGB array
 */
export function drawDivider(doc, y, color = COLOR.borderMedium) {
  doc.setDrawColor(...color)
  doc.setLineWidth(1.5)
  doc.line(MARGIN.left, y, A4.width - MARGIN.right, y)
}

/**
 * Draw a section label (small, uppercase, letter-spaced, muted).
 *
 * @param {object} doc
 * @param {string} label
 * @param {number} x
 * @param {number} y
 */
export function drawSectionLabel(doc, label, x, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.sectionLabel)
  doc.setTextColor(...COLOR.textMuted)
  withCharSpace(doc, 1.5, () => {
    doc.text(String(label).toUpperCase(), x, y)
  })
}

/**
 * Draw a label/value meta row.
 *
 * @param {object} doc
 * @param {string} label
 * @param {string|null} value
 * @param {number} leftX   X for label
 * @param {number} rightX  X for right-aligned value
 * @param {number} y
 * @param {object} opts    { strong?: boolean, empty?: boolean }
 * @returns {number}  y + 12
 */
export function drawMetaRow(doc, label, value, leftX, rightX, y, opts = {}) {
  const { strong = false, empty = false } = opts

  // Label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.metaLabel)
  doc.setTextColor(...COLOR.textMuted)
  doc.text(String(label), leftX, y)

  // Value
  const isEmptyValue = empty || value == null || value === '' || value === '—'
  if (isEmptyValue) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(FONT.metaValue)
    doc.setTextColor(...COLOR.textDisabled)
    doc.text('—', rightX, y, { align: 'right' })
  } else {
    doc.setFont('helvetica', strong ? 'bold' : 'normal')
    doc.setFontSize(FONT.metaValue)
    doc.setTextColor(...COLOR.textPrimary)
    doc.text(String(value), rightX, y, { align: 'right' })
  }

  return y + 12
}

/**
 * Draw a signature row with N columns.
 *
 * Each column shows: label → signature space → line → name → role
 *
 * @param {object} doc
 * @param {Array<{label: string, name?: string|null, role: string}>} columns
 * @param {number} startY
 * @param {object} opts  { totalWidth?, leftX?, signatureGap? }
 * @returns {number}  Y after the last row
 */
export function drawSignatureRow(doc, columns, startY, opts = {}) {
  const {
    totalWidth = CONTENT.width,
    leftX = MARGIN.left,
    signatureGap = 12,
  } = opts

  if (!columns || columns.length === 0) return startY

  const colWidth =
    (totalWidth - signatureGap * (columns.length - 1)) / columns.length

  let y = startY

  // Labels
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.sigLabel)
  doc.setTextColor(...COLOR.textSecondary)
  columns.forEach((col, i) => {
    const colX = leftX + i * (colWidth + signatureGap)
    doc.text(safeText(col.label), colX, y)
  })

  y += 32 // space for handwritten signature

  // Signature lines + name + role
  columns.forEach((col, i) => {
    const colX = leftX + i * (colWidth + signatureGap)

    // Signature line
    doc.setDrawColor(...COLOR.borderMedium)
    doc.setLineWidth(0.5)
    doc.line(colX, y, colX + colWidth, y)
  })

  y += 10

  // Names
  columns.forEach((col, i) => {
    const colX = leftX + i * (colWidth + signatureGap)
    if (col.name) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FONT.sigName)
      doc.setTextColor(...COLOR.textPrimary)
      doc.text(safeText(col.name), colX, y)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FONT.sigName)
      doc.setTextColor(...COLOR.textDisabled)
      doc.text('(...........................)', colX, y)
    }
  })

  y += 10

  // Roles
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.sigRole)
  doc.setTextColor(...COLOR.textSecondary)
  columns.forEach((col, i) => {
    const colX = leftX + i * (colWidth + signatureGap)
    doc.text(safeText(col.role), colX, y)
  })

  return y + 4
}

/**
 * Draw the page footer (doc number, generated date, page number).
 *
 * @param {object} doc
 * @param {object} opts  { docNumber, pageNumber, totalPages }
 */
export function drawPageFooter(doc, opts = {}) {
  const { docNumber = '', pageNumber = 1, totalPages = 1 } = opts

  const y = A4.height - MARGIN.bottom + 18
  const leftX = MARGIN.left
  const rightX = A4.width - MARGIN.right
  const centerX = A4.width / 2

  // Thin rule above footer
  doc.setDrawColor(...COLOR.borderLight)
  doc.setLineWidth(0.5)
  doc.line(leftX, y - 6, rightX, y - 6)

  // Footer text
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.pageFooter)
  doc.setTextColor(...COLOR.textDisabled)

  // Left: doc number
  doc.text(safeText(docNumber, ''), leftX, y)

  // Center: generated date
  const today = new Date()
  const generatedStr = `Generated ${today.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`
  doc.text(generatedStr, centerX, y, { align: 'center' })

  // Right: page X of Y
  doc.text(`Page ${pageNumber} of ${totalPages}`, rightX, y, { align: 'right' })
}

/**
 * Draw the continuation header for overflow pages.
 *
 * Layout:
 *   Left: company name (bold 11pt)
 *   Right: docTitle (accent color, charSpace 2, uppercase) | docNumber (11pt black)
 *   Below: "DOC TITLE DOC-NUMBER — CONTINUED" in accent color 8.5pt
 *   Then: 0.5pt accent-colored horizontal rule
 *
 * @param {object} doc
 * @param {object} opts  { companyName, docTitle, docNumber, accentColor }
 * @returns {number}  Y where the continuation table should start (MARGIN.top + 44)
 */
export function drawContinuationHeader(doc, opts = {}) {
  const {
    companyName = '',
    docTitle = '',
    docNumber = '',
    accentColor = COLOR.blue,
  } = opts

  const leftX = MARGIN.left
  const rightX = A4.width - MARGIN.right
  let y = MARGIN.top + 8

  // Company name — left
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT.companyName)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(companyName), leftX, y)

  // Doc title — right, accent, uppercase, letter-spaced
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT.docLabel)
  doc.setTextColor(...accentColor)
  withCharSpace(doc, 2, () => {
    doc.text(String(docTitle).toUpperCase(), rightX, y, { align: 'right' })
  })

  y += 14

  // Doc number below title — right, 11pt black
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.textPrimary)
  doc.text(safeText(docNumber), rightX, y, { align: 'right' })

  y += 12

  // "DOC TITLE DOC-NUMBER — CONTINUED" line in accent color, 8.5pt
  const continuedLabel = `${String(docTitle).toUpperCase()} ${docNumber} — CONTINUED`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...accentColor)
  doc.text(continuedLabel, leftX, y)

  y += 8

  // Accent-colored horizontal rule below the label
  doc.setDrawColor(...accentColor)
  doc.setLineWidth(0.5)
  doc.line(leftX, y, rightX, y)

  y += 6

  return y
}
