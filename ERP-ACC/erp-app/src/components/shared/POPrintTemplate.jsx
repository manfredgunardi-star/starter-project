// erp-app/src/components/shared/POPrintTemplate.jsx
import './InvoicePrintTemplate.css'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'

const STATUS_LABELS = {
  draft:     'Draft',
  confirmed: 'Confirmed',
  received:  'Received',
  done:      'Done',
}

const STATUS_COLORS = {
  draft:     { background: '#f3f4f6', color: '#374151' },
  confirmed: { background: '#dbeafe', color: '#1d4ed8' },
  received:  { background: '#fef9c3', color: '#854d0e' },
  done:      { background: '#dcfce7', color: '#166534' },
}

export default function POPrintTemplate({ po, company }) {
  const items = po.purchase_order_items || []
  const subtotal = items.reduce(
    (acc, item) => acc + ((item.total || 0) - (item.tax_amount || 0)), 0
  )
  const grandTotal = po.total || 0
  const statusStyle = STATUS_COLORS[po.status] || STATUS_COLORS.draft

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

      {/* Meta: judul + nomor PO + tanggal */}
      <div className="invoice-meta">
        <div className="invoice-meta-left">
          <p className="invoice-title">Purchase Order</p>
        </div>
        <div className="invoice-meta-right">
          <p className="invoice-number">{po.po_number}</p>
          <p>Tanggal: {formatDate(po.date)}</p>
        </div>
      </div>

      {/* Supplier */}
      <div className="invoice-to">
        <p className="invoice-to-label">Kepada (Supplier)</p>
        <p className="invoice-to-name">{po.supplier?.name || '—'}</p>
      </div>

      {/* Tabel item */}
      <table className="invoice-table">
        <thead>
          <tr>
            <th style={{ width: 32, textAlign: 'center' }}>No</th>
            <th>Produk</th>
            <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
            <th style={{ width: 70, textAlign: 'center' }}>Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ width: 120, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="center">{idx + 1}</td>
              <td>{item.product?.name || '—'}</td>
              <td className="center">{item.quantity}</td>
              <td className="center">{item.unit?.name || '—'}</td>
              <td className="right">{formatCurrency(item.unit_price)}</td>
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
          {po.notes && (
            <>
              <p className="invoice-notes-label">Catatan:</p>
              <p style={{ margin: 0 }}>{po.notes}</p>
            </>
          )}
        </div>
        <span className="invoice-status-badge" style={statusStyle}>
          {STATUS_LABELS[po.status] || po.status}
        </span>
      </div>

    </div>
  )
}
