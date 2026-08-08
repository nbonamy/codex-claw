import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
    },
  },
  ssr: {
    noExternal: ['@codex-claw/core'],
  },
  build: {
    ssr: path.resolve(__dirname, 'src/server/index.ts'),
    outDir: path.resolve(__dirname, 'dist/server'),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [/^node:/],
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
  },
});
