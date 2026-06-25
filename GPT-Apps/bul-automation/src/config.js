import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

export async function loadConfig(projectRoot) {
  const defaultPath = path.join(projectRoot, 'config', 'default.json');
  const queryPath = path.join(projectRoot, 'config', 'firebase-queries.json');
  const defaults = JSON.parse(await fs.readFile(defaultPath, 'utf8'));
  const firebaseQueries = JSON.parse(await fs.readFile(queryPath, 'utf8'));

  return {
    ...defaults,
    driveRoot: process.env.BUL_DRIVE_ROOT || defaults.driveRoot,
    recipientEmail: process.env.BUL_RECIPIENT_EMAIL || defaults.recipientEmail,
    firebaseQueries
  };
}

export function resolveBulPaths(config, period, runId) {
  const root = config.driveRoot;
  const transactionRoot = path.join(root, config.folderNames.transactions);
  const periodFolder = path.join(transactionRoot, period.label);
  const previousPeriodFolder = path.join(transactionRoot, period.previousLabel);
  const outputDir = path.join(periodFolder, config.folderNames.automationOutput, runId);

  return {
    root,
    transactionRoot,
    periodFolder,
    previousPeriodFolder,
    outputDir,
    coaWorkbook: path.join(root, config.workbooks.coa),
    mappingWorkbook: path.join(root, config.workbooks.mapping)
  };
}
