import { useState } from 'react';
import { Card, Button, Flex, Typography, Table, Form, Input, Select, DatePicker, InputNumber, Alert, Descriptions } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useFungsi, useOpsi, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';
import FormJurnalManual from './FormJurnalManual.jsx';

export default function SaldoAwalPage() {
  const { peran } = useAuth();
  const owner = boleh(peran, 'akuntansi.pengaturan');
  const [posting, setPosting] = useState(false);
  const [batal, setBatal] = useState(false);
  const [form] = Form.useForm();
  const jurnal = useDaftar('jurnal', { filter: [['eq', 'sumber_tipe', 'saldo_awal'], ['is', 'dibalik_oleh_id', null]] });
  const piutang = useDaftar('v_invoice_saldo', { filter: [['eq', 'saldo_awal', true], ['eq', 'status', 'terbit']], order: { kolom: 'tanggal' } });
  const cek = useFungsi('cek_saldo_awal_piutang', {});
  const opsiLini = useOpsi({ tabel: 'lini', label: 'nama', value: 'kode' });
  const opsiPelanggan = useOpsi({ tabel: 'pelanggan', label: 'nama' });
  const buatPiutang = useRpc('buat_piutang_saldo_awal', { invalidate: ['v_invoice_saldo', 'cek_saldo_awal_piutang'] });
  const batalkan = useRpc('batalkan_saldo_awal', { invalidate: ['jurnal', 'cek_saldo_awal_piutang'], pesanSukses: 'Saldo awal dibalik' });
  const j = jurnal.data?.[0];
  const c = cek.data?.[0];
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={4} style={{ margin: 0 }}>Saldo Awal</Typography.Title>
      <Card title="Jurnal saldo awal">
        {j ? (
          <Flex gap={12} align="center" wrap>
            <Typography.Text>{j.nomor} per {formatTanggal(j.tanggal)}</Typography.Text>
            {owner && <Button danger onClick={() => setBatal(true)}>Batalkan untuk posting ulang</Button>}
          </Flex>
        ) : (
          <Flex gap={12} align="center" wrap>
            <Typography.Text>Belum ada. Isi dari neraca akuntan per 31-12-2025.</Typography.Text>
            {owner && <Button type="primary" onClick={() => setPosting(true)}>Posting saldo awal</Button>}
          </Flex>
        )}
      </Card>
      <Card title="Rincian piutang lama per invoice">
        {c && (
          <Descriptions size="small" column={3} items={[
            { key: 'g', label: 'Piutang di jurnal', children: formatRupiah(c.saldo_gl) },
            { key: 'i', label: 'Total rincian', children: formatRupiah(c.total_invoice) },
            { key: 's', label: 'Selisih', children: formatRupiah(c.selisih) },
          ]} />
        )}
        {c && c.selisih !== '0.00' && <Alert type="warning" showIcon style={{ margin: '8px 0' }} message="Rincian piutang belum sama dengan saldo piutang di jurnal saldo awal." />}
        <Table rowKey="id" size="small" pagination={false} dataSource={piutang.data ?? []} columns={[
          { title: 'Nomor', dataIndex: 'nomor' }, { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Pelanggan', dataIndex: 'pelanggan_nama' }, { title: 'Jumlah', dataIndex: 'total_akhir', align: 'right', render: formatRupiah },
          { title: 'Sisa', dataIndex: 'sisa', align: 'right', render: formatRupiah },
        ]} />
        {owner && j && (
          <Form form={form} layout="inline" style={{ marginTop: 12 }} initialValues={{ tanggal: dayjs(j.tanggal), lini_kode: 'SJP' }}>
            <Form.Item name="nomor" rules={[{ required: true }]}><Input placeholder="Nomor invoice lama" /></Form.Item>
            <Form.Item name="lini_kode" rules={[{ required: true }]}><Select options={opsiLini.options} style={{ width: 110 }} /></Form.Item>
            <Form.Item name="pelanggan_id" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder="Pelanggan" options={opsiPelanggan.options} style={{ width: 220 }} /></Form.Item>
            <Form.Item name="tanggal" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="jumlah" rules={[{ required: true }]}><InputNumber stringMode min="0.01" precision={2} placeholder="Sisa piutang" style={{ width: 160 }} /></Form.Item>
            <TombolAksi type="primary" onClick={async () => {
              const v = await form.validateFields();
              await buatPiutang.mutateAsync({ p_nomor: v.nomor, p_lini_kode: v.lini_kode, p_pelanggan_id: v.pelanggan_id, p_tanggal: keTanggalDb(v.tanggal), p_jumlah: v.jumlah, p_keterangan: '' });
              form.resetFields(['nomor', 'jumlah']);
            }}>Tambah</TombolAksi>
          </Form>
        )}
      </Card>
      <FormJurnalManual open={posting} onTutup={() => setPosting(false)} rpc="posting_saldo_awal" judul="Posting saldo awal"
        tanggalAwal="2025-12-31" denganKeterangan={false} invalidate={['jurnal', 'v_buku_besar', 'cek_saldo_awal_piutang']}
        info="Masukkan saldo per akun dari neraca akuntan per 31-12-2025. Isi pelanggan pada baris piutang dan supir pada baris hutang upah bila tersedia." />
      <ModalAlasan open={batal} judul="Batalkan saldo awal" denganTanggal={false} onBatal={() => setBatal(false)}
        onKirim={async ({ alasan }) => { await batalkan.mutateAsync({ p_alasan: alasan }); setBatal(false); }} />
    </Flex>
  );
}
