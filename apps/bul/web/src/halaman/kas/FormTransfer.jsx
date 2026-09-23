import { Modal, Form, DatePicker, Select, Input, InputNumber } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useRpc } from '../../lib/data.js';
import { keTanggalDb } from '../../lib/format.js';

export default function FormTransfer({ open, onTutup }) {
  const [form] = Form.useForm();
  const kas = useDaftar('akun', { filter: [['eq', 'kas_bank', true], ['eq', 'aktif', true]], order: { kolom: 'kode' } });
  const opsi = (kas.data ?? []).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  const transfer = useRpc('transfer_kas', { invalidate: ['transaksi_kas'], pesanSukses: 'Transfer tercatat' });
  return (
    <Modal open={open} title="Transfer antar kas/bank" okText="Simpan" destroyOnHidden confirmLoading={transfer.isPending}
      onCancel={onTutup}
      onOk={async () => {
        const v = await form.validateFields();
        await transfer.mutateAsync({ p_tanggal: keTanggalDb(v.tanggal), p_dari_kode: v.dari, p_ke_kode: v.ke, p_jumlah: v.jumlah, p_keterangan: v.keterangan });
        onTutup();
      }}>
      <Form form={form} layout="vertical" preserve={false} initialValues={{ tanggal: dayjs() }}>
        <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
        <Form.Item name="dari" label="Dari" rules={[{ required: true }]}><Select options={opsi} /></Form.Item>
        <Form.Item name="ke" label="Ke" rules={[{ required: true }, ({ getFieldValue }) => ({
          validator: (_, v) => (v && v === getFieldValue('dari') ? Promise.reject(new Error('Tujuan harus berbeda')) : Promise.resolve()),
        })]}><Select options={opsi} /></Form.Item>
        <Form.Item name="jumlah" label="Jumlah" rules={[{ required: true }]}><InputNumber stringMode min="0.01" precision={2} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="keterangan" label="Keterangan" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      </Form>
    </Modal>
  );
}
