function sel(v, angka) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (angka) return s.replace('.', ',');
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function keCsv(kolom, rows) {
  const ambil = (r, di) => (Array.isArray(di) ? di.reduce((o, k) => o?.[k], r) : r[di]);
  const baris = [kolom.map((k) => sel(k.title)).join(';')];
  for (const r of rows) baris.push(kolom.map((k) => sel(ambil(r, k.dataIndex), k.angka)).join(';'));
  return `﻿${baris.join('\r\n')}\r\n`;
}

export function unduhCsv(namaFile, teks) {
  const url = URL.createObjectURL(new Blob([teks], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  a.click();
  URL.revokeObjectURL(url);
}

// Pembaca untuk berkas impor. Konvensinya sama persis dengan keCsv di atas:
// BOM, pemisah titik koma, CRLF, dan field berkutip ala RFC 4180.
// Nomor baris sumber ikut dibawa supaya pesan galat bisa menunjuk baris yang SAMA dengan
// yang dilihat user di Excel. Baris judul adalah baris 1, jadi baris data ke-k berada di
// baris k+1 — dan setiap baris kosong yang dibuang menggeser selisihnya lebih jauh lagi,
// sehingga user tidak bisa mengoreksinya sendiri dengan menambah satu.
export function dariCsvBernomor(teks) {
  const s = String(teks ?? '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const semua = [];
  let baris = [];
  let sel = '';
  let dalamKutip = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (dalamKutip) {
      if (c !== '"') sel += c;
      else if (s[i + 1] === '"') { sel += '"'; i += 1; }
      else dalamKutip = false;
      continue;
    }
    if (c === '"' && sel === '') dalamKutip = true;
    else if (c === ';') { baris.push(sel); sel = ''; }
    else if (c === '\n') { baris.push(sel); semua.push(baris); baris = []; sel = ''; }
    else sel += c;
  }
  if (sel !== '' || baris.length) { baris.push(sel); semua.push(baris); }

  // Indeks asli dipertahankan SEBELUM menyaring, karena setelah disaring ia hilang.
  const isi = semua
    .map((r, i) => ({ no: i + 1, sel: r }))
    .filter((r) => r.sel.some((v) => v.trim() !== ''));
  if (isi.length < 2) return [];
  const judul = isi[0].sel.map((h) => h.trim());
  return isi.slice(1).map((r) => ({
    no: r.no,
    nilai: Object.fromEntries(judul.map((h, i) => [h, (r.sel[i] ?? '').trim()])),
  }));
}

export function dariCsv(teks) {
  return dariCsvBernomor(teks).map((r) => r.nilai);
}
