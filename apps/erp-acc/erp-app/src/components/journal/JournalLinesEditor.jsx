// src/components/journal/JournalLinesEditor.jsx
import { formatCurrency } from '../../utils/currency'
import { Plus, Trash2 } from 'lucide-react'
import { Typography } from 'antd'

// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; this helper is only used together with the default export
export const emptyJournalLine = () => ({
  _key: Date.now() + Math.random(),
  coa_id: '',
  account_id: '',
  description: '',
  cost_center_id: '',
  debit: '',
  credit: '',
})

// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; this helper is only used together with the default export
export function computeJournalTotals(items) {
  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0)
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0)
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01
  return { totalDebit, totalCredit, isBalanced }
}

export default function JournalLinesEditor({ items, onChange, coa, accounts, costCenters, readOnly }) {
  const { totalDebit, totalCredit, isBalanced } = computeJournalTotals(items)

  const allCoaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  const getCostCenterName = costCenterId => costCenters.find(cc => cc.id === costCenterId)?.name || '-'
  const getAccountsForCoa = coaId => accounts.filter(a => a.coa_id === coaId)

  const updateItem = (idx, key, value) => {
    onChange(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [key]: value }
      if (key === 'coa_id') updated.account_id = ''
      if (key === 'debit' && value) updated.credit = ''
      if (key === 'credit' && value) updated.debit = ''
      return updated
    }))
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
          <tr>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Akun (COA)</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Keterangan</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Cost Center</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#374151' }}>Debit</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#374151' }}>Kredit</th>
            {!readOnly && <th style={{ width: 40 }}></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item._key} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, minWidth: 240 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14 }}>{item.coa_code} — {item.coa_name}</span>
                ) : (
                  <select
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.coa_id}
                    onChange={e => updateItem(idx, 'coa_id', e.target.value)}
                  >
                    <option value="">Pilih akun...</option>
                    {allCoaOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                {item.coa_id && getAccountsForCoa(item.coa_id).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                      Rekening (opsional)
                    </label>
                    <select
                      style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                      value={item.account_id || ''}
                      onChange={e => updateItem(idx, 'account_id', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">— tidak dispesifikasi —</option>
                      {getAccountsForCoa(item.coa_id).map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                      ))}
                    </select>
                  </div>
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, color: '#4b5563' }}>{item.description}</span>
                ) : (
                  <input
                    type="text"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Keterangan..."
                  />
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, minWidth: 180 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, color: '#4b5563' }}>{getCostCenterName(item.cost_center_id)}</span>
                ) : (
                  <select
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.cost_center_id}
                    onChange={e => updateItem(idx, 'cost_center_id', e.target.value)}
                  >
                    <option value="">Tanpa CC</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                    ))}
                  </select>
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, width: 144 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, textAlign: 'right', display: 'block' }}>{item.debit > 0 ? Number(item.debit).toLocaleString('id-ID') : ''}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, textAlign: 'right' }}
                    value={item.debit}
                    onChange={e => updateItem(idx, 'debit', e.target.value)}
                    placeholder="0"
                  />
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, width: 144 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, textAlign: 'right', display: 'block' }}>{item.credit > 0 ? Number(item.credit).toLocaleString('id-ID') : ''}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, textAlign: 'right' }}
                    value={item.credit}
                    onChange={e => updateItem(idx, 'credit', e.target.value)}
                    placeholder="0"
                  />
                )}
              </td>
              {!readOnly && (
                <td style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 8, paddingBottom: 8 }}>
                  <button
                    onClick={() => onChange(prev => prev.filter((_, i) => i !== idx))}
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
          <tr>
            <td colSpan={3} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontWeight: 600, textAlign: 'right', color: '#374151' }}>Total</td>
            <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
              <Typography.Text strong>{formatCurrency(totalDebit)}</Typography.Text>
            </td>
            <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
              <Typography.Text strong>{formatCurrency(totalCredit)}</Typography.Text>
            </td>
            {!readOnly && <td></td>}
          </tr>
          {!readOnly && (
            <tr>
              <td colSpan={5} className="px-4 py-2">
                <Typography.Text
                  type={isBalanced ? 'success' : totalDebit > 0 ? 'warning' : 'secondary'}
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  {isBalanced ? '✓ Seimbang — siap diposting' : totalDebit > 0 ? `Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}` : 'Isi baris jurnal di atas'}
                </Typography.Text>
              </td>
              {!readOnly && <td></td>}
            </tr>
          )}
        </tfoot>
      </table>

      {!readOnly && (
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => onChange(prev => [...prev, emptyJournalLine()])}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#2563eb' }}
          >
            <Plus size={16} /> Tambah Baris
          </button>
        </div>
      )}
    </>
  )
}
