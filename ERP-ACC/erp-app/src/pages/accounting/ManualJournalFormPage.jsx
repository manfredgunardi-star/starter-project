import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useCOA } from '../../hooks/useMasterData'
import { saveManualJournal, postManualJournal, getJournal } from '../../services/journalService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DateInput from '../../components/ui/DateInput'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Plus, Trash2 } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Alert, Typography } from 'antd'

const emptyRow = () => ({ _key: Date.now() + Math.random(), coa_id: '', description: '', debit: '', credit: '' })

export default function ManualJournalFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'
  const { coa } = useCOA()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({ date: today(), description: '', status: 'draft' })
  const [items, setItems] = useState([emptyRow(), emptyRow()])

  useEffect(() => {
    if (!isNew) {
      getJournal(id)
        .then(j => {
          setHeader({
            id: j.id,
            journal_number: j.journal_number,
            date: j.date,
            description: j.description,
            status: j.is_posted ? 'posted' : 'draft',
          })
          setItems(j.journal_items.map(i => ({
            _key: i.id,
            coa_id: i.coa_id,
            coa_code: i.coa?.code,
            coa_name: i.coa?.name,
            description: i.description || '',
            debit: i.debit > 0 ? i.debit : '',
            credit: i.credit > 0 ? i.credit : '',
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const readOnly = (!isNew && header.status === 'posted') || !canPost

  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0)
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0)
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [key]: value }
      // Clear the other side when one is entered
      if (key === 'debit' && value) updated.credit = ''
      if (key === 'credit' && value) updated.debit = ''
      return updated
    }))
  }

  const handleSave = async () => {
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    if (!header.description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items.filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }

    setSubmitting(true)
    try {
      const journalId = await saveManualJournal(header, validItems)
      toast.success('Jurnal berhasil disimpan')
      navigate(`/accounting/journals/${journalId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    if (!isBalanced) { toast.error('Jurnal belum seimbang — total debit harus sama dengan total kredit'); return }
    setSubmitting(true)
    try {
      await postManualJournal(id)
      toast.success('Jurnal berhasil diposting')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Flatten COA for dropdown
  const coaOptions = coa.filter(c => !c.children?.length).map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  // Actually show all COA with code
  const allCoaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))

  if (loading) return <LoadingSpinner message="Memuat jurnal..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/accounting/journals')} style={{ color: '#6b7280' }}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {isNew ? 'Jurnal Manual Baru' : `Jurnal ${header.journal_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canPost && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && !readOnly && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting} disabled={!isBalanced}>
              <Send size={18} /> Post Jurnal
            </Button>
          )}
        </Space>
      </Flex>

      {/* Header */}
      <Card>
        <Row gutter={16}>
          <Col span={12}>
            <DateInput
              label="Tanggal *"
              value={header.date}
              onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
              disabled={readOnly}
            />
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151' }}>Deskripsi *</label>
              <input
                type="text"
                value={header.description}
                onChange={e => setHeader(h => ({ ...h, description: e.target.value }))}
                readOnly={readOnly}
                placeholder="Keterangan jurnal..."
                style={{ width: '100%', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Items table */}
      <Card bodyStyle={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Akun (COA)</th>
              <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Keterangan</th>
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
                      onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
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
              <td colSpan={2} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontWeight: 600, textAlign: 'right', color: '#374151' }}>Total</td>
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
                <td colSpan={4} className="px-4 py-2">
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
              onClick={() => setItems(prev => [...prev, emptyRow()])}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#2563eb' }}
            >
              <Plus size={16} /> Tambah Baris
            </button>
          </div>
        )}
      </Card>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Jurnal telah diposting dan tidak dapat diubah."
          showIcon
        />
      )}
    </Space>
  )
}
