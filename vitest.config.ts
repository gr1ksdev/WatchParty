import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': resolve(import.meta.dirname, 'apps/worker/src/test/cloudflare-workers-stub.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./apps/miniapp/src/test/setup.ts'],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
  },
});
