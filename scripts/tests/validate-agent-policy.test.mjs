import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkText, validateScope } from '../validate-agent-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('checkText reports missing required phrases', () => {
  assert.deepEqual(checkText('alpha', ['alpha', 'beta'], []), ['missing: beta']);
});

test('checkText reports forbidden phrases case-insensitively', () => {
  assert.deepEqual(
    checkText('Firebase Deploy --only hosting', [], ['firebase deploy']),
    ['forbidden: firebase deploy'],
  );
});

test('checkText returns no failures for compliant text', () => {
  assert.deepEqual(
    checkText(
      'reviewer read-only; production deployment dilarang',
      ['reviewer read-only', 'production deployment dilarang'],
      ['firebase deploy:*'],
    ),
    [],
  );
});

test('root policy denies pushes, resets, deployment CLIs, and recursive deletion by default', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  const deny = settings.permissions?.deny ?? [];

  assert.ok(deny.includes('Bash(git push:*)'));
  assert.ok(deny.includes('Bash(git reset:*)'));
  assert.ok(deny.includes('Bash(firebase:*)'));
  assert.ok(deny.includes('Bash(npx firebase:*)'));
  assert.ok(deny.includes('Bash(vercel:*)'));
  assert.ok(deny.includes('Bash(npx vercel:*)'));
  assert.ok(deny.includes('Bash(supabase:*)'));
  assert.ok(deny.includes('Bash(npx supabase:*)'));
  assert.ok(deny.includes('Bash(rm -rf:*)'));
});

test('permissions scope passes end-to-end for repository settings', () => {
  assert.deepEqual(validateScope(repoRoot, 'permissions'), {
    scope: 'permissions',
    failures: [],
  });
});
