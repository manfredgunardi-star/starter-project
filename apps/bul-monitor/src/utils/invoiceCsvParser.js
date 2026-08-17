/**
 * Parser CSV untuk import Invoice (bul-monitor).
 *
 * Fungsi MURNI: tidak menyentuh React, Firebase, maupun DOM.
 * Tugasnya hanya mengubah teks CSV + daftar Surat Jalan yang layak di-invoice
 * menjadi nilai-nilai yang siap dimasukkan ke state form invoice yang SUDAH ADA.
 * Tidak ada rumus uang baru di sini: nilai dihitung persis seperti addInvoice()
 * di App.jsx, yaitu qtyBongkar * hargaSatuan per Surat Jalan.
 */

const HARGA_PATTERN = /^\d+(\.\d+)?$/;

const hasil = (patch = {}) => ({
  ok: true,
  error: null,
  matched: [],
  rejected: [],
  groups: [],
  selectedSJIds: [],
  hargaPerGroup: {},
  hargaSatuan: null,
  totalNilai: 0,
  ...patch,
});

export function parseInvoiceCsv(csvText, eligibleSJList = []) {
  // Excel menyimpan CSV UTF-8 dengan BOM di awal berkas; harus dibuang
  // agar pengecekan header tidak gagal karena karakter tak terlihat.
  const teks = String(csvText || '').replace(/^\uFEFF/, '');

  const baris = teks
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (baris.length < 2) {
    return hasil({ ok: false, error: 'File CSV kosong atau tidak berisi baris data.' });
  }

  const pemisah = baris[0].includes(';') ? ';' : ',';
  const header = baris[0].split(pemisah).map((h) => h.trim().toLowerCase());

  const headerValid =
    header.length === 2 &&
    header[0].includes('nomor') &&
    header[0].includes('sj') &&
    header[1].includes('harga');

  if (!headerValid) {
    return hasil({
      ok: false,
      error:
        'Header CSV tidak sesuai.\n\nFormat yang benar:\nNomor SJ;Harga Jual per Satuan\n\n' +
        `Header yang ditemukan:\n${baris[0]}\n\nSilakan pakai tombol "Download Template CSV".`,
    });
  }

  const matched = [];
  const rejected = [];
  const sudahDipakai = new Map(); // nomorSJ (lowercase) -> nomor baris pertama yang memakainya

  for (let i = 1; i < baris.length; i++) {
    const nomorBaris = i + 1; // header = baris 1
    const kolom = baris[i].split(pemisah).map((v) => v.trim());
    const nomorSJ = kolom[0] || '';
    const hargaMentah = kolom[1] || '';

    if (kolom.length < 2 || !nomorSJ || !hargaMentah) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: 'Baris tidak lengkap — butuh 2 kolom: Nomor SJ dan Harga Jual per Satuan.',
      });
      continue;
    }

    if (!HARGA_PATTERN.test(hargaMentah)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          `Harga "${hargaMentah}" bukan angka polos. Tulis tanpa "Rp" dan tanpa pemisah ribuan, ` +
          'pakai titik untuk desimal. Contoh: 50000 atau 50123.45.',
      });
      continue;
    }

    const harga = parseFloat(hargaMentah);
    if (!(harga > 0)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: 'Harga harus lebih besar dari 0.',
      });
      continue;
    }

    const kunci = nomorSJ.toLowerCase();
    if (sudahDipakai.has(kunci)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: `Nomor SJ duplikat di dalam file — sudah dipakai di baris ${sudahDipakai.get(kunci)}.`,
      });
      continue;
    }

    const kandidat = eligibleSJList.filter(
      (sj) => String(sj.nomorSJ || '').trim().toLowerCase() === kunci
    );

    if (kandidat.length === 0) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          'Nomor SJ tidak ditemukan di daftar Surat Jalan yang bisa di-invoice. ' +
          'Kemungkinan sudah terinvoice, belum berstatus terkirim, atau salah ketik.',
      });
      continue;
    }

    if (kandidat.length > 1) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: `Nomor SJ ambigu — ada ${kandidat.length} Surat Jalan dengan nomor yang sama. Selesaikan lewat pemilihan manual.`,
      });
      continue;
    }

    sudahDipakai.set(kunci, nomorBaris);
    matched.push({ nomorSJ, sj: kandidat[0], harga });
  }

  if (matched.length === 0) {
    return hasil({
      ok: false,
      error: 'Tidak ada baris yang bisa dipakai. Periksa daftar penolakan di bawah.',
      rejected,
    });
  }

  return hasil({ matched, rejected });
}
