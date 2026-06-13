import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSourceWorktree, suggestedSourceWorktreePath } from '../git-worktrees';

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
});
