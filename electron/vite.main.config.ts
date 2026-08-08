import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import path from 'node:path';
import { sdkSourceAliases } from '../vite.sdk-aliases';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const useSdkSources = process.env.CODEX_APP_SDK_SOURCE === '1';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
      ...(useSdkSources ? sdkSourceAliases : {}),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['autolib'],
    },
  },
});
