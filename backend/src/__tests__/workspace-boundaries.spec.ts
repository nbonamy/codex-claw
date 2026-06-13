import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace dependency boundaries', () => {
  it('keeps backend and shared source free of Electron imports', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const files = [
      ...(await sourceFiles(path.join(repoRoot, 'backend/src'))),
      ...(await sourceFiles(path.join(repoRoot, 'shared/src'))),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(file, 'utf8');
      if (/from ['"]electron['"]|import\(['"]electron['"]\)/.test(text)) {
        offenders.push(path.relative(repoRoot, file));
      }
    }

    expect(offenders).toStrictEqual([]);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  }));

  return files.flat();
}
