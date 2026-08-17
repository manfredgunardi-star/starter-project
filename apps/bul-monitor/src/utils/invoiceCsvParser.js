/**
 * Parser CSV untuk import Invoice (bul-monitor).
 *
 * Fungsi MURNI: tidak menyentuh React, Firebase, maupun DOM.
 * Tugasnya hanya mengubah teks CSV + daftar Surat Jalan yang layak di-invoice
 * menjadi nilai-nilai yang siap dimasukkan ke state form invoice yang SUDAH ADA.
 * Tidak ada rumus uang baru di sini: nilai dihitung persis seperti addInvoice()
 * di App.jsx, yaitu qtyBongkar * hargaSatuan per Surat Jalan.
 */

// Maksimal 2 angka desimal. Batas inilah yang menolak "50.000" — format ribuan
// Excel berlokal Indonesia — yang kalau diterima akan terbaca sebagai Rp 50,
// yaitu salah tagih 1000x tanpa peringatan apa pun.
const HARGA_PATTERN = /^\d+(\.\d{1,2})?$/;

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

  // Nomor baris ASLI di berkas ikut disimpan. Kalau baris kosong hanya dibuang,
  // daftar penolakan akan menunjuk baris yang salah dan operator mengoreksi
  // baris yang sebenarnya sudah benar.
  const baris = [];
  teks.split('\n').forEach((isi, idx) => {
    const bersih = isi.trim();
    if (bersih.length > 0) baris.push({ isi: bersih, nomorAsli: idx + 1 });
  });

  if (baris.length < 2) {
    return hasil({ ok: false, error: 'File CSV kosong atau tidak berisi baris data.' });
  }

  const pemisah = baris[0].isi.includes(';') ? ';' : ',';
  const header = baris[0].isi.split(pemisah).map((h) => h.trim().toLowerCase());

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
        `Header yang ditemukan:\n${baris[0].isi}\n\nSilakan pakai tombol "Download Template CSV".`,
    });
  }

  const matched = [];
  const rejected = [];
  const sudahDipakai = new Map(); // nomorSJ (lowercase) -> nomor baris pertama yang memakainya

  for (let i = 1; i < baris.length; i++) {
    const nomorBaris = baris[i].nomorAsli;
    const kolom = baris[i].isi.split(pemisah).map((v) => v.trim());
    const nomorSJ = kolom[0] || '';
    const hargaMentah = kolom[1] || '';

    // Wajib TEPAT 2 kolom. Kalau kolom berlebih dibiarkan, "07214,50,000"
    // akan terbaca sebagai harga 50 dan kolom ketiga hilang tanpa jejak.
    if (kolom.length !== 2 || !nomorSJ || !hargaMentah) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan: 'Baris harus tepat 2 kolom: Nomor SJ dan Harga Jual per Satuan.',
      });
      continue;
    }

    if (!HARGA_PATTERN.test(hargaMentah)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          `Harga "${hargaMentah}" bukan angka polos. Tulis tanpa "Rp" dan tanpa pemisah ribuan, ` +
          'maksimal 2 angka desimal dengan titik. Contoh: 50000 atau 50123.45. ' +
          'Kalau maksud Anda lima puluh ribu, tulis 50000 — bukan 50.000.',
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

    // Qty Bongkar kosong/0 berarti nilainya Rp 0, tapi SJ-nya tetap akan dicap
    // "terinvoice" saat disimpan — tertagih nol dan hilang selamanya dari daftar
    // eligible. Import melewati review visual per kartu, jadi harus ditolak di sini.
    const qtyBongkar = Number(kandidat[0].qtyBongkar);
    if (!(qtyBongkar > 0)) {
      rejected.push({
        baris: nomorBaris,
        nomorSJ,
        alasan:
          'Qty Bongkar Surat Jalan ini kosong atau 0, jadi nilainya akan Rp 0. ' +
          'Lengkapi Qty Bongkar dulu lewat Surat Jalan, baru import ulang.',
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

  // Kelompokkan per (material|rute) — kunci ini HARUS sama persis dengan yang
  // dipakai Modal.jsx dan addInvoice() di App.jsx agar harga tersambung benar.
  const peta = new Map();
  for (const item of matched) {
    const groupKey = `${item.sj.material}|${item.sj.rute}`;
    if (!peta.has(groupKey)) peta.set(groupKey, []);
    peta.get(groupKey).push(item);
  }

  // Harga wajib seragam dalam satu grup. Kalau tidak, tolak seluruh berkas —
  // menebak salah satu harga berarti diam-diam mengubah nilai tagihan.
  for (const [groupKey, anggota] of peta) {
    const pertama = anggota[0];
    const beda = anggota.find((a) => a.harga !== pertama.harga);
    if (beda) {
      const [material, rute] = groupKey.split('|');
      return hasil({
        ok: false,
        rejected,
        error:
          `Harga tidak konsisten untuk ${material} — ${rute}.\n\n` +
          `SJ ${pertama.nomorSJ}: Rp ${pertama.harga.toLocaleString('id-ID')}\n` +
          `SJ ${beda.nomorSJ}: Rp ${beda.harga.toLocaleString('id-ID')}\n\n` +
          'Satu rute hanya boleh punya satu harga per invoice. Perbaiki file lalu import ulang.',
      });
    }
  }

  const groups = [];
  let totalNilai = 0;
  const hargaPerGroup = {};

  for (const [groupKey, anggota] of peta) {
    const [material, rute] = groupKey.split('|');
    const hargaSatuanGrup = anggota[0].harga;
    const totalQty = anggota.reduce((s, a) => s + (Number(a.sj.qtyBongkar) || 0), 0);
    // Dihitung per Surat Jalan, persis seperti addInvoice() di App.jsx,
    // supaya angka pratinjau sama dengan angka yang tersimpan.
    const nilai = anggota.reduce(
      (s, a) => s + (Number(a.sj.qtyBongkar) || 0) * hargaSatuanGrup,
      0
    );

    totalNilai += nilai;
    hargaPerGroup[groupKey] = String(hargaSatuanGrup);
    groups.push({
      groupKey,
      material,
      rute,
      satuan: anggota[0].sj.satuan || 'satuan',
      hargaSatuan: hargaSatuanGrup,
      totalQty,
      nilai,
      jumlahSJ: anggota.length,
    });
  }

  return hasil({
    matched,
    rejected,
    groups,
    selectedSJIds: matched.map((m) => m.sj.id),
    hargaPerGroup,
    // Form invoice memakai satu input tunggal bila hanya ada 1 grup,
    // dan input per grup bila lebih dari 1 (lihat Modal.jsx:737 dan :766).
    hargaSatuan: groups.length === 1 ? String(groups[0].hargaSatuan) : null,
    totalNilai,
  });
}
