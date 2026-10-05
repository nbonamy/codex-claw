import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { sdkSourceAliases } from '../vite.sdk-aliases';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..');
  const env = {
    ...loadEnv(mode, rootDir, ''),
    ...process.env,
  };
  const useSdkSources = env.CODEX_APP_SDK_SOURCE === '1';

  return {
    define: {
      __APP_GITHUB_CLIENT_ID__: JSON.stringify(env.APP_GITHUB_CLIENT_ID ?? ''),
      __APP_LINEAR_CLIENT_ID__: JSON.stringify(env.APP_LINEAR_CLIENT_ID ?? ''),
    },
    resolve: {
      alias: {
        '@workspace/core': path.resolve(__dirname, '../core/src'),
        ...(useSdkSources ? sdkSourceAliases : {}),
      },
    },
    ssr: {
      noExternal: true,
    },
    build: {
      ssr: path.resolve(__dirname, 'src/daemon.ts'),
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      rollupOptions: {
        external: [/^node:/],
        output: {
          entryFileNames: 'daemon.mjs',
          format: 'es',
        },
      },
    },
  };
});
