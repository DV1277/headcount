import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: {
    '@hc/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
    '@hc/engine': fileURLToPath(new URL('./packages/engine/src/index.ts', import.meta.url)),
  } },
  test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'], pool: 'forks', maxWorkers: 2, minWorkers: 1 },
});
