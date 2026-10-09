import { excalidrawAssets } from '../vue/vite.excalidraw-assets';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { product } from '../core/src/product';
import { sdkSourceAliases, sdkSourceRoot } from '../vite.sdk-aliases';

const useSdkSources = process.env.CODEX_APP_SDK_SOURCE === '1';

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
      ...(useSdkSources ? sdkSourceAliases : {}),
    },
    dedupe: ['vue'],
  },
  server: {
    fs: { allow: [path.resolve(__dirname, '..'), ...(useSdkSources ? [sdkSourceRoot] : [])] },
    // `npm run dev:web` serves the client from Vite and forwards the app socket to the web server.
    proxy: process.env.WEB_DEV_SERVER_PORT
      ? { '/app': { target: `ws://127.0.0.1:${process.env.WEB_DEV_SERVER_PORT}`, ws: true } }
      : undefined,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
