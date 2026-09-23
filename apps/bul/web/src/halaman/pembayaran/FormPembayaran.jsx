import { useState } from 'react';
import { Modal, Form, Select, DatePicker, Input, Table, InputNumber, Button, Flex, Alert } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useOpsi, useRpc } from '../../lib/data.js';
import { panggilRpc } from '../../lib/rpc.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import { dariSen, jumlahkan, keSen } from '../../lib/uang.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import { alokasiOtomatis, cekAlokasi } from './alokasi.js';

export default function FormPembayaran({ open, onTutup }) {
  const [form] = Form.useForm();
  const [alokasi, setAlokasi] = useState({}); // invoice_id → jumlah string
  const pelanggan = Form.useWatch('pelanggan_id', form);
  const diterima = Form.useWatch('jumlah_diterima', form) ?? '0';
  const pph = Form.useWatch('jumlah_pph', form) ?? '0';
  const tanggal = Form.useWatch('tanggal', form);
  const opsiPelanggan = useOpsi({ tabel: 'pelanggan', label: 'nama' });
  const kasBank = useDaftar('akun', { filter: [['eq', 'kas_bank', true], ['eq', 'aktif', true]], order: { kolom: 'kode' } });
  const inv = useDaftar('v_invoice_saldo', {
    enabled: Boolean(pelanggan), order: { kolom: 'tanggal' },
    filter: [['eq', 'pelanggan_id', pelanggan ?? ''], ['eq', 'status', 'terbit'], ['gt', 'sisa', 0]],
  });
  const catat = useRpc('catat_pembayaran', { invalidate: ['pembayaran', 'v_invoice_saldo'], pesanSukses: 'Pembayaran tercatat' });
  const daftar = inv.data ?? [];
  const listAlokasi = Object.entries(alokasi).filter(([, v]) => v && keSen(v) > 0n).map(([invoice_id, jumlah]) => ({ invoice_id, jumlah }));
  const galat = cekAlokasi(listAlokasi, diterima, pph);

  function otomatis() {
    const hasil = alokasiOtomatis(daftar, dariSen(keSen(diterima) + keSen(pph)));
    setAlokasi(Object.fromEntries(hasil.map((a) => [a.invoice_id, a.jumlah])));
  }

  async function saranPph() {
    const penuh = daftar.filter((i) => alokasi[i.id] && keSen(alokasi[i.id]) === keSen(i.sisa));
    const nilai = await Promise.all(penuh.map((i) => panggilRpc('saran_pph_invoice', { p_invoice_id: i.id, p_tanggal: keTanggalDb(tanggal) })));
    form.setFieldValue('jumlah_pph', dariSen(jumlahkan(nilai)));
  }

  async function simpan() {
    const v = await form.validateFields();
    if (galat) throw new Error(galat);
    await catat.mutateAsync({
      p_tanggal: keTanggalDb(v.tanggal), p_pelanggan_id: v.pelanggan_id, p_akun_kas_kode: v.akun_kas_kode,
      p_jumlah_diterima: v.jumlah_diterima, p_jumlah_pph: v.jumlah_pph ?? '0',
      p_alokasi: listAlokasi, p_keterangan: v.keterangan ?? '',
    });
    setAlokasi({});
    form.resetFields();
    onTutup();
  }

  const kasOptions = (kasBank.data ?? []).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }));
  return (
    <Modal open={open} title="Catat pembayaran pelanggan" width={860} onCancel={onTutup} destroyOnHidden footer={
      <Flex gap={8} justify="end"><Button onClick={onTutup}>Tutup</Button><TombolAksi type="primary" disabled={Boolean(galat)} onClick={simpan}>Simpan</TombolAksi></Flex>
    }>
      <Form form={form} layout="vertical" initialValues={{ tanggal: dayjs(), jumlah_pph: '0' }}>
        <Flex wrap gap={12}>
          <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="pelanggan_id" label="Pelanggan" rules={[{ required: true }]} style={{ minWidth: 260 }}>
            <Select showSearch optionFilterProp="label" options={opsiPelanggan.options} onChange={() => setAlokasi({})} />
          </Form.Item>
          <Form.Item name="akun_kas_kode" label="Masuk ke" rules={[{ required: true }]} style={{ minWidth: 220 }}>
            <Select options={kasOptions} />
          </Form.Item>
          <Form.Item name="jumlah_diterima" label="Jumlah diterima" rules={[{ required: true }]}>
            <InputNumber stringMode min="0" precision={2} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="jumlah_pph" label="PPh final dipotong">
            <InputNumber stringMode min="0" precision={2} style={{ width: 160 }} />
          </Form.Item>
        </Flex>
        <Flex gap={8} style={{ marginBottom: 8 }}>
          <Button onClick={otomatis} disabled={!daftar.length}>Alokasi otomatis</Button>
          <Button onClick={saranPph} disabled={!listAlokasi.length}>Hitung saran PPh (invoice lunas)</Button>
        </Flex>
        <Table
          rowKey="id" size="small" pagination={false} loading={inv.isLoading} dataSource={daftar} scroll={{ y: 300 }}
          columns={[
            { title: 'Nomor', dataIndex: 'nomor' },
            { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
            { title: 'Sub total', dataIndex: 'subtotal', align: 'right', render: formatRupiah },
            { title: 'Sisa', dataIndex: 'sisa', align: 'right', render: formatRupiah },
            { title: 'Alokasi', key: 'al', render: (_, r) => (
              <InputNumber stringMode min="0" max={r.sisa} precision={2} value={alokasi[r.id]}
                onChange={(v) => setAlokasi((a) => ({ ...a, [r.id]: v ?? '' }))} style={{ width: 150 }} />
            ) },
          ]}
        />
        {galat && listAlokasi.length > 0 && <Alert type="warning" style={{ marginTop: 8 }} message={galat} />}
        <Form.Item name="keterangan" label="Keterangan" style={{ marginTop: 8 }}><Input /></Form.Item>
      </Form>
    </Modal>
  );
}
