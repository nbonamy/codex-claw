import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listAgentFolderFiles, previewAgentFolderFile } from '../agent-files';

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

  it('reads text files inside an agent folder', async () => {
    const folder = await createTempFolder();
    await writeFile(path.join(folder, 'README.md'), '# Read me\n', 'utf8');

    await expect(previewAgentFolderFile(folder, 'README.md')).resolves.toStrictEqual({
      path: 'README.md',
      content: '# Read me\n',
    });
  });

  it('reads an explicitly addressed absolute file outside the agent folder', async () => {
    const folder = await createTempFolder();
    const outsideFolder = await createTempFolder();
    const outsideFile = path.join(outsideFolder, 'notes.md');
    await writeFile(outsideFile, '# External notes\n', 'utf8');

    await expect(previewAgentFolderFile(folder, outsideFile)).resolves.toStrictEqual({
      path: outsideFile,
      content: '# External notes\n',
    });
  });

  it('rejects traversal, folders, and oversized files before reading content', async () => {
    const folder = await createTempFolder();
    await writeFile(path.join(folder, 'large.md'), 'xxxx', 'utf8');

    await expect(previewAgentFolderFile(folder, '../outside.md')).rejects.toThrow('outside the agent folder');
    await expect(previewAgentFolderFile(folder, '.')).rejects.toThrow('Path is not a file');
    await expect(previewAgentFolderFile(folder, 'large.md', { maxBytes: 3 })).rejects.toThrow('File is too large');
  });
});

async function createTempFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'codex-claw-agent-files-'));
  tempFolders.push(folder);
  return folder;
}
