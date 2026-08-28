import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSourceWorktree, listSourceBranches, listSourceWorktrees, parseGitWorktreeList, parseSourceBranches, suggestedSourceWorktreePath } from '../git-worktrees';

describe('git worktree operations', () => {
  it('suggests sibling worktree paths from repo and branch names', () => {
    expect(suggestedSourceWorktreePath('/Users/nbonamy/src/codex-claw', 'feature/source folder')).toBe(
      path.join('/Users/nbonamy/src', 'codex-claw-feature-source-folder'),
    );
    expect(suggestedSourceWorktreePath('/Users/nbonamy/src/codex-claw', 'bug/fix/path')).toBe(
      path.join('/Users/nbonamy/src', 'codex-claw-bug-fix-path'),
    );
  });

  it('runs git worktree add in the repository folder', async () => {
    const run = vi.fn().mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'show-ref') throw new Error('missing');
      return { stdout: '', stderr: '' };
    });

    await expect(createSourceWorktree({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
    }, { run })).resolves.toStrictEqual({
      name: 'source-folder',
      path: path.join('/Users/nbonamy/src', 'codex-claw-feature-source-folder'),
    });

    expect(run).toHaveBeenLastCalledWith('git', [
      'worktree',
      'add',
      '-b',
      'feature/source-folder',
      path.join('/Users/nbonamy/src', 'codex-claw-feature-source-folder'),
    ], {
      cwd: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('reuses local and remote branches when creating worktrees', async () => {
    const localRun = vi.fn().mockResolvedValue({ stdout: '' });
    await createSourceWorktree({ repoPath: '/repo', branchName: 'feature/existing' }, { run: localRun });
    expect(localRun).toHaveBeenLastCalledWith('git', ['worktree', 'add', '/repo-feature-existing', 'feature/existing'], { cwd: '/repo' });

    const remoteRun = vi.fn().mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'show-ref') throw new Error('missing');
      if (args[0] === 'for-each-ref') return { stdout: 'origin/feature/remote\n' };
      return { stdout: '' };
    });
    await createSourceWorktree({ repoPath: '/repo', branchName: 'feature/remote' }, { run: remoteRun });
    expect(remoteRun).toHaveBeenLastCalledWith('git', [
      'worktree', 'add', '-b', 'feature/remote', '/repo-feature-remote', 'origin/feature/remote',
    ], { cwd: '/repo' });
  });

  it('rejects missing branch names before invoking git', async () => {
    const run = vi.fn();

    await expect(createSourceWorktree({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: ' ',
    }, { run })).rejects.toThrow('Branch name is required.');
    expect(run).not.toHaveBeenCalled();
  });

  it('lists source worktrees through git worktree porcelain output', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: [
        'worktree /Users/nbonamy/src/codex-claw',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /Users/nbonamy/src/codex-claw-backend',
        'HEAD def456',
        'branch refs/heads/feature/backend',
        '',
        'worktree /Users/nbonamy/src/codex-claw-detached',
        'HEAD fedcba',
        'detached',
        '',
      ].join('\n'),
    });

    await expect(listSourceWorktrees('/Users/nbonamy/src/codex-claw', { run })).resolves.toStrictEqual([
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'codex-claw-detached', path: '/Users/nbonamy/src/codex-claw-detached' },
      { name: 'feature/backend', path: '/Users/nbonamy/src/codex-claw-backend' },
    ]);

    expect(run).toHaveBeenCalledWith('git', ['worktree', 'list', '--porcelain'], {
      cwd: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('lists local and remote branches with default and checkout metadata', async () => {
    const run = vi.fn().mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'for-each-ref') return { stdout: 'refs/heads/main\nrefs/heads/feature/local\nrefs/remotes/origin/feature/remote\nrefs/remotes/origin/HEAD\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      return { stdout: 'worktree /repo\nbranch refs/heads/main\n\nworktree /repo-feature-local\nbranch refs/heads/feature/local\n' };
    });

    await expect(listSourceBranches('/repo', { run })).resolves.toStrictEqual([
      { name: 'main', isDefault: true, worktreePath: '/repo' },
      { name: 'feature/local', isDefault: false, worktreePath: '/repo-feature-local' },
      { name: 'feature/remote', isDefault: false },
    ]);
  });

  it('parses branch refs with main as the fallback default', () => {
    expect(parseSourceBranches('refs/heads/main\nrefs/remotes/upstream/topic/x\n', '', '', '/repo')).toStrictEqual([
      { name: 'main', isDefault: true },
      { name: 'topic/x', isDefault: false },
    ]);
  });

  it('parses malformed worktree entries defensively', () => {
    expect(parseGitWorktreeList('HEAD abc123\n\nworktree /repo/work\n', '/repo/main')).toStrictEqual([
      { name: 'work', path: '/repo/work' },
    ]);
  });
});
