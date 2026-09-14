import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSourceRepository, requireRepositoryName } from '../create-source-repository';

describe('createSourceRepository', () => {
  it('creates a folder, initializes Git, and returns the discovered repository', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'claw-create-repository-'));
    const run = vi.fn(async (_command: string, _args: string[], options: { cwd: string }) => {
      await mkdir(path.join(options.cwd, '.git'));
      await writeFile(path.join(options.cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    });

    try {
      await expect(createSourceRepository(sourceRoot, 'new-project', { run })).resolves.toStrictEqual({
        name: 'new-project',
        path: path.join(sourceRoot, 'new-project'),
        worktrees: [{ name: 'main', path: path.join(sourceRoot, 'new-project') }],
      });
      expect(run).toHaveBeenCalledWith('git', ['init'], { cwd: path.join(sourceRoot, 'new-project') });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('rejects an existing destination without running Git', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'claw-create-repository-existing-'));
    await mkdir(path.join(sourceRoot, 'existing'));
    const run = vi.fn();

    try {
      await expect(createSourceRepository(sourceRoot, 'existing', { run })).rejects.toThrow('existing already exists');
      expect(run).not.toHaveBeenCalled();
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('accepts only one non-empty folder name', () => {
    expect(requireRepositoryName(' project ')).toBe('project');
    expect(() => requireRepositoryName('')).toThrow('Project name is required');
    expect(() => requireRepositoryName('../project')).toThrow('single folder name');
    expect(() => requireRepositoryName('nested/project')).toThrow('single folder name');
  });
});
