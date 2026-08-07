import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'src/test/setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/main/mcp/**/*.ts',
        'src/main/snapshot-service.ts',
        'src/renderer/**/*.{ts,vue}',
      ],
      exclude: [
        'src/renderer/main.ts',
        'src/renderer/**/*.d.ts',
        'src/renderer/**/__tests__/**',
        'src/test/**',
      ],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
