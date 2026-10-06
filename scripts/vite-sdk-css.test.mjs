import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('Electron source-mode SDK styles resolve KaTeX CSS and local fonts', async () => {
  const previous = process.env.CODEX_APP_SDK_SOURCE;
  process.env.CODEX_APP_SDK_SOURCE = '1';
  let server;
  try {
    server = await createServer({
      configFile: fileURLToPath(new URL('../electron/vite.renderer.config.ts', import.meta.url)),
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const resolved = await server.pluginContainer.resolveId('@codex-app-sdk/vue/styles.css');
    assert.ok(resolved);
    const transformed = await server.transformRequest(`/@fs/${resolved.id.replaceAll('\\', '/')}`);
    assert.ok(transformed);
    assert.match(transformed.code, /\.katex/);
    assert.match(transformed.code, /KaTeX_Main-Regular\.woff2/);
    assert.doesNotMatch(transformed.code, /@import ['"]katex\//);
  } finally {
    await server?.close();
    if (previous === undefined) delete process.env.CODEX_APP_SDK_SOURCE;
    else process.env.CODEX_APP_SDK_SOURCE = previous;
  }
});
