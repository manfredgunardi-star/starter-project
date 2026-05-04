import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Space, Flex, Typography, Card, Row, Col, Alert, Divider } from 'antd'
import { ArrowLeft, Save } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import DateInput from '../../components/ui/DateInput'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import {
  getRecurringTemplate,
  createRecurringTemplate,
  updateRecurringTemplate,
} from '../../services/recurringService'

const { Title } = Typography

const TYPE_OPTIONS = [
  { value: 'invoice', label: 'Sales Invoice' },
  { value: 'journal', label: 'Manual Jurnal' },
]

const INTERVAL_OPTIONS = [
  { value: 'daily',   label: 'Harian' },
  { value: 'weekly',  label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly',  label: 'Tahunan' },
]

const DAY_OPTIONS = [
  { value: -1, label: 'Hari terakhir bulan' },
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `Tanggal ${i + 1}` })),
]

export default function RecurringFormPage() {
  const { id }   = useParams()
  const isEdit   = Boolean(id) && id !== 'new'
  const navigate = useNavigate()

  const [loading, setLoading] = useState(isEdit)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [errors,  setErrors]  = useState({})

  const [form, setForm] = useState({
    name:          '',
    type:          'invoice',
    interval_type: 'monthly',
    day_of_month:  1,
    start_date:    '',
    end_date:      '',
  })

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getRecurringTemplate(id)
      .then(tmpl => {
        setForm({
          name:          tmpl.name ?? '',
          type:          tmpl.type ?? 'invoice',
          interval_type: tmpl.interval_type ?? 'monthly',
          day_of_month:  tmpl.day_of_month ?? 1,
          start_date:    tmpl.start_date ?? '',
          end_date:      tmpl.end_date ?? '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  function setField(name, value) {
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(e => ({ ...e, [name]: undefined }))
  }

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Nama wajib diisi'
    if (!form.type) next.type = 'Tipe wajib dipilih'
    if (!form.interval_type) next.interval_type = 'Interval wajib dipilih'
    if (!form.start_date) next.start_date = 'Tanggal mulai wajib diisi'
    if (form.interval_type === 'monthly' && form.day_of_month === undefined) {
      next.day_of_month = 'Pilih hari'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await updateRecurringTemplate(id, {
          name:          form.name,
          interval_type: form.interval_type,
          day_of_month:  form.interval_type === 'monthly' ? form.day_of_month : null,
          start_date:    form.start_date,
          end_date:      form.end_date || null,
        })
      } else {
        await createRecurringTemplate({
          name:          form.name,
          type:          form.type,
          interval_type: form.interval_type,
          day_of_month:  form.interval_type === 'monthly' ? form.day_of_month : null,
          day_of_week:   null,
          start_date:    form.start_date,
          end_date:      form.end_date || null,
          template_data: form.type === 'invoice'
            ? { customer_id: null, due_days: 30, notes: form.name, items: [] }
            : { description: form.name, items: [] },
        })
      }
      navigate('/accounting/recurring')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate('/accounting/recurring')} />
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'Edit Template Berulang' : 'Tambah Template Berulang'}
        </Title>
      </Flex>

      {error && <Alert type="error" message={error} showIcon />}

      <Card>
        <form onSubmit={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Input
                label="Nama Template"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="Contoh: Invoice Sewa Alat Bulanan"
                error={errors.name}
              />
            </Col>
            <Col xs={24} md={12}>
              <Select
                label="Tipe Transaksi"
                value={form.type}
                onChange={e => setField('type', e.target.value)}
                options={TYPE_OPTIONS}
                disabled={isEdit}
                error={errors.type}
              />
            </Col>
          </Row>

          <Divider orientation="left">Jadwal</Divider>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Select
                label="Interval"
                value={form.interval_type}
                onChange={e => setField('interval_type', e.target.value)}
                options={INTERVAL_OPTIONS}
                error={errors.interval_type}
              />
            </Col>
            {form.interval_type === 'monthly' && (
              <Col xs={24} md={8}>
                <Select
                  label="Hari ke-"
                  value={form.day_of_month}
                  onChange={e => setField('day_of_month', e.target.value === '' ? null : Number(e.target.value))}
                  options={DAY_OPTIONS}
                  error={errors.day_of_month}
                />
              </Col>
            )}
          </Row>

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24} md={8}>
              <DateInput
                label="Mulai Tanggal *"
                value={form.start_date}
                onChange={e => setField('start_date', e.target.value)}
                error={errors.start_date}
              />
            </Col>
            <Col xs={24} md={8}>
              <DateInput
                label="Berakhir Tanggal (opsional)"
                value={form.end_date}
                onChange={e => setField('end_date', e.target.value)}
              />
            </Col>
          </Row>

          {!isEdit && (
            <Alert
              type="info"
              showIcon
              message="Setelah disimpan, edit detail transaksi (customer, item) dengan menggunakan toggle 'Jadikan Berulang' di form Invoice/Jurnal — atau lewat halaman ini setelah Phase 2."
              style={{ marginTop: 16, marginBottom: 16 }}
            />
          )}

          <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => navigate('/accounting/recurring')}>Batal</Button>
            <Button variant="primary" type="submit" loading={saving} icon={<Save size={16} />}>
              Simpan
            </Button>
          </Flex>
        </form>
      </Card>
    </Space>
  )
}
