import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    ssr: path.resolve(__dirname, 'src/clawd.ts'),
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [/^node:/],
      output: {
        entryFileNames: 'clawd.mjs',
        format: 'es',
      },
    },
  },
});
