import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, resolveBulPaths } from './config.js';
import { parsePeriod, outputRunId } from './period.js';
import { exportFirebaseSnapshots } from './firebaseExporter.js';
import { loadManualDocuments, loadMappingSeed } from './manualDocuments.js';
import { buildJournalImportRows, buildRuleIndex, classifyTransactions } from './mapping.js';
import { reconcileDocumentSets } from './reconciler.js';
import { writeOutputs } from './reportBuilder.js';
import { sendReportEmail, syncGmailDecisions } from './gmailSync.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runAutomation({ periodLabel, dryRun = true, timestamp = new Date().toISOString() }) {
  const config = await loadConfig(projectRoot);
  const period = parsePeriod(periodLabel);
  const runId = outputRunId(timestamp);
  const paths = resolveBulPaths(config, period, runId);

  const manual = await loadManualDocuments({ paths, period });
  const mapping = await loadMappingSeed(paths.mappingWorkbook);
  const ruleIndex = buildRuleIndex(mapping.seedRows, mapping.confirmedRules);
  const classified = classifyTransactions(manual.cashTransactions, ruleIndex);
  const journalRows = buildJournalImportRows(classified.ready);
  const reconciliation = reconcileDocumentSets({
    suratJalan: manual.suratJalan,
    ritasi: manual.ritasi,
    invoices: manual.invoices,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd
  });
  const firebaseResult = await exportFirebaseSnapshots({
    config: config.firebaseQueries,
    period,
    outputDir: paths.outputDir,
    dryRun
  });
  const outputFiles = await writeOutputs({
    config,
    paths,
    period,
    runId,
    manual,
    reconciliation,
    classified,
    journalRows,
    firebaseResult,
    dryRun
  });
  const emailStatus = await sendReportEmail({
    to: config.recipientEmail,
    subject: `BUL Automation ${runId} - ${period.label}`,
    body: await readText(outputFiles.emailSummary),
    attachments: [outputFiles.weeklyReport, outputFiles.reviewRequired, outputFiles.readyJournal],
    dryRun
  });

  return {
    runId,
    period,
    dryRun,
    paths,
    counts: {
      cashTransactions: manual.cashTransactions.length,
      ready: classified.ready.length,
      review: classified.review.length,
      sjNotInRitasi: reconciliation.sjNotInRitasi.length,
      ritasiNotInSj: reconciliation.ritasiNotInSj.length,
      sjWithoutInvoice: reconciliation.sjWithoutInvoice.length,
      outOfPeriod: reconciliation.outOfPeriod.length
    },
    firebaseStatus: firebaseResult.status,
    emailStatus,
    outputFiles
  };
}

export async function runEmailSync({ runId, dryRun = false }) {
  return syncGmailDecisions({ runId, dryRun });
}

async function readText(file) {
  const fs = await import('node:fs/promises');
  return fs.readFile(file, 'utf8');
}
