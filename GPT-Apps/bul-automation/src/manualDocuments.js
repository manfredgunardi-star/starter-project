import fs from 'node:fs/promises';
import path from 'node:path';

import { normalizeSjNumber } from './reconciler.js';

export async function loadManualDocuments({ paths, period }) {
  const periodFiles = await listFilesSafe(paths.periodFolder);
  const sourceStatus = [];

  const cashWorkbook = findFirst(periodFiles, /LAPORAN UANG KAS.*\.xlsx$/i);
  const sjZip = findFirst(periodFiles, /Rekapan Surat Jalan.*\.zip$/i);
  const ritasiZip = findFirst(periodFiles, /Rekapan Perhitungan Ritasi.*\.zip$/i);
  const kwitansiZip = findFirst(periodFiles, /Rekapan Kwitansi.*\.zip$/i);

  const cashTransactions = cashWorkbook ? await parseCashWorkbook(cashWorkbook, period) : [];
  const suratJalan = sjZip ? await parseRecapZip(sjZip, period, 'surat_jalan') : [];
  const ritasi = ritasiZip ? await parseRecapZip(ritasiZip, period, 'ritasi') : [];
  const externalInvoices = kwitansiZip ? await parseKwitansiZip(kwitansiZip) : [];
  const workbookInvoices = buildInvoicesFromSuratJalanWorkbooks(suratJalan);
  const invoices = [...externalInvoices, ...workbookInvoices];

  for (const [name, file] of Object.entries({ cashWorkbook, sjZip, ritasiZip, kwitansiZip })) {
    sourceStatus.push({ source: name, status: file ? 'found' : 'missing', file: file || '' });
  }

  return { cashTransactions, suratJalan, ritasi, invoices, sourceStatus };
}

export async function loadMappingSeed(mappingWorkbook) {
  if (!(await exists(mappingWorkbook))) return { seedRows: [], confirmedRules: [] };
  const { default: XLSX } = await import('xlsx');
  const workbook = XLSX.readFile(mappingWorkbook, { cellDates: true });
  const seedRows = [];
  const confirmedRules = [];

  if (workbook.Sheets['Rekap All']) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Rekap All'], { header: 1, raw: true, defval: '' });
    for (const row of rows.slice(1)) {
      if (!row[1] || !row[5] || !row[6]) continue;
      seedRows.push({
        tanggal: normalizeDate(row[0]),
        keterangan: String(row[1]).trim(),
        nominal: numberish(row[4]) || numberish(row[2]) || numberish(row[3]) || 0,
        akunDebit: String(row[5]).trim(),
        akunKredit: String(row[6]).trim(),
        truck: String(row[7] || '').trim(),
        supir: String(row[8] || '').trim()
      });
    }
  }

  if (workbook.Sheets.AUTO_RULES) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.AUTO_RULES, { raw: true, defval: '' });
    for (const row of rows) {
      confirmedRules.push({
        keterangan: row.Keterangan || row.Pattern || row.Description || '',
        akunDebit: row['Akun Debit'] || row.Debit || '',
        akunKredit: row['Akun Kredit'] || row.Credit || ''
      });
    }
  }

  return { seedRows, confirmedRules };
}

async function parseCashWorkbook(file, period) {
  const { default: XLSX } = await import('xlsx');
  const workbook = XLSX.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets.Oprasional || workbook.Sheets.Operasional || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  const headerIndex = rows.findIndex((row) => row.some((cell) => /TANGGAL/i.test(String(cell))) && row.some((cell) => /KREDIT/i.test(String(cell))));
  if (headerIndex < 0) return [];

  const transactions = [];
  let seq = 1;
  for (const row of rows.slice(headerIndex + 1)) {
    const tanggal = normalizeDate(row[1]);
    const debit = numberish(row[2]);
    const credit = numberish(row[3]);
    const keterangan = String(row[4] || '').trim();
    if (!tanggal && !debit && !credit && !keterangan) continue;
    const nominal = credit || debit || 0;
    if (!nominal || !keterangan) continue;
    transactions.push({
      id: `M-${period.label.replace('.', '')}-${String(seq).padStart(3, '0')}`,
      ref: `AUTO-${period.label.replace('.', '')}-${String(seq).padStart(4, '0')}`,
      tanggal,
      keterangan,
      nominal,
      direction: credit ? 'cash_out' : 'cash_in',
      sourceFile: path.basename(file)
    });
    seq += 1;
  }
  return transactions;
}

async function parseRecapZip(file, period, kind) {
  const { default: AdmZip } = await import('adm-zip');
  const { default: XLSX } = await import('xlsx');
  const zip = new AdmZip(file);
  const rows = [];

  for (const entry of zip.getEntries().filter((candidate) => !candidate.isDirectory && /\.xlsx$/i.test(candidate.entryName))) {
    const workbook = XLSX.read(entry.getData(), { type: 'buffer', cellDates: true });
    const hasKwitansiSheet = workbook.SheetNames.some((name) => /KWITANSI/i.test(name));
    for (const sheetName of workbook.SheetNames) {
      if (/KWITANSI/i.test(sheetName)) continue;
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
      const headerIndex = sheetRows.findIndex((row) => row.some((cell) => /NO\s*SJ/i.test(String(cell))));
      if (headerIndex < 0) continue;
      for (const row of sheetRows.slice(headerIndex + 1)) {
        const nomorSJ = normalizeSjNumber(row[2]);
        if (!/^\d{4,6}$/.test(nomorSJ)) continue;
        rows.push({
          nomorSJ,
          tanggal: normalizeDate(row[1]),
          nomorPolisi: String(row[3] || '').trim().toUpperCase(),
          tujuan: String(row[4] || '').trim().toUpperCase(),
          keterangan: String(row[5] || '').trim(),
          amount: numberish(kind === 'ritasi' ? row[7] || row[6] : row[9]),
          sourceFile: entry.entryName,
          sourceSheet: sheetName,
          sourceHasKwitansi: hasKwitansiSheet
        });
      }
    }
  }

  return rows;
}

function buildInvoicesFromSuratJalanWorkbooks(suratJalan) {
  const byFile = new Map();
  for (const row of suratJalan) {
    if (!row.sourceHasKwitansi) continue;
    if (!byFile.has(row.sourceFile)) {
      byFile.set(row.sourceFile, {
        noInvoice: `KWITANSI:${row.sourceFile}`,
        sourceFile: row.sourceFile,
        suratJalanNos: []
      });
    }
    byFile.get(row.sourceFile).suratJalanNos.push(row.nomorSJ);
  }
  return [...byFile.values()];
}

async function parseKwitansiZip(file) {
  const { default: AdmZip } = await import('adm-zip');
  const zip = new AdmZip(file);
  return zip.getEntries()
    .filter((entry) => !entry.isDirectory && /\.xlsx$/i.test(entry.entryName))
    .map((entry) => ({
      noInvoice: path.basename(entry.entryName, path.extname(entry.entryName)),
      sourceFile: entry.entryName,
      suratJalanNos: extractSjNumbers(entry.entryName)
    }));
}

function extractSjNumbers(value) {
  return [...String(value || '').matchAll(/\b\d{4,6}\b/g)].map((match) => normalizeSjNumber(match[0]));
}

async function listFilesSafe(folder) {
  try {
    const entries = await fs.readdir(folder);
    return entries.map((name) => path.join(folder, name));
  } catch {
    return [];
  }
}

function findFirst(files, pattern) {
  return files.find((file) => pattern.test(path.basename(file)));
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const shortSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(text);
  if (shortSlash) return `20${shortSlash[3]}-${shortSlash[1].padStart(2, '0')}-${shortSlash[2].padStart(2, '0')}`;
  return text;
}

function numberish(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}
