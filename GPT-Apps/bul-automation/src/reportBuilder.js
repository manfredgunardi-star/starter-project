import fs from 'node:fs/promises';
import path from 'node:path';

import { toDelimited } from './csv.js';

export async function writeOutputs({ config, paths, period, runId, manual, reconciliation, classified, journalRows, firebaseResult, dryRun }) {
  await fs.mkdir(paths.outputDir, { recursive: true });

  const { default: XLSX } = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  appendJsonSheet(XLSX, workbook, 'Summary', buildSummaryRows({ period, runId, manual, reconciliation, classified, firebaseResult, dryRun }));
  appendJsonSheet(XLSX, workbook, 'Sources', manual.sourceStatus);
  appendJsonSheet(XLSX, workbook, 'SJ Missing Ritasi', reconciliation.sjNotInRitasi);
  appendJsonSheet(XLSX, workbook, 'Ritasi Missing SJ', reconciliation.ritasiNotInSj);
  appendJsonSheet(XLSX, workbook, 'SJ Missing Invoice', reconciliation.sjWithoutInvoice);
  appendJsonSheet(XLSX, workbook, 'Out Of Period', reconciliation.outOfPeriod);
  appendJsonSheet(XLSX, workbook, 'Review Required', classified.review);
  appendJsonSheet(XLSX, workbook, 'Ready Journal', journalRows.map(importRowToObject));
  appendJsonSheet(XLSX, workbook, 'Firebase', firebaseResult.sheets || [{ status: firebaseResult.status }]);

  const weeklyReport = path.join(paths.outputDir, 'weekly_report.xlsx');
  const readyJournal = path.join(paths.outputDir, 'ready_journal_import.csv');
  const readySuratJalan = path.join(paths.outputDir, 'ready_surat_jalan_import.csv');
  const reviewRequired = path.join(paths.outputDir, 'review_required.xlsx');
  const emailSummary = path.join(paths.outputDir, 'email_summary.txt');

  XLSX.writeFile(workbook, weeklyReport);
  await fs.writeFile(readyJournal, toDelimited([config.journalImportHeader, ...journalRows]), 'utf8');
  await fs.writeFile(readySuratJalan, toDelimited([config.suratJalanImportHeader]), 'utf8');
  await writeReviewWorkbook(XLSX, reviewRequired, classified.review, reconciliation);
  await fs.writeFile(emailSummary, buildEmailSummary({ period, runId, reconciliation, classified, firebaseResult, paths }), 'utf8');

  return { weeklyReport, readyJournal, readySuratJalan, reviewRequired, emailSummary };
}

function appendJsonSheet(XLSX, workbook, name, rows) {
  const data = Array.isArray(rows) && rows.length ? rows : [{ status: 'empty' }];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), safeSheetName(name));
}

function buildSummaryRows({ period, runId, manual, reconciliation, classified, firebaseResult, dryRun }) {
  return [
    { metric: 'runId', value: runId },
    { metric: 'period', value: period.label },
    { metric: 'mode', value: dryRun ? 'dry-run' : 'run' },
    { metric: 'cash_transactions', value: manual.cashTransactions.length },
    { metric: 'surat_jalan_unique', value: reconciliation.counts.suratJalan },
    { metric: 'ritasi_unique', value: reconciliation.counts.ritasi },
    { metric: 'sj_not_in_ritasi', value: reconciliation.sjNotInRitasi.length },
    { metric: 'ritasi_not_in_sj', value: reconciliation.ritasiNotInSj.length },
    { metric: 'sj_without_invoice', value: reconciliation.sjWithoutInvoice.length },
    { metric: 'out_of_period', value: reconciliation.outOfPeriod.length },
    { metric: 'ready_journals', value: classified.ready.length },
    { metric: 'review_required', value: classified.review.length },
    { metric: 'firebase_status', value: firebaseResult.status }
  ];
}

function importRowToObject(row) {
  return {
    'No.Jurnal': row[0],
    Tanggal: row[1],
    'Deskripsi Jurnal': row[2],
    'Kode Akun': row[3],
    Debit: row[4],
    Kredit: row[5],
    'Keterangan Baris': row[6]
  };
}

async function writeReviewWorkbook(XLSX, file, reviewRows, reconciliation) {
  const workbook = XLSX.utils.book_new();
  appendJsonSheet(XLSX, workbook, 'Mapping Review', reviewRows);
  appendJsonSheet(XLSX, workbook, 'Anomaly Review', [
    ...reconciliation.outOfPeriod.map((row) => ({ ...row, reason: 'out_of_period' })),
    ...reconciliation.sjWithoutInvoice.map((row) => ({ ...row, reason: 'sj_without_invoice' }))
  ]);
  XLSX.writeFile(workbook, file);
}

function buildEmailSummary({ period, runId, reconciliation, classified, firebaseResult, paths }) {
  return [
    `Laporan Automasi BUL ${period.label}`,
    `Run ID: ${runId}`,
    '',
    `Ready journal: ${classified.ready.length}`,
    `Perlu review mapping: ${classified.review.length}`,
    `SJ tidak ada di ritasi: ${reconciliation.sjNotInRitasi.length}`,
    `Ritasi tidak ada di SJ: ${reconciliation.ritasiNotInSj.length}`,
    `SJ tanpa kwitansi/invoice: ${reconciliation.sjWithoutInvoice.length}`,
    `Tanggal di luar periode: ${reconciliation.outOfPeriod.length}`,
    `Firebase export: ${firebaseResult.status}`,
    '',
    'Format balasan:',
    'MAP M-202606-001 5110/1111',
    'KEEP A-202606-005',
    'SKIP A-202606-006',
    '',
    `Output folder: ${paths.outputDir}`
  ].join('\r\n');
}

function safeSheetName(name) {
  return String(name || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
}
