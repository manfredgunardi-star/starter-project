import { useState, useEffect, useRef } from 'react'
import { Space, Typography, Form, Input, Card, Flex, Alert } from 'antd'
import { useToast } from '../../components/ui/ToastContext'
import { useCompanySettings } from '../../hooks/useCompanySettings'
import { updateCompanySettings, uploadCompanyLogo } from '../../services/companySettingsService'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const { Title } = Typography

export default function CompanySettingsPage() {
  const toast = useToast()
  const { company, loading, error } = useCompanySettings()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (company) {
      form.setFieldsValue({
        name: company.name || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        npwp: company.npwp || '',
        bank_name: company.bank_name || '',
        bank_account_number: company.bank_account_number || '',
        bank_account_name: company.bank_account_name || '',
        signer_name: company.signer_name || '',
        signer_title: company.signer_title || '',
      })
    }
  }, [company, form])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast.error('Format file harus PNG atau JPG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 2MB')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    setSaving(true)
    try {
      let logo_url = company.logo_url || null
      if (logoFile) {
        logo_url = await uploadCompanyLogo(logoFile)
      }
      await updateCompanySettings({ id: company.id, ...values, logo_url })
      toast.success('Pengaturan perusahaan berhasil disimpan')
      setLogoFile(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner message="Memuat pengaturan..." />
  if (error) return <Alert type="error" message={error} />

  const currentLogo = logoPreview || company?.logo_url

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Title level={3} style={{ margin: 0 }}>Pengaturan Perusahaan</Title>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Simpan
        </Button>
      </Flex>

      <Form form={form} layout="vertical">
      <Card>
          <Form.Item
            label="Nama Perusahaan"
            name="name"
            rules={[{ required: true, message: 'Nama perusahaan wajib diisi' }]}
          >
            <Input disabled={saving} />
          </Form.Item>

          <Form.Item label="Alamat" name="address">
            <Input.TextArea rows={3} disabled={saving} />
          </Form.Item>

          <Form.Item label="Telepon" name="phone">
            <Input disabled={saving} />
          </Form.Item>

          <Form.Item label="Email" name="email">
            <Input type="email" disabled={saving} />
          </Form.Item>

          <Form.Item label="NPWP" name="npwp">
            <Input placeholder="XX.XXX.XXX.X-XXX.XXX" disabled={saving} />
          </Form.Item>

          <Form.Item label="Logo Perusahaan">
            <Space direction="vertical">
              {currentLogo ? (
                <img
                  src={currentLogo}
                  alt="Logo perusahaan"
                  style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 4 }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : (
                <div style={{ width: 200, height: 80, border: '1px dashed #d1d5db', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Belum ada logo
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                {currentLogo ? 'Ganti Logo' : 'Upload Logo'}
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Format: PNG, JPG. Maks 2MB.
              </Typography.Text>
            </Space>
          </Form.Item>
      </Card>

      <Card title="Informasi Invoice">
          <Form.Item label="Nama Bank" name="bank_name">
            <Input placeholder="Contoh: BCA, BRI, Mandiri" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nomor Rekening" name="bank_account_number">
            <Input placeholder="Contoh: 1234567890" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nama Pemilik Rekening" name="bank_account_name">
            <Input placeholder="Contoh: PT Nama Perusahaan" disabled={saving} />
          </Form.Item>

          <Form.Item label="Nama Penanda Tangan Invoice" name="signer_name">
            <Input placeholder="Contoh: Aldo Liong" disabled={saving} />
          </Form.Item>

          <Form.Item label="Jabatan Penanda Tangan" name="signer_title">
            <Input placeholder="Contoh: Direktur" disabled={saving} />
          </Form.Item>
      </Card>
      </Form>
    </Space>
  )
}
