import { Modal, Form, DatePicker, Select, Input, InputNumber, Button, Flex, Typography } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useOpsi, useRpc } from '../../lib/data.js';
import { formatRupiah, keTanggalDb } from '../../lib/format.js';
import { dariSen, jumlahkan } from '../../lib/uang.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';

export default function FormKas({ jenis, onTutup }) {
  const [form] = Form.useForm();
  const akun = useDaftar('akun', { filter: [['eq', 'tipe', 'detail'], ['eq', 'aktif', true]], order: { kolom: 'kode' } });
  const opsiTruk = useOpsi({ tabel: 'truk', label: 'nopol', order: 'nopol' });
  const opsiSupir = useOpsi({ tabel: 'supir', label: 'nama' });
  const opsiLini = useOpsi({ tabel: 'lini', label: 'nama', value: 'kode' });
  const catat = useRpc('catat_kas', { invalidate: ['transaksi_kas'], pesanSukses: 'Transaksi kas tercatat' });
  const semua = akun.data ?? [];
  const opsiKas = semua.filter((a) => a.kas_bank).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  // Piutang (1121) dan kas/bank tidak boleh jadi baris; server juga menolak.
  const opsiBaris = semua.filter((a) => !a.kas_bank && a.kode !== '1121').map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  const baris = Form.useWatch('baris', form) ?? [];
  const total = dariSen(jumlahkan(baris.map((b) => b?.jumlah ?? '0')));

  async function simpan() {
    const v = await form.validateFields();
    await catat.mutateAsync({
      p_jenis: jenis, p_tanggal: keTanggalDb(v.tanggal), p_akun_kas_kode: v.akun_kas_kode, p_keterangan: v.keterangan,
      p_baris: v.baris.map((b) => ({
        akun_kode: b.akun_kode, jumlah: b.jumlah, keterangan: b.keterangan ?? '',
        truk_id: b.truk_id ?? null, supir_id: b.supir_id ?? null, lini_kode: b.lini_kode ?? null,
      })),
    });
    form.resetFields();
    onTutup();
  }

  return (
    <Modal open={Boolean(jenis)} width={960} destroyOnHidden onCancel={onTutup}
      title={jenis === 'keluar' ? 'Kas keluar (biaya, bayar upah, dll.)' : 'Kas masuk (setoran modal, pendapatan lain, dll.)'}
      footer={<Flex gap={8} justify="end" align="center">
        <Typography.Text strong>Total {formatRupiah(total)}</Typography.Text>
        <Button onClick={onTutup}>Tutup</Button>
        <TombolAksi type="primary" onClick={simpan}>Simpan</TombolAksi>
      </Flex>}>
      <Form form={form} layout="vertical" initialValues={{ tanggal: dayjs(), baris: [{}] }}>
        <Flex wrap gap={12}>
          <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="akun_kas_kode" label={jenis === 'keluar' ? 'Dari kas/bank' : 'Ke kas/bank'} rules={[{ required: true }]} style={{ minWidth: 240 }}>
            <Select options={opsiKas} />
          </Form.Item>
          <Form.Item name="keterangan" label="Keterangan" rules={[{ required: true, whitespace: true }]} style={{ flex: 1, minWidth: 240 }}>
            <Input />
          </Form.Item>
        </Flex>
        <Form.List name="baris">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Flex key={f.key} wrap gap={8} align="start">
                  <Form.Item name={[f.name, 'akun_kode']} rules={[{ required: true, message: 'Akun' }]} style={{ minWidth: 260 }}>
                    <Select showSearch optionFilterProp="label" placeholder="Akun" options={opsiBaris} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'jumlah']} rules={[{ required: true, message: 'Jumlah' }]}>
                    <InputNumber stringMode min="0.01" precision={2} placeholder="Jumlah" style={{ width: 150 }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'truk_id']}><Select allowClear placeholder="Truk" options={opsiTruk.options} style={{ width: 130 }} /></Form.Item>
                  <Form.Item name={[f.name, 'supir_id']}><Select allowClear showSearch optionFilterProp="label" placeholder="Supir" options={opsiSupir.options} style={{ width: 150 }} /></Form.Item>
                  <Form.Item name={[f.name, 'lini_kode']}><Select allowClear placeholder="Lini" options={opsiLini.options} style={{ width: 110 }} /></Form.Item>
                  <Form.Item name={[f.name, 'keterangan']} style={{ flex: 1, minWidth: 140 }}><Input placeholder="Keterangan baris" /></Form.Item>
                  {fields.length > 1 && <Button onClick={() => remove(f.name)}>Hapus</Button>}
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
