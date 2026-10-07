import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AgentGitService, type AgentGitRunner } from '../agent-git-service';

const exec = promisify(execFile);
const git: AgentGitRunner = (cwd, args) => exec('git', args, {
  cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
});

async function fixture(run: (local: string, remote: string, service: AgentGitService) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'app-pull-')));
  try {
    const remote = join(root, 'remote');
    const local = join(root, 'local');
    await git(root, ['init', '-b', 'upstream-branch', remote]);
    await git(remote, ['config', 'user.name', 'Pull Test']);
    await git(remote, ['config', 'user.email', 'pull@example.invalid']);
    await writeFile(join(remote, 'file.txt'), 'base\n');
    await git(remote, ['add', '.']);
    await git(remote, ['commit', '-m', 'base']);
    await git(root, ['clone', remote, local]);
    await git(local, ['branch', '-m', 'local-branch']);
    await git(local, ['config', 'user.name', 'Pull Test']);
    await git(local, ['config', 'user.email', 'pull@example.invalid']);
    await run(local, remote, new AgentGitService(() => new Date(), git));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('pull with real Git', () => {
  it('fetches the configured upstream and fast-forwards without touching unrelated dirty files', async () => {
    await fixture(async (local, remote, service) => {
      await writeFile(join(remote, 'file.txt'), 'remote update\n');
      await git(remote, ['commit', '-am', 'remote update']);
      await writeFile(join(local, 'notes.txt'), 'keep my notes\n');
      await expect(service.pull(local)).rejects.toThrow('Commit your changes');
      expect(await readFile(join(local, 'file.txt'), 'utf8')).toBe('base\n');
      await expect(service.pull(local, true)).resolves.toStrictEqual({
        upstream: 'origin/upstream-branch', branch: 'local-branch', conflicts: [],
      });
      expect(await readFile(join(local, 'file.txt'), 'utf8')).toBe('remote update\n');
      expect(await readFile(join(local, 'notes.txt'), 'utf8')).toBe('keep my notes\n');
    });
  });

  it('leaves a divergent merge conflict for resolution, overriding rebase and ff-only preferences', async () => {
    await fixture(async (local, remote, service) => {
      for (const [folder, text] of [[local, 'local'], [remote, 'remote']]) {
        await writeFile(join(folder!, 'file.txt'), `${text}\n`);
        await git(folder!, ['commit', '-am', text!]);
      }
      await git(local, ['config', 'pull.rebase', 'true']);
      await git(local, ['config', 'pull.ff', 'only']);
      await expect(service.pull(local)).resolves.toStrictEqual({
        upstream: 'origin/upstream-branch', branch: 'local-branch', conflicts: ['file.txt'],
      });
      expect(await readFile(join(local, 'file.txt'), 'utf8')).toContain('<<<<<<<');
      expect((await git(local, ['rev-parse', '--verify', 'MERGE_HEAD'])).stdout.trim()).not.toBe('');
      await expect(service.pull(local, true)).rejects.toThrow('Resolve the existing conflicts');
    });
  });

  it('rejects detached or untracked branches and does not misreport fetch errors as conflicts', async () => {
    await fixture(async (local, _remote, service) => {
      await git(local, ['remote', 'set-url', 'origin', join(local, 'missing-remote')]);
      await expect(service.pull(local)).rejects.toThrow();
      expect((await git(local, ['diff', '--name-only', '--diff-filter=U'])).stdout).toBe('');
      await git(local, ['branch', '--unset-upstream']);
      await expect(service.pull(local)).rejects.toThrow('Set an upstream');
      await git(local, ['checkout', '--detach']);
      await expect(service.pull(local)).rejects.toThrow('Check out a branch');
    });
  });
});
