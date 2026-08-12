import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { AgentGitService, parseBranchStatus, parseChangedFiles, parseNumstat, parsePorcelainFiles } from '../agent-git-service';

describe('agent git service parsers', () => {
  it('parses branch tracking status', () => {
    expect(parseBranchStatus('## main...origin/main [ahead 2, behind 1]\n M README.md\n')).toStrictEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    });
  });

  it('parses changed and untracked files from porcelain status', () => {
    expect(parseChangedFiles([
      '## main',
      ' M README.md',
      'A  src/main.ts',
      '?? scratch.md',
    ].join('\n'))).toStrictEqual({
      changedFiles: 3,
      hasUntracked: true,
    });
  });

  it('sums numstat lines and ignores binary changes', () => {
    expect(parseNumstat([
      '10\t2\tREADME.md',
      '-\t-\tassets/icon.png',
      '4\t0\tsrc/main.ts',
    ].join('\n'))).toStrictEqual({
      addedLines: 14,
      removedLines: 2,
    });
  });

  it('reviews staged and unstaged tracked changes against HEAD', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'status') {
        return { stdout: '## main...origin/main\n M src/a.ts\nM  src/b.ts\n' };
      }
      if (args.includes('--cached')) return { stdout: '3\t1\tsrc/b.ts\n' };
      if (args.includes('--numstat')) return { stdout: '5\t2\tsrc/a.ts\n' };
      if (args[0] === 'ls-files') {
        return { stdout: '' };
      }
      return { stdout: 'diff --git a/src/a.ts b/src/a.ts\n' };
    });
    const service = new AgentGitService(() => new Date('2026-08-01T00:00:00.000Z'), runGit);

    await expect(service.status('/repo')).resolves.toMatchObject({
      addedLines: 8,
      removedLines: 3,
      changedFiles: 2,
      state: 'dirty',
    });
    await expect(service.diff('/repo')).resolves.toMatchObject({
      diff: '3\t1\tsrc/b.ts\ndiff --git a/src/a.ts b/src/a.ts\n',
      sections: [
        { scope: 'staged', diff: '3\t1\tsrc/b.ts\n' },
        { scope: 'unstaged', diff: 'diff --git a/src/a.ts b/src/a.ts\n' },
        { scope: 'untracked', diff: '' },
      ],
    });

    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--cached', '--numstat', '--']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--numstat', '--']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--no-ext-diff', '--']);
  });

  it('includes untracked files in the shared working-tree totals', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'status') return { stdout: '## main...origin/main\n M src/a.ts\n?? src/new.ts\n' };
      if (args[0] === 'ls-files') return { stdout: 'src/new.ts\0' };
      if (args.includes('--no-index')) return { stdout: '5\t0\tsrc/new.ts\n' };
      if (args.includes('--cached')) return { stdout: '' };
      if (args[0] === 'diff' && args.includes('--numstat')) return { stdout: '2\t1\tsrc/a.ts\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date('2026-08-01T00:00:00.000Z'), runGit);

    await expect(service.status('/repo')).resolves.toMatchObject({
      addedLines: 7,
      removedLines: 1,
      changedFiles: 2,
      hasUntracked: true,
      state: 'dirty',
    });
  });

  it('reports the primary repository name for a linked worktree', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'status') return { stdout: '## test\n' };
      if (args[0] === 'rev-parse') return { stdout: '/Users/nbonamy/src/codex-claw-git-fixture/.git\n' };
      if (args[0] === 'remote') return { stdout: 'origin\tgit@github.com:nbonamy/codex-claw-git-fixture.git (fetch)\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.status('/Users/nbonamy/src/codex-claw-git-fixture-test')).resolves.toMatchObject({
      repository: 'codex-claw-git-fixture',
      githubRepository: 'nbonamy/codex-claw-git-fixture',
      branch: 'test',
    });
  });

  it('reviews staged plus unstaged diffs before the first commit', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args.includes('--cached')) {
        return { stdout: 'staged diff' };
      }
      if (args[0] === 'ls-files') {
        return { stdout: '' };
      }
      return { stdout: 'unstaged diff' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diff('/new-repo')).resolves.toMatchObject({
      diff: 'staged diff\nunstaged diff',
      sections: [
        { scope: 'staged', diff: 'staged diff' },
        { scope: 'unstaged', diff: 'unstaged diff' },
        { scope: 'untracked', diff: '' },
      ],
    });
    expect(runGit).toHaveBeenCalledWith('/new-repo', ['diff', '--cached', '--no-ext-diff', '--']);
    expect(runGit).toHaveBeenCalledWith('/new-repo', ['diff', '--no-ext-diff', '--']);
  });

  it('appends diffs for untracked files', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'ls-files') {
        return { stdout: 'new file.ts\0-leading-dash.md\0' };
      }
      if (args.includes('--no-index')) {
        const file = args.at(-1);
        return { stdout: `diff --git a/${file} b/${file}\n` };
      }
      if (args.includes('--cached')) return { stdout: '' };
      return { stdout: 'tracked diff\n' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diff('/repo')).resolves.toMatchObject({
      diff: [
        'tracked diff\n',
        'diff --git a/new file.ts b/new file.ts\n',
        'diff --git a/-leading-dash.md b/-leading-dash.md\n',
      ].join(''),
      sections: [
        { scope: 'staged', diff: '' },
        { scope: 'unstaged', diff: 'tracked diff\n' },
        {
          scope: 'untracked',
          diff: 'diff --git a/new file.ts b/new file.ts\ndiff --git a/-leading-dash.md b/-leading-dash.md\n',
        },
      ],
    });
    expect(runGit).toHaveBeenCalledWith('/repo', [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
    ]);
    expect(runGit).toHaveBeenCalledWith('/repo', [
      'diff',
      '--no-index',
      '--no-ext-diff',
      '--',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-leading-dash.md',
    ]);
  });

  it('returns staged, unstaged, and untracked review sections independently', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'ls-files') return { stdout: 'src/new.ts\0' };
      if (args.includes('--no-index')) return { stdout: 'untracked diff\n' };
      if (args.includes('--cached')) return { stdout: 'staged diff\n' };
      return { stdout: 'unstaged diff\n' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diffSections('/repo')).resolves.toStrictEqual([
      { scope: 'staged', diff: 'staged diff\n' },
      { scope: 'unstaged', diff: 'unstaged diff\n' },
      { scope: 'untracked', diff: 'untracked diff\n' },
    ]);
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--cached', '--no-ext-diff', '--']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--no-ext-diff', '--']);
  });

  it('builds commit generation context from exactly the selected scopes', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'ls-files') return { stdout: 'new.ts\0' };
      if (args.includes('--no-index')) return { stdout: 'untracked diff\n' };
      if (args.includes('--cached')) return { stdout: 'staged diff\n' };
      return { stdout: 'unstaged diff\n' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.commitMessageContext('/repo', {
      includeUnstaged: false,
      includeUntracked: true,
    })).resolves.toStrictEqual({
      context: '## staged changes\nstaged diff\n\n## untracked changes\nuntracked diff',
    });
  });

  it('builds pull request generation context from the branch merge base', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref' && args[3] === 'HEAD') return { stdout: 'feature/demo\n' };
      if (args.includes('@{upstream}')) return { stdout: 'origin/feature/demo\n' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: 'origin\n' };
      if (args[0] === 'remote') return { stdout: 'git@github.com:owner/repo.git\n' };
      if (args[0] === 'status') return { stdout: '## feature/demo...origin/feature/demo\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/feature/demo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'origin/main\n' };
      if (args[0] === 'log') return { stdout: 'abc123 feat: add flow\n\n' };
      if (args[0] === 'diff' && args.includes('--stat')) return { stdout: 'src/a.ts | 2 ++\n' };
      if (args[0] === 'diff' && args.includes('origin/main...HEAD')) return { stdout: 'branch diff\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.pullRequestMessageContext('/repo')).resolves.toStrictEqual({
      baseRef: 'origin/main',
      context: [
        '## Base\norigin/main',
        '## Commits\nabc123 feat: add flow',
        '## Diff stat\nsrc/a.ts | 2 ++',
        '## Diff\nbranch diff',
      ].join('\n\n'),
    });
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', '--no-ext-diff', 'origin/main...HEAD', '--']);
  });

  it('rejects pull request generation from an integration branch', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'main\n' };
      if (args.includes('@{upstream}')) return { stdout: 'origin/main\n' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: 'origin\n' };
      if (args[0] === 'remote') return { stdout: 'git@github.com:owner/repo.git\n' };
      if (args[0] === 'status') return { stdout: ' M src/a.ts\0' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.pullRequestMessageContext('/repo')).rejects.toThrow('Create a feature branch');
    expect(runGit.mock.calls.some(([, args]) => args[0] === 'log')).toBe(false);
  });

  it('inspects workflow state and performs bounded git mutations', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: 'origin\n' };
      if (args[0] === 'remote') return { stdout: 'git@github.com:nbonamy/codex-claw.git\n' };
      if (args[0] === 'status') return { stdout: ' M src/a.ts\0?? src/new.ts\0' };
      if (args.includes('--no-index')) return { stdout: '2\t0\tsrc/new.ts\n' };
      if (args[0] === 'diff' && args[1] === '--cached') return { stdout: '4\t1\tsrc/a.ts\n' };
      if (args[0] === 'diff') return { stdout: '2\t0\tsrc/a.ts\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.workflow('/repo')).resolves.toMatchObject({
      repository: 'nbonamy/codex-claw', branch: 'feature', remote: 'origin', detached: false,
      isLinkedWorktree: false,
      unstagedFiles: ['src/a.ts', 'src/new.ts'], stagedFiles: [],
      stagedAddedLines: 4, stagedRemovedLines: 1,
      unstagedAddedLines: 2, unstagedRemovedLines: 0,
      untrackedAddedLines: 2, untrackedRemovedLines: 0,
    });
    await service.stage('/repo', ['src/a.ts']);
    await service.commit('/repo', 'feat: ship workflow');
    await service.push('/repo', 'origin', 'feature', true);
    expect(runGit).toHaveBeenCalledWith('/repo', ['add', '--', 'src/a.ts']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['commit', '-m', 'feat: ship workflow']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['push', '--set-upstream', 'origin', 'feature']);
  });

  it('validates, creates, and checks out a branch from the current HEAD', async () => {
    const runGit = vi.fn().mockResolvedValue({ stdout: '' });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.createBranch('/repo', ' feature/from-current ')).resolves.toBe('/repo');

    expect(runGit.mock.calls).toStrictEqual([
      ['/repo', ['check-ref-format', '--branch', 'feature/from-current']],
      ['/repo', ['switch', '-c', 'feature/from-current']],
    ]);
  });

  it('creates a branch in an adjacent worktree without switching the current checkout', async () => {
    const runGit = vi.fn().mockResolvedValue({ stdout: '' });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.createBranch('/repo', 'feature/worktree', true)).resolves.toBe('/repo-feature-worktree');

    expect(runGit.mock.calls).toStrictEqual([
      ['/repo', ['check-ref-format', '--branch', 'feature/worktree']],
      ['/repo', ['worktree', 'add', '-b', 'feature/worktree', '/repo-feature-worktree']],
    ]);
  });

  it('fetches a pull request head before creating its review worktree', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'check-ref-format') return { stdout: '' };
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'rev-parse' && args.includes('@{upstream}')) return { stdout: 'origin/main\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'main\n' };
      if (args[0] === 'remote' && args[1] === 'get-url') return { stdout: 'git@github.com:nbonamy/repo.git\n' };
      if (args[0] === 'remote') return { stdout: 'origin\n' };
      if (args[0] === 'status' && args.includes('--branch')) return { stdout: '## main...origin/main\n' };
      if (args[0] === 'status') return { stdout: '' };
      if (args[0] === 'worktree' && args[1] === 'list') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.createBranch('/repo', 'review/42-fix-the-bug', true, 42))
      .resolves.toBe('/repo-review-42-fix-the-bug');

    expect(runGit).toHaveBeenCalledWith('/repo', ['fetch', 'origin', 'pull/42/head']);
    expect(runGit).toHaveBeenCalledWith('/repo', [
      'worktree',
      'add',
      '-b',
      'review/42-fix-the-bug',
      '/repo-review-42-fix-the-bug',
      'FETCH_HEAD',
    ]);
  });

  it('rejects empty, option-like, and invalid branch names before switching', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'check-ref-format') throw new Error('invalid ref');
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.createBranch('/repo', ' ')).rejects.toThrow('Enter a branch name.');
    await expect(service.createBranch('/repo', '-dangerous')).rejects.toThrow('Enter a valid branch name.');
    await expect(service.createBranch('/repo', 'bad name')).rejects.toThrow('Enter a valid branch name.');
    expect(runGit).not.toHaveBeenCalledWith('/repo', expect.arrayContaining(['switch']));
  });

  it('reports whether the repository folder is a secondary linked worktree', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo-feature\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote') return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.workflow('/repo-feature')).resolves.toMatchObject({
      folder: '/repo-feature',
      isLinkedWorktree: true,
    });
  });

  it('rejects staging paths that escape the repository', async () => {
    const service = new AgentGitService(() => new Date(), vi.fn());
    await expect(service.stage('/repo', ['../secret'])).rejects.toThrow('inside the repository');
    expect(parsePorcelainFiles('R  new.ts\0old.ts\0')).toStrictEqual([{ path: 'old.ts', indexStatus: 'R', worktreeStatus: ' ' }]);
  });

  it('merges a feature worktree into the main worktree and applies cleanup options', async () => {
    const runGit = vi.fn(async (folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo-feature\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);
    await expect(service.merge('/repo-feature', 'squash', true, true, 'feat: combine the workflow')).resolves.toBe('/repo');
    expect(runGit).toHaveBeenCalledWith('/repo', ['merge', '--squash', 'feature']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['commit', '-m', 'feat: combine the workflow']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['branch', '-d', 'feature']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['worktree', 'remove', '/repo-feature']);
    const removeWorktreeCall = runGit.mock.calls.findIndex(([, args]) => args[0] === 'worktree' && args[1] === 'remove');
    const deleteBranchCall = runGit.mock.calls.findIndex(([, args]) => args[0] === 'branch' && args[1] === '-d');
    expect(removeWorktreeCall).toBeLessThan(deleteBranchCall);
  });

  it('requires a commit message before starting a squash merge', async () => {
    const runGit = vi.fn();
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.merge('/repo-feature', 'squash', false, false, '  ')).rejects.toThrow('Enter a squash commit message.');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects worktree cleanup from a primary checkout', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote') return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.merge('/repo', 'merge', false, true)).rejects.toThrow('not a linked worktree');
    expect(runGit.mock.calls.some(([folder, args]) => folder !== '/repo' || args[0] === 'merge')).toBe(false);
  });

  it('does not delete a branch that remains checked out in its linked worktree', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo-feature\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote') return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.merge('/repo-feature', 'merge', true, false)).rejects.toThrow('Remove the linked worktree');
    expect(runGit.mock.calls.some(([, args]) => args[0] === 'merge' || args[0] === 'branch')).toBe(false);
  });

  it('forces a local merge commit without pushing the base branch', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo-feature\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await service.merge('/repo-feature', 'merge', false, false);

    expect(runGit).toHaveBeenCalledWith('/repo', ['merge', '--no-ff', 'feature']);
    expect(runGit.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false);
  });

  it('resolves the base worktree as the merged-branch push target', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo-feature\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote') return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.mergeTarget('/repo-feature')).resolves.toBe('/repo');
  });

  it('switches a primary feature checkout to its base branch before merging', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature/demo\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote') return { stdout: '' };
      if (args[0] === 'status') return { stdout: '## feature/demo\n' };
      if (args[0] === 'worktree') return { stdout: 'worktree /repo\nHEAD def\nbranch refs/heads/feature/demo\n' };
      if (args[0] === 'branch' && args.includes('--format=%(refname:short)')) return { stdout: 'feature/demo\nmain\n' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.merge('/repo', 'merge', false, false)).resolves.toBe('/repo');
    expect(runGit).toHaveBeenCalledWith('/repo', ['switch', 'main']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['merge', '--no-ff', 'feature/demo']);
  });
});
