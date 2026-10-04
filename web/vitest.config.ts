import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
      '@codex-claw/vue': path.resolve(__dirname, '../vue/src'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/client/main.ts',
        'src/server/index.ts',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
      ],
      thresholds: {
        statements: 85,
      },
    },
  },
});
