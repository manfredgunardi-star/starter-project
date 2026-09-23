import { useState } from 'react';
import { Table, Select, DatePicker, Flex, Typography } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useFungsi } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import { dariSen, keSen } from '../../lib/uang.js';

export default function BukuBesarPage() {
  const [akun, setAkun] = useState();
  const [rentang, setRentang] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const daftarAkun = useDaftar('akun', { filter: [['eq', 'tipe', 'detail']], order: { kolom: 'kode' } });
  const dari = keTanggalDb(rentang[0]);
  const sampai = keTanggalDb(rentang[1]);
  const saldo = useFungsi('laporan_saldo_akun', { p_dari: dari, p_sampai: sampai }, { enabled: Boolean(akun) });
  const mutasi = useDaftar('v_buku_besar', {
    enabled: Boolean(akun), order: { kolom: 'tanggal' },
    filter: [['eq', 'akun_kode', akun ?? ''], ['gte', 'tanggal', dari], ['lte', 'tanggal', sampai]],
  });
  const info = (saldo.data ?? []).find((r) => r.kode === akun);
  const normalDebit = info?.saldo_normal !== 'kredit';
  let berjalan = keSen(info?.saldo_awal ?? '0');
  const baris = [...(mutasi.data ?? [])].sort((a, b) => (a.tanggal + a.nomor).localeCompare(b.tanggal + b.nomor)).map((r) => {
    berjalan += normalDebit ? keSen(r.debit) - keSen(r.kredit) : keSen(r.kredit) - keSen(r.debit);
    return { ...r, saldo: dariSen(berjalan) };
  });
  return (
    <>
      <Typography.Title level={4}>Buku Besar</Typography.Title>
      <Flex wrap gap={8} style={{ marginBottom: 12 }}>
        <Select showSearch optionFilterProp="label" placeholder="Pilih akun" style={{ minWidth: 300 }} value={akun} onChange={setAkun}
          options={(daftarAkun.data ?? []).map((a) => ({ value: a.kode, label: `${a.kode} ${a.nama}` }))} />
        <DatePicker.RangePicker format="DD/MM/YYYY" value={rentang} onChange={(v) => v && setRentang(v)} allowClear={false} />
      </Flex>
      {akun && <Typography.Paragraph>Saldo awal: <b>{formatRupiah(info?.saldo_awal ?? '0')}</b> · Saldo akhir: <b>{formatRupiah(info?.saldo_akhir ?? '0')}</b></Typography.Paragraph>}
      <Table rowKey="baris_id" size="small" loading={mutasi.isLoading} dataSource={baris} scroll={{ x: true }} pagination={{ pageSize: 100, showSizeChanger: false }} columns={[
        { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal },
        { title: 'Nomor', dataIndex: 'nomor' },
        { title: 'Keterangan', dataIndex: 'keterangan' },
        { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v) => (v === '0.00' ? '' : formatRupiah(v)) },
        { title: 'Kredit', dataIndex: 'kredit', align: 'right', render: (v) => (v === '0.00' ? '' : formatRupiah(v)) },
        { title: 'Saldo', dataIndex: 'saldo', align: 'right', render: formatRupiah },
      ]} />
    </>
  );
}
