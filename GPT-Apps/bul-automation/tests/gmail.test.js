import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDecisionCommands } from '../src/gmailSync.js';

test('parseDecisionCommands accepts only structured MAP KEEP SKIP commands', () => {
  const commands = parseDecisionCommands(`
    MAP M-202606-001 5110/1111
    KEEP A-202606-005
    SKIP A-202606-006
    please map random text
  `);

  assert.deepEqual(commands, [
    { action: 'MAP', id: 'M-202606-001', debitAccount: '5110', creditAccount: '1111' },
    { action: 'KEEP', id: 'A-202606-005' },
    { action: 'SKIP', id: 'A-202606-006' }
  ]);
});
