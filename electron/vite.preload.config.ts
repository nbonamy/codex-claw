import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
  },
});
