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
    pool: 'vmThreads',
    vmMemoryLimit: '512MB',
    setupFiles: [path.resolve(__dirname, 'src/test/setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/bootstrap.ts',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/test/**',
      ],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 90,
      },
    },
  },
});
