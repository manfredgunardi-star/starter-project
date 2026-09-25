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
export function dariCsv(teks) {
  // CRLF dinormalkan di awal, TERMASUK yang berada di dalam field berkutip. Excel
  // menulis CRLF untuk baris baru di dalam sel; \r yang lolos akan tersimpan
  // diam-diam ke Postgres, lalu merusak pencocokan nama dan muncul sebagai sampah di
  // ekspor. Sesudah normalisasi \r tidak mungkin ada lagi, jadi penjaga
  // c !== '\r' di cabang terakhir tidak diperlukan.
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

  const isi = semua.filter((r) => r.some((v) => v.trim() !== ''));
  if (isi.length < 2) return [];
  const judul = isi[0].map((h) => h.trim());
  return isi.slice(1).map((r) => Object.fromEntries(judul.map((h, i) => [h, (r[i] ?? '').trim()])));
}
