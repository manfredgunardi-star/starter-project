import { useState } from 'react';
import { Table, Button, Flex, Select, DatePicker, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { boleh } from '../../layout/menu.js';
import { useDaftar } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import { keSen } from '../../lib/uang.js';

export default function InvoicePage() {
  const { peran } = useAuth();
  const nav = useNavigate();
  const [rentang, setRentang] = useState([dayjs().startOf('year'), dayjs().endOf('year')]);
  const [status, setStatus] = useState('terbit');
  const filter = [['gte', 'tanggal', keTanggalDb(rentang[0])], ['lte', 'tanggal', keTanggalDb(rentang[1])]];
  if (status) filter.push(['eq', 'status', status]);
  const q = useDaftar('v_invoice_saldo', { order: { kolom: 'tanggal', naik: false }, filter });
  return (
    <>
      <Flex justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Invoice</Typography.Title>
        {boleh(peran, 'invoice.tulis') && <Button type="primary" onClick={() => nav('/invoice/baru')}>Invoice baru</Button>}
      </Flex>
      <Flex wrap gap={8} style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker format="DD/MM/YYYY" value={rentang} onChange={(v) => v && setRentang(v)} allowClear={false} />
        <Select allowClear placeholder="Status" value={status} onChange={setStatus} style={{ width: 140 }}
          options={[{ value: 'terbit', label: 'Terbit' }, { value: 'batal', label: 'Batal' }]} />
      </Flex>
      <Table
        rowKey="id" size="small" loading={q.isLoading} dataSource={q.data ?? []} scroll={{ x: true }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          { title: 'Nomor', dataIndex: 'nomor', render: (v, r) => <Link to={`/invoice/${r.id}`}>{v}</Link> },
          { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
          { title: 'Pelanggan', dataIndex: 'pelanggan_nama' },
          { title: 'Sub total', dataIndex: 'subtotal', align: 'right', render: formatRupiah },
          { title: 'Uang jalan', dataIndex: 'total_uang_jalan', align: 'right', render: formatRupiah },
          { title: 'Total akhir', dataIndex: 'total_akhir', align: 'right', render: formatRupiah },
          { title: 'Sisa', dataIndex: 'sisa', align: 'right', render: formatRupiah },
          { title: 'Status', key: 's', render: (_, r) => (
            r.status === 'batal' ? <Tag>batal</Tag>
              : keSen(r.sisa) === 0n ? <Tag color="green">lunas</Tag>
              : r.saldo_awal ? <Tag color="purple">saldo awal</Tag> : <Tag color="orange">belum lunas</Tag>
          ) },
        ]}
      />
    </>
  );
}
