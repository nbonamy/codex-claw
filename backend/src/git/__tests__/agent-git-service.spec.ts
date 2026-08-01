import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { AgentGitService, parseBranchStatus, parseChangedFiles, parseNumstat } from '../agent-git-service';

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
      return { stdout: 'unstaged diff' };
    });
    const service = new AgentGitService(() => new Date(), runGit);

    await expect(service.diff('/new-repo')).resolves.toBe('staged diff\nunstaged diff');
    expect(runGit).toHaveBeenCalledWith('/new-repo', ['diff', '--cached', '--no-ext-diff', '--']);
    expect(runGit).toHaveBeenCalledWith('/new-repo', ['diff', '--no-ext-diff', '--']);
  });
});
