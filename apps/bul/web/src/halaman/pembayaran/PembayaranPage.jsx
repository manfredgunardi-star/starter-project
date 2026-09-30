import { useState } from 'react';
import { Table, Button, Flex, Typography, Tag } from 'antd';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal } from '../../lib/format.js';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';
import FormPembayaran from './FormPembayaran.jsx';

export default function PembayaranPage() {
  const { peran } = useAuth();
  const bisa = boleh(peran, 'pembayaran.tulis');
  const [baru, setBaru] = useState(false);
  const [batal, setBatal] = useState(null);
  const q = useDaftar('pembayaran', {
    select: '*, pelanggan(nama), pembayaran_alokasi(jumlah, aktif, invoice(nomor))',
    order: { kolom: 'tanggal', naik: false },
  });
  const batalkan = useRpc('batalkan_pembayaran', { invalidate: ['pembayaran', 'v_invoice_saldo'], pesanSukses: 'Pembayaran dibatalkan' });
  return (
    <>
      <Flex justify="space-between" style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Pembayaran</Typography.Title>
        {bisa && <Button type="primary" onClick={() => setBaru(true)}>Catat pembayaran</Button>}
      </Flex>
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={q.data ?? []} scroll={{ x: true }}
        columns={[
          { title: 'Nomor', dataIndex: 'nomor' },
          { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Pelanggan', dataIndex: ['pelanggan', 'nama'] },
          { title: 'Akun', dataIndex: 'akun_kas_kode' },
          { title: 'Diterima', dataIndex: 'jumlah_diterima', align: 'right', render: formatRupiah },
          { title: 'PPh', dataIndex: 'jumlah_pph', align: 'right', render: formatRupiah },
          { title: 'Invoice', key: 'inv', render: (_, r) => r.pembayaran_alokasi.map((a) => a.invoice.nomor).join(', ') },
          { title: 'Status', dataIndex: 'status', render: (v) => (v === 'batal' ? <Tag>batal</Tag> : <Tag color="green">terbit</Tag>) },
          { title: '', key: 'a', render: (_, r) => bisa && r.status === 'terbit' && <Button size="small" danger onClick={() => setBatal(r)}>Batal</Button> },
        ]}
      />
      <FormPembayaran open={baru} onTutup={() => setBaru(false)} />
      <ModalAlasan open={Boolean(batal)} judul={`Batalkan ${batal?.nomor ?? ''}`} onBatal={() => setBatal(null)}
        onKirim={async ({ alasan, tanggal }) => { await batalkan.mutateAsync({ p_id: batal.id, p_alasan: alasan, p_tanggal: tanggal }); setBatal(null); }} />
    </>
  );
}
