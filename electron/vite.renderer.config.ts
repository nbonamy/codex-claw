import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@codex-claw/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5174,
  },
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
