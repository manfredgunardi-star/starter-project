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

// --- Template parsing tests ---
import { generateTarifRuteTemplate, parseTarifRuteTemplate, validateRuteIds } from '../src/utils/tarifRuteTemplateHelpers.js';

const ruteList = [
  { id: 'R1', rute: 'Jakarta - Surabaya', uangJalan: 500000 },
  { id: 'R2', rute: 'Bandung - Medan',    uangJalan: 300000 },
];

const tpl = generateTarifRuteTemplate(ruteList, '2026-05-01');
console.log(tpl[0][0] === 'Tanggal Efektif:' ? 'OK  tpl A1' : 'FAIL tpl A1'); fail += (tpl[0][0] === 'Tanggal Efektif:' ? 0 : 1);
console.log(tpl[0][1] === '2026-05-01' ? 'OK  tpl B1' : 'FAIL tpl B1'); fail += (tpl[0][1] === '2026-05-01' ? 0 : 1);
console.log(JSON.stringify(tpl[2]) === JSON.stringify(['ID Rute','Nama Rute','Tarif Lama','Tarif Baru']) ? 'OK  tpl header' : 'FAIL tpl header'); fail += (JSON.stringify(tpl[2]) === JSON.stringify(['ID Rute','Nama Rute','Tarif Lama','Tarif Baru']) ? 0 : 1);

// Simulate a filled template
const filled = [
  ['Tanggal Efektif:', '2026-05-01'],
  [],
  ['ID Rute','Nama Rute','Tarif Lama','Tarif Baru'],
  ['R1','Jakarta - Surabaya',500000,600000],  // updated
  ['R2','Bandung - Medan',300000,''],          // skipped (empty)
  ['R3','Unknown route',0,100000],             // will fail rute validation
];
const parsed = parseTarifRuteTemplate(filled);
console.log(parsed.errors.length === 0 ? 'OK  parse no errors' : `FAIL parse errors: ${parsed.errors.join('; ')}`); fail += (parsed.errors.length === 0 ? 0 : 1);
console.log(parsed.effectiveDate === '2026-05-01' ? 'OK  parse date' : 'FAIL parse date'); fail += (parsed.effectiveDate === '2026-05-01' ? 0 : 1);
console.log(parsed.updates.length === 2 ? 'OK  parse 2 updates' : `FAIL parse ${parsed.updates.length} updates`); fail += (parsed.updates.length === 2 ? 0 : 1);
console.log(parsed.updates[0]?.tarifBaru === 600000 ? 'OK  parse R1 600k' : 'FAIL parse R1 600k'); fail += (parsed.updates[0]?.tarifBaru === 600000 ? 0 : 1);

const ruteErrs = validateRuteIds(parsed.updates, ruteList);
console.log(ruteErrs.length === 1 && ruteErrs[0].includes('R3') ? 'OK  R3 flagged unknown' : `FAIL rute errs: ${ruteErrs.join('; ')}`); fail += (ruteErrs.length === 1 && ruteErrs[0].includes('R3') ? 0 : 1);

// Invalid date
const badDate = [
  ['Tanggal Efektif:', 'not a date'],
  [],
  ['ID Rute','Nama Rute','Tarif Lama','Tarif Baru'],
  ['R1','Jakarta - Surabaya',500000,600000],
];
const parsedBad = parseTarifRuteTemplate(badDate);
console.log(parsedBad.errors.some(e => e.includes('Tanggal Efektif')) ? 'OK  bad date flagged' : 'FAIL bad date'); fail += (parsedBad.errors.some(e => e.includes('Tanggal Efektif')) ? 0 : 1);

if (fail > 0) {
  console.error(`\n${fail} test(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke tests passed');
