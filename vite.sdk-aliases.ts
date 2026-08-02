import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sdkSourceRoot = fileURLToPath(new URL('../codex-app-sdk/src', import.meta.url));

export const sdkSourceAliases = {
  'codex-app-sdk/electron/preload': path.join(sdkSourceRoot, 'electron/preload.ts'),
  'codex-app-sdk/electron': path.join(sdkSourceRoot, 'electron/index.ts'),
  'codex-app-sdk/codex': path.join(sdkSourceRoot, 'codex/index.ts'),
  'codex-app-sdk/events': path.join(sdkSourceRoot, 'events/index.ts'),
  'codex-app-sdk/node': path.join(sdkSourceRoot, 'node/index.ts'),
  'codex-app-sdk/styles.css': path.join(sdkSourceRoot, 'vue/styles.css'),
  'codex-app-sdk/surface': path.join(sdkSourceRoot, 'surface/index.ts'),
  'codex-app-sdk/vue': path.join(sdkSourceRoot, 'vue/index.ts'),
  'codex-app-sdk': path.join(sdkSourceRoot, 'index.ts'),
};
