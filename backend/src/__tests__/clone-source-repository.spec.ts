import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cloneSourceRepository, repositoryNameFromUrl } from '../clone-source-repository';

describe('cloneSourceRepository', () => {
  it('derives repository names from HTTPS and SSH URLs', () => {
    expect(repositoryNameFromUrl('https://github.com/nbonamy/codex-claw.git')).toBe('codex-claw');
    expect(repositoryNameFromUrl('git@github.com:nbonamy/codex-claw.git')).toBe('codex-claw');
  });

  it('clones into the source folder and returns the discovered repository', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'claw-clone-'));
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === 'clone') {
        const destination = args.at(-1)!;
        await mkdir(path.join(destination, '.git'), { recursive: true });
        await writeFile(path.join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      }
      return { stdout: '' };
    });

    await expect(cloneSourceRepository(
      sourceRoot,
      'https://github.com/nbonamy/codex-claw.git',
      { run },
    )).resolves.toStrictEqual({
      name: 'codex-claw',
      path: path.join(sourceRoot, 'codex-claw'),
      worktrees: [{ name: 'main', path: path.join(sourceRoot, 'codex-claw') }],
    });
    expect(run).toHaveBeenCalledWith('git', [
      'clone',
      '--',
      'https://github.com/nbonamy/codex-claw.git',
      path.join(sourceRoot, 'codex-claw'),
    ], { cwd: sourceRoot });
  });

  it('reuses an existing clone only when its origin matches', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'claw-clone-existing-'));
    const destination = path.join(sourceRoot, 'codex-claw');
    await mkdir(path.join(destination, '.git'), { recursive: true });
    await writeFile(path.join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const run = vi.fn().mockResolvedValue({ stdout: 'https://github.com/nbonamy/codex-claw.git\n' });

    await expect(cloneSourceRepository(
      sourceRoot,
      'https://github.com/nbonamy/codex-claw',
      { run },
    )).resolves.toMatchObject({ name: 'codex-claw', path: destination });
    expect(run).toHaveBeenCalledOnce();
  });
});
