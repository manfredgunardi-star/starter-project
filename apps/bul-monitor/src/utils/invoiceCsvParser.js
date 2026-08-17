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

  return hasil();
}
