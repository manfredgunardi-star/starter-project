import { useState } from 'react';
import { Table, Modal, Form, Input, Select, Switch, Button, Alert, Tag } from 'antd';
import { useDaftar, useRpc } from '../lib/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';

const PERAN = ['owner', 'keuangan', 'operasional', 'viewer'].map((p) => ({ value: p, label: p }));

export default function PenggunaPage() {
  const { profil: saya } = useAuth();
  const q = useDaftar('profil', { order: { kolom: 'email' } });
  const atur = useRpc('atur_profil', { invalidate: ['profil'] });
  const [edit, setEdit] = useState(null);
  const [form] = Form.useForm();
  return (
    <>
      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="Pengguna baru dibuat di dashboard Supabase → Authentication → Add user. Setelah itu aktifkan dan beri peran di sini."
      />
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={q.data ?? []}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Nama', dataIndex: 'nama' },
          { title: 'Peran', dataIndex: 'peran' },
          { title: 'Status', dataIndex: 'aktif', render: (v) => (v ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>) },
          { title: '', key: 'a', render: (_, r) => <Button size="small" onClick={() => setEdit(r)}>Atur</Button> },
        ]}
      />
      <Modal
        open={Boolean(edit)} title={`Atur ${edit?.email ?? ''}`} okText="Simpan" destroyOnHidden
        confirmLoading={atur.isPending}
        afterOpenChange={(o) => o && form.setFieldsValue(edit)}
        onCancel={() => setEdit(null)}
        onOk={async () => {
          const v = await form.validateFields();
          await atur.mutateAsync({ p_id: edit.id, p_peran: v.peran, p_aktif: v.aktif, p_nama: v.nama ?? '' });
          setEdit(null);
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="nama" label="Nama"><Input /></Form.Item>
          <Form.Item name="peran" label="Peran" rules={[{ required: true }]}>
            <Select options={PERAN} disabled={edit?.id === saya?.id} />
          </Form.Item>
          <Form.Item name="aktif" label="Aktif" valuePropName="checked">
            <Switch disabled={edit?.id === saya?.id} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
