import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkText(text, required = [], forbidden = []) {
  const normalized = text.toLowerCase();
  return [
    ...required
      .filter((phrase) => !normalized.includes(phrase.toLowerCase()))
      .map((phrase) => `missing: ${phrase}`),
    ...forbidden
      .filter((phrase) => normalized.includes(phrase.toLowerCase()))
      .map((phrase) => `forbidden: ${phrase}`),
  ];
}

const scopeFiles = {
  root: [
    ['AGENTS.md', ['empat aplikasi', 'production deployment dilarang', 'reviewer read-only', 'satu implementer'], []],
    ['CLAUDE.md', ['empat aplikasi', 'production deployment dilarang', 'reviewer read-only', 'satu implementer'], []],
    ['docs/agent-policy/repository-map.md', ['apps/erp-acc/erp-app', 'supabase', 'vercel'], []],
    ['docs/agent-policy/shared-safety.md', ['financial logic', 'security rules', 'persetujuan user'], []],
    ['docs/agent-policy/validation-matrix.md', ['npm run build', 'playwright', 'staging'], []],
    ['docs/agent-policy/worktree-lifecycle.md', ['created', 'quarantined', 'git worktree remove'], ['--force']],
    ['docs/agent-policy/manual-collaboration.md', ['task contract', 'implementer', 'reviewer'], []],
  ],
  apps: [
    ['apps/sj-monitor/AGENTS.md', ['firestore write safety', 'npm run build', 'staging_deploy'], []],
    ['apps/sj-monitor/CLAUDE.md', ['firestore write safety', 'npm run build', 'staging_deploy'], []],
    ['apps/bul-monitor/AGENTS.md', ['bul_*', 'npm run build', 'production deployment dilarang'], []],
    ['apps/bul-monitor/CLAUDE.md', ['bul_*', 'npm run build', 'production deployment dilarang'], ['firebase deploy --only hosting,firestore:rules']],
    ['apps/bul-accounting/AGENTS.md', ['debit', 'kredit', 'npm test'], []],
    ['apps/bul-accounting/CLAUDE.md', ['debit', 'kredit', 'npm test'], ['c:\\project\\apps\\bul-acc`']],
    ['apps/erp-acc/erp-app/AGENTS.md', ['supabase', 'rls', 'npm run lint'], []],
    ['apps/erp-acc/erp-app/CLAUDE.md', ['supabase', 'rls', 'npm run lint'], ['firebase deploy']],
  ],
  reviewers: [
    ['.claude/agents/code-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/security-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/accounting-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/finance-auditor.md', ['tools: read, grep, glob, bash', 'read-only'], ['draft-fix', 'tools: read, grep, glob, bash, edit']],
  ],
  permissions: [
    ['.claude/settings.json', [], ['firebase deploy:*', 'git push:*', 'git reset:*', 'rm -rf']],
    ['apps/sj-monitor/.claude/settings.json', [], ['firebase:*', 'firebase deploy']],
    ['apps/sj-monitor/.claude/settings.local.json', [], ['firebase:*', 'npm run:*']],
    ['apps/bul-accounting/.claude/settings.local.json', [], ['firebase deploy', 'firebase deploy:*']],
    ['apps/erp-acc/.claude/settings.json', [], ['rm -rf', 'git reset:*', 'git push:*', 'deploy_edge_function']],
    ['apps/erp-acc/.claude/settings.local.json', [], ['git push:*', 'firebase deploy', 'deploy_edge_function']],
  ],
};

const requiredRootDeny = [
  'Bash(firebase:*)',
  'Bash(npx firebase:*)',
  'Bash(vercel:*)',
  'Bash(npx vercel:*)',
  'Bash(supabase:*)',
  'Bash(npx supabase:*)',
  'Bash(git push:*)',
  'Bash(git reset:*)',
  'Bash(rm -rf:*)',
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function validateScope(repoRoot, scope = 'all') {
  const selected = scope === 'all' ? Object.keys(scopeFiles) : [scope];
  const failures = [];

  for (const selectedScope of selected) {
    if (!scopeFiles[selectedScope]) {
      failures.push(`unknown scope: ${selectedScope}`);
      continue;
    }

    for (const [relativePath, required, forbidden] of scopeFiles[selectedScope]) {
      const absolutePath = path.join(repoRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        failures.push(`${relativePath}: missing file`);
        continue;
      }
      const rawText = readUtf8(absolutePath);
      const parsedSettings = selectedScope === 'permissions' ? JSON.parse(rawText) : null;
      const inspectedText = parsedSettings
        ? JSON.stringify(parsedSettings.permissions?.allow ?? [])
        : rawText;
      for (const failure of checkText(inspectedText, required, forbidden)) {
        failures.push(`${relativePath}: ${failure}`);
      }
      if (selectedScope === 'permissions' && relativePath === '.claude/settings.json') {
        const denyText = JSON.stringify(parsedSettings.permissions?.deny ?? []);
        for (const failure of checkText(denyText, requiredRootDeny, [])) {
          failures.push(`${relativePath} deny: ${failure}`);
        }
      }
    }
  }

  return { scope, failures };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const scopeIndex = process.argv.indexOf('--scope');
  const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : 'all';
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = validateScope(repoRoot, scope);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.failures.length === 0 ? 0 : 1;
}
