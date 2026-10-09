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
  it.each(['merge', 'rebase'] as const)('updates from base with %s, refuses dirty rebases, and confirms published rewrites', async strategy => {
    const { root, repo, feature } = await fixture();
    try {
      const service = new AgentGitService(() => new Date(), git);
      await writeFile(join(repo, 'base.txt'), 'base update'); await git(repo, ['add', '.']); await git(repo, ['commit', '-m', 'base update']);
      await git(feature, ['push']);
      const before = (await git(feature, ['rev-parse', 'HEAD'])).stdout;
      await writeFile(join(feature, 'dirty.txt'), 'keep');
      await expect(service.updateFromBase(feature, false, { strategy })).rejects.toThrow('Commit your changes');
      if (strategy === 'rebase') await expect(service.updateFromBase(feature, true, { strategy })).rejects.toThrow('Commit your changes');
      await rm(join(feature, 'dirty.txt'));
      if (strategy === 'rebase') {
        await expect(service.updateFromBase(feature, false, { strategy })).rejects.toThrow('Confirm rewriting');
        expect((await git(feature, ['rev-parse', 'HEAD'])).stdout).toBe(before);
      }
      expect((await service.updateFromBase(feature, false, { strategy, rewritePublished: true })).conflicts).toStrictEqual([]);
      expect(await readFile(join(feature, 'base.txt'), 'utf8')).toBe('base update');
      const parents = (await git(feature, ['rev-list', '--parents', '-n', '1', 'HEAD'])).stdout.trim().split(' ');
      expect(parents).toHaveLength(strategy === 'merge' ? 3 : 2);
      expect((await git(feature, ['rev-parse', 'origin/feature'])).stdout).toBe(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('retains merge conflicts when an explicitly allowed dirty update encounters a conflict', async () => {
    const { root, repo, feature } = await fixture();
    try {
      await writeFile(join(repo, 'feature.txt'), 'base version'); await git(repo, ['add', '.']); await git(repo, ['commit', '-m', 'base version']);
      await writeFile(join(feature, 'notes.txt'), 'keep notes');
      const service = new AgentGitService(() => new Date(), git);
      expect((await service.updateFromBase(feature, true)).conflicts).toStrictEqual(['feature.txt']);
      expect(await readFile(join(feature, 'notes.txt'), 'utf8')).toBe('keep notes');
      expect((await git(feature, ['stash', 'list'])).stdout).toBe('');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('shares overrides between linked worktrees and isolates separate clones and owning services', async () => {
    const { root, repo, feature } = await fixture();
    try {
      const service = new AgentGitService(() => new Date(), git);
      const { repositoryKey } = await service.preferences(repo);
      service.setSettingsProvider(() => ({ defaults: { pull: 'merge', update: 'merge', integration: 'merge' }, repositories: { [repositoryKey]: { pull: 'rebase' } } }));
      expect(await service.preferences(feature)).toStrictEqual(await service.preferences(repo));
      await git(root, ['clone', repo, 'clone']);
      expect((await service.preferences(join(root, 'clone'))).effective.pull).toBe('merge');
      expect((await new AgentGitService(() => new Date(), git).preferences(repo)).effective.pull).toBe('git-config');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
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
