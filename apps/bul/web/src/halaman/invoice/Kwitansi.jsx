import { Button, Flex, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useDaftar } from '../../lib/data.js';
import { formatQty, formatRupiah, formatTanggal } from '../../lib/format.js';
import { terbilang } from './terbilang.js';
import './kwitansi.css';

export default function Kwitansi() {
  const { id } = useParams();
  const nav = useNavigate();
  const inv = useDaftar('invoice', { select: '*, pelanggan(nama, alamat, npwp)', filter: [['eq', 'id', id]] });
  const baris = useDaftar('invoice_baris', {
    select: '*, surat_jalan(nomor, tanggal, rute(nama), material(nama, satuan), truk(nopol))',
    filter: [['eq', 'invoice_id', id], ['eq', 'aktif', true]],
  });
  const i = inv.data?.[0];
  if (inv.isLoading || baris.isLoading) return <Spin />;
  if (!i) return null;
  const urut = [...(baris.data ?? [])].sort((a, b) => (a.surat_jalan.tanggal + a.surat_jalan.nomor).localeCompare(b.surat_jalan.tanggal + b.surat_jalan.nomor));
  return (
    <>
      <Flex gap={8} className="tanpa-cetak" style={{ marginBottom: 12 }}>
        <Button onClick={() => nav(-1)}>Kembali</Button>
        <Button type="primary" onClick={() => window.print()}>Cetak</Button>
      </Flex>
      <div className="kwitansi">
        <h2 style={{ textAlign: 'center', margin: 0 }}>KWITANSI / INVOICE</h2>
        <p style={{ textAlign: 'center' }}>No. {i.nomor} — {formatTanggal(i.tanggal)}{i.status === 'batal' ? ' — DIBATALKAN' : ''}</p>
        <p>Kepada: <b>{i.pelanggan.nama}</b><br />{i.pelanggan.alamat}{i.pelanggan.npwp ? <><br />NPWP {i.pelanggan.npwp}</> : null}</p>
        <table>
          <thead>
            <tr><th>No</th><th>Tanggal</th><th>No. SJ</th><th>Truk</th><th>Rute</th><th>Material</th><th>Qty</th><th>Harga</th><th>Jumlah</th><th>Uang jalan</th></tr>
          </thead>
          <tbody>
            {urut.map((b, n) => (
              <tr key={b.id}>
                <td>{n + 1}</td><td>{formatTanggal(b.surat_jalan.tanggal)}</td><td>{b.surat_jalan.nomor}</td>
                <td>{b.surat_jalan.truk.nopol}</td><td>{b.surat_jalan.rute.nama}</td><td>{b.surat_jalan.material.nama}</td>
                <td className="angka">{formatQty(b.qty)} {b.surat_jalan.material.satuan}</td>
                <td className="angka">{formatRupiah(b.harga_satuan)}</td>
                <td className="angka">{formatRupiah(b.jumlah)}</td>
                <td className="angka">{formatRupiah(b.uang_jalan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="ringkas" style={{ width: 360, marginLeft: 'auto', marginTop: 8 }}>
          <tbody>
            <tr><td>Sub Total</td><td className="angka">{formatRupiah(i.subtotal)}</td></tr>
            <tr><td>Potongan uang jalan</td><td className="angka">-{formatRupiah(i.total_uang_jalan)}</td></tr>
            <tr><td><b>Total</b></td><td className="angka"><b>{formatRupiah(i.total_akhir)}</b></td></tr>
          </tbody>
        </table>
        <p><i>Terbilang: {terbilang(i.total_akhir)}</i></p>
        {i.keterangan && <p>{i.keterangan}</p>}
      </div>
    </>
  );
}
