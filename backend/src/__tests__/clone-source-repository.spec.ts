import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cloneSourceRepository, repositoryNameFromUrl } from '../clone-source-repository';

describe('cloneSourceRepository', () => {
  it('derives repository names from HTTPS and SSH URLs', () => {
    expect(repositoryNameFromUrl('https://github.com/nbonamy/agent-workspace.git')).toBe('agent-workspace');
    expect(repositoryNameFromUrl('git@github.com:nbonamy/agent-workspace.git')).toBe('agent-workspace');
  });

  it('clones into the source folder and returns the discovered repository', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'app-clone-'));
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
      'https://github.com/nbonamy/agent-workspace.git',
      { run },
    )).resolves.toStrictEqual({
      name: 'agent-workspace',
      path: path.join(sourceRoot, 'agent-workspace'),
      worktrees: [{ name: 'main', path: path.join(sourceRoot, 'agent-workspace') }],
    });
    expect(run).toHaveBeenCalledWith('git', [
      'clone',
      '--',
      'https://github.com/nbonamy/agent-workspace.git',
      path.join(sourceRoot, 'agent-workspace'),
    ], { cwd: sourceRoot });
  });

  it('normalizes a relative source folder before cloning and discovery', async () => {
    const sourceRootPath = await mkdtemp(path.join(process.cwd(), '.app-clone-relative-'));
    const sourceRoot = path.relative(process.cwd(), sourceRootPath);
    const run = vi.fn(async (_command: string, args: string[], options: { cwd: string }) => {
      if (args[0] === 'clone') {
        const destination = path.resolve(options.cwd, args.at(-1)!);
        await mkdir(path.join(destination, '.git'), { recursive: true });
        await writeFile(path.join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      }
      return { stdout: '' };
    });

    try {
      await expect(cloneSourceRepository(
        sourceRoot,
        'https://github.com/openai/skills.git',
        { run },
      )).resolves.toStrictEqual({
        name: 'skills',
        path: path.join(sourceRootPath, 'skills'),
        worktrees: [{ name: 'main', path: path.join(sourceRootPath, 'skills') }],
      });
    } finally {
      await rm(sourceRootPath, { recursive: true, force: true });
    }
  });

  it('reuses an existing clone only when its origin matches', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'app-clone-existing-'));
    const destination = path.join(sourceRoot, 'agent-workspace');
    await mkdir(path.join(destination, '.git'), { recursive: true });
    await writeFile(path.join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const run = vi.fn().mockResolvedValue({ stdout: 'https://github.com/nbonamy/agent-workspace.git\n' });

    await expect(cloneSourceRepository(
      sourceRoot,
      'https://github.com/nbonamy/agent-workspace',
      { run },
    )).resolves.toMatchObject({ name: 'agent-workspace', path: destination });
    expect(run).toHaveBeenCalledOnce();
  });
});
