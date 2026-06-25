#!/usr/bin/env node
import { runAutomation, runEmailSync } from './runner.js';

const args = process.argv.slice(2);
const command = args[0];
const options = parseArgs(args.slice(1));

try {
  if (command === 'dry-run') {
    const result = await runAutomation({ periodLabel: requireOption(options, 'period'), dryRun: true });
    printResult(result);
  } else if (command === 'run') {
    const result = await runAutomation({ periodLabel: requireOption(options, 'period'), dryRun: false });
    printResult(result);
  } else if (command === 'email-sync') {
    const result = await runEmailSync({ runId: requireOption(options, 'run-id'), dryRun: Boolean(options['dry-run']) });
    console.log(JSON.stringify(result, null, 2));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function requireOption(options, key) {
  if (!options[key]) throw new Error(`Missing required option --${key}`);
  return options[key];
}

function printResult(result) {
  console.log(JSON.stringify({
    runId: result.runId,
    period: result.period.label,
    dryRun: result.dryRun,
    counts: result.counts,
    firebaseStatus: result.firebaseStatus,
    emailStatus: result.emailStatus,
    outputFiles: result.outputFiles
  }, null, 2));
}

function usage() {
  console.log([
    'Usage:',
    '  npm run dry-run -- --period 04.2026',
    '  npm run run -- --period 04.2026',
    '  npm run email-sync -- --run-id YYYY-MM-DD'
  ].join('\n'));
}
