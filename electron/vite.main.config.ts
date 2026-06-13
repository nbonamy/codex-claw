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
  define: {
    __CODEX_CLAW_GITHUB_CLIENT_ID__: JSON.stringify(process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? ''),
  },
  build: {
    sourcemap: true,
    minify: false,
  },
});
