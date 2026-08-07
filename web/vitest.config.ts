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
  },
});
