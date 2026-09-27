import { Card, Flex, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useFungsi } from '../lib/data.js';
import { formatRupiah } from '../lib/format.js';
import { dariSen, jumlahkan } from '../lib/uang.js';

export default function Beranda() {
  const omzet = useFungsi('laporan_omzet', { p_tahun: dayjs().year() });
  const piutang = useFungsi('laporan_umur_piutang', { p_per: dayjs().format('YYYY-MM-DD') });
  const hutang = useDaftar('v_hutang_upah_supir');
  const hutangKomisi = useDaftar('v_hutang_komisi_pengurus');
  const hutangBonus = useDaftar('v_hutang_bonus');
  const sjTerbuka = useDaftar('surat_jalan', { select: 'id', filter: [['eq', 'status', 'berangkat']] });
  const siapInvoice = useDaftar('surat_jalan', { select: 'id', filter: [['eq', 'status', 'selesai'], ['is', 'invoice_id', null]] });
  const o = omzet.data?.[0];
  return (
    <>
      <Typography.Title level={4}>Beranda</Typography.Title>
      <Flex wrap gap={16}>
        <Card><Statistic title={`Omzet ${dayjs().year()}`} value={formatRupiah(o?.omzet ?? '0')} /><Typography.Text type="secondary">{o ? `${o.persen}% dari batas PP 55` : ''}</Typography.Text></Card>
        <Card><Statistic title="Piutang berjalan" value={formatRupiah(dariSen(jumlahkan((piutang.data ?? []).map((r) => r.sisa))))} /></Card>
        <Card><Statistic title="Hutang upah supir" value={formatRupiah(dariSen(jumlahkan((hutang.data ?? []).map((r) => r.saldo))))} /></Card>
        <Card><Statistic title="Hutang komisi pengurus" value={formatRupiah(dariSen(jumlahkan((hutangKomisi.data ?? []).map((r) => r.saldo))))} /></Card>
        <Card><Statistic title="Hutang bonus" value={formatRupiah(dariSen(jumlahkan((hutangBonus.data ?? []).map((r) => r.saldo))))} /></Card>
        <Card><Statistic title="SJ belum selesai" value={sjTerbuka.data?.length ?? 0} /></Card>
        <Card><Statistic title="SJ siap diinvoice" value={siapInvoice.data?.length ?? 0} /></Card>
      </Flex>
    </>
  );
}
