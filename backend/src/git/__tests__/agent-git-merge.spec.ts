import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AgentGitService, type AgentGitRunner } from '../agent-git-service';

const exec = promisify(execFile);
const git: AgentGitRunner = (cwd, args) => exec('git', args, {
  cwd,
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'app-merge-')));
  const repo = join(root, 'repo');
  const feature = join(root, 'feature');
  await git(root, ['init', '-b', 'main', repo]);
  await git(repo, ['config', 'user.name', 'Merge Test']);
  await git(repo, ['config', 'user.email', 'merge@example.invalid']);
  await git(repo, ['commit', '--allow-empty', '-m', 'base']);
  await git(root, ['init', '--bare', join(root, 'origin.git')]);
  await git(repo, ['remote', 'add', 'origin', join(root, 'origin.git')]);
  await git(repo, ['worktree', 'add', '-b', 'feature', feature]);
  await git(feature, ['push', '-u', 'origin', 'feature']);
  await writeFile(join(feature, 'feature.txt'), 'merged content\n');
  await git(feature, ['add', 'feature.txt']);
  await git(feature, ['commit', '-m', 'feature']);
  return { root, repo, feature };
}

describe('merge cleanup with real Git', () => {
  it.each(['merge', 'squash'] as const)('cleans up a %s when the tracked remote branch is behind', async (strategy) => {
    const { root, repo, feature } = await fixture();
    try {
      const remoteBefore = (await git(repo, ['rev-parse', 'origin/feature'])).stdout;
      const service = new AgentGitService(() => new Date(), git);
      await expect(service.merge(feature, strategy, true, true, 'feat: merge feature'))
        .resolves.toStrictEqual({ targetFolder: repo });
      expect(await readFile(join(repo, 'feature.txt'), 'utf8')).toBe('merged content\n');
      expect((await git(repo, ['branch', '--list', 'feature'])).stdout).toBe('');
      expect((await git(repo, ['worktree', 'list', '--porcelain'])).stdout).not.toContain(`worktree ${feature}`);
      expect((await git(repo, ['rev-parse', 'origin/feature'])).stdout).toBe(remoteBefore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['locked branch', 'unverified ancestry'])('preserves the branch and reports completed merge with cleanup warning for %s', async (failure) => {
    const { root, repo, feature } = await fixture();
    try {
      const runner: AgentGitRunner = (cwd, args) => {
        if (failure === 'locked branch' && args[0] === 'branch' && ['-d', '-D'].includes(args[1]!)) {
          return Promise.reject(new Error('cannot lock ref'));
        }
        if (failure === 'unverified ancestry' && args.join(' ') === 'merge-base --is-ancestor feature HEAD') {
          return Promise.reject(new Error('ancestry check failed'));
        }
        return git(cwd, args);
      };
      const service = new AgentGitService(() => new Date(), runner);
      await expect(service.merge(feature, 'merge', true, true)).resolves.toStrictEqual({
        targetFolder: repo,
        warning: { type: 'branchRetained', branch: 'feature' },
      });
      expect(await readFile(join(repo, 'feature.txt'), 'utf8')).toBe('merged content\n');
      expect((await git(repo, ['branch', '--list', 'feature'])).stdout.trim()).toBe('feature');
      expect((await git(repo, ['worktree', 'list', '--porcelain'])).stdout).not.toContain(`worktree ${feature}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
