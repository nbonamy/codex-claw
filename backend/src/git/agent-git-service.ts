import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentGitFile, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { AgentGitStatus } from '@codex-claw/core/contracts';

const execFileAsync = promisify(execFile);

export type AgentGitServiceClock = () => Date;
export type AgentGitRunner = (cwd: string, args: string[]) => Promise<{ stdout: string }>;

export class AgentGitService {
  constructor(
    private readonly now: AgentGitServiceClock = () => new Date(),
    private readonly runGit: AgentGitRunner = git,
  ) {}

  async status(folder: string): Promise<AgentGitStatus> {
    const updatedAt = this.now().toISOString();
    try {
      const [statusResult, diffResult] = await Promise.all([
        this.runGit(folder, ['status', '--porcelain=v1', '--branch']),
        workingTreeDiff(this.runGit, folder, ['--numstat']),
      ]);
      const branch = parseBranchStatus(statusResult.stdout);
      const diff = parseNumstat(diffResult.stdout);
      const changed = parseChangedFiles(statusResult.stdout);
      const isDirty = changed.changedFiles > 0 || diff.addedLines > 0 || diff.removedLines > 0;

      return {
        folder,
        ...branch,
        ...diff,
        changedFiles: changed.changedFiles,
        hasUntracked: changed.hasUntracked,
        ahead: branch.ahead ?? 0,
        behind: branch.behind ?? 0,
        state: isDirty ? 'dirty' : 'clean',
        updatedAt,
      };
    } catch (error) {
      return {
        folder,
        ahead: 0,
        behind: 0,
        changedFiles: 0,
        addedLines: 0,
        removedLines: 0,
        hasUntracked: false,
        state: 'unknown',
        updatedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async diff(folder: string): Promise<string> {
    const [tracked, untrackedFiles] = await Promise.all([
      workingTreeDiff(this.runGit, folder, ['--no-ext-diff']),
      this.runGit(folder, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
    ]);
    const diffs = [tracked.stdout];

    for (const file of untrackedFiles.stdout.split('\0').filter(Boolean)) {
      const result = await this.runGit(folder, [
        'diff',
        '--no-index',
        '--no-ext-diff',
        '--',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
        file,
      ]);
      diffs.push(result.stdout);
    }

    return joinDiffOutputs(diffs);
  }

  async workflow(folder: string): Promise<Omit<AgentGitWorkflow, 'githubConnected' | 'existingPullRequest'>> {
    const [root, branch, upstream, remote, status, branchStatusResult, stagedNumstat, unstagedNumstat] = await Promise.all([
      this.runGit(folder, ['rev-parse', '--show-toplevel']),
      this.runGit(folder, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['remote']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['status', '--porcelain=v1', '-z']),
      this.runGit(folder, ['status', '--porcelain=v1', '--branch']),
      this.runGit(folder, ['diff', '--cached', '--numstat', '--']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['diff', '--numstat', '--']).catch(() => ({ stdout: '' })),
    ]);
    const remotes = remote.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const trackedRemote = upstream.stdout.trim().split('/')[0];
    const remoteName = (trackedRemote && remotes.includes(trackedRemote) ? trackedRemote : undefined)
      ?? (remotes.includes('origin') ? 'origin' : remotes[0]);
    const remoteUrl = remoteName
      ? (await this.runGit(folder, ['remote', 'get-url', remoteName])).stdout.trim()
      : undefined;
    const files = parsePorcelainFiles(status.stdout);
    const branchStatus = parseBranchStatus(branchStatusResult.stdout);
    const stagedDiff = parseNumstat(stagedNumstat.stdout);
    const unstagedDiff = parseNumstat(unstagedNumstat.stdout);
    const untrackedDiff = await untrackedNumstat(this.runGit, folder, files.filter((file) => file.indexStatus === '?').map((file) => file.path));
    const repository = githubRepositoryFromRemote(remoteUrl) ?? fileName(root.stdout.trim());
    return {
      repository,
      folder: root.stdout.trim(),
      ...(branch.stdout.trim() ? { branch: branch.stdout.trim() } : {}),
      detached: !branch.stdout.trim(),
      ...(remoteName ? { remote: remoteName } : {}),
      ...(remoteUrl ? { remoteUrl } : {}),
      ...(upstream.stdout.trim() ? { upstream: upstream.stdout.trim() } : {}),
      ahead: branchStatus.ahead ?? 0,
      behind: branchStatus.behind ?? 0,
      stagedAddedLines: stagedDiff.addedLines,
      stagedRemovedLines: stagedDiff.removedLines,
      unstagedAddedLines: unstagedDiff.addedLines,
      unstagedRemovedLines: unstagedDiff.removedLines,
      untrackedAddedLines: untrackedDiff.addedLines,
      untrackedRemovedLines: untrackedDiff.removedLines,
      files,
      stagedFiles: files.filter((file) => file.indexStatus !== ' ' && file.indexStatus !== '?').map((file) => file.path),
      unstagedFiles: files.filter((file) => file.worktreeStatus !== ' ' || file.indexStatus === '?').map((file) => file.path),
    };
  }

  async stage(folder: string, paths: string[]): Promise<void> {
    if (paths.length === 0) throw new Error('Select at least one file to stage.');
    if (paths.some((path) => !path.trim() || path.startsWith('/') || path.split(/[\\/]/).includes('..'))) {
      throw new Error('Stage paths must stay inside the repository.');
    }
    await this.runGit(folder, ['add', '--', ...paths]);
  }

  async commit(folder: string, message: string): Promise<void> {
    const normalized = message.trim();
    if (!normalized) throw new Error('Enter a commit message.');
    await this.runGit(folder, ['commit', '-m', normalized]);
  }

  async push(folder: string, remote: string, branch: string, setUpstream: boolean): Promise<void> {
    await this.runGit(folder, setUpstream
      ? ['push', '--set-upstream', remote, branch]
      : ['push', remote, branch]);
  }

  async merge(folder: string, strategy: 'merge' | 'squash', deleteBranch: boolean, deleteWorktree: boolean): Promise<void> {
    const current = await this.workflow(folder);
    if (!current.branch || current.detached) throw new Error('Create or check out a branch before merging.');
    const worktrees = parseWorktrees((await this.runGit(folder, ['worktree', 'list', '--porcelain'])).stdout);
    const target = worktrees.find((item) => item.path !== current.folder && (item.branch === 'main' || item.branch === 'master')) ?? worktrees.find((item) => item.path !== current.folder);
    if (!target) throw new Error('A base worktree is required before merging.');
    await this.runGit(target.path, strategy === 'squash' ? ['merge', '--squash', current.branch] : ['merge', current.branch]);
    if (strategy === 'squash') await this.runGit(target.path, ['commit', '-m', `Merge branch '${current.branch}'`]);
    if (deleteBranch) await this.runGit(target.path, ['branch', '-d', current.branch]);
    if (deleteWorktree) await this.runGit(target.path, ['worktree', 'remove', current.folder]);
  }
}

function parseWorktrees(output: string): Array<{ path: string; branch?: string }> {
  const records = output.split(/\n\n+/).map((record) => record.split(/\r?\n/)).filter((lines) => lines[0]?.startsWith('worktree '));
  return records.map((lines) => ({ path: lines[0]!.slice('worktree '.length), branch: lines.find((line) => line.startsWith('branch '))?.slice('branch refs/heads/'.length) }));
}

export function parsePorcelainFiles(output: string): AgentGitFile[] {
  const entries = output.split('\0').filter(Boolean);
  const files: AgentGitFile[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const indexStatus = entry[0] ?? ' ';
    const worktreeStatus = entry[1] ?? ' ';
    let path = entry.slice(3);
    if ((indexStatus === 'R' || indexStatus === 'C') && entries[index + 1]) path = entries[++index]!;
    files.push({ path, indexStatus, worktreeStatus });
  }
  return files;
}

function githubRepositoryFromRemote(remoteUrl?: string): string | null {
  if (!remoteUrl) return null;
  const match = remoteUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i);
  return match?.[1] ?? null;
}

function fileName(value: string): string {
  return value.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? value;
}

function joinDiffOutputs(diffs: string[]): string {
  let output = '';
  for (const diff of diffs) {
    if (!diff) continue;
    if (output && !output.endsWith('\n')) output += '\n';
    output += diff;
  }
  return output;
}

async function workingTreeDiff(runGit: AgentGitRunner, folder: string, args: string[]): Promise<{ stdout: string }> {
  try {
    return await runGit(folder, ['diff', 'HEAD', ...args, '--']);
  } catch {
    const [staged, unstaged] = await Promise.all([
      runGit(folder, ['diff', '--cached', ...args, '--']),
      runGit(folder, ['diff', ...args, '--']),
    ]);
    return { stdout: [staged.stdout, unstaged.stdout].filter(Boolean).join('\n') };
  }
}

async function untrackedNumstat(runGit: AgentGitRunner, folder: string, paths: string[]): Promise<{ addedLines: number; removedLines: number }> {
  const results = await Promise.all(paths.map(async (filePath) => {
    try {
      return parseNumstat((await runGit(folder, ['diff', '--no-index', '--numstat', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', filePath])).stdout);
    } catch {
      return { addedLines: 0, removedLines: 0 };
    }
  }));
  return results.reduce((total, result) => ({ addedLines: total.addedLines + result.addedLines, removedLines: total.removedLines + result.removedLines }), { addedLines: 0, removedLines: 0 });
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result.stdout };
  } catch (error) {
    // `git diff --no-index` uses exit code 1 to report that files differ.
    if (args.includes('--no-index') && isExpectedDiffExit(error)) {
      return { stdout: error.stdout };
    }
    throw error;
  }
}

function isExpectedDiffExit(error: unknown): error is { code: 1; stdout: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 1
    && 'stdout' in error
    && typeof error.stdout === 'string';
}

export function parseBranchStatus(output: string): Pick<AgentGitStatus, 'ahead' | 'behind' | 'branch' | 'upstream'> {
  const branchLine = output.split(/\r?\n/).find((line) => line.startsWith('## '));
  if (!branchLine) {
    return { ahead: 0, behind: 0 };
  }

  const content = branchLine.slice(3).trim();
  const [branchPart, trackingPart] = content.split('...');
  const branch = branchPart && branchPart !== 'HEAD (no branch)' ? branchPart : undefined;
  if (!trackingPart) {
    return {
      ...(branch ? { branch } : {}),
      ahead: 0,
      behind: 0,
    };
  }

  const [upstreamPart, detailPart] = trackingPart.split(' [');
  const ahead = Number(detailPart?.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(detailPart?.match(/behind (\d+)/)?.[1] ?? 0);

  return {
    ...(branch ? { branch } : {}),
    ...(upstreamPart ? { upstream: upstreamPart } : {}),
    ahead,
    behind,
  };
}

export function parseChangedFiles(output: string): Pick<AgentGitStatus, 'changedFiles' | 'hasUntracked'> {
  const lines = output.split(/\r?\n/).filter((line) => line && !line.startsWith('## '));
  return {
    changedFiles: lines.length,
    hasUntracked: lines.some((line) => line.startsWith('??')),
  };
}

export function parseNumstat(output: string): Pick<AgentGitStatus, 'addedLines' | 'removedLines'> {
  let addedLines = 0;
  let removedLines = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const [added, removed] = line.split(/\s+/);
    addedLines += numericStat(added);
    removedLines += numericStat(removed);
  }

  return { addedLines, removedLines };
}

function numericStat(value: string | undefined): number {
  if (!value || value === '-') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
