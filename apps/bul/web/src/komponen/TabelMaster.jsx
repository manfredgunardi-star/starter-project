import { useState } from 'react';
import { Table, Button, Modal, Form, Flex, Typography, Tag } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../auth/AuthProvider.jsx';
import { boleh } from '../layout/menu.js';
import { useDaftar, useRpc } from '../lib/data.js';
import FieldDinamis from './FieldDinamis.jsx';

function keNilaiForm(field, baris) {
  const out = {};
  for (const f of field) {
    const v = baris?.[f.name];
    if (f.tipe === 'tanggal') out[f.name] = v ? dayjs(v) : f.bawaan === 'hari_ini' ? dayjs() : undefined;
    else if (v === undefined || v === null) out[f.name] = f.bawaan;
    else out[f.name] = v;
  }
  return out;
}

export default function TabelMaster({ konfig }) {
  const { peran } = useAuth();
  const bisaTulis = boleh(peran, konfig.hak);
  const q = useDaftar(konfig.tabel, { select: konfig.select ?? '*', order: konfig.order, filter: konfig.filter });
  const simpan = useRpc(konfig.rpc, { invalidate: [konfig.tabel, ...(konfig.invalidateLain ?? [])] });
  const [edit, setEdit] = useState(null); // null = tertutup, {} = baru, baris = ubah
  const [form] = Form.useForm();

  const kolom = [
    ...konfig.kolom,
    ...(konfig.kolom.some((k) => k.dataIndex === 'aktif') || !konfig.field.some((f) => f.name === 'aktif') ? [] : [{
      title: 'Status', dataIndex: 'aktif', render: (v) => (v ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>),
    }]),
    ...(bisaTulis && konfig.bolehUbah !== false ? [{
      title: '', key: 'aksi', width: 80,
      render: (_, baris) => <Button size="small" onClick={() => setEdit(baris)}>Ubah</Button>,
    }] : []),
  ];

  const baru = edit && !edit.id && !edit.kode;
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{konfig.judul}</Typography.Title>
        {bisaTulis && <Button type="primary" onClick={() => setEdit({})}>Tambah</Button>}
      </Flex>
      <Table
        rowKey={(r) => r.id ?? r.kode}
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={kolom}
        size="small"
        scroll={{ x: true }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
      />
      <Modal
        open={edit !== null}
        title={`${baru ? 'Tambah' : 'Ubah'} ${konfig.judul}`}
        okText="Simpan"
        confirmLoading={simpan.isPending}
        destroyOnHidden
        onCancel={() => setEdit(null)}
        afterOpenChange={(o) => o && form.setFieldsValue(keNilaiForm(konfig.field, edit))}
        onOk={async () => {
          const nilai = await form.validateFields();
          await simpan.mutateAsync(konfig.keArgs(nilai, baru ? null : edit));
          setEdit(null);
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          {konfig.field.map((f) => <FieldDinamis key={f.name} field={f} disabled={!baru && f.hanyaBaru} />)}
        </Form>
      </Modal>
    </>
  );
}
