import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePeriod, outputRunId } from '../src/period.js';

test('parsePeriod converts mm.yyyy into inclusive period bounds and folder label', () => {
  const period = parsePeriod('04.2026');

  assert.equal(period.label, '04.2026');
  assert.equal(period.year, 2026);
  assert.equal(period.month, 4);
  assert.equal(period.periodStart, '2026-04-01');
  assert.equal(period.periodEnd, '2026-04-30');
  assert.equal(period.previousLabel, '03.2026');
});

test('parsePeriod rejects invalid period labels', () => {
  assert.throws(() => parsePeriod('2026-04'), /mm\.yyyy/);
  assert.throws(() => parsePeriod('13.2026'), /month/);
});

test('outputRunId returns stable date id from an ISO timestamp', () => {
  assert.equal(outputRunId('2026-05-22T11:44:01.000Z'), '2026-05-22');
});
