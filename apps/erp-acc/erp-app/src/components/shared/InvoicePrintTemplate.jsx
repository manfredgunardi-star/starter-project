import './InvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { terbilang } from '../../utils/terbilang'

export default function InvoicePrintTemplate({ invoice, company }) {
  const subtotal = invoice.items.reduce(
    (acc, item) => acc + (item.total - (item.tax_amount || 0)), 0
  )
  const taxTotal = invoice.items.reduce(
    (acc, item) => acc + (item.tax_amount || 0), 0
  )
  const grandTotal = invoice.total || 0

  return (
    <div className="inv-template">

      {/* Zone 1: Header */}
      <div className="inv-header">
        <div className="inv-header-left">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt="Logo"
              className="inv-logo"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <div>
            <p className="inv-company-name">{company?.name || 'Nama Perusahaan'}</p>
            {company?.address && <p className="inv-company-detail">{company.address}</p>}
            {company?.phone && <p className="inv-company-detail">Telp: {company.phone}</p>}
            {company?.email && <p className="inv-company-detail">Email: {company.email}</p>}
            {company?.npwp && <p className="inv-company-detail">NPWP: {company.npwp}</p>}
          </div>
        </div>
        <div className="inv-header-right">
          <p className="inv-title">Invoice Penjualan</p>
          <p className="inv-number">{invoice.invoice_number}</p>
          <p className="inv-meta-row">Tanggal: {formatDate(invoice.date)}</p>
          {invoice.due_date && (
            <p className="inv-meta-row">Jatuh Tempo: {formatDate(invoice.due_date)}</p>
          )}
        </div>
      </div>
      <div className="inv-divider" />

      {/* Zone 2: Bill To */}
      <div className="inv-bill-to-section">
        <div className="inv-bill-to-box">
          <p className="inv-section-label">Ditagihkan Kepada</p>
          <p className="inv-customer-name">{invoice.customer?.name || '—'}</p>
        </div>
      </div>

      {/* Zone 3: Table */}
      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Deskripsi</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 130, textAlign: 'right' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="inv-text-center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="inv-text-center">{item.quantity}</td>
              <td className="inv-text-center">{item.unit?.name || '—'}</td>
              <td className="inv-text-right">{formatCurrency(item.unit_price)}</td>
              <td className="inv-text-right">
                {formatCurrency(item.total - (item.tax_amount || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Zone 4: Totals */}
      <div className="inv-totals">
        <table className="inv-totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
            {taxTotal > 0 && (
              <tr>
                <td>PPN</td>
                <td>{formatCurrency(taxTotal)}</td>
              </tr>
            )}
            <tr className="inv-grand-total">
              <td>Grand Total</td>
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Zone 5: Terbilang */}
      <div className="inv-terbilang-box">
        <p className="inv-section-label">Terbilang</p>
        <p className="inv-terbilang-text">{terbilang(Math.round(grandTotal))}</p>
      </div>

      {/* Zone 6: Footer */}
      <div className="inv-footer">
        <div className="inv-footer-left">
          {invoice.notes && (
            <div>
              <p className="inv-notes-label">Catatan Pembayaran</p>
              <p className="inv-notes-text">{invoice.notes}</p>
            </div>
          )}
          {company?.bank_name && (
            <div style={{ marginTop: invoice.notes ? 12 : 0 }}>
              <p className="inv-bank-label">Transfer ke:</p>
              <p className="inv-bank-detail">
                {company.bank_name}
                {company.bank_account_number ? ` – ${company.bank_account_number}` : ''}
              </p>
              {company.bank_account_name && (
                <p className="inv-bank-detail">a.n. {company.bank_account_name}</p>
              )}
            </div>
          )}
        </div>
        {company?.signer_name && (
          <div className="inv-signature">
            <p>Hormat kami,</p>
            <p className="inv-signer-name">{company.signer_name}</p>
            {company.signer_title && (
              <p className="inv-signer-title">{company.signer_title}</p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
