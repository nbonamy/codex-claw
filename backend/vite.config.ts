import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..');
  const env = {
    ...loadEnv(mode, rootDir, ''),
    ...process.env,
  };

  return {
    define: {
      __CODEX_CLAW_GITHUB_CLIENT_ID__: JSON.stringify(env.CODEX_CLAW_GITHUB_CLIENT_ID ?? ''),
    },
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
  };
});
