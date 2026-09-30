import { useState } from 'react';
import { Table, Button, Flex, Select, DatePicker, Input, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatQty, formatRupiah, formatRute, formatTanggal, keTanggalDb } from '../../lib/format.js';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';
import FormSj from './FormSj.jsx';
import ModalSelesai from './ModalSelesai.jsx';

const WARNA = { berangkat: 'blue', selesai: 'green', batal: 'default' };

export default function SuratJalanPage() {
  const { peran } = useAuth();
  const bisa = boleh(peran, 'sj.tulis');
  const [lini, setLini] = useState();
  const [status, setStatus] = useState();
  const [rentang, setRentang] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [cari, setCari] = useState('');
  const [form, setForm] = useState({ open: false, sj: null });
  const [selesai, setSelesai] = useState(null);
  const [batal, setBatal] = useState(null);
  const batalkan = useRpc('batalkan_sj', { invalidate: ['surat_jalan'], pesanSukses: 'SJ dibatalkan' });

  const filter = [['gte', 'tanggal', keTanggalDb(rentang[0])], ['lte', 'tanggal', keTanggalDb(rentang[1])]];
  if (lini) filter.push(['eq', 'lini_kode', lini]);
  if (status) filter.push(['eq', 'status', status]);
  const q = useDaftar('surat_jalan', {
    select: '*, pelanggan(nama), rute(nama, asal, tujuan), material(nama, satuan), truk(nopol), supir(nama), invoice(nomor)',
    order: { kolom: 'tanggal', naik: false }, filter,
  });
  const data = (q.data ?? []).filter((r) => !cari || r.nomor.toLowerCase().includes(cari.toLowerCase()));

  return (
    <>
      <Flex justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Surat Jalan</Typography.Title>
        {bisa && <Button type="primary" onClick={() => setForm({ open: true, sj: null })}>SJ baru</Button>}
      </Flex>
      <Flex wrap gap={8} style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="Lini" style={{ width: 120 }} value={lini} onChange={setLini}
          options={['SJP', 'SJT', 'SJS'].map((v) => ({ value: v, label: v }))} />
        <Select allowClear placeholder="Status" style={{ width: 140 }} value={status} onChange={setStatus}
          options={['berangkat', 'selesai', 'batal'].map((v) => ({ value: v, label: v }))} />
        <DatePicker.RangePicker format="DD/MM/YYYY" value={rentang} onChange={(v) => v && setRentang(v)} allowClear={false} />
        <Input.Search placeholder="Cari nomor" allowClear style={{ width: 180 }} onChange={(e) => setCari(e.target.value)} />
      </Flex>
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={data} scroll={{ x: true }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          { title: 'Lini', dataIndex: 'lini_kode' },
          { title: 'Nomor', dataIndex: 'nomor' },
          { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Pelanggan', dataIndex: ['pelanggan', 'nama'] },
          { title: 'Rute', render: (_, r) => formatRute(r.rute) },
          { title: 'Material', dataIndex: ['material', 'nama'] },
          { title: 'Truk', dataIndex: ['truk', 'nopol'] },
          { title: 'Supir', dataIndex: ['supir', 'nama'] },
          { title: 'Muat', dataIndex: 'qty_muat', align: 'right', render: formatQty },
          { title: 'Bongkar', dataIndex: 'qty_bongkar', align: 'right', render: (v) => (v ? formatQty(v) : '') },
          { title: 'Uang jalan', dataIndex: 'uang_jalan', align: 'right', render: formatRupiah },
          { title: 'Upah', dataIndex: 'upah', align: 'right', render: (v) => (v == null ? '' : formatRupiah(v)) },
          { title: 'Status', dataIndex: 'status', render: (v, r) => <Tag color={WARNA[v]}>{r.invoice ? `invoice ${r.invoice.nomor}` : v}</Tag> },
          {
            title: '', key: 'aksi', render: (_, r) => bisa && (
              <Flex gap={4}>
                {r.status === 'berangkat' && <Button size="small" onClick={() => setForm({ open: true, sj: r })}>Ubah</Button>}
                {r.status === 'berangkat' && <Button size="small" type="primary" onClick={() => setSelesai(r)}>Selesai</Button>}
                {r.status !== 'batal' && !r.invoice_id && <Button size="small" danger onClick={() => setBatal(r)}>Batal</Button>}
              </Flex>
            ),
          },
        ]}
      />
      <FormSj open={form.open} sj={form.sj} onTutup={() => setForm({ open: false, sj: null })} />
      <ModalSelesai sj={selesai} onTutup={() => setSelesai(null)} />
      <ModalAlasan
        open={Boolean(batal)} judul={`Batalkan SJ ${batal?.nomor ?? ''}`} onBatal={() => setBatal(null)}
        onKirim={async ({ alasan, tanggal }) => {
          await batalkan.mutateAsync({ p_id: batal.id, p_alasan: alasan, p_tanggal: tanggal });
          setBatal(null);
        }}
      />
    </>
  );
}
