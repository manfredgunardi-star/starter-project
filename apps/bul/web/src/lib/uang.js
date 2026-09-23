// Semua hitungan uang di klien memakai sen (BigInt). Database tetap otoritatif.

export function keSen(v) {
  if (v === null || v === undefined || v === '') return 0n;
  if (typeof v === 'bigint') return v;
  const teks = typeof v === 'number' ? String(v) : String(v).trim();
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(teks);
  if (!m) throw new Error(`Angka tidak valid: ${v}`);
  const [, minus, bulat, pecahan = ''] = m;
  const pecah = pecahan.replace(/0+$/, '');
  if (pecah.length > 2) throw new Error(`Maksimal 2 desimal: ${v}`);
  const sen = BigInt(bulat) * 100n + BigInt(pecah.padEnd(2, '0') || '0');
  return minus ? -sen : sen;
}

export function dariSen(sen) {
  const minus = sen < 0n;
  const abs = minus ? -sen : sen;
  const teks = `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
  return minus ? `-${teks}` : teks;
}

function keRibuan(qty) {
  const m = /^(\d+)(?:\.(\d{0,3}))?$/.exec(String(qty ?? '0').trim());
  if (!m) throw new Error(`Qty tidak valid: ${qty}`);
  return BigInt(m[1]) * 1000n + BigInt((m[2] ?? '').padEnd(3, '0') || '0');
}

// round(qty × harga, 2) setengah ke atas; qty ≥ 0, harga ≥ 0.
export function kaliQtyHarga(qty, harga) {
  const hasil = keRibuan(qty) * keSen(harga); // satuan: sen × 1/1000
  return (hasil + 500n) / 1000n;
}

export function jumlahkan(list) {
  return list.reduce((s, v) => s + keSen(v), 0n);
}
