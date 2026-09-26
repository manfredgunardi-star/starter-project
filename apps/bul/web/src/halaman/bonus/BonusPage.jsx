import { useState } from 'react';
import { Alert, Button, Card, DatePicker, Flex, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useDaftar, useFungsi, useRpc } from '../../lib/data.js';
import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';
import { dariSen, jumlahkan } from '../../lib/uang.js';
import { labelJenisBonus } from '../master/konfigurasi.js';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import ModalAlasan from '../../komponen/ModalAlasan.jsx';

const SEGARKAN = ['jurnal', 'v_hutang_bonus', 'pratinjau_bonus'];

export default function BonusPage() {
  // Bulan lalu adalah pilihan yang hampir selalu benar: bulan berjalan belum boleh diposting.
  const [bulan, setBulan] = useState(() => dayjs().subtract(1, 'month'));
  const [batal, setBatal] = useState(false);
  const periode = keTanggalDb(bulan.startOf('month'));
  const akhir = keTanggalDb(bulan.endOf('month'));
  // Server menolak bulan yang belum berakhir; klien cuma mencerminkannya agar tombol tidak menyesatkan.
  const belumBerakhir = !bulan.endOf('month').isBefore(dayjs(), 'day');

  const pratinjau = useFungsi('pratinjau_bonus', { p_periode: periode });
  const jurnal = useDaftar('jurnal', {
    filter: [['eq', 'sumber_tipe', 'bonus'], ['eq', 'tanggal', akhir], ['is', 'dibalik_oleh_id', null]],
  });
  const hitung = useRpc('hitung_bonus', { invalidate: SEGARKAN, pesanSukses: 'Bonus diposting' });
  const batalkan = useRpc('batalkan_bonus', { invalidate: SEGARKAN, pesanSukses: 'Bonus dibatalkan' });

  const baris = pratinjau.data ?? [];
  const total = dariSen(jumlahkan(baris.map((r) => r.jumlah)));
  const sudah = jurnal.data?.[0];

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={4} style={{ margin: 0 }}>Bonus</Typography.Title>
      <Card>
        <Flex gap={12} align="center" wrap>
          <DatePicker picker="month" format="MM/YYYY" value={bulan} allowClear={false}
            onChange={(v) => v && setBulan(v)} />
          <Typography.Text strong>Total {formatRupiah(total)}</Typography.Text>
          {sudah ? (
            <>
              <Typography.Text type="secondary">
                Sudah diposting: {sudah.nomor} per {formatTanggal(sudah.tanggal)}
              </Typography.Text>
              <Button danger onClick={() => setBatal(true)}>Batalkan Bonus</Button>
            </>
          ) : (
            <TombolAksi type="primary" disabled={belumBerakhir || baris.length === 0}
              onClick={() => hitung.mutateAsync({ p_periode: periode })}>
              Posting Bonus
            </TombolAksi>
          )}
        </Flex>
        {belumBerakhir && (
          <Alert style={{ marginTop: 12 }} type="info" showIcon
            message="Bulan ini belum berakhir. Bonus baru bisa diposting setelah bulan selesai." />
        )}
        {!belumBerakhir && !sudah && baris.length === 0 && !pratinjau.isLoading && (
          <Alert style={{ marginTop: 12 }} type="warning" showIcon
            message="Tidak ada bonus untuk bulan ini. Periksa Aturan Bonus di Master Data." />
        )}
      </Card>
      <Table
        rowKey={(r) => `${r.jenis}-${r.penerima_id}`}
        size="small"
        pagination={false}
        loading={pratinjau.isLoading}
        dataSource={baris}
        columns={[
          { title: 'Penerima', dataIndex: 'penerima_nama' },
          { title: 'Peran', dataIndex: 'penerima_jenis', render: (v) => (v === 'supir' ? 'Supir' : 'Pengurus') },
          { title: 'Jenis bonus', dataIndex: 'jenis', render: labelJenisBonus },
          { title: 'Dasar', dataIndex: 'dasar', align: 'right' },
          { title: 'Jumlah', dataIndex: 'jumlah', align: 'right', render: formatRupiah },
        ]}
      />
      <ModalAlasan
        open={batal}
        judul={`Batalkan bonus ${bulan.format('MM/YYYY')}`}
        onBatal={() => setBatal(false)}
        onKirim={async ({ alasan, tanggal }) => {
          await batalkan.mutateAsync({ p_periode: periode, p_alasan: alasan, p_tanggal: tanggal });
          setBatal(false);
        }}
      />
    </Flex>
  );
}
