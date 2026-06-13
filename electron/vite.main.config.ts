import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

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
