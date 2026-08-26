/**
 * Satu-satunya sumber kebenaran untuk tiga angka kwitansi:
 * Sub Total (bruto) − Potongan Uang Jalan = Total Akhir (net).
 *
 * Kwitansi fisik di lapangan memakai format "SUB Total − Pengurangan UJ =
 * Total Akhir", sementara dokumen invoice di Firestore hanya menyimpan angka
 * bruto pada `totalNilai`. Uang jalan tinggal di dokumen Surat Jalan dan tidak
 * pernah diagregasi kecuali saat kirim ke accounting.
 *
 * Uang jalan diresolusi LIVE-FIRST: dokumen Surat Jalan yang sedang aktif
 * dipakai lebih dulu, snapshot `invoice.suratJalanList` hanya jadi cadangan.
 * Ini disengaja supaya angka yang tampil di layar identik dengan `totalUJ`
 * yang dihitung `integrationService.kirimInvoiceKeAccounting()` — kalau UI
 * memakai snapshot beku sementara jurnal memakai SJ live, kwitansi dan buku
 * besar akan berpisah diam-diam, persis bug yang util ini perbaiki.
 */

/**
 * Resolusi `suratJalanIds` sebuah invoice menjadi dokumen Surat Jalan.
 *
 * @param {object} invoice Dokumen invoice.
 * @param {object[]} [suratJalanList] Daftar Surat Jalan yang sedang aktif.
 * @returns {{ list: Array<{ sj: object, sumber: 'live'|'snapshot' }>, sjHilang: number }}
 */
export function resolveSJInvoice(invoice, suratJalanList = []) {
  const ids = invoice?.suratJalanIds || [];
  const snapshot = invoice?.suratJalanList || [];
  const snapshotById = new Map(snapshot.map((sj) => [sj?.id, sj]));

  const list = [];
  let sjHilang = 0;

  for (const id of ids) {
    const live = suratJalanList.find((sj) => sj?.id === id);
    if (live) {
      list.push({ sj: live, sumber: 'live' });
      continue;
    }
    const snap = snapshotById.get(id);
    if (snap) {
      list.push({ sj: snap, sumber: 'snapshot' });
      continue;
    }
    sjHilang += 1;
  }

  return { list, sjHilang };
}

/**
 * Jumlahkan uangJalan dari sederet dokumen Surat Jalan.
 *
 * @param {object[]} [sjs] Dokumen Surat Jalan.
 * @returns {number}
 */
export function hitungPotonganUJ(sjs = []) {
  return sjs.reduce((total, sj) => total + (Number(sj?.uangJalan) || 0), 0);
}

/**
 * Hitung tiga angka kwitansi untuk satu invoice tersimpan.
 *
 * `subTotal` selalu diambil apa adanya dari `invoice.totalNilai` — nilai itu
 * bruto dan menjadi dasar pengakuan pendapatan Cr 4100, jadi tidak boleh
 * dihitung ulang di sini.
 *
 * @param {object} invoice Dokumen invoice.
 * @param {object[]} [suratJalanList] Daftar Surat Jalan yang sedang aktif.
 * @returns {{ subTotal: number, potonganUJ: number, totalAkhir: number, sumberUJ: 'live'|'campuran'|'snapshot', sjHilang: number }}
 */
export function hitungTotalInvoice(invoice, suratJalanList = []) {
  const { list, sjHilang } = resolveSJInvoice(invoice, suratJalanList);

  const dariSnapshot = list.filter((x) => x.sumber === 'snapshot').length;
  const dariLive = list.length - dariSnapshot;

  let sumberUJ = 'campuran';
  if (dariSnapshot === 0) sumberUJ = 'live';
  else if (dariLive === 0) sumberUJ = 'snapshot';

  const subTotal = Number(invoice?.totalNilai) || 0;
  const potonganUJ = hitungPotonganUJ(list.map((x) => x.sj));

  return { subTotal, potonganUJ, totalAkhir: subTotal - potonganUJ, sumberUJ, sjHilang };
}
