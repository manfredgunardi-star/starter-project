import { useState } from 'react';
import { Form, Select, Table, DatePicker, Input, Flex, Alert, Typography, Descriptions } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useDaftar, useFungsi, useOpsi, useRpc } from '../../lib/data.js';
import { formatQty, formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import { hitungRingkasan } from './ringkasan.js';

export default function InvoiceBaruPage() {
  const nav = useNavigate();
  const [lini, setLini] = useState('SJP');
  const [pelanggan, setPelanggan] = useState();
  const [pilih, setPilih] = useState([]);
  const [form] = Form.useForm();
  const opsiLini = useOpsi({ tabel: 'lini', label: 'nama', value: 'kode' });
  const opsiPelanggan = useOpsi({ tabel: 'pelanggan', label: 'nama' });
  const sj = useDaftar('surat_jalan', {
    enabled: Boolean(pelanggan),
    select: 'id, nomor, tanggal, qty_bongkar, uang_jalan, rute(nama), material(nama, satuan), truk(nopol)',
    order: { kolom: 'tanggal' },
    filter: [['eq', 'lini_kode', lini], ['eq', 'pelanggan_id', pelanggan ?? ''], ['eq', 'status', 'selesai'], ['is', 'invoice_id', null]],
  });
  const pratinjau = useFungsi('pratinjau_invoice',
    { p_lini_kode: lini, p_pelanggan_id: pelanggan, p_sj_ids: pilih }, { enabled: pilih.length > 0 });
  const terbit = useRpc('terbitkan_invoice', { invalidate: ['v_invoice_saldo', 'surat_jalan'], pesanSukses: 'Invoice terbit' });
  const baris = pratinjau.data ?? [];
  const masalah = baris.filter((b) => b.masalah).map((b) => b.masalah);
  const r = hitungRingkasan(baris);

  async function terbitkan() {
    const v = await form.validateFields();
    const id = await terbit.mutateAsync({
      p_lini_kode: lini, p_pelanggan_id: pelanggan, p_tanggal: keTanggalDb(v.tanggal), p_sj_ids: pilih,
      p_nomor: v.nomor?.trim() || null, p_jatuh_tempo: keTanggalDb(v.jatuh_tempo), p_keterangan: v.keterangan ?? '',
    });
    nav(`/invoice/${id}`);
  }

  return (
    <>
      <Typography.Title level={4}>Invoice baru</Typography.Title>
      <Flex wrap gap={8} style={{ marginBottom: 12 }}>
        <Select style={{ width: 140 }} value={lini} options={opsiLini.options} onChange={(v) => { setLini(v); setPilih([]); }} />
        <Select style={{ width: 280 }} showSearch optionFilterProp="label" placeholder="Pelanggan" value={pelanggan}
          options={opsiPelanggan.options} onChange={(v) => { setPelanggan(v); setPilih([]); }} />
      </Flex>
      {pelanggan && (
        <Table
          rowKey="id" size="small" loading={sj.isLoading} dataSource={sj.data ?? []} pagination={false} scroll={{ x: true, y: 360 }}
          rowSelection={{ selectedRowKeys: pilih, onChange: setPilih }}
          columns={[
            { title: 'Nomor', dataIndex: 'nomor' },
            { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
            { title: 'Rute', dataIndex: ['rute', 'nama'] },
            { title: 'Material', dataIndex: ['material', 'nama'] },
            { title: 'Truk', dataIndex: ['truk', 'nopol'] },
            { title: 'Qty', dataIndex: 'qty_bongkar', align: 'right', render: formatQty },
            { title: 'Uang jalan', dataIndex: 'uang_jalan', align: 'right', render: formatRupiah },
          ]}
        />
      )}
      {pilih.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>Pratinjau (dihitung server)</Typography.Title>
          {masalah.length > 0 && <Alert type="error" style={{ marginBottom: 12 }} message="Tidak bisa diterbitkan" description={<ul>{masalah.map((m) => <li key={m}>{m}</li>)}</ul>} />}
          <Table
            rowKey="surat_jalan_id" size="small" pagination={false} loading={pratinjau.isLoading} dataSource={baris} scroll={{ x: true }}
            columns={[
              { title: 'Nomor', dataIndex: 'nomor' },
              { title: 'Qty', dataIndex: 'qty', align: 'right', render: (v) => (v ? formatQty(v) : '') },
              { title: 'Harga', dataIndex: 'harga_satuan', align: 'right', render: (v) => (v ? formatRupiah(v) : '—') },
              { title: 'Jumlah', dataIndex: 'jumlah', align: 'right', render: (v) => (v ? formatRupiah(v) : '—') },
              { title: 'Uang jalan', dataIndex: 'uang_jalan', align: 'right', render: formatRupiah },
            ]}
          />
          <Descriptions size="small" column={1} style={{ maxWidth: 420, marginTop: 12 }} bordered items={[
            { key: 's', label: 'Sub total', children: formatRupiah(r.subtotal) },
            { key: 'u', label: 'Potongan uang jalan', children: formatRupiah(r.totalUangJalan) },
            { key: 't', label: 'Total akhir (piutang)', children: <b>{formatRupiah(r.totalAkhir)}</b> },
          ]} />
          <Form form={form} layout="vertical" style={{ maxWidth: 420, marginTop: 12 }} initialValues={{ tanggal: dayjs() }}>
            <Form.Item name="tanggal" label="Tanggal invoice" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="nomor" label="Nomor (kosong = otomatis LINI/NNN/MM/YYYY)"><Input /></Form.Item>
            <Form.Item name="jatuh_tempo" label="Jatuh tempo"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="keterangan" label="Keterangan"><Input.TextArea rows={2} /></Form.Item>
            <TombolAksi type="primary" disabled={masalah.length > 0 || pratinjau.isLoading} onClick={terbitkan}>Terbitkan invoice</TombolAksi>
          </Form>
        </>
      )}
    </>
  );
}
