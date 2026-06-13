import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/clawd.ts'),
      formats: ['es'],
      fileName: () => 'clawd.mjs',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
