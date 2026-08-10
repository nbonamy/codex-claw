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
      if (args.includes('--numstat')) {
        return { stdout: '5\t2\tsrc/a.ts\n3\t1\tsrc/b.ts\n' };
      }
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
    await expect(service.diff('/repo')).resolves.toBe('diff --git a/src/a.ts b/src/a.ts\n');

    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', 'HEAD', '--numstat', '--']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['diff', 'HEAD', '--no-ext-diff', '--']);
  });

  it('falls back to staged plus unstaged diffs before the first commit', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'diff' && args[1] === 'HEAD') {
        throw new Error('unknown revision HEAD');
      }
      if (args.includes('--cached')) {
        return { stdout: 'staged diff' };
      }
      if (args[0] === 'ls-files') {
        return { stdout: '' };
      }
      return { stdout: 'unstaged diff' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diff('/new-repo')).resolves.toBe('staged diff\nunstaged diff');
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
      return { stdout: 'tracked diff\n' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diff('/repo')).resolves.toBe([
      'tracked diff\n',
      'diff --git a/new file.ts b/new file.ts\n',
      'diff --git a/-leading-dash.md b/-leading-dash.md\n',
    ].join(''));
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

  it('inspects workflow state and performs bounded git mutations', async () => {
    const runGit = vi.fn(async (_folder: string, args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: '/repo\n' };
      if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
      if (args.includes('@{upstream}')) return { stdout: '' };
      if (args[0] === 'remote' && args[1] === undefined) return { stdout: 'origin\n' };
      if (args[0] === 'remote') return { stdout: 'git@github.com:nbonamy/codex-claw.git\n' };
      if (args[0] === 'status') return { stdout: ' M src/a.ts\0?? src/new.ts\0' };
      return { stdout: '' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.workflow('/repo')).resolves.toMatchObject({
      repository: 'nbonamy/codex-claw', branch: 'feature', remote: 'origin', detached: false,
      unstagedFiles: ['src/a.ts', 'src/new.ts'], stagedFiles: [],
    });
    await service.stage('/repo', ['src/a.ts']);
    await service.commit('/repo', 'feat: ship workflow');
    await service.push('/repo', 'origin', 'feature', true);
    expect(runGit).toHaveBeenCalledWith('/repo', ['add', '--', 'src/a.ts']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['commit', '-m', 'feat: ship workflow']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['push', '--set-upstream', 'origin', 'feature']);
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
    await service.merge('/repo-feature', 'squash', true, true);
    expect(runGit).toHaveBeenCalledWith('/repo', ['merge', '--squash', 'feature']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['commit', '-m', "Merge branch 'feature'"]);
    expect(runGit).toHaveBeenCalledWith('/repo', ['branch', '-d', 'feature']);
    expect(runGit).toHaveBeenCalledWith('/repo', ['worktree', 'remove', '/repo-feature']);
  });
});
