import { useState } from 'react';
import { Descriptions, Table, Flex, Button, Tag, Typography, Spin } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatQty, formatRupiah, formatRute, formatTanggal } from '../../lib/format.js';
import { keSen } from '../../lib/uang.js';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { peran } = useAuth();
  const [batal, setBatal] = useState(false);
  const inv = useDaftar('v_invoice_saldo', { filter: [['eq', 'id', id]] });
  const meta = useDaftar('invoice', { select: 'jurnal_id, jurnal_batal_id, alasan_batal, jatuh_tempo', filter: [['eq', 'id', id]] });
  const baris = useDaftar('invoice_baris', {
    select: '*, surat_jalan(nomor, tanggal, rute(nama, asal, tujuan), material(nama, satuan), truk(nopol))',
    filter: [['eq', 'invoice_id', id]],
  });
  const batalkan = useRpc('batalkan_invoice', { invalidate: ['v_invoice_saldo', 'invoice', 'invoice_baris', 'surat_jalan'], pesanSukses: 'Invoice dibatalkan' });
  const i = inv.data?.[0];
  const m = meta.data?.[0];
  if (inv.isLoading) return <Spin />;
  if (!i) return <Typography.Text>Invoice tidak ditemukan.</Typography.Text>;
  return (
    <>
      <Flex justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Invoice {i.nomor} {i.status === 'batal' && <Tag>batal</Tag>}</Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => nav(`/invoice/${id}/cetak`)}>Cetak kwitansi</Button>
          {boleh(peran, 'invoice.tulis') && i.status === 'terbit' && keSen(i.dibayar) === 0n &&
            <Button danger onClick={() => setBatal(true)}>Batalkan</Button>}
        </Flex>
      </Flex>
      <Descriptions size="small" bordered column={{ xs: 1, md: 2 }} items={[
        { key: 'p', label: 'Pelanggan', children: i.pelanggan_nama },
        { key: 't', label: 'Tanggal', children: formatTanggal(i.tanggal) },
        { key: 'j', label: 'Jatuh tempo', children: formatTanggal(m?.jatuh_tempo) || '—' },
        { key: 'l', label: 'Lini', children: i.lini_kode },
        { key: 's', label: 'Sub total', children: formatRupiah(i.subtotal) },
        { key: 'u', label: 'Uang jalan', children: formatRupiah(i.total_uang_jalan) },
        { key: 'a', label: 'Total akhir', children: formatRupiah(i.total_akhir) },
        { key: 'd', label: 'Dibayar', children: formatRupiah(i.dibayar) },
        { key: 'r', label: 'Sisa', children: formatRupiah(i.sisa) },
        { key: 'jr', label: 'Jurnal', children: m?.jurnal_id ? <Link to={`/jurnal?id=${m.jurnal_id}`}>lihat</Link> : '—' },
        ...(m?.alasan_batal ? [{ key: 'ab', label: 'Alasan batal', children: m.alasan_batal }] : []),
      ]} />
      <Table
        style={{ marginTop: 12 }} rowKey="id" size="small" pagination={false} loading={baris.isLoading} scroll={{ x: true }}
        dataSource={baris.data ?? []}
        columns={[
          { title: 'SJ', dataIndex: ['surat_jalan', 'nomor'] },
          { title: 'Tanggal', dataIndex: ['surat_jalan', 'tanggal'], render: formatTanggal },
          { title: 'Rute', render: (_, r) => formatRute(r.surat_jalan.rute) },
          { title: 'Material', dataIndex: ['surat_jalan', 'material', 'nama'] },
          { title: 'Truk', dataIndex: ['surat_jalan', 'truk', 'nopol'] },
          { title: 'Qty', dataIndex: 'qty', align: 'right', render: formatQty },
          { title: 'Harga', dataIndex: 'harga_satuan', align: 'right', render: formatRupiah },
          { title: 'Jumlah', dataIndex: 'jumlah', align: 'right', render: formatRupiah },
          { title: 'Uang jalan', dataIndex: 'uang_jalan', align: 'right', render: formatRupiah },
          { title: '', dataIndex: 'aktif', render: (v) => (v ? '' : <Tag>dilepas</Tag>) },
        ]}
      />
      <ModalAlasan
        open={batal} judul={`Batalkan invoice ${i.nomor}`} onBatal={() => setBatal(false)}
        onKirim={async ({ alasan, tanggal }) => { await batalkan.mutateAsync({ p_id: id, p_alasan: alasan, p_tanggal: tanggal }); setBatal(false); }}
      />
    </>
  );
}
