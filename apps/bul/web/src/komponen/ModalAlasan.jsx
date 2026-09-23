import { Modal, Form, Input, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { keTanggalDb } from '../lib/format.js';

export default function ModalAlasan({ open, judul, onBatal, onKirim, denganTanggal = true }) {
  const [form] = Form.useForm();
  return (
    <Modal
      open={open}
      title={judul}
      okText="Batalkan dokumen"
      okButtonProps={{ danger: true }}
      cancelText="Tutup"
      destroyOnHidden
      onCancel={onBatal}
      onOk={async () => {
        const v = await form.validateFields();
        await onKirim({ alasan: v.alasan.trim(), tanggal: denganTanggal ? keTanggalDb(v.tanggal) : undefined });
        form.resetFields();
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ tanggal: dayjs() }}>
        <Form.Item name="alasan" label="Alasan" rules={[{ required: true, whitespace: true, message: 'Alasan wajib diisi' }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        {denganTanggal && (
          <Form.Item name="tanggal" label="Tanggal pembatalan (tanggal jurnal pembalik)" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
