import { defineConfig } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  define: {
    __CODEX_CLAW_GITHUB_CLIENT_ID__: JSON.stringify(process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? ''),
  },
  build: {
    sourcemap: true,
    minify: false,
  },
});
