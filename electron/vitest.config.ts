import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/main/mcp/**/*.ts',
        'src/main/snapshot-service.ts',
        'src/main/**/*.ts',
      ],
      exclude: [
        'src/renderer/**/*.d.ts',
        'src/test/**',
      ],
      thresholds: {
        statements: 85,
      },
    },
  },
});
