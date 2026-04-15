import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Card, Form, Input, Button, Typography, Alert } from 'antd'
import { LogIn } from 'lucide-react'

const { Title } = Typography

export default function LoginPage() {
  const { signIn } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(values) {
    setError('')
    setLoading(true)
    try {
      await signIn(values.email, values.password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <Card style={{ width: 360 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>ERP Pembukuan</Title>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: 'Email wajib diisi' }]}
          >
            <Input type="email" disabled={loading} />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Password wajib diisi' }]}
          >
            <Input.Password disabled={loading} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              icon={<LogIn size={16} />}
            >
              {loading ? 'Masuk...' : 'Masuk'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
