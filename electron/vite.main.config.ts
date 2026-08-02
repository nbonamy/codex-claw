import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import path from 'node:path';
import { sdkSourceAliases } from '../vite.sdk-aliases';

dotenv.config();
const useSdkSources = process.env.CODEX_APP_SDK_SOURCE === '1';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/shared': path.resolve(__dirname, '../shared/src'),
      ...(useSdkSources ? sdkSourceAliases : {}),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
  },
});
