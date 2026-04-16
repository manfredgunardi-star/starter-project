import './InvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'

const STATUS_LABELS = {
  draft: 'Draft',
  posted: 'Posted',
  partial: 'Sebagian Dibayar',
  paid: 'Lunas',
}

const STATUS_COLORS = {
  draft: { background: '#f3f4f6', color: '#374151' },
  posted: { background: '#dbeafe', color: '#1d4ed8' },
  partial: { background: '#fef9c3', color: '#854d0e' },
  paid: { background: '#dcfce7', color: '#166534' },
}

export default function InvoicePrintTemplate({ invoice, company }) {
  const subtotal = invoice.items.reduce(
    (acc, item) => acc + (item.total - (item.tax_amount || 0)), 0
  )
  const taxTotal = invoice.items.reduce(
    (acc, item) => acc + (item.tax_amount || 0), 0
  )
  const grandTotal = invoice.total || 0
  const statusStyle = STATUS_COLORS[invoice.status] || STATUS_COLORS.draft

  return (
    <div className="invoice-template" style={{ padding: '24px' }}>

      {/* Header: company info + logo */}
      <div className="invoice-header">
        <div className="invoice-company-info">
          <p className="invoice-company-name">{company?.name || 'Nama Perusahaan'}</p>
          {company?.address && <p className="invoice-company-detail">{company.address}</p>}
          {company?.phone && <p className="invoice-company-detail">Telp: {company.phone}</p>}
          {company?.email && <p className="invoice-company-detail">Email: {company.email}</p>}
          {company?.npwp && <p className="invoice-company-detail">NPWP: {company.npwp}</p>}
        </div>
        {company?.logo_url && (
          <img
            src={company.logo_url}
            alt="Logo"
            className="invoice-logo"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
      </div>

      {/* Invoice meta: judul + nomor + tanggal */}
      <div className="invoice-meta">
        <div className="invoice-meta-left">
          <p className="invoice-title">Invoice Penjualan</p>
        </div>
        <div className="invoice-meta-right">
          <p className="invoice-number">{invoice.invoice_number}</p>
          <p>Tanggal: {formatDate(invoice.date)}</p>
          {invoice.due_date && <p>Jatuh Tempo: {formatDate(invoice.due_date)}</p>}
        </div>
      </div>

      {/* Customer */}
      <div className="invoice-to">
        <p className="invoice-to-label">Kepada</p>
        <p className="invoice-to-name">{invoice.customer?.name || '—'}</p>
      </div>

      {/* Tabel item */}
      <table className="invoice-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Produk</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 110, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 90, textAlign: 'right' }}>Pajak</th>
            <th style={{ width: 120, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="center">{item.quantity}</td>
              <td className="center">{item.unit?.name || '—'}</td>
              <td className="right">{formatCurrency(item.unit_price)}</td>
              <td className="right">{formatCurrency(item.tax_amount || 0)}</td>
              <td className="right">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="invoice-totals">
        <table className="invoice-totals-table">
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
            <tr className="grand-total">
              <td>TOTAL</td>
              <td>{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer: catatan + status */}
      <div className="invoice-footer">
        <div className="invoice-notes">
          {invoice.notes && (
            <>
              <p className="invoice-notes-label">Catatan:</p>
              <p style={{ margin: 0 }}>{invoice.notes}</p>
            </>
          )}
        </div>
        <span
          className="invoice-status-badge"
          style={statusStyle}
        >
          {STATUS_LABELS[invoice.status] || invoice.status}
        </span>
      </div>

    </div>
  )
}
