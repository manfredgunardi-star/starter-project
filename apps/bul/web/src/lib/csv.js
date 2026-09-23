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
