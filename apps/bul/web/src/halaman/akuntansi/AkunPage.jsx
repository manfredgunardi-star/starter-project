import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Flex, Typography, Tag } from 'antd';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';

function keTree(rows) {
  const peta = new Map(rows.map((r) => [r.kode, { ...r, children: [] }]));
  const akar = [];
  for (const r of peta.values()) (r.induk_kode && peta.get(r.induk_kode) ? peta.get(r.induk_kode).children : akar).push(r);
  for (const r of peta.values()) if (!r.children.length) delete r.children;
  return akar;
}

export default function AkunPage() {
  const { peran } = useAuth();
  const bisa = boleh(peran, 'akuntansi.pengaturan');
  const q = useDaftar('akun', { order: { kolom: 'kode' } });
  const simpan = useRpc('simpan_akun', { invalidate: ['akun'] });
  const [edit, setEdit] = useState(null);
  const [form] = Form.useForm();
  const header = (q.data ?? []).filter((a) => a.tipe === 'header').map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  return (
    <>
      <Flex justify="space-between" style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Daftar Akun</Typography.Title>
        {bisa && <Button type="primary" onClick={() => setEdit({})}>Tambah akun</Button>}
      </Flex>
      <Table rowKey="kode" size="small" loading={q.isLoading} dataSource={keTree(q.data ?? [])} pagination={false} expandable={{ defaultExpandAllRows: true }} columns={[
        { title: 'Kode', dataIndex: 'kode' },
        { title: 'Nama', dataIndex: 'nama', render: (v, r) => (r.tipe === 'header' ? <b>{v}</b> : v) },
        { title: 'Normal', dataIndex: 'saldo_normal' },
        { title: '', key: 't', render: (_, r) => <>{r.kas_bank && <Tag color="blue">kas/bank</Tag>}{!r.aktif && <Tag>nonaktif</Tag>}</> },
        { title: '', key: 'a', render: (_, r) => bisa && <Button size="small" onClick={() => setEdit(r)}>Ubah</Button> },
      ]} />
      <Modal open={Boolean(edit)} title={edit?.kode ? `Ubah akun ${edit.kode}` : 'Akun baru'} okText="Simpan" destroyOnHidden
        confirmLoading={simpan.isPending} onCancel={() => setEdit(null)}
        afterOpenChange={(o) => o && form.setFieldsValue({ tipe: 'detail', saldo_normal: 'debit', kas_bank: false, aktif: true, ...edit })}
        onOk={async () => {
          const v = await form.validateFields();
          await simpan.mutateAsync({ p_kode: v.kode, p_nama: v.nama, p_induk_kode: v.induk_kode ?? null, p_tipe: v.tipe, p_saldo_normal: v.saldo_normal, p_kas_bank: v.kas_bank, p_aktif: v.aktif });
          setEdit(null);
        }}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="kode" label="Kode (4 digit)" rules={[{ required: true, pattern: /^\d{4}$/, message: '4 digit angka' }]}><Input disabled={Boolean(edit?.kode)} /></Form.Item>
          <Form.Item name="nama" label="Nama" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="induk_kode" label="Induk"><Select allowClear showSearch optionFilterProp="label" options={header} /></Form.Item>
          <Form.Item name="tipe" label="Tipe"><Select options={[{ value: 'header', label: 'Header' }, { value: 'detail', label: 'Detail' }]} /></Form.Item>
          <Form.Item name="saldo_normal" label="Saldo normal"><Select options={[{ value: 'debit', label: 'Debit' }, { value: 'kredit', label: 'Kredit' }]} /></Form.Item>
          <Form.Item name="kas_bank" label="Akun kas/bank" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="aktif" label="Aktif" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
