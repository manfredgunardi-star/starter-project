import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  COLUMNS, jakartaToday, mingguLalu, validateParams, filterRows, sortRows,
  buildWorkbook, fileName, runRekap,
} from '../src/rekap.js';

const TODAY = '2026-10-22';

test('jakartaToday memakai zona Asia/Jakarta, bukan UTC', () => {
  // 2026-10-21 18:30 UTC = 2026-10-22 01:30 WIB
  assert.equal(jakartaToday(new Date('2026-10-21T18:30:00Z')), '2026-10-22');
  assert.equal(jakartaToday(new Date('2026-10-21T16:59:00Z')), '2026-10-21');
});

test('mingguLalu = Senin–Minggu minggu sebelumnya', () => {
  assert.deepEqual(mingguLalu('2026-10-26'), { tgl_awal: '2026-10-19', tgl_akhir: '2026-10-25' }); // Senin
  assert.deepEqual(mingguLalu('2026-10-25'), { tgl_awal: '2026-10-12', tgl_akhir: '2026-10-18' }); // Minggu
  assert.deepEqual(mingguLalu('2026-10-22'), { tgl_awal: '2026-10-12', tgl_akhir: '2026-10-18' }); // Kamis
});

test('validateParams menerima input valid dan merapikan filter', () => {
  assert.deepEqual(
    validateParams({ tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15', rute: '  Jakarta - Bogor ', pt: '' }, TODAY),
    { tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15', rute: 'Jakarta - Bogor', pt: null },
  );
});

test('validateParams menolak input tidak valid', () => {
  const bad = [
    [{ tgl_awal: '01/10/2026', tgl_akhir: '2026-10-15' }, /format/i],
    [{ tgl_awal: '2026-02-30', tgl_akhir: '2026-03-01' }, /tidak valid/i],
    [{ tgl_akhir: '2026-10-15' }, /wajib/i],
    [{ tgl_awal: '2026-10-15', tgl_akhir: '2026-10-01' }, /tgl_awal/i],
    [{ tgl_awal: '2026-10-01', tgl_akhir: '2026-10-23' }, /masa depan/i],
    [{ tgl_awal: '2025-10-20', tgl_akhir: '2026-10-21' }, /367 hari/], // 367 hari inklusif
  ];
  for (const [input, re] of bad) assert.throws(() => validateParams(input, TODAY), re, JSON.stringify(input));
  // tepat 366 hari inklusif masih boleh
  assert.doesNotThrow(() => validateParams({ tgl_awal: '2025-10-22', tgl_akhir: '2026-10-22' }, TODAY));
});

test('filterRows meniru app: buang deletedAt & isActive=false, filter rute/pt case-insensitive', () => {
  const docs = [
    { id: 'a', rute: 'Jakarta - Bogor', pt: 'PT A' },
    { id: 'b', rute: 'jakarta - bogor ', pt: 'pt a', isActive: true },
    { id: 'c', rute: 'Jakarta - Bogor', pt: 'PT A', isActive: false }, // gagal / soft delete
    { id: 'd', rute: 'Jakarta - Bogor', pt: 'PT A', deletedAt: '2026-10-02T00:00:00Z' },
    { id: 'e', rute: 'Bekasi', pt: 'PT A' },
    { id: 'f', rute: 'Jakarta - Bogor', pt: 'PT B' },
  ];
  assert.deepEqual(filterRows(docs, {}).map((r) => r.id), ['a', 'b', 'e', 'f']);
  assert.deepEqual(filterRows(docs, { rute: 'JAKARTA - BOGOR', pt: 'PT A' }).map((r) => r.id), ['a', 'b']);
});

test('sortRows: tanggalSJ naik lalu nomorSJ', () => {
  const rows = [
    { tanggalSJ: '2026-10-02', nomorSJ: 'B' },
    { tanggalSJ: '2026-10-01', nomorSJ: 'Z' },
    { tanggalSJ: '2026-10-02', nomorSJ: 'A' },
  ];
  assert.deepEqual(sortRows(rows).map((r) => r.tanggalSJ + r.nomorSJ), ['2026-10-01Z', '2026-10-02A', '2026-10-02B']);
});

test('fileName mengikuti handoff', () => {
  assert.equal(fileName({ tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15' }), 'Rekap_SJ_2026-10-01_sd_2026-10-15.xlsx');
});

const SAMPLE = [
  {
    nomorSJ: 'SJ/001', tanggalSJ: '2026-10-01', tglTerkirim: '2026-10-02', pt: 'PT A', namaSupir: 'Budi',
    nomorPolisi: 'B 1 AB', rute: 'Jakarta - Bogor', material: 'Pasir', qtyIsi: 10.5, qtyBongkar: 10,
    satuan: 'Ton', uangJalan: 150000, status: 'terkirim', statusInvoice: 'terinvoice',
    createdBy: 'Admin', createdAt: '2026-10-01T03:00:00.000Z', updatedBy: 'Admin', updatedAt: '2026-10-02T04:00:00.000Z',
  },
  {
    nomorSJ: 'SJ/002', tanggalSJ: '2026-10-03', tglTerkirim: null, pt: 'PT A', supir: 'Andi (legacy)',
    nomorPolisi: 'B 2 AB', rute: 'Bekasi', material: 'Batu', qtyIsi: 8, qtyBongkar: null,
    satuan: 'Ton', uangJalan: 100000, status: 'pending', createdBy: 'Import', createdAt: '2026-10-03T01:00:00.000Z',
  },
];

test('buildWorkbook: 19 kolom app, header tebal, freeze, tanggal & total', async () => {
  const buf = await buildWorkbook(SAMPLE, { tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Rekap Surat Jalan');
  assert.ok(ws, 'sheet Rekap Surat Jalan ada');

  const header = ws.getRow(1).values.slice(1);
  assert.deepEqual(header, COLUMNS.map((c) => c.header));
  assert.equal(header.length, 19);
  assert.equal(ws.getRow(1).font?.bold, true);
  assert.equal(ws.views[0].state, 'frozen');
  assert.equal(ws.views[0].ySplit, 1);

  const r2 = ws.getRow(2);
  assert.equal(r2.getCell(1).value, 1);
  assert.equal(r2.getCell(2).value, 'SJ/001');
  assert.ok(r2.getCell(3).value instanceof Date);
  assert.equal(r2.getCell(3).value.toISOString().slice(0, 10), '2026-10-01');
  assert.equal(r2.getCell(3).numFmt, 'dd/mm/yyyy');
  assert.equal(r2.getCell(13).value, 150000);

  const r3 = ws.getRow(3);
  assert.equal(r3.getCell(4).value, null);          // belum terkirim
  assert.equal(r3.getCell(6).value, 'Andi (legacy)'); // fallback field supir
  assert.equal(r3.getCell(11).value, 0);            // qtyBongkar null -> 0 seperti app
  assert.equal(r3.getCell(15).value, 'belum');      // statusInvoice default

  const total = ws.getRow(4);
  assert.equal(total.getCell(2).value, 'TOTAL');
  assert.equal(total.getCell(10).value.result, 18.5);
  assert.equal(total.getCell(11).value.result, 10);
  assert.equal(total.getCell(13).value.result, 250000);
  assert.match(total.getCell(13).value.formula, /^SUM\(M2:M3\)$/);
  assert.equal(total.font?.bold, true);
});

test('buildWorkbook tetap valid tanpa data', async () => {
  const buf = await buildWorkbook([], { tgl_awal: '2026-10-01', tgl_akhir: '2026-10-01' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const total = wb.getWorksheet('Rekap Surat Jalan').getRow(2);
  assert.equal(total.getCell(2).value, 'TOTAL');
  assert.equal(total.getCell(13).value, 0);
});

test('runRekap: kirim file, tulis audit, kembalikan ringkasan saja', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sjtools-'));
  const auditFile = join(dir, 'logs', 'audit.log');
  const sent = [];
  const fetched = [];
  const summary = await runRekap(
    { tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15', pt: 'pt a' },
    {
      today: TODAY,
      source: 'test',
      auditFile,
      fetchRows: async (a, b) => { fetched.push([a, b]); return [...SAMPLE, { ...SAMPLE[0], pt: 'PT Lain' }]; },
      send: async (buffer, name, caption) => { sent.push({ size: buffer.length, name, caption }); },
    },
  );

  assert.deepEqual(fetched, [['2026-10-01', '2026-10-15']]);
  assert.deepEqual(summary, {
    periode: '2026-10-01 s/d 2026-10-15',
    filter: { rute: null, pt: 'pt a' },
    jumlah_sj: 2,
    total_uang_jalan: 250000,
    nama_file: 'Rekap_SJ_2026-10-01_sd_2026-10-15.xlsx',
    terkirim: true,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'Rekap_SJ_2026-10-01_sd_2026-10-15.xlsx');
  assert.ok(sent[0].size > 0);

  const text = JSON.stringify(summary);
  for (const secretish of ['Budi', 'SJ/001', 'B 1 AB', 'Pasir']) assert.ok(!text.includes(secretish), `ringkasan bocor: ${secretish}`);

  const log = readFileSync(auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.length, 1);
  assert.equal(log[0].status, 'sukses');
  assert.equal(log[0].jumlah_baris, 2);
  assert.equal(log[0].source, 'test');
  assert.ok(!JSON.stringify(log).includes('Budi'));
});

test('runRekap: gagal validasi tidak query, tapi tetap diaudit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sjtools-'));
  const auditFile = join(dir, 'audit.log');
  let called = false;
  await assert.rejects(
    runRekap({ tgl_awal: '2026-10-15', tgl_akhir: '2026-10-01' }, {
      today: TODAY, source: 'test', auditFile,
      fetchRows: async () => { called = true; return []; },
      send: async () => { called = true; },
    }),
    /tgl_awal/,
  );
  assert.equal(called, false);
  const [entry] = readFileSync(auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(entry.status, 'gagal');
  assert.match(entry.error, /tgl_awal/);
});
