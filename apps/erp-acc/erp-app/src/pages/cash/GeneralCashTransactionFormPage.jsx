// src/pages/cash/GeneralCashTransactionFormPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { useCOA } from '../../hooks/useMasterData'
import { saveGeneralCashTransaction } from '../../services/cashBankService'
import { listCostCenters } from '../../services/costCenterService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import JournalLinesEditor, { emptyJournalLine, computeJournalTotals } from '../../components/journal/JournalLinesEditor'
import { ArrowLeft, Send } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Typography } from 'antd'

export default function GeneralCashTransactionFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { coa } = useCOA()
  const { accounts } = useAccounts()

  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [items, setItems] = useState([emptyJournalLine(), emptyJournalLine()])
  const [costCenters, setCostCenters] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listCostCenters().then(setCostCenters).catch(() => {})
  }, [])

  const { isBalanced } = computeJournalTotals(items)
  const hasCashLeg = items.some(i => i.account_id)

  const round2 = n => Math.round(Number(n || 0) * 100) / 100

  const handleSubmit = async () => {
    if (!date) { toast.error('Tanggal wajib diisi'); return }
    if (!description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items
      .filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
      .map(i => ({ ...i, debit: round2(i.debit), credit: round2(i.credit) }))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }
    if (!validItems.some(i => i.account_id)) {
      toast.error('Minimal satu baris harus terhubung ke akun kas/bank')
      return
    }
    const { isBalanced: validBalanced } = computeJournalTotals(validItems)
    if (!validBalanced) {
      toast.error('Jurnal belum seimbang — total debit harus sama dengan total kredit')
      return
    }

    setSubmitting(true)
    try {
      const journalId = await saveGeneralCashTransaction({ date, description, lines: validItems })
      toast.success('Transaksi berhasil diposting')
      navigate(`/accounting/journals/${journalId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/cash/accounts')} style={{ color: '#6b7280' }}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={3} style={{ margin: 0 }}>Transaksi Kas/Bank Lainnya</Typography.Title>
        </Space>
        <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!isBalanced || !hasCashLeg}>
          <Send size={18} /> Posting Transaksi
        </Button>
      </Flex>

      <Card>
        <Row gutter={16}>
          <Col span={12}>
            <DateInput label="Tanggal *" value={date} onChange={e => setDate(e.target.value)} />
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151' }}>Deskripsi *</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Mis. Biaya admin bank Oktober 2026..."
                style={{ width: '100%', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <JournalLinesEditor
          items={items}
          onChange={setItems}
          coa={coa}
          accounts={accounts}
          costCenters={costCenters}
          readOnly={false}
        />
      </Card>

      {!hasCashLeg && (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          Minimal satu baris harus terhubung ke akun kas/bank (pilih "Rekening" pada salah satu baris).
        </Typography.Text>
      )}
    </Space>
  )
}
