import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentGitRunner } from './agent-git-service';
import type { GitRebaseState } from '@workspace/core/contracts/git';

/** Git's own durable operation files are authoritative across daemon restarts. */
export class GitRebase {
  constructor(private readonly run: AgentGitRunner) {}

  async state(folder: string): Promise<GitRebaseState | undefined> {
    for (const name of ['rebase-merge', 'rebase-apply']) {
      const path = (await this.run(folder, ['rev-parse', '--path-format=absolute', '--git-path', name])).stdout.trim();
      const head = await readFile(join(path, 'head-name'), 'utf8').catch(() => undefined);
      if (!head) continue;
      const onto = (await readFile(join(path, 'onto'), 'utf8')).trim();
      return { branch: head.trim().replace(/^refs\/heads\//, ''), onto, conflicts: await this.conflicts(folder) };
    }
    return undefined;
  }

  async conflicts(folder: string): Promise<string[]> {
    return (await this.run(folder, ['diff', '--name-only', '--diff-filter=U', '-z'])).stdout.split('\0').filter(Boolean);
  }

  async assertIdle(folder: string): Promise<void> {
    if (await this.state(folder)) throw new Error('Continue or abort the rebase before starting another operation.');
    const merging = await this.run(folder, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).then(() => true, () => false);
    if (merging || (await this.conflicts(folder)).length) throw new Error('Resolve the existing conflicts before starting another operation.');
  }

  async start(folder: string, target: string, rewriteConfirmed: boolean, preserveMerges = false): Promise<string[]> {
    await this.assertIdle(folder);
    const branch = (await this.run(folder, ['symbolic-ref', '--quiet', 'HEAD'])).stdout.trim();
    const worktrees = (await this.run(folder, ['worktree', 'list', '--porcelain'])).stdout;
    if (worktrees.split('\n').filter(line => line === `branch ${branch}`).length > 1) throw new Error('The working branch is checked out in multiple worktrees.');
    if ((await this.run(folder, ['status', '--porcelain=v1', '-z'])).stdout) throw new Error('Commit your changes before rebasing.');
    const ancestor = await this.run(folder, ['merge-base', '--is-ancestor', target, 'HEAD']).then(() => true, () => false);
    if (ancestor) return [];
    const commits = (await this.run(folder, ['rev-list', `${target}..HEAD`])).stdout.trim().split('\n').filter(Boolean);
    const originalHead = (await this.run(folder, ['rev-parse', 'HEAD'])).stdout;
    const originalTarget = (await this.run(folder, ['rev-parse', target])).stdout;
    await this.run(folder, ['fetch', '--all']);
    if ((await this.run(folder, ['symbolic-ref', '--quiet', 'HEAD'])).stdout.trim() !== branch || (await this.run(folder, ['rev-parse', 'HEAD'])).stdout !== originalHead || (await this.run(folder, ['rev-parse', target])).stdout !== originalTarget) throw new Error('Git state changed while checking published history. Review the operation again.');
    if (!rewriteConfirmed) {
      for (const commit of commits) {
        const published = (await this.run(folder, ['for-each-ref', `--contains=${commit}`, '--format=%(refname)', 'refs/remotes'])).stdout.trim();
        if (published) throw new Error('Confirm rewriting published commits before rebasing. Pushing remains a separate action.');
      }
    }
    try {
      await this.run(folder, ['-c', 'rebase.updateRefs=false', '-c', 'rebase.autoStash=false', 'rebase', '--no-autostash', ...(preserveMerges ? ['--rebase-merges'] : []), target]);
    } catch (error) {
      if (!await this.state(folder) || !(await this.conflicts(folder)).length) throw error;
    }
    return this.conflicts(folder);
  }

  async recover(folder: string, action: 'continue' | 'abort'): Promise<void> {
    if (!await this.state(folder)) throw new Error('There is no rebase to continue or abort.');
    if (action === 'continue' && (await this.conflicts(folder)).length) throw new Error('Resolve and stage the conflicted files before continuing.');
    // Keep the commit message, never launch an interactive editor in the daemon.
    try { await this.run(folder, ['-c', 'core.editor=true', '-c', 'rebase.updateRefs=false', 'rebase', `--${action}`]); }
    catch (error) { if (!await this.state(folder) || !(await this.conflicts(folder)).length) throw error; }
  }
}
