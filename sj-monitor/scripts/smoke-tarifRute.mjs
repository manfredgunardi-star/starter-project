// Smoke test for tarifRuteHelpers. Run: node scripts/smoke-tarifRute.mjs
import { indexTarifRute, resolveUangJalanForDate, toISODateOnly } from '../src/utils/tarifRuteHelpers.js';

const sample = [
  { ruteId: 'R1', uangJalan: 500000, effectiveDate: '2026-01-01', isActive: true },
  { ruteId: 'R1', uangJalan: 600000, effectiveDate: '2026-05-01', isActive: true },
  { ruteId: 'R1', uangJalan: 700000, effectiveDate: '2026-08-01', isActive: false }, // ignored
  { ruteId: 'R2', uangJalan: 300000, effectiveDate: '2026-03-15', isActive: true },
];

const idx = indexTarifRute(sample);

const cases = [
  ['R1', '2026-04-20', 500000],   // before May rate, uses Jan rate
  ['R1', '2026-05-01', 600000],   // exact effective date
  ['R1', '2026-07-10', 600000],   // after May, before Aug (but Aug is inactive), still May rate
  ['R1', '2025-12-31', null],     // before any rate
  ['R2', '2026-03-15', 300000],
  ['R3', '2026-05-01', null],     // unknown rute
];

let fail = 0;
for (const [ruteId, date, expected] of cases) {
  const got = resolveUangJalanForDate(ruteId, date, idx);
  const ok = got === expected;
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${ruteId} @ ${date} => ${got} (expected ${expected})`);
  if (!ok) fail++;
}

// toISODateOnly
const dateCases = [
  ['2026-05-01', '2026-05-01'],
  ['2026-05-01T10:30:00.000Z', '2026-05-01'],
  ['', ''],
  [null, ''],
  ['not a date', ''],
];
for (const [input, expected] of dateCases) {
  const got = toISODateOnly(input);
  const ok = got === expected;
  console.log(`${ok ? 'OK ' : 'FAIL'}  toISODateOnly(${JSON.stringify(input)}) => "${got}" (expected "${expected}")`);
  if (!ok) fail++;
}

if (fail > 0) {
  console.error(`\n${fail} test(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke tests passed');
