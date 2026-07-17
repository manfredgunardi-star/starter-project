import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { useCOA } from '../../hooks/useMasterData'
import { saveManualJournal, postManualJournal, getJournal } from '../../services/journalService'
import { createRecurringTemplate } from '../../services/recurringService'
import { listCostCenters } from '../../services/costCenterService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import JournalLinesEditor, { emptyJournalLine, computeJournalTotals } from '../../components/journal/JournalLinesEditor'
import { ArrowLeft, Save, Send, Repeat } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Alert, Typography, Switch, Select as AntdSelect } from 'antd'

export default function ManualJournalFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'
  const { coa } = useCOA()
  const { accounts } = useAccounts()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({ date: today(), description: '', status: 'draft' })
  const [items, setItems] = useState([emptyJournalLine(), emptyJournalLine()])
  const [costCenters, setCostCenters] = useState([])

  // ----- Recurring template state (only relevant for new journals) -----
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [recurInterval, setRecurInterval] = useState('monthly')
  const [recurDay,      setRecurDay]      = useState(1)
  const [recurStart,    setRecurStart]    = useState('')

  useEffect(() => {
    listCostCenters().then(setCostCenters).catch(() => {})
  }, [])

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
            account_id: i.account_id || '',
            coa_code: i.coa?.code,
            coa_name: i.coa?.name,
            description: i.description || '',
            cost_center_id: i.cost_center_id || '',
            debit: i.debit > 0 ? i.debit : '',
            credit: i.credit > 0 ? i.credit : '',
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew, toast])

  const readOnly = (!isNew && header.status === 'posted') || !canPost
  const { isBalanced } = computeJournalTotals(items)

  const round2 = n => Math.round(Number(n || 0) * 100) / 100

  const handleSave = async () => {
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    if (!header.description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items
      .filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
      .map(i => ({ ...i, cost_center_id: i.cost_center_id || null, debit: round2(i.debit), credit: round2(i.credit) }))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }
    if (makeRecurring && !recurStart) {
      toast.error('Tanggal mulai untuk template berulang wajib diisi')
      return
    }

    setSubmitting(true)
    try {
      const journalId = await saveManualJournal(header, validItems)

      if (makeRecurring && isNew) {
        try {
          await createRecurringTemplate({
            name:          `Jurnal Berulang – ${header.description ?? 'Jurnal'}`,
            type:          'journal',
            interval_type: recurInterval,
            day_of_month:  recurInterval === 'monthly' ? recurDay : null,
            start_date:    recurStart,
            template_data: {
              description: header.description ?? '',
              items: validItems.map(it => ({
                coa_id:      it.coa_id,
                description: it.description ?? '',
                cost_center_id: it.cost_center_id ?? null,
                debit:       Number(it.debit)  || 0,
                credit:      Number(it.credit) || 0,
              })),
            },
          })
          toast.success('Template berulang dibuat')
        } catch (err) {
          toast.error('Jurnal tersimpan, tapi gagal membuat template berulang: ' + err.message)
        }
      }

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
        <JournalLinesEditor
          items={items}
          onChange={setItems}
          coa={coa}
          accounts={accounts}
          costCenters={costCenters}
          readOnly={readOnly}
        />
      </Card>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Jurnal telah diposting dan tidak dapat diubah."
          showIcon
        />
      )}

      {/* Recurring template toggle (only for new journals) */}
      {isNew && !readOnly && canPost && (
        <Card>
          <Flex align="center" gap={12}>
            <Switch
              checked={makeRecurring}
              onChange={setMakeRecurring}
              id="recurring-toggle-journal"
            />
            <label htmlFor="recurring-toggle-journal" style={{ cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Repeat size={16} /> Jadikan Berulang
            </label>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Buat template untuk auto-create jurnal di masa depan.
            </Typography.Text>
          </Flex>

          {makeRecurring && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Interval</div>
                <AntdSelect
                  value={recurInterval}
                  onChange={setRecurInterval}
                  options={[
                    { value: 'daily',   label: 'Harian' },
                    { value: 'weekly',  label: 'Mingguan' },
                    { value: 'monthly', label: 'Bulanan' },
                    { value: 'yearly',  label: 'Tahunan' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Col>
              {recurInterval === 'monthly' && (
                <Col xs={24} md={8}>
                  <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Tanggal ke-</div>
                  <AntdSelect
                    value={recurDay}
                    onChange={setRecurDay}
                    options={[
                      { value: -1, label: 'Hari terakhir bulan' },
                      ...Array.from({ length: 28 }, (_, i) => ({
                        value: i + 1, label: `${i + 1}`,
                      })),
                    ]}
                    style={{ width: '100%' }}
                  />
                </Col>
              )}
              <Col xs={24} md={8}>
                <DateInput
                  label="Mulai Tanggal *"
                  value={recurStart}
                  onChange={e => setRecurStart(e.target.value)}
                />
              </Col>
            </Row>
          )}
        </Card>
      )}
    </Space>
  )
}
