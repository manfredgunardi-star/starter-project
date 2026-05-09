import Input from '../ui/Input'
import Select from '../ui/Select'
import StatusBadge from '../ui/StatusBadge'
import DateInput from '../ui/DateInput'
import { Card, Space, Typography, Flex } from 'antd'
import { Row, Col } from 'antd'

const { Text } = Typography

export default function DocumentHeader({
  docNumber,
  onDocNumberChange,
  date,
  onDateChange,
  status,
  partyLabel = 'Pihak',
  partyId,
  onPartyChange,
  partyOptions = [],
  dueDate,
  onDueDateChange,
  notes,
  onNotesChange,
  readOnly = false,
  children,
}) {
  return (
    <Card>
      <Flex justify="space-between" align="flex-start" gap={16}>
        <div style={{ flex: 1 }}>
          <Row gutter={16}>
            {/* Document Number */}
            <Col span={12}>
              <Input
                label="No. Dokumen"
                value={docNumber || ''}
                onChange={e => onDocNumberChange?.(e.target.value)}
                readOnly={readOnly || !onDocNumberChange}
                placeholder="Otomatis"
                className={readOnly ? 'bg-gray-50' : ''}
              />
            </Col>

            {/* Date */}
            <Col span={12}>
              <DateInput
                label="Tanggal *"
                value={date || ''}
                onChange={e => onDateChange?.(e.target.value)}
                disabled={readOnly}
              />
            </Col>

            {/* Party (customer/supplier) */}
            <Col span={12} style={{ marginTop: 16 }}>
              {readOnly ? (
                <Input
                  label={partyLabel}
                  value={partyOptions.find(o => o.value === partyId)?.label || partyId || '—'}
                  readOnly
                />
              ) : (
                <Select
                  label={`${partyLabel} *`}
                  options={partyOptions}
                  value={partyId || ''}
                  onChange={e => onPartyChange?.(e.target.value)}
                  placeholder={`Pilih ${partyLabel.toLowerCase()}...`}
                />
              )}
            </Col>

            {/* Due date (optional) */}
            {(dueDate !== undefined) && (
              <Col span={12} style={{ marginTop: 16 }}>
                <DateInput
                  label="Jatuh Tempo"
                  value={dueDate || ''}
                  onChange={e => onDueDateChange?.(e.target.value)}
                  disabled={readOnly}
                />
              </Col>
            )}

            {/* Extra slots */}
            {children}
          </Row>
        </div>

        {/* Status badge */}
        {status && (
          <div style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Status</Text>
            <StatusBadge status={status} />
          </div>
        )}
      </Flex>

      {/* Notes */}
      {(notes !== undefined) && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={4}>
          <Text strong style={{ fontSize: 13 }}>Catatan</Text>
          <textarea
            value={notes || ''}
            onChange={e => onNotesChange?.(e.target.value)}
            readOnly={readOnly}
            rows={2}
            placeholder="Catatan opsional..."
            style={{
              width: '100%',
              padding: '6px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              fontSize: 13,
              color: '#374151',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </Space>
      )}
    </Card>
  )
}
