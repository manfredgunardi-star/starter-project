import { useState } from 'react'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { saveReconciliation } from '../../services/cashBankService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import DateInput from '../../components/ui/DateInput'
import { CheckCircle, XCircle } from 'lucide-react'
import { Space, Row, Col, Card, Typography, Flex } from 'antd'

export default function ReconciliationPage() {
  const toast = useToast()
  const { accounts } = useAccounts()

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    account_id: '',
    date: today(),
    statement_balance: '',
  })

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const selectedAccount = accounts.find(a => a.id === form.account_id)
  const diff = selectedAccount && form.statement_balance !== ''
    ? Number(form.statement_balance) - selectedAccount.balance
    : null

  const handleSave = async () => {
    if (!form.account_id) { toast.error('Pilih akun'); return }
    if (!form.date) { toast.error('Tanggal wajib diisi'); return }
    if (form.statement_balance === '') { toast.error('Masukkan saldo rekening koran'); return }

    setSubmitting(true)
    try {
      const rec = await saveReconciliation(form)
      setResult(rec)
      toast.success('Rekonsiliasi berhasil disimpan')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map(a => ({
    value: a.id,
    label: `${a.name} (${a.type === 'bank' ? 'Bank' : 'Kas'})`
  }))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Typography.Title level={2} style={{ margin: 0 }}>Rekonsiliasi Bank</Typography.Title>

      <Row gutter={24}>
        {/* Input form */}
        <Col xs={24} md={12}>
          <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Typography.Title level={5} style={{ margin: 0 }}>Rekonsiliasi Baru</Typography.Title>

              <Select
                label="Akun *"
                options={accountOptions}
                value={form.account_id}
                onChange={e => { field('account_id', e.target.value); setResult(null) }}
                placeholder="Pilih akun..."
              />

              <DateInput
                label="Tanggal Rekonsiliasi *"
                value={form.date}
                onChange={e => field('date', e.target.value)}
              />

              <Input
                label="Saldo Rekening Koran *"
                type="number"
                step="any"
                placeholder="0"
                value={form.statement_balance}
                onChange={e => { field('statement_balance', e.target.value); setResult(null) }}
              />

              {/* Live comparison */}
              {selectedAccount && form.statement_balance !== '' && (
                <Card size="small" style={{ background: '#fafafa' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Flex justify="space-between">
                      <Typography.Text type="secondary">Saldo Sistem</Typography.Text>
                      <Typography.Text strong>{formatCurrency(selectedAccount.balance)}</Typography.Text>
                    </Flex>
                    <Flex justify="space-between">
                      <Typography.Text type="secondary">Saldo Rekening Koran</Typography.Text>
                      <Typography.Text strong>{formatCurrency(Number(form.statement_balance))}</Typography.Text>
                    </Flex>
                    <div style={{ borderTop: '1px solid #d9d9d9', paddingTop: 8 }}>
                      <Flex justify="space-between">
                        <Typography.Text strong>Selisih</Typography.Text>
                        <Typography.Text strong type={diff === 0 ? 'success' : 'danger'}>
                          {formatCurrency(Math.abs(diff))} {diff > 0 ? '(lebih)' : diff < 0 ? '(kurang)' : ''}
                        </Typography.Text>
                      </Flex>
                    </div>
                    {diff === 0 && (
                      <Flex align="center" gap={8}>
                        <CheckCircle size={14} style={{ color: '#52c41a' }} />
                        <Typography.Text type="success" style={{ fontSize: 12 }}>
                          Saldo sesuai — siap direkonsiliasi
                        </Typography.Text>
                      </Flex>
                    )}
                    {diff !== 0 && (
                      <Flex align="center" gap={8}>
                        <XCircle size={14} style={{ color: '#fa8c16' }} />
                        <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                          Ada selisih — periksa transaksi yang belum dicatat
                        </Typography.Text>
                      </Flex>
                    )}
                  </Space>
                </Card>
              )}

              <Button variant="primary" onClick={handleSave} loading={submitting}>
                Simpan Rekonsiliasi
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Result */}
        {result && (
          <Col xs={24} md={12}>
            <Card
              style={{
                background: result.is_reconciled ? '#f6ffed' : '#fff7e6',
                borderColor: result.is_reconciled ? '#b7eb8f' : '#ffd591',
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Flex align="center" gap={12}>
                  {result.is_reconciled
                    ? <CheckCircle size={24} style={{ color: '#52c41a' }} />
                    : <XCircle size={24} style={{ color: '#fa8c16' }} />
                  }
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {result.is_reconciled ? 'Rekonsiliasi Sukses' : 'Ada Selisih'}
                  </Typography.Title>
                </Flex>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Flex justify="space-between">
                    <Typography.Text type="secondary">Saldo Sistem</Typography.Text>
                    <Typography.Text strong>{formatCurrency(result.system_balance)}</Typography.Text>
                  </Flex>
                  <Flex justify="space-between">
                    <Typography.Text type="secondary">Saldo Rekening Koran</Typography.Text>
                    <Typography.Text strong>{formatCurrency(result.statement_balance)}</Typography.Text>
                  </Flex>
                  <div style={{ borderTop: '1px solid #d9d9d9', paddingTop: 8 }}>
                    <Flex justify="space-between">
                      <Typography.Text strong>Selisih</Typography.Text>
                      <Typography.Text strong type={result.is_reconciled ? 'success' : 'danger'}>
                        {formatCurrency(Math.abs(result.statement_balance - result.system_balance))}
                      </Typography.Text>
                    </Flex>
                  </div>
                </Space>
                {!result.is_reconciled && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    Periksa transaksi yang belum dicatat atau transaksi yang masih dalam proses.
                  </Typography.Text>
                )}
              </Space>
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  )
}
