import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreeManager, type WorktreeInitializationProgress, type WorktreeManagerOptions } from '../worktree-manager';

describe('WorktreeManager', () => {
  let root: string;
  let repositoryPath: string;
  let worktreePath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'claw-worktree-manager-'));
    repositoryPath = path.join(root, 'repo');
    worktreePath = path.join(root, 'repo-feature');
    await mkdir(repositoryPath);
    await mkdir(worktreePath);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('uses the current-platform repository setup instead of the generic setup', async () => {
    await writeSetup('setup', 'npm install');
    await writeSetup('setup-macos.sh', 'make bootstrap');
    const runCommand = vi.fn().mockResolvedValue({});
    const manager = createManager({ platform: 'darwin', runCommand });

    const result = await manager.create(createInput());

    expect(result.initialization).toStrictEqual({
      source: 'repository',
      commands: [path.join('.agents', 'worktree', 'setup-macos.sh')],
    });
    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledWith(
      '/bin/sh',
      [path.join(worktreePath, '.agents', 'worktree', 'setup-macos.sh')],
      expect.objectContaining({ cwd: worktreePath }),
    );
  });

  it('uses the generic repository setup when no platform override exists', async () => {
    await writeSetup('setup', 'npm install');
    const runCommand = vi.fn().mockResolvedValue({});
    const manager = createManager({ platform: 'linux', runCommand });

    await manager.create(createInput());

    expect(runCommand).toHaveBeenCalledWith(
      '/bin/sh',
      [path.join(worktreePath, '.agents', 'worktree', 'setup')],
      expect.objectContaining({ cwd: worktreePath }),
    );
  });

  it('runs extensionless setup as PowerShell command text on Windows', async () => {
    await writeSetup('setup', 'npm install\npython -m pip install -r requirements.txt');
    const runCommand = vi.fn().mockResolvedValue({});
    const manager = createManager({ platform: 'win32', runCommand });

    await manager.create(createInput());

    expect(runCommand).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'npm install\npython -m pip install -r requirements.txt',
      ],
      expect.objectContaining({ cwd: worktreePath }),
    );
  });

  it('treats an empty repository setup as an intentional no-op', async () => {
    await writeSetup('setup', '\n');
    await writeFile(path.join(worktreePath, 'package.json'), '{}');
    const runCommand = vi.fn();
    const manager = createManager({ runCommand });

    const result = await manager.create(createInput());

    expect(result.initialization).toStrictEqual({ source: 'repository', commands: [] });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('initializes every detected root ecosystem in a stable sequence', async () => {
    await Promise.all([
      writeFile(path.join(worktreePath, 'package.json'), '{}'),
      writeFile(path.join(worktreePath, 'package-lock.json'), '{}'),
      writeFile(path.join(worktreePath, 'uv.lock'), ''),
      writeFile(path.join(worktreePath, 'go.mod'), 'module example.com/project\n'),
    ]);
    const runCommand = vi.fn().mockResolvedValue({});
    const progress: WorktreeInitializationProgress[] = [];
    const manager = createManager({ runCommand });

    const result = await manager.create(createInput(), {
      onInitializationProgress: (event) => progress.push(event),
    });

    expect(result.initialization).toStrictEqual({
      source: 'automatic',
      commands: ['npm ci', 'uv sync', 'go mod download'],
    });
    expect(runCommand.mock.calls.map(([command, args]) => [command, args])).toStrictEqual([
      ['npm', ['ci']],
      ['uv', ['sync']],
      ['go', ['mod', 'download']],
    ]);
    expect(progress).toStrictEqual([
      { phase: 'detecting' },
      { phase: 'running', source: 'automatic', command: 'npm ci', commandIndex: 0, commandCount: 3 },
      { phase: 'running', source: 'automatic', command: 'uv sync', commandIndex: 1, commandCount: 3 },
      { phase: 'running', source: 'automatic', command: 'go mod download', commandIndex: 2, commandCount: 3 },
      { phase: 'complete', source: 'automatic', commands: ['npm ci', 'uv sync', 'go mod download'] },
    ]);
  });

  it('does not guess commands in repository-only mode', async () => {
    await writeFile(path.join(worktreePath, 'package.json'), '{}');
    const runCommand = vi.fn();
    const manager = createManager({ mode: 'repository', runCommand });

    await expect(manager.create(createInput())).resolves.toMatchObject({
      initialization: { source: 'none', commands: [] },
    });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('does not inspect or initialize worktrees when initialization is off', async () => {
    await writeSetup('setup-linux.sh', 'make bootstrap');
    const runCommand = vi.fn();
    const manager = createManager({ mode: 'off', runCommand });

    await expect(manager.create(createInput())).resolves.toMatchObject({
      initialization: { source: 'none', commands: [] },
    });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('does not initialize an existing worktree returned by Git', async () => {
    const runCommand = vi.fn();
    const createGitWorktree = vi.fn().mockResolvedValue({
      worktree: { name: 'feature/demo', path: worktreePath },
      created: false,
    });
    const manager = new WorktreeManager({
      createGitWorktree,
      getInitializationMode: () => 'automatic',
      runCommand,
    });

    const result = await manager.create(createInput());

    expect(result.created).toBe(false);
    expect(result.initialization).toStrictEqual({ source: 'none', commands: [] });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('stops after a failed initialization command', async () => {
    await Promise.all([
      writeFile(path.join(worktreePath, 'package.json'), '{}'),
      writeFile(path.join(worktreePath, 'package-lock.json'), '{}'),
      writeFile(path.join(worktreePath, 'go.mod'), 'module example.com/project\n'),
    ]);
    const failure = new Error('npm failed');
    const runCommand = vi.fn().mockRejectedValueOnce(failure);
    const manager = createManager({ runCommand });

    await expect(manager.create(createInput())).rejects.toBe(failure);
    expect(runCommand).toHaveBeenCalledOnce();
  });

  function createInput() {
    return { repoPath: repositoryPath, branchName: 'feature/demo' };
  }

  function createManager(options: {
    mode?: 'automatic' | 'repository' | 'off';
    platform?: NodeJS.Platform;
    runCommand: NonNullable<WorktreeManagerOptions['runCommand']>;
  }): WorktreeManager {
    return new WorktreeManager({
      createGitWorktree: vi.fn().mockResolvedValue({
        worktree: { name: 'demo', path: worktreePath },
        created: true,
      }),
      getInitializationMode: () => options.mode ?? 'automatic',
      platform: options.platform ?? 'linux',
      runCommand: options.runCommand,
    });
  }

  async function writeSetup(name: string, contents: string): Promise<void> {
    const setupRoot = path.join(worktreePath, '.agents', 'worktree');
    await mkdir(setupRoot, { recursive: true });
    await writeFile(path.join(setupRoot, name), contents);
  }
});
