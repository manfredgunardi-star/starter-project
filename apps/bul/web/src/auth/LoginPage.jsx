import { useState } from 'react';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { supabase } from '../lib/supabase.js';
import { pesanError } from '../lib/errors.js';

export default function LoginPage() {
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  async function masuk({ email, password }) {
    setSibuk(true);
    setGalat(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setGalat(error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : pesanError(error));
    setSibuk(false);
  }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Typography.Title level={3}>BUL</Typography.Title>
        {galat && <Alert type="error" message={galat} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={masuk}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input autoComplete="email" /></Form.Item>
          <Form.Item name="password" label="Kata sandi" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={sibuk}>Masuk</Button>
        </Form>
      </Card>
    </div>
  );
}
