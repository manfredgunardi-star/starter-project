import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  Space, Card, Typography, Button, Select, InputNumber, Radio,
  Upload, Table, Row, Col, Flex,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useAccounts } from '../../hooks/useCashBank'
import { useToast } from '../../components/ui/ToastContext'
import {
  parseStatementFile, mapStatementRows, createImportSession,
} from '../../services/bankImportService'
import { today } from '../../utils/date'

const { Title, Text } = Typography

export default function BankStatementImportPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { accounts, loading: accountsLoading } = useAccounts()

  const [accountId, setAccountId] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [skipRows, setSkipRows] = useState(1)
  const [amountMode, setAmountMode] = useState('single')
  const [colMap, setColMap] = useState({
    dateCol: 0,
    descCol: 1,
    amountCol: 2,
    debitCol: 3,
    creditCol: 4,
  })
  const [submitting, setSubmitting] = useState(false)

  const headerRow = rawRows[0] || []
  const colOptions = headerRow.map((header, index) => ({
    value: index,
    label: `Kolom ${index + 1}${header ? `: ${String(header).slice(0, 20)}` : ''}`,
  }))

  const previewRows = rawRows.slice(skipRows, skipRows + 5)
  const previewCols = headerRow.map((header, index) => ({
    title: String(header || `Kolom ${index + 1}`).slice(0, 20),
    dataIndex: index,
    key: index,
    render: value => String(value ?? ''),
    width: 120,
  }))
  const previewData = previewRows.map((row, index) => {
    const record = { key: index }
    row.forEach((value, columnIndex) => {
      record[columnIndex] = value
    })
    return record
  })

  async function handleFileSelect(file) {
    try {
      const rows = await parseStatementFile(file)
      setRawRows(rows)
      setFileName(file.name)
    } catch (err) {
      toast.error(err.message)
    }
    return false
  }

  async function handleSubmit() {
    if (!accountId) {
      toast.error('Pilih akun terlebih dahulu')
      return
    }
    if (rawRows.length === 0) {
      toast.error('Upload file terlebih dahulu')
      return
    }

    const effectiveColMap = amountMode === 'single'
      ? { dateCol: colMap.dateCol, descCol: colMap.descCol, amountCol: colMap.amountCol }
      : { dateCol: colMap.dateCol, descCol: colMap.descCol, debitCol: colMap.debitCol, creditCol: colMap.creditCol }

    const rows = mapStatementRows(rawRows, effectiveColMap, skipRows)
    if (rows.length === 0) {
      toast.error('Tidak ada baris valid yang dapat diproses. Periksa konfigurasi kolom.')
      return
    }

    setSubmitting(true)
    try {
      const sessionId = await createImportSession(accountId, fileName, today(), rows)
      navigate(`/cash/import/${sessionId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map(account => ({
    value: account.id,
    label: `${account.name} (${account.type === 'bank' ? 'Bank' : 'Kas'})`,
  }))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/cash/accounts')} />
        <Title level={2} style={{ margin: 0 }}>Import Rekening Koran</Title>
      </Flex>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Card title="1. Pilih Akun & Upload File">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text strong>Akun Bank/Kas</Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="Pilih akun..."
                    options={accountOptions}
                    value={accountId}
                    onChange={setAccountId}
                    loading={accountsLoading}
                  />
                </div>
                <div>
                  <Text strong>File Rekening Koran (.csv, .xlsx, .xls)</Text>
                  <div style={{ marginTop: 4 }}>
                    <Upload
                      accept=".csv,.xlsx,.xls"
                      beforeUpload={handleFileSelect}
                      showUploadList={false}
                      maxCount={1}
                    >
                      <Button icon={<UploadOutlined />}>
                        {fileName || 'Pilih File'}
                      </Button>
                    </Upload>
                  </div>
                </div>
                <div>
                  <Text strong>Skip baris awal (header)</Text>
                  <InputNumber
                    style={{ width: '100%', marginTop: 4 }}
                    min={0}
                    max={10}
                    value={skipRows}
                    onChange={value => setSkipRows(value ?? 1)}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Biasanya 1 untuk melewati baris judul kolom. Sesuaikan jika ada baris meta di atas.
                  </Text>
                </div>
              </Space>
            </Card>

            {rawRows.length > 0 && (
              <Card title="2. Pemetaan Kolom">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div>
                    <Text strong>Kolom Tanggal</Text>
                    <Select
                      style={{ width: '100%', marginTop: 4 }}
                      options={colOptions}
                      value={colMap.dateCol}
                      onChange={value => setColMap(current => ({ ...current, dateCol: value }))}
                    />
                  </div>
                  <div>
                    <Text strong>Kolom Keterangan (opsional)</Text>
                    <Select
                      style={{ width: '100%', marginTop: 4 }}
                      options={[{ value: null, label: '- Tidak ada -' }, ...colOptions]}
                      value={colMap.descCol}
                      onChange={value => setColMap(current => ({ ...current, descCol: value }))}
                    />
                  </div>
                  <div>
                    <Text strong>Mode Jumlah</Text>
                    <Radio.Group
                      style={{ marginTop: 4, display: 'block' }}
                      value={amountMode}
                      onChange={event => setAmountMode(event.target.value)}
                    >
                      <Radio value="single">Satu kolom (+ = masuk, - = keluar)</Radio>
                      <Radio value="split">Dua kolom terpisah (Debit dan Kredit)</Radio>
                    </Radio.Group>
                  </div>
                  {amountMode === 'single' ? (
                    <div>
                      <Text strong>Kolom Jumlah</Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        options={colOptions}
                        value={colMap.amountCol}
                        onChange={value => setColMap(current => ({ ...current, amountCol: value }))}
                      />
                    </div>
                  ) : (
                    <Row gutter={12}>
                      <Col span={12}>
                        <Text strong>Kolom Debit (keluar)</Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          options={colOptions}
                          value={colMap.debitCol}
                          onChange={value => setColMap(current => ({ ...current, debitCol: value }))}
                        />
                      </Col>
                      <Col span={12}>
                        <Text strong>Kolom Kredit (masuk)</Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          options={colOptions}
                          value={colMap.creditCol}
                          onChange={value => setColMap(current => ({ ...current, creditCol: value }))}
                        />
                      </Col>
                    </Row>
                  )}
                </Space>
              </Card>
            )}

            {rawRows.length > 0 && (
              <Flex justify="flex-end" gap={8}>
                <Button onClick={() => navigate('/cash/accounts')}>Batal</Button>
                <Button type="primary" loading={submitting} onClick={handleSubmit}>
                  Proses Import
                </Button>
              </Flex>
            )}
          </Space>
        </Col>

        {rawRows.length > 0 && (
          <Col xs={24} lg={10}>
            <Card title={`Preview (5 baris pertama setelah skip ${skipRows} baris)`} size="small">
              <Table
                dataSource={previewData}
                columns={previewCols}
                pagination={false}
                size="small"
                scroll={{ x: true }}
                locale={{ emptyText: 'Tidak ada data' }}
              />
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  )
}
