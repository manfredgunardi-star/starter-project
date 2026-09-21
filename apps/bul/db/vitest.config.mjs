import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['db/tests/**/*.test.mjs'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
