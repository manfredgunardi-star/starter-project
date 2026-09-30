import { useState } from 'react';
import { Table, Button, Flex, Typography, Tag, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';
import FormKas from './FormKas.jsx';
import FormTransfer from './FormTransfer.jsx';

export default function KasPage() {
  const { peran } = useAuth();
  const bisa = boleh(peran, 'kas.tulis');
  const [rentang, setRentang] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [jenis, setJenis] = useState(null);
  const [tf, setTf] = useState(false);
  const [batal, setBatal] = useState(null);
  const q = useDaftar('transaksi_kas', {
    select: '*, transaksi_kas_baris(akun_kode, jumlah, keterangan)',
    order: { kolom: 'tanggal', naik: false },
    filter: [['gte', 'tanggal', keTanggalDb(rentang[0])], ['lte', 'tanggal', keTanggalDb(rentang[1])]],
  });
  const batalkan = useRpc('batalkan_kas', { invalidate: ['transaksi_kas'], pesanSukses: 'Transaksi dibatalkan' });
  return (
    <>
      <Flex justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Kas & Bank</Typography.Title>
        {bisa && <Flex gap={8}>
          <Button type="primary" onClick={() => setJenis('keluar')}>Kas keluar</Button>
          <Button onClick={() => setJenis('masuk')}>Kas masuk</Button>
          <Button onClick={() => setTf(true)}>Transfer</Button>
        </Flex>}
      </Flex>
      <DatePicker.RangePicker style={{ marginBottom: 12 }} format="DD/MM/YYYY" value={rentang} onChange={(v) => v && setRentang(v)} allowClear={false} />
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={q.data ?? []} scroll={{ x: true }}
        expandable={{ expandedRowRender: (r) => (
          <Table size="small" pagination={false} rowKey={(b, i) => i} dataSource={r.transaksi_kas_baris}
            columns={[{ title: 'Akun', dataIndex: 'akun_kode' }, { title: 'Keterangan', dataIndex: 'keterangan' },
              { title: 'Jumlah', dataIndex: 'jumlah', align: 'right', render: formatRupiah }]} />
        ), rowExpandable: (r) => r.transaksi_kas_baris.length > 0 }}
        columns={[
          { title: 'Nomor', dataIndex: 'nomor' },
          { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Jenis', dataIndex: 'jenis' },
          { title: 'Kas/bank', dataIndex: 'akun_kas_kode', render: (v, r) => (r.akun_tujuan_kode ? `${v} → ${r.akun_tujuan_kode}` : v) },
          { title: 'Keterangan', dataIndex: 'keterangan' },
          { title: 'Total', dataIndex: 'total', align: 'right', render: formatRupiah },
          { title: 'Status', dataIndex: 'status', render: (v) => (v === 'batal' ? <Tag>batal</Tag> : null) },
          { title: '', key: 'a', render: (_, r) => bisa && r.status === 'terbit' && <Button size="small" danger onClick={() => setBatal(r)}>Batal</Button> },
        ]}
      />
      <FormKas jenis={jenis} onTutup={() => setJenis(null)} />
      <FormTransfer open={tf} onTutup={() => setTf(false)} />
      <ModalAlasan open={Boolean(batal)} judul={`Batalkan ${batal?.nomor ?? ''}`} onBatal={() => setBatal(null)}
        onKirim={async ({ alasan, tanggal }) => { await batalkan.mutateAsync({ p_id: batal.id, p_alasan: alasan, p_tanggal: tanggal }); setBatal(null); }} />
    </>
  );
}
