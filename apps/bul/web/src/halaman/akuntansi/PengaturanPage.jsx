import { Card, Table, Select, Form, DatePicker, Switch, InputNumber, Button, Flex, Typography, Alert } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';

export default function PengaturanPage() {
  const posting = useDaftar('pengaturan_posting', { order: { kolom: 'kunci' } });
  const akun = useDaftar('akun', { filter: [['eq', 'tipe', 'detail'], ['eq', 'aktif', true]], order: { kolom: 'kode' } });
  const pajak = useDaftar('pengaturan_pajak', { order: { kolom: 'berlaku_mulai', naik: false } });
  const kunci = useDaftar('kunci_periode');
  const aturPosting = useRpc('atur_pengaturan_posting', { invalidate: ['pengaturan_posting'] });
  const simpanPajak = useRpc('simpan_pengaturan_pajak', { invalidate: ['pengaturan_pajak'] });
  const aturKunci = useRpc('atur_kunci_periode', { invalidate: ['kunci_periode'] });
  const [formPajak] = Form.useForm();
  const [formKunci] = Form.useForm();
  const opsiAkun = (akun.data ?? []).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  const terkunci = kunci.data?.[0]?.terkunci_sampai;
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={4} style={{ margin: 0 }}>Pengaturan</Typography.Title>
      <Card title="Akun posting otomatis">
        <Table rowKey="kunci" size="small" pagination={false} loading={posting.isLoading} dataSource={posting.data ?? []} columns={[
          { title: 'Kunci', dataIndex: 'kunci' },
          { title: 'Keterangan', dataIndex: 'keterangan' },
          { title: 'Akun', dataIndex: 'akun_kode', render: (v, r) => (
            <Select style={{ minWidth: 260 }} showSearch optionFilterProp="label" value={v} options={opsiAkun}
              onChange={(kode) => aturPosting.mutate({ p_kunci: r.kunci, p_akun_kode: kode })} />
          ) },
        ]} />
      </Card>
      <Card title="Pajak (PPh final PP 55)">
        <Table rowKey="berlaku_mulai" size="small" pagination={false} dataSource={pajak.data ?? []} columns={[
          { title: 'Berlaku mulai', dataIndex: 'berlaku_mulai', render: formatTanggal },
          { title: 'PP 55 aktif', dataIndex: 'pp55_aktif', render: (v) => (v ? 'Ya' : 'Tidak') },
          { title: 'Tarif', dataIndex: 'tarif_pph_final', render: (v) => `${(Number(v) * 100).toFixed(2)}%` },
          { title: 'Batas omzet', dataIndex: 'batas_omzet', render: formatRupiah },
        ]} />
        <Form form={formPajak} layout="inline" style={{ marginTop: 12 }} initialValues={{ berlaku_mulai: dayjs().startOf('year'), pp55_aktif: true, tarif: '0.005', batas: '4800000000' }}>
          <Form.Item name="berlaku_mulai" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="pp55_aktif" label="PP 55" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="tarif" label="Tarif (desimal)"><InputNumber stringMode min="0" max="0.9999" step="0.0005" precision={4} /></Form.Item>
          <Form.Item name="batas" label="Batas omzet"><InputNumber stringMode min="1" precision={2} style={{ width: 180 }} /></Form.Item>
          <TombolAksi onClick={async () => {
            const v = await formPajak.validateFields();
            await simpanPajak.mutateAsync({ p_berlaku_mulai: keTanggalDb(v.berlaku_mulai), p_pp55_aktif: v.pp55_aktif, p_tarif_pph_final: v.tarif, p_batas_omzet: v.batas });
          }}>Simpan pajak</TombolAksi>
        </Form>
      </Card>
      <Card title="Kunci periode">
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={terkunci ? `Transaksi sampai ${formatTanggal(terkunci)} terkunci.` : 'Belum ada periode yang dikunci.'} />
        <Form form={formKunci} layout="inline">
          <Form.Item name="sampai"><DatePicker format="DD/MM/YYYY" placeholder="Kunci sampai" /></Form.Item>
          <TombolAksi onClick={async () => { await aturKunci.mutateAsync({ p_sampai: keTanggalDb(formKunci.getFieldValue('sampai')) }); }}>Simpan</TombolAksi>
          <Button onClick={() => aturKunci.mutate({ p_sampai: null })}>Buka semua</Button>
        </Form>
      </Card>
    </Flex>
  );
}
