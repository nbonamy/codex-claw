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
      __CODEX_CLAW_GITHUB_CLIENT_ID__: JSON.stringify(env.CODEX_CLAW_GITHUB_CLIENT_ID ?? ''),
    },
    resolve: {
      alias: {
        '@codex-claw/core': path.resolve(__dirname, '../core/src'),
        ...(useSdkSources ? sdkSourceAliases : {}),
      },
    },
    ssr: {
      noExternal: true,
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
  };
});
