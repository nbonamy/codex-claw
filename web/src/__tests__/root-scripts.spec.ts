import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root web scripts', () => {
  it('exposes the complete web development lifecycle from the repository root', async () => {
    const rootPackage = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(rootPackage.scripts).toMatchObject({
      'dev:web': expect.stringContaining('@codex-claw/web'),
      'start:web': 'npm run start -w @codex-claw/web',
      'preview:web': 'npm run build:web && npm run start:web',
      'build:web': expect.stringContaining('@codex-claw/web'),
      'typecheck:web': 'npm run typecheck -w @codex-claw/web',
      'lint:web': 'npm run lint -w @codex-claw/web',
      'test:web': 'npm run test -w @codex-claw/web',
      'test:coverage:web': 'npm run test:coverage -w @codex-claw/web',
    });
    expect(rootPackage.scripts['dev:web']).toContain('npm run build:sdk');
    expect(rootPackage.scripts['build:web']).toContain('npm run build -w @codex-claw/backend');
  });
});
