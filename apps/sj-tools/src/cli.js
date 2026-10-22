#!/usr/bin/env node
// Entrypoint tanpa LLM untuk systemd timer / uji manual.
//   node src/cli.js rekap --dari 2026-10-01 --sampai 2026-10-15 [--rute X] [--pt Y]
//   node src/cli.js rekap --minggu-lalu
//   node src/cli.js uji-tolak-tulis
import { parseArgs } from 'node:util';
import { jakartaToday, mingguLalu, runRekap } from './rekap.js';
import { AUDIT_FILE, loadEnv, fetchSuratJalan, ujiTolakTulis, closeFirebase } from './firebase.js';
import { sendDocument } from './telegram.js';

const USAGE = `Pemakaian:
  node src/cli.js rekap --dari YYYY-MM-DD --sampai YYYY-MM-DD [--rute NAMA] [--pt NAMA]
  node src/cli.js rekap --minggu-lalu
  node src/cli.js uji-tolak-tulis`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    dari: { type: 'string' },
    sampai: { type: 'string' },
    'minggu-lalu': { type: 'boolean' },
    rute: { type: 'string' },
    pt: { type: 'string' },
  },
});

loadEnv();
try {
  if (positionals[0] === 'rekap') {
    const today = jakartaToday();
    const range = values['minggu-lalu'] ? mingguLalu(today) : { tgl_awal: values.dari, tgl_akhir: values.sampai };
    const summary = await runRekap({ ...range, rute: values.rute, pt: values.pt }, {
      today, source: 'cli', auditFile: AUDIT_FILE, fetchRows: fetchSuratJalan, send: sendDocument,
    });
    console.log(JSON.stringify(summary));
  } else if (positionals[0] === 'uji-tolak-tulis') {
    console.log(JSON.stringify(await ujiTolakTulis()));
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`GAGAL: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeFirebase();
}
