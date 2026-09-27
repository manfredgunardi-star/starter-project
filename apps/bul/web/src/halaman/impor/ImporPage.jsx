import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Descriptions, Flex, Table, Typography, Upload } from 'antd';
import { useDaftar, useRpc } from '../../lib/data.js';
import { formatRupiah } from '../../lib/format.js';
import { unduhCsv } from '../../lib/csv.js';
import { BERKAS, bacaBerkas, templatCsv, namaTakDikenal, ringkasan, peringatanImpor } from './skema.js';

const SEGARKAN = [
  'surat_jalan', 'transaksi_kas', 'jurnal', 'pelanggan', 'rute', 'material', 'truk', 'supir',
  'pengurus', 'tarif', 'uang_jalan_rute', 'aturan_upah',
];

const KUNCI_MASTER = ['rute', 'material', 'pelanggan', 'truk', 'supir', 'pengurus', 'uang_jalan', 'tarif', 'aturan_upah'];

export default function ImporPage() {
  const [kiriman, setKiriman] = useState({});
  const [galat, setGalat] = useState([]);
  const [peringatan, setPeringatan] = useState([]);
  const [akui, setAkui] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const kunci = useDaftar('kunci_periode');
  const pelanggan = useDaftar('pelanggan', { select: 'nama,aktif' });
  const rute = useDaftar('rute', { select: 'nama,tipe_rute_id,aktif' });
  const truk = useDaftar('truk', { select: 'nopol,aktif' });
  const supir = useDaftar('supir', { select: 'nama,aktif' });
  const pengurus = useDaftar('pengurus', { select: 'nama,aktif' });
  const material = useDaftar('material', { select: 'lini_kode,nama,aktif' });
  const lini = useDaftar('lini', { select: 'kode' });
  const tipeRute = useDaftar('tipe_rute', { select: 'id,nama' });
  // aktif = true supaya cocok dengan syarat komisi_berlaku, yang hanya melihat aturan aktif.
  const aturanKomisi = useDaftar('aturan_komisi', { select: 'tipe_rute_id', filter: [['eq', 'aktif', true]] });
  const akun = useDaftar('akun', { select: 'kode' });

  const imporMaster = useRpc('impor_master', { invalidate: SEGARKAN, pesanSukses: 'Master data terimpor' });
  const imporSj = useRpc('impor_surat_jalan', { invalidate: SEGARKAN, pesanSukses: 'Surat jalan terimpor' });
  const imporKas = useRpc('impor_kas', { invalidate: SEGARKAN, pesanSukses: 'Kas terimpor' });

  const terkunci = kunci.data?.[0]?.terkunci_sampai ?? null;
  const ring = ringkasan(kiriman);
  const adaIsi = Object.keys(ring.jumlah).length > 0;
  // Tepat sesudah reload, query React Query di atas belum resolve dan .data masih undefined;
  // pilihBerkas() membacanya sebagai [] lalu menuduh SETIAP nama di berkas "belum ada di master".
  // Kunci pemilihan berkas sampai semuanya termuat, supaya galat itu tidak pernah muncul palsu.
  const masterBelumSiap = [kunci, pelanggan, rute, truk, supir, pengurus, material, lini, tipeRute, aturanKomisi, akun]
    .some((q) => q.isLoading);

  async function pilihBerkas(berkasList) {
    const baru = {};
    const semuaGalat = [];
    for (const f of berkasList) {
      const hasil = bacaBerkas(f.name, await f.text());
      semuaGalat.push(...hasil.galat);
      if (hasil.kunci && hasil.baris.length) baru[hasil.kunci] = hasil.baris;
    }
    const master = {
      pelanggan: (pelanggan.data ?? []).filter((r) => r.aktif).map((r) => r.nama),
      rute: (rute.data ?? []).filter((r) => r.aktif).map((r) => r.nama),
      truk: (truk.data ?? []).filter((r) => r.aktif).map((r) => r.nopol),
      supir: (supir.data ?? []).filter((r) => r.aktif).map((r) => r.nama),
      pengurus: (pengurus.data ?? []).filter((r) => r.aktif).map((r) => r.nama),
      material: (material.data ?? []).filter((r) => r.aktif).map((r) => `${r.lini_kode}|${r.nama}`),
      lini: (lini.data ?? []).map((r) => r.kode),
      tipe_rute: (tipeRute.data ?? []).map((r) => r.nama),
      akun: (akun.data ?? []).map((r) => r.kode),
    };
    const takAktif = {
      pelanggan: (pelanggan.data ?? []).filter((r) => !r.aktif).map((r) => r.nama),
      rute: (rute.data ?? []).filter((r) => !r.aktif).map((r) => r.nama),
      truk: (truk.data ?? []).filter((r) => !r.aktif).map((r) => r.nopol),
      supir: (supir.data ?? []).filter((r) => !r.aktif).map((r) => r.nama),
      pengurus: (pengurus.data ?? []).filter((r) => !r.aktif).map((r) => r.nama),
      material: (material.data ?? []).filter((r) => !r.aktif).map((r) => `${r.lini_kode}|${r.nama}`),
    };
    const berkomisi = new Set((aturanKomisi.data ?? []).map((r) => r.tipe_rute_id));
    setKiriman(baru);
    setGalat([...semuaGalat, ...namaTakDikenal(baru, master, takAktif)]);
    setAkui(false);
    setPeringatan(peringatanImpor(baru, {
      tipeRuteBerkomisi: (tipeRute.data ?? []).filter((r) => berkomisi.has(r.id)).map((r) => r.nama),
      ruteTanpaTipe: (rute.data ?? []).filter((r) => r.tipe_rute_id === null).map((r) => r.nama),
    }));
  }

  async function jalankan() {
    setSibuk(true);
    try {
      const master = Object.fromEntries(KUNCI_MASTER.filter((k) => kiriman[k]).map((k) => [k, kiriman[k]]));
      if (Object.keys(master).length) await imporMaster.mutateAsync({ p_data: master });
      if (kiriman.surat_jalan?.length) await imporSj.mutateAsync({ p_baris: kiriman.surat_jalan });
      if (kiriman.kas?.length) await imporKas.mutateAsync({ p_baris: kiriman.kas });
      setKiriman({});
      setGalat([]);
      setPeringatan([]);
      setAkui(false);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={4} style={{ margin: 0 }}>Impor Riwayat</Typography.Title>

      {terkunci && (
        <Alert type="error" showIcon
          message={`Periode terkunci sampai ${terkunci}`}
          description="Impor bertanggal di dalam periode terkunci akan ditolak. Buka kunci lewat Pengaturan sebelum mengimpor." />
      )}

      <Card>
        <Flex gap={12} wrap align="center">
          <Button onClick={() => templatCsv().forEach((t, i) => setTimeout(() => unduhCsv(t.berkas, t.teks), i * 250))}>
            Unduh templat ({BERKAS.length} berkas)
          </Button>
          <Upload multiple accept=".csv" showUploadList={false} beforeUpload={() => false} disabled={masterBelumSiap}
            onChange={({ fileList }) => pilihBerkas(fileList.map((f) => f.originFileObj ?? f))}>
            <Button type="primary" disabled={masterBelumSiap} loading={masterBelumSiap}>
              {masterBelumSiap ? 'Memuat master data…' : 'Pilih berkas CSV'}
            </Button>
          </Upload>
          <Button danger loading={sibuk} onClick={jalankan}
            disabled={!adaIsi || galat.length > 0 || sibuk || (peringatan.length > 0 && !akui)}>
            Impor sekarang
          </Button>
        </Flex>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Isi templat di Excel, simpan sebagai CSV, lalu pilih semua berkasnya sekaligus. Urutan tidak penting.
        </Typography.Paragraph>
      </Card>

      {galat.length > 0 && (
        <Alert type="error" showIcon
          message={`${galat.length} masalah harus dibereskan sebelum impor bisa dijalankan`}
          description={<ul style={{ margin: 0, paddingLeft: 20 }}>{galat.map((g) => <li key={g}>{g}</li>)}</ul>} />
      )}

      {peringatan.length > 0 && (
        <Alert type="warning" showIcon
          message="Impor ini akan berjalan, tetapi sebagian angka tidak akan sesuai dokumen lama"
          description={
            <>
              <ul style={{ margin: 0, paddingLeft: 20 }}>{peringatan.map((p) => <li key={p}>{p}</li>)}</ul>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 8 }}>
                Komisi dihitung dari tipe rute dan aturan komisi, bukan dari berkas, dan tidak bisa
                ditimpa per baris. Upah yang dikosongkan pun diambil dari aturan yang berlaku sekarang.
                Bereskan dulu lewat layar master atau lengkapi berkasnya kalau angka periode ini memang
                harus sesuai dokumen lama — sesudah impor, jurnalnya hanya bisa diperbaiki lewat jurnal balik.
              </Typography.Paragraph>
              <Checkbox checked={akui} onChange={(e) => setAkui(e.target.checked)}>
                Saya mengerti dan tetap ingin mengimpor
              </Checkbox>
            </>
          } />
      )}

      {adaIsi && (
        <Card title="Pratinjau — adu angka ini dengan subtotal di Excel Anda sebelum mengimpor">
          <Descriptions column={2} size="small" bordered items={[
            { key: 'uj', label: 'Total uang jalan', children: formatRupiah(ring.uangJalan) },
            { key: 'up', label: 'Total upah', children: formatRupiah(ring.upah) },
            { key: 'kk', label: 'Total kas keluar', children: formatRupiah(ring.kasKeluar) },
            { key: 'km', label: 'Total kas masuk', children: formatRupiah(ring.kasMasuk) },
          ]} />
          <Table style={{ marginTop: 16 }} size="small" pagination={false} rowKey="kunci"
            dataSource={Object.entries(ring.jumlah).map(([k, n]) => ({ kunci: k, jumlah: n }))}
            columns={[
              { title: 'Jenis', dataIndex: 'kunci' },
              { title: 'Jumlah baris', dataIndex: 'jumlah', align: 'right' },
            ]} />
        </Card>
      )}
    </Flex>
  );
}
