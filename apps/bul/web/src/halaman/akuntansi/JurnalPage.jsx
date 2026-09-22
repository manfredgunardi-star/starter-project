import { useState } from 'react';
import { Table, Button, Flex, Typography, Tag, DatePicker, Select } from 'antd';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';
import FormJurnalManual from './FormJurnalManual.jsx';

const SUMBER = ['saldo_awal', 'sj_selesai', 'invoice', 'pembayaran', 'kas', 'manual', 'pembalik'];

function BarisJurnal({ jurnalId }) {
  const q = useDaftar('v_buku_besar', { filter: [['eq', 'jurnal_id', jurnalId]], order: { kolom: 'urutan' } });
  return (
    <Table size="small" pagination={false} rowKey="baris_id" loading={q.isLoading} dataSource={q.data ?? []} columns={[
      { title: 'Akun', dataIndex: 'akun_kode', render: (v, r) => `${v} ${r.akun_nama}` },
      { title: 'Keterangan', dataIndex: 'keterangan' },
      { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v) => (v === '0.00' ? '' : formatRupiah(v)) },
      { title: 'Kredit', dataIndex: 'kredit', align: 'right', render: (v) => (v === '0.00' ? '' : formatRupiah(v)) },
    ]} />
  );
}

export default function JurnalPage() {
  const { peran } = useAuth();
  const bisa = boleh(peran, 'jurnal.manual');
  const [param] = useSearchParams();
  const idTerpilih = param.get('id');
  const [rentang, setRentang] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [sumber, setSumber] = useState();
  const [baru, setBaru] = useState(false);
  const [batal, setBatal] = useState(null);
  const filter = idTerpilih ? [['eq', 'id', idTerpilih]]
    : [['gte', 'tanggal', keTanggalDb(rentang[0])], ['lte', 'tanggal', keTanggalDb(rentang[1])], ...(sumber ? [['eq', 'sumber_tipe', sumber]] : [])];
  const q = useDaftar('jurnal', { order: { kolom: 'nomor', naik: false }, filter });
  const batalkan = useRpc('batalkan_jurnal_manual', { invalidate: ['jurnal', 'v_buku_besar'], pesanSukses: 'Jurnal dibalik' });
  return (
    <>
      <Flex justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Jurnal</Typography.Title>
        {bisa && <Button type="primary" onClick={() => setBaru(true)}>Jurnal manual</Button>}
      </Flex>
      {!idTerpilih && (
        <Flex wrap gap={8} style={{ marginBottom: 12 }}>
          <DatePicker.RangePicker format="DD/MM/YYYY" value={rentang} onChange={(v) => v && setRentang(v)} allowClear={false} />
          <Select allowClear placeholder="Sumber" style={{ width: 160 }} value={sumber} onChange={setSumber} options={SUMBER.map((s) => ({ value: s, label: s }))} />
        </Flex>
      )}
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={q.data ?? []} scroll={{ x: true }}
        expandable={{ expandedRowRender: (r) => <BarisJurnal jurnalId={r.id} />, defaultExpandAllRows: Boolean(idTerpilih) }}
        columns={[
          { title: 'Nomor', dataIndex: 'nomor' },
          { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Sumber', dataIndex: 'sumber_tipe', render: (v) => <Tag>{v}</Tag> },
          { title: 'Keterangan', dataIndex: 'keterangan' },
          { title: '', key: 's', render: (_, r) => (r.dibalik_oleh_id ? <Tag color="red">dibalik</Tag> : null) },
          { title: '', key: 'a', render: (_, r) => bisa && r.sumber_tipe === 'manual' && !r.dibalik_oleh_id &&
            <Button size="small" danger onClick={() => setBatal(r)}>Batalkan</Button> },
        ]}
      />
      <FormJurnalManual open={baru} onTutup={() => setBaru(false)} />
      <ModalAlasan open={Boolean(batal)} judul={`Balik jurnal ${batal?.nomor ?? ''}`} onBatal={() => setBatal(null)}
        onKirim={async ({ alasan, tanggal }) => { await batalkan.mutateAsync({ p_id: batal.id, p_alasan: alasan, p_tanggal: tanggal }); setBatal(null); }} />
    </>
  );
}
