// Rekap pengiriman: validasi parameter, filter, bangun xlsx, orkestrasi kirim + audit.
// Semua fungsi di sini murni/injeksi dependensi supaya bisa dites tanpa Firebase/Telegram.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import ExcelJS from 'exceljs';

const MAX_DAYS = 366;
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tanggal di sj-monitor disimpan sebagai string; ambil bagian YYYY-MM-DD seperti
// normDate di apps/sj-monitor/src/utils/excel.js (createdAt/updatedAt = tanggal UTC).
const normDate = (v) => {
  if (!v) return '';
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  try { return new Date(v).toISOString().slice(0, 10); } catch { return ''; }
};
const dateCell = (v) => { const d = normDate(v); return d ? new Date(`${d}T00:00:00Z`) : null; };

const QTY_FMT = '#,##0.00';
const RP_FMT = '#,##0';
const DATE_FMT = 'dd/mm/yyyy';

// Urutan & lebar kolom meniru downloadSJRecapToExcel (apps/sj-monitor/src/utils/excel.js:29-57).
export const COLUMNS = [
  { header: 'No', width: 6, value: (_, i) => i + 1 },
  { header: 'Nomor SJ', width: 18, value: (sj) => sj.nomorSJ || '' },
  { header: 'Tanggal SJ', width: 14, value: (sj) => dateCell(sj.tanggalSJ), numFmt: DATE_FMT },
  { header: 'Tanggal Terkirim', width: 16, value: (sj) => dateCell(sj.tglTerkirim), numFmt: DATE_FMT },
  { header: 'PT', width: 10, value: (sj) => sj.pt || '' },
  { header: 'Supir', width: 24, value: (sj) => sj.namaSupir || sj.supir || '' },
  { header: 'Nomor Polisi', width: 16, value: (sj) => sj.nomorPolisi || '' },
  { header: 'Rute', width: 24, value: (sj) => sj.rute || '' },
  { header: 'Material', width: 16, value: (sj) => sj.material || '' },
  { header: 'Qty Isi', width: 10, value: (sj) => Number(sj.qtyIsi || 0), numFmt: QTY_FMT, total: true },
  { header: 'Qty Bongkar', width: 12, value: (sj) => Number(sj.qtyBongkar || 0), numFmt: QTY_FMT, total: true },
  { header: 'Satuan', width: 10, value: (sj) => sj.satuan || '' },
  { header: 'Uang Jalan', width: 14, value: (sj) => Number(sj.uangJalan || 0), numFmt: RP_FMT, total: true },
  { header: 'Status', width: 12, value: (sj) => sj.status || '' },
  { header: 'Status Invoice', width: 14, value: (sj) => sj.statusInvoice || 'belum' },
  { header: 'Dibuat Oleh', width: 16, value: (sj) => sj.createdBy || '' },
  { header: 'Dibuat Tanggal', width: 14, value: (sj) => dateCell(sj.createdAt), numFmt: DATE_FMT },
  { header: 'Diupdate Oleh', width: 16, value: (sj) => sj.updatedBy || '' },
  { header: 'Diupdate Tanggal', width: 14, value: (sj) => dateCell(sj.updatedAt), numFmt: DATE_FMT },
];

export const jakartaToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);

const toUtc = (d) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const mingguLalu = (today) => {
  const t = toUtc(today);
  const senin = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  return { tgl_awal: fromUtc(senin - 7 * DAY_MS), tgl_akhir: fromUtc(senin - DAY_MS) };
};

const checkDate = (name, v) => {
  if (!v) throw new Error(`${name} wajib diisi (YYYY-MM-DD)`);
  if (typeof v !== 'string' || !ISO_DATE.test(v)) throw new Error(`${name} harus berformat YYYY-MM-DD`);
  if (Number.isNaN(toUtc(v)) || fromUtc(toUtc(v)) !== v) throw new Error(`${name} tanggal tidak valid: ${v}`);
};
const cleanFilter = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export const validateParams = ({ tgl_awal, tgl_akhir, rute, pt } = {}, today) => {
  checkDate('tgl_awal', tgl_awal);
  checkDate('tgl_akhir', tgl_akhir);
  if (tgl_awal > tgl_akhir) throw new Error('tgl_awal tidak boleh setelah tgl_akhir');
  if (tgl_akhir > today) throw new Error(`tgl_akhir ${tgl_akhir} ada di masa depan (hari ini ${today} WIB)`);
  const days = (toUtc(tgl_akhir) - toUtc(tgl_awal)) / DAY_MS + 1;
  if (days > MAX_DAYS) throw new Error(`Rentang ${days} hari melebihi batas ${MAX_DAYS} hari`);
  return { tgl_awal, tgl_akhir, rute: cleanFilter(rute), pt: cleanFilter(pt) };
};

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Sama dengan daftar SJ di app: soft delete & status gagal (isActive=false) tidak ikut.
export const filterRows = (docs, { rute, pt } = {}) =>
  docs.filter((sj) =>
    !sj.deletedAt && sj.isActive !== false
    && (!rute || norm(sj.rute) === norm(rute))
    && (!pt || norm(sj.pt) === norm(pt)));

export const sortRows = (rows) =>
  [...rows].sort((a, b) =>
    String(a.tanggalSJ).localeCompare(String(b.tanggalSJ)) || String(a.nomorSJ).localeCompare(String(b.nomorSJ)));

export const fileName = ({ tgl_awal, tgl_akhir }) => `Rekap_SJ_${tgl_awal}_sd_${tgl_akhir}.xlsx`;

const colLetter = (n) => String.fromCharCode(64 + n); // cukup untuk 19 kolom (A..S)

export const buildWorkbook = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rekap Surat Jalan', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map(({ header, width, numFmt }) => ({ header, width, style: numFmt ? { numFmt } : {} }));
  ws.getRow(1).font = { bold: true };

  rows.forEach((sj, i) => ws.addRow(COLUMNS.map((c) => c.value(sj, i))));

  const last = rows.length + 1;
  const totalRow = ws.addRow(COLUMNS.map((c, idx) => {
    if (idx === 1) return 'TOTAL';
    if (!c.total) return null;
    const result = rows.reduce((s, sj, i) => s + c.value(sj, i), 0);
    if (!rows.length) return 0;
    const col = colLetter(idx + 1);
    return { formula: `SUM(${col}2:${col}${last})`, result };
  }));
  totalRow.font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
};

const writeAudit = (file, entry) => {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ waktu: new Date().toISOString(), ...entry })}\n`);
};

/**
 * deps: { today, source, auditFile, fetchRows(tgl_awal, tgl_akhir), send(buffer, fileName, caption) }
 * Mengembalikan HANYA ringkasan — tidak ada baris data (prinsip 3 handoff).
 */
export const runRekap = async (input, deps) => {
  const audit = { source: deps.source, params: { tgl_awal: input?.tgl_awal, tgl_akhir: input?.tgl_akhir, rute: input?.rute ?? null, pt: input?.pt ?? null } };
  try {
    const p = validateParams(input, deps.today);
    const rows = sortRows(filterRows(await deps.fetchRows(p.tgl_awal, p.tgl_akhir), p));
    const name = fileName(p);
    const periode = `${p.tgl_awal} s/d ${p.tgl_akhir}`;
    await deps.send(await buildWorkbook(rows), name, `Rekap Surat Jalan ${periode} — ${rows.length} SJ`);

    const summary = {
      periode,
      filter: { rute: p.rute, pt: p.pt },
      jumlah_sj: rows.length,
      total_uang_jalan: rows.reduce((s, sj) => s + Number(sj.uangJalan || 0), 0),
      nama_file: name,
      terkirim: true,
    };
    writeAudit(deps.auditFile, { ...audit, status: 'sukses', jumlah_baris: rows.length });
    return summary;
  } catch (err) {
    writeAudit(deps.auditFile, { ...audit, status: 'gagal', error: err.message });
    throw err;
  }
};
