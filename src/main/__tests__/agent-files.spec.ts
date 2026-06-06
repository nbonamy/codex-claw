import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listAgentFolderFiles } from '../agent-files';

const tempFolders: string[] = [];

describe('listAgentFolderFiles', () => {
  afterEach(async () => {
    await Promise.all(tempFolders.map(async (folder) => {
      await rm(folder, { recursive: true, force: true });
    }));
    tempFolders.length = 0;
  });

  it('returns sorted relative file paths from an agent folder', async () => {
    const folder = await createTempFolder();
    await mkdir(path.join(folder, 'src'), { recursive: true });
    await writeFile(path.join(folder, 'README.md'), 'hello');
    await writeFile(path.join(folder, 'src', 'main.ts'), 'main');

    await expect(listAgentFolderFiles(folder)).resolves.toStrictEqual([
      { name: 'README.md', path: 'README.md' },
      { name: 'main.ts', path: 'src/main.ts' },
    ]);
  });

  it('skips generated folders and symbolic links', async () => {
    const folder = await createTempFolder();
    await mkdir(path.join(folder, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(path.join(folder, '.git'), { recursive: true });
    await writeFile(path.join(folder, 'node_modules', 'pkg', 'index.js'), 'ignored');
    await writeFile(path.join(folder, '.git', 'config'), 'ignored');
    await writeFile(path.join(folder, 'package.json'), '{}');
    await symlink(path.join(folder, 'package.json'), path.join(folder, 'package-link.json'));

    await expect(listAgentFolderFiles(folder)).resolves.toStrictEqual([
      { name: 'package.json', path: 'package.json' },
    ]);
  });

  it('honors max file limits', async () => {
    const folder = await createTempFolder();
    await writeFile(path.join(folder, 'a.txt'), 'a');
    await writeFile(path.join(folder, 'b.txt'), 'b');

    await expect(listAgentFolderFiles(folder, { maxFiles: 1 })).resolves.toHaveLength(1);
  });
});

async function createTempFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'codex-claw-agent-files-'));
  tempFolders.push(folder);
  return folder;
}
