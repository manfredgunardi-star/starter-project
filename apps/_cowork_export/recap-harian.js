#!/usr/bin/env node
/**
 * Rekap Operasional Harian BUL (Opsi 2).
 * Membaca hasil ekspor JSON terbaru lalu menghasilkan laporan HTML siap dibuka.
 *
 * Cara pakai:
 *   node recap-harian.js                 # export terbaru, tanggal = hari aktivitas terakhir
 *   node recap-harian.js --date=2026-02-18
 *   node recap-harian.js --out="C:\\path\\Rekap.html"
 *
 * Tidak butuh dependency tambahan (hanya Node bawaan).
 */
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v];
}));

const EXPORTS = path.join(__dirname, 'exports');
const rupiah = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const num = n => (n || 0).toLocaleString('id-ID');
const qty = n => Math.round(n || 0).toLocaleString('id-ID'); // m3 dibulatkan

function latestExport(prefix) {
  if (!fs.existsSync(EXPORTS)) throw new Error('Folder exports/ tidak ada. Jalankan ekspor dulu.');
  const dirs = fs.readdirSync(EXPORTS).filter(d => d.startsWith(prefix)).sort();
  if (!dirs.length) throw new Error('Tidak ada export untuk ' + prefix);
  return path.join(EXPORTS, dirs[dirs.length - 1]);
}
const readJSON = (dir, file) => {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
};

const monDir = latestExport('bul-monitor_');
const accDir = latestExport('bul-accounting_');

const sjAll = readJSON(monDir, 'bul_surat_jalan.json');
const invMonAll = readJSON(monDir, 'bul_invoices.json');
const accInv = readJSON(accDir, 'invoices.json');
const accCust = readJSON(accDir, 'customers.json');
const pelanggan = readJSON(monDir, 'bul_pelanggan.json');

const sjDate = x => x.tanggalSJ || x.tglTerkirim || (x.createdAt || '').slice(0, 10) || null;
const sjValid = sjAll.filter(x => !x.deletedAt);

const allDates = sjValid.map(sjDate).filter(Boolean).sort();
const refDate = args.date || allDates[allDates.length - 1];
const exportedAt = (() => { try { return JSON.parse(fs.readFileSync(path.join(monDir, '_summary.json'), 'utf8')).exportedAt; } catch { return null; } })();

const sjHari = sjValid.filter(x => sjDate(x) === refDate);
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const groupCount = (arr, f) => arr.reduce((m, x) => { const k = f(x) || '(kosong)'; m[k] = (m[k] || 0) + 1; return m; }, {});
const topN = (obj, n = 5) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

const hariQty = sum(sjHari, x => x.qtyIsi);
const hariUangJalan = sum(sjHari, x => x.uangJalan);
const hariStatus = groupCount(sjHari, x => x.status);
const perMaterial = groupCount(sjHari, x => x.material);
const perRute = groupCount(sjHari, x => x.rute);
const perSupir = groupCount(sjHari, x => x.namaSupir);

const trenMap = groupCount(sjValid, sjDate);
const tren = Object.entries(trenMap).filter(([d]) => d && d <= refDate).sort().slice(-14);
const trenMax = Math.max(1, ...tren.map(([, c]) => c));

const invMon = invMonAll.filter(x => !x.deletedAt);
const invMonNilai = sum(invMon, x => x.totalNilai);
const invMonQty = sum(invMon, x => x.totalQty);

const today = new Date(refDate + 'T00:00:00');
const piutang = accInv
  .filter(i => !['cancelled', 'paid', 'deleted'].includes(i.status))
  .map(i => {
    const out = (i.amount || 0) - (i.totalPaid || 0);
    const age = Math.max(0, Math.round((today - new Date(i.date)) / 86400000));
    return { ...i, outstanding: out, age };
  })
  .filter(i => i.outstanding > 0);
const totalPiutang = sum(piutang, x => x.outstanding);
const buckets = { '0-30 hari': 0, '31-60 hari': 0, '61-90 hari': 0, '> 90 hari': 0 };
piutang.forEach(i => {
  const b = i.age <= 30 ? '0-30 hari' : i.age <= 60 ? '31-60 hari' : i.age <= 90 ? '61-90 hari' : '> 90 hari';
  buckets[b] += i.outstanding;
});
const topPiutang = Object.entries(piutang.reduce((m, i) => { m[i.customerName || '(?)'] = (m[i.customerName || '(?)'] || 0) + i.outstanding; return m; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 5);

const dupPelanggan = (() => {
  const m = groupCount(pelanggan.filter(p => !p.deletedAt), p => (p.name || '').trim().toLowerCase());
  return Object.entries(m).filter(([, c]) => c > 1);
})();
const dupCust = (() => {
  const norm = s => (s || '').trim().toLowerCase().replace(/^pt\.?\s*/, '');
  const m = groupCount(accCust, c => norm(c.name));
  return Object.entries(m).filter(([, c]) => c > 1);
})();
const alerts = [];
if (dupPelanggan.length) alerts.push(dupPelanggan.length + ' nama pelanggan (bul-monitor) terindikasi ganda - mis. "' + dupPelanggan[0][0] + '" muncul ' + dupPelanggan[0][1] + 'x.');
if (dupCust.length) alerts.push(dupCust.length + ' nama customer (accounting) terindikasi ganda setelah normalisasi (mis. "PT. Tunas Maju" vs "Tunas Maju").');
const sjUndef = sjValid.filter(x => x.statusInvoice === undefined || x.statusInvoice === null).length;
if (sjUndef) alerts.push(num(sjUndef) + ' Surat Jalan tidak punya nilai statusInvoice (kosong) - sulit dilacak status penagihannya.');
const sjGagal = sjValid.filter(x => x.status === 'gagal').length;
if (sjGagal) alerts.push(num(sjGagal) + ' Surat Jalan berstatus "gagal" - perlu ditinjau penyebabnya.');
const invDeleted = invMonAll.filter(x => x.deletedAt).length;
if (invDeleted) alerts.push(num(invDeleted) + ' dari ' + num(invMonAll.length) + ' invoice (bul-monitor) berstatus terhapus (soft-deleted).');

const NAVY = '#16234A', TEAL = '#1FB6A6', AMBER = '#F5A623', CORAL = '#EF6F6C', PAPER = '#F4F6FB', INK = '#26324C', MUTE = '#6B7794';
const row = (cells) => '<tr>' + cells.map((c, i) => '<td style="padding:9px 12px;border-bottom:1px solid #EAEEF6;' + (i ? 'text-align:right;font-variant-numeric:tabular-nums;' : 'font-weight:600;color:' + NAVY) + '">' + c + '</td>').join('') + '</tr>';
const statChip = (label, val, sub, color) =>
  '<div style="flex:1;min-width:190px;background:#fff;border:1px solid #E4E9F3;border-left:5px solid ' + color + ';border-radius:10px;padding:16px 18px;box-shadow:0 2px 8px rgba(16,24,47,.05)">' +
  '<div style="font-size:12px;color:' + MUTE + ';font-weight:600;letter-spacing:.3px">' + label + '</div>' +
  '<div style="font-size:25px;font-weight:800;color:' + NAVY + ';margin-top:4px">' + val + '</div>' +
  '<div style="font-size:12px;color:' + MUTE + ';margin-top:2px">' + (sub || '') + '</div></div>';
const barRow = (label, val, max, color) =>
  '<div style="display:flex;align-items:center;gap:10px;margin:6px 0">' +
  '<div style="width:54px;font-size:12px;color:' + INK + ';text-align:right">' + label + '</div>' +
  '<div style="flex:1;background:#EEF1F8;border-radius:5px;height:18px;overflow:hidden">' +
  '<div style="width:' + Math.max(3, (val / max) * 100) + '%;height:100%;background:' + color + '"></div></div>' +
  '<div style="width:34px;font-size:12px;font-weight:700;color:' + NAVY + '">' + val + '</div></div>';
const section = (title, kicker, body) =>
  '<section style="margin:26px 0"><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:' + TEAL + '">' + kicker + '</div>' +
  '<h2 style="font-family:Georgia,serif;font-size:22px;color:' + NAVY + ';margin:2px 0 14px">' + title + '</h2>' + body + '</section>';
const card = (title, rows) =>
  '<div style="flex:1;min-width:240px;background:#fff;border:1px solid #E4E9F3;border-radius:10px;overflow:hidden">' +
  '<div style="background:' + NAVY + ';color:#fff;font-weight:700;font-size:13px;padding:9px 12px">' + title + '</div>' +
  '<table style="width:100%;border-collapse:collapse;font-size:13px">' + (rows.length ? rows.map(([k, v]) => row([k, num(v)])).join('') : row(['(tidak ada)', ''])) + '</table></div>';

const fmtDate = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };

const html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>Rekap Operasional Harian - BUL</title></head>' +
'<body style="margin:0;background:' + PAPER + ';font-family:Segoe UI,Calibri,Arial,sans-serif;color:' + INK + '">' +
'<div style="max-width:920px;margin:0 auto;padding:0 20px 60px">' +
'<header style="background:' + NAVY + ';color:#fff;border-radius:0 0 16px 16px;padding:30px 34px;margin-bottom:6px">' +
'<div style="font-size:12px;letter-spacing:3px;color:' + TEAL + ';font-weight:700">REKAP OPERASIONAL HARIAN &middot; PT. BANGUN USAHA LANCAR</div>' +
'<h1 style="font-family:Georgia,serif;font-size:30px;margin:8px 0 4px">' + fmtDate(refDate) + '</h1>' +
'<div style="font-size:13px;color:#AEBBD8">Sumber: ekspor bul-monitor &amp; bul-accounting' + (exportedAt ? ' &middot; diekspor ' + new Date(exportedAt).toLocaleString('id-ID') : '') + '</div></header>' +
section('Ringkasan Hari Ini', 'OPERASIONAL',
  '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
  statChip('Surat Jalan', num(sjHari.length), 'dokumen pada ' + refDate, TEAL) +
  statChip('Volume Terkirim', qty(hariQty) + ' m&sup3;', 'total qty isi', NAVY) +
  statChip('Uang Jalan', rupiah(hariUangJalan), 'total hari ini', AMBER) +
  statChip('Status SJ', Object.entries(hariStatus).map(([k, v]) => k + ':' + v).join(' &middot; ') || '-', 'rincian status', CORAL) +
  '</div>') +
section('Tren 14 Hari (jumlah Surat Jalan)', 'VOLUME',
  '<div style="background:#fff;border:1px solid #E4E9F3;border-radius:10px;padding:16px 18px">' +
  (tren.map(([d, c]) => barRow(d.slice(5), c, trenMax, d === refDate ? TEAL : '#9FB0CF')).join('') || '<i>Tidak ada data.</i>') + '</div>') +
section('Per Material, Rute & Supir (hari ini)', 'RINCIAN',
  '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
  card('Material', topN(perMaterial)) + card('Rute teratas', topN(perRute)) + card('Supir teratas', topN(perSupir)) + '</div>') +
section('Invoice (bul-monitor)', 'PENAGIHAN',
  '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
  statChip('Invoice Aktif', num(invMon.length), 'dari ' + num(invMonAll.length) + ' total (sisanya terhapus)', TEAL) +
  statChip('Nilai Invoice', rupiah(invMonNilai), 'akumulasi invoice aktif', NAVY) +
  statChip('Qty Terinvoice', qty(invMonQty) + ' m&sup3;', 'total qty pada invoice', AMBER) + '</div>') +
section('Piutang & Aging (bul-accounting)', 'KEUANGAN',
  '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
  statChip('Total Piutang', rupiah(totalPiutang), piutang.length + ' invoice belum lunas', CORAL) +
  Object.entries(buckets).map(([b, v]) => statChip(b, rupiah(v), '', b.indexOf('> 90') >= 0 ? CORAL : b.indexOf('61') >= 0 ? AMBER : TEAL)).slice(0, 3).join('') +
  '</div>' +
  '<div style="background:#fff;border:1px solid #E4E9F3;border-radius:10px;overflow:hidden">' +
  '<div style="background:' + NAVY + ';color:#fff;font-weight:700;font-size:13px;padding:9px 12px">Piutang per Pelanggan (Top 5)</div>' +
  '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
  (topPiutang.length ? topPiutang.map(([k, v]) => row([k, rupiah(v)])).join('') : row(['(tidak ada)', ''])) + '</table></div>') +
section('Peringatan Kualitas Data', 'PERLU DITINJAU',
  '<div style="background:#FFF6F0;border:1px solid ' + AMBER + ';border-radius:10px;padding:8px 6px">' +
  (alerts.length ? '<ul style="margin:8px 16px;padding:0;line-height:1.7">' + alerts.map(a => '<li>' + a + '</li>').join('') + '</ul>' : '<p style="margin:12px 16px">Tidak ada anomali mencolok.</p>') +
  '<div style="font-size:12px;color:' + MUTE + ';margin:4px 18px 10px">Temuan ini adalah bahan untuk Opsi 1 (Audit Rekonsiliasi) &amp; Opsi 3 (Kualitas Data).</div></div>') +
'<footer style="text-align:center;color:' + MUTE + ';font-size:12px;margin-top:30px;border-top:1px solid #E4E9F3;padding-top:16px">' +
'Dihasilkan otomatis oleh Cowork &middot; recap-harian.js &middot; ' + new Date().toLocaleString('id-ID') + '</footer>' +
'</div></body></html>';

const outPath = args.out || path.join(EXPORTS, 'Rekap_Harian_BUL_' + refDate + '.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Rekap dibuat untuk tanggal', refDate);
console.log('SJ:', sjHari.length, '| Qty:', Math.round(hariQty), 'm3 | Uang jalan:', rupiah(hariUangJalan));
console.log('Piutang total:', rupiah(totalPiutang), '| File:', outPath);
