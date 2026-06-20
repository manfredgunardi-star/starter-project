import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function rulesPath(rel) {
  return resolve(__dirname, rel);
}

// Boot a test environment for one app's real rules file.
export async function makeEnv(projectId, rulesRelPath) {
  return initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(rulesPath(rulesRelPath), 'utf8'),
    },
  });
}
