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
  it('rejects a dirty base before integration and supports integration from a primary feature checkout', async () => {
    const { root, repo, feature } = await fixture();
    try {
      const service = new AgentGitService(() => new Date(), git);
      await writeFile(join(repo, 'dirty.txt'), 'keep');
      await expect(service.merge(feature, 'merge', false, false)).rejects.toThrow('Commit changes in main');
      await expect(service.merge(feature, 'rebase-ff', false, false)).rejects.toThrow('Commit changes in main');
      await rm(join(repo, 'dirty.txt'));
      await git(repo, ['worktree', 'remove', feature]);
      await git(repo, ['switch', 'feature']);
      await service.merge(repo, 'merge', false, false);
      expect((await git(repo, ['branch', '--show-current'])).stdout.trim()).toBe('main');
      expect(await readFile(join(repo, 'feature.txt'), 'utf8')).toBe('merged content\n');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reports retained folders after successful integration without losing branch cleanup', async () => {
    const { root, repo, feature } = await fixture();
    try {
      const runner: AgentGitRunner = async (cwd, args) => {
        const result = await git(cwd, args);
        if (args[0] === 'worktree' && args[1] === 'remove') throw new Error('Folder retained');
        return result;
      };
      await expect(new AgentGitService(() => new Date(), runner).merge(feature, 'merge', true, true)).resolves.toStrictEqual({ targetFolder: repo, warning: { type: 'worktreeFolderRetained', folder: feature } });
      expect((await git(repo, ['branch', '--list', 'feature'])).stdout).toBe('');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each(['merge', 'squash', 'rebase-ff', 'ff-only'] as const)('integrates with %s into an explicit nonstandard base without pushing or cleanup', async strategy => {
    const { root, repo, feature } = await fixture();
    try {
      await git(repo, ['branch', '-m', 'release']);
      const service = new AgentGitService(() => new Date(), git);
      const { repositoryKey } = await service.preferences(feature);
      service.setSettingsProvider(() => ({ defaults: { pull: 'git-config', update: 'merge', integration: strategy }, repositories: { [repositoryKey]: { baseBranch: 'release' } } }));
      expect((await service.workflow(feature)).baseBranch).toBe('release');
      const remote = (await git(feature, ['rev-parse', 'origin/feature'])).stdout;
      await service.merge(feature, undefined, false, false, 'squashed');
      expect(await readFile(join(repo, 'feature.txt'), 'utf8')).toBe('merged content\n');
      expect((await git(repo, ['rev-list', '--parents', '-n', '1', 'HEAD'])).stdout.trim().split(' ')).toHaveLength(strategy === 'merge' ? 3 : 2);
      expect((await git(feature, ['rev-parse', 'origin/feature'])).stdout).toBe(remote);
      expect((await git(repo, ['worktree', 'list', '--porcelain'])).stdout).toContain(feature);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses fast-forward divergence and stale targets, and stops cleanup on a rebase conflict', async () => {
    const { root, repo, feature } = await fixture();
    try {
      const service = new AgentGitService(() => new Date(), git);
      await writeFile(join(repo, 'feature.txt'), 'conflicting base'); await git(repo, ['add', '.']); await git(repo, ['commit', '-m', 'base']);
      const base = (await git(repo, ['rev-parse', 'HEAD'])).stdout;
      await expect(service.merge(feature, 'ff-only', true, true)).rejects.toThrow('not up to date');
      await expect(service.merge(feature, 'rebase-ff', true, true, undefined, { expectedTarget: 'wrong' })).rejects.toThrow('changed');
      await expect(service.merge(feature, 'rebase-ff', true, true)).rejects.toThrow('Integration paused');
      expect((await new AgentGitService(() => new Date(), git).workflow(feature)).rebase?.conflicts).toStrictEqual(['feature.txt']);
      expect((await git(repo, ['rev-parse', 'HEAD'])).stdout).toBe(base);
      expect((await git(repo, ['worktree', 'list', '--porcelain'])).stdout).toContain(feature);
      await service.recoverRebase(feature, 'abort');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rebases divergent work and advances the base only after a clean rebase', async () => {
    const { root, repo, feature } = await fixture();
    try {
      await writeFile(join(repo, 'base.txt'), 'base'); await git(repo, ['add', '.']); await git(repo, ['commit', '-m', 'base']);
      const base = (await git(repo, ['rev-parse', 'HEAD'])).stdout;
      await new AgentGitService(() => new Date(), git).merge(feature, 'rebase-ff', false, false);
      expect((await git(repo, ['rev-parse', 'HEAD^'])).stdout).toBe(base);
      expect((await git(repo, ['rev-parse', 'HEAD'])).stdout).toBe((await git(feature, ['rev-parse', 'HEAD'])).stdout);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
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
