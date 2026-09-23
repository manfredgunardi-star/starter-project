import { Modal, Form, Alert } from 'antd';
import dayjs from 'dayjs';
import FieldDinamis from '../../komponen/FieldDinamis.jsx';
import { useFungsi, useRpc } from '../../lib/data.js';
import { formatRupiah } from '../../lib/format.js';
import { argsSelesai } from './argsSj.js';

export default function ModalSelesai({ sj, onTutup }) {
  const [form] = Form.useForm();
  const selesai = useRpc('selesaikan_sj', { invalidate: ['surat_jalan'], pesanSukses: 'SJ selesai, upah diposting' });
  const qty = Form.useWatch('qty_bongkar', form);
  const upah = useFungsi('upah_berlaku',
    { p_rute_id: sj?.rute_id, p_material_id: sj?.material_id, p_tanggal: sj?.tanggal, p_qty: qty || sj?.qty_muat },
    { enabled: Boolean(sj) });
  return (
    <Modal
      open={Boolean(sj)} title={`Selesaikan SJ ${sj?.nomor ?? ''}`} okText="Selesai" destroyOnHidden
      confirmLoading={selesai.isPending} onCancel={onTutup}
      afterOpenChange={(o) => o && form.setFieldsValue({ qty_bongkar: sj.qty_muat, tanggal_selesai: dayjs() })}
      onOk={async () => { await selesai.mutateAsync(argsSelesai(sj.id, await form.validateFields())); onTutup(); }}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <FieldDinamis field={{ name: 'qty_bongkar', label: 'Qty bongkar', tipe: 'qty', wajib: true }} />
        <FieldDinamis field={{ name: 'tanggal_selesai', label: 'Tanggal selesai', tipe: 'tanggal', wajib: true }} />
        <Alert
          style={{ marginBottom: 12 }}
          type={upah.data == null ? 'warning' : 'info'}
          message={upah.data == null ? 'Tidak ada aturan upah yang berlaku — isi upah manual.' : `Upah menurut aturan: ${formatRupiah(upah.data)}`}
        />
        <FieldDinamis field={{ name: 'upah', label: 'Upah manual (kosong = pakai aturan)', tipe: 'uang' }} />
      </Form>
    </Modal>
  );
}
