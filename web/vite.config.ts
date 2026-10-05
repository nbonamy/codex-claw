import { excalidrawAssets } from '../vue/vite.excalidraw-assets';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { product } from '../core/src/product';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [
    vue(),
    excalidrawAssets(),
    {
      name: 'app-page-title',
      transformIndexHtml: (html) => html.replace('<title>Workspace</title>', `<title>${product.name}</title>`),
    },
  ],
  resolve: {
    alias: {
      '@workspace/core': path.resolve(__dirname, '../core/src'),
      '@workspace/vue': path.resolve(__dirname, '../vue/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
