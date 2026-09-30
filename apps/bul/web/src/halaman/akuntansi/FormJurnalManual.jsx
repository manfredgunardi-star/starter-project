import { Modal, Form, DatePicker, Input, Select, InputNumber, Button, Flex, Typography, Alert } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useOpsi, useRpc } from '../../lib/data.js';
import { formatRupiah, keTanggalDb } from '../../lib/format.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import { keBarisJurnal, selisihJurnal } from './barisJurnal.js';

const INFO_BAWAAN = 'Piutang usaha hanya lewat Invoice/Pembayaran. Baris Hutang Upah Sopir wajib memilih supir.';

export default function FormJurnalManual({ open, onTutup, rpc = 'buat_jurnal_manual', judul = 'Jurnal manual', tanggalAwal, denganKeterangan = true, invalidate = ['v_buku_besar', 'jurnal'], info = INFO_BAWAAN }) {
  const [form] = Form.useForm();
  const akun = useDaftar('akun', { filter: [['eq', 'tipe', 'detail'], ['eq', 'aktif', true]], order: { kolom: 'kode' } });
  const opsiAkun = (akun.data ?? []).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  const opsiTruk = useOpsi({ tabel: 'truk', label: 'nopol', order: 'nopol' });
  const opsiSupir = useOpsi({ tabel: 'supir', label: 'nama' });
  const opsiPelanggan = useOpsi({ tabel: 'pelanggan', label: 'nama' });
  const simpan = useRpc(rpc, { invalidate, pesanSukses: 'Jurnal diposting' });
  const baris = Form.useWatch('baris', form) ?? [];
  const s = selisihJurnal(baris);

  async function kirim() {
    const v = await form.validateFields();
    const args = { p_tanggal: keTanggalDb(v.tanggal), p_baris: keBarisJurnal(v.baris) };
    if (denganKeterangan) args.p_keterangan = v.keterangan;
    await simpan.mutateAsync(args);
    form.resetFields();
    onTutup();
  }

  return (
    <Modal open={open} title={judul} width={1040} destroyOnHidden onCancel={onTutup} footer={
      <Flex gap={12} justify="end" align="center">
        <Typography.Text>Debit {formatRupiah(s.debit)} · Kredit {formatRupiah(s.kredit)}</Typography.Text>
        {s.selisih !== '0.00' && <Typography.Text type="danger">Selisih {formatRupiah(s.selisih)}</Typography.Text>}
        <Button onClick={onTutup}>Tutup</Button>
        <TombolAksi type="primary" disabled={s.selisih !== '0.00' || s.debit === '0.00'} onClick={kirim}>Posting</TombolAksi>
      </Flex>
    }>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={info} />
      <Form form={form} layout="vertical" initialValues={{ tanggal: tanggalAwal ? dayjs(tanggalAwal) : dayjs(), baris: [{}, {}] }}>
        <Flex wrap gap={12}>
          <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
          {denganKeterangan && <Form.Item name="keterangan" label="Keterangan" rules={[{ required: true, whitespace: true }]} style={{ flex: 1 }}><Input /></Form.Item>}
        </Flex>
        <Form.List name="baris">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Flex key={f.key} wrap gap={8} align="start">
                  <Form.Item name={[f.name, 'akun_kode']} style={{ minWidth: 260 }}><Select showSearch optionFilterProp="label" placeholder="Akun" options={opsiAkun} /></Form.Item>
                  <Form.Item name={[f.name, 'debit']}><InputNumber stringMode min="0" precision={2} placeholder="Debit" style={{ width: 140 }} /></Form.Item>
                  <Form.Item name={[f.name, 'kredit']}><InputNumber stringMode min="0" precision={2} placeholder="Kredit" style={{ width: 140 }} /></Form.Item>
                  <Form.Item name={[f.name, 'truk_id']}><Select allowClear placeholder="Truk" options={opsiTruk.options} style={{ width: 120 }} /></Form.Item>
                  <Form.Item name={[f.name, 'supir_id']}><Select allowClear showSearch optionFilterProp="label" placeholder="Supir" options={opsiSupir.options} style={{ width: 140 }} /></Form.Item>
                  <Form.Item name={[f.name, 'pelanggan_id']}><Select allowClear showSearch optionFilterProp="label" placeholder="Pelanggan" options={opsiPelanggan.options} style={{ width: 160 }} /></Form.Item>
                  <Form.Item name={[f.name, 'keterangan']} style={{ flex: 1, minWidth: 120 }}><Input placeholder="Keterangan" /></Form.Item>
                  {fields.length > 2 && <Button onClick={() => remove(f.name)}>Hapus</Button>}
                </Flex>
              ))}
              <Button onClick={() => add({})}>Tambah baris</Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
