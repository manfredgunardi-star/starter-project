import test from 'node:test';
import assert from 'node:assert/strict';

import { exportFirebaseSnapshots } from '../src/firebaseExporter.js';

test('exportFirebaseSnapshots reports query_not_configured when no enabled queries exist', async () => {
  const result = await exportFirebaseSnapshots({
    config: { apps: {} },
    period: { periodStart: '2026-04-01', periodEnd: '2026-04-30' },
    outputDir: 'unused',
    dryRun: true
  });

  assert.equal(result.status, 'query_not_configured');
  assert.deepEqual(result.files, []);
});
