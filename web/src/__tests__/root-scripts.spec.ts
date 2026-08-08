import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root host scripts', () => {
  it('exposes consistent Electron and web targets with Electron-first aliases', async () => {
    const rootPackage = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(Object.keys(rootPackage.scripts)).toStrictEqual(Object.keys(rootPackage.scripts).sort());
    expect(rootPackage.scripts).toMatchObject({
      build: 'npm run build:electron',
      'build:electron': 'node scripts/build.mjs',
      dev: 'npm run dev:electron',
      'dev:electron': 'node scripts/dev.mjs',
      'dev:web': expect.stringContaining('@codex-claw/web'),
      'build:web': expect.stringContaining('@codex-claw/web'),
      'lint:electron': 'npm run lint -w @codex-claw/electron',
      'lint:web': 'npm run lint -w @codex-claw/web-client && npm run lint -w @codex-claw/web',
      make: 'npm run make:electron',
      package: 'npm run package:electron',
      'preview:web': 'npm run build:web && npm run start:web',
      publish: 'npm run publish:electron',
      'start:electron': 'npm run start -w @codex-claw/electron',
      'start:web': 'npm run start -w @codex-claw/web',
      'test:coverage:electron': 'npm run test:coverage -w @codex-claw/electron',
      'test:coverage:web': 'npm run test:coverage -w @codex-claw/web-client && npm run test:coverage -w @codex-claw/web',
      'test:electron': 'npm run test -w @codex-claw/electron',
      'test:web': 'npm run test -w @codex-claw/web-client && npm run test -w @codex-claw/web',
      'typecheck:electron': 'npm run typecheck -w @codex-claw/electron',
      'typecheck:web': 'npm run typecheck -w @codex-claw/web-client && npm run typecheck -w @codex-claw/web',
    });
    expect(rootPackage.scripts['dev:web']).toContain('npm run build:sdk');
    expect(rootPackage.scripts['build:web']).toContain('npm run build -w @codex-claw/backend');
    expect(rootPackage.scripts['make:electron']).toContain('npm run make -w @codex-claw/electron');
    expect(rootPackage.scripts['package:electron']).toContain('npm run package -w @codex-claw/electron');
    expect(rootPackage.scripts['publish:electron']).toContain('npm run make:electron');
  });
});
