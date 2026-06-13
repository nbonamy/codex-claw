import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSourceWorktree, listSourceWorktrees, parseGitWorktreeList, suggestedSourceWorktreePath } from '../git-worktrees';

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
    const run = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(createSourceWorktree({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
    }, { run })).resolves.toStrictEqual({
      name: 'source-folder',
      path: path.join('/Users/nbonamy/src', 'codex-claw-feature-source-folder'),
    });

    expect(run).toHaveBeenCalledWith('git', [
      'worktree',
      'add',
      '-b',
      'feature/source-folder',
      path.join('/Users/nbonamy/src', 'codex-claw-feature-source-folder'),
    ], {
      cwd: '/Users/nbonamy/src/codex-claw',
    });
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

  it('parses malformed worktree entries defensively', () => {
    expect(parseGitWorktreeList('HEAD abc123\n\nworktree /repo/work\n', '/repo/main')).toStrictEqual([
      { name: 'work', path: '/repo/work' },
    ]);
  });
});
