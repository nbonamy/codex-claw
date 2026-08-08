import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [vue()],
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
      '@codex-claw/vue': path.resolve(__dirname, '../vue/src'),
      '@codex-claw/web-client': path.resolve(__dirname, '../web-client/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
