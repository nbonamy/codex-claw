import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { AgentGitDiff, AgentGitDiffSection, AgentGitFile, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { AgentGitStatus } from '@codex-claw/core/contracts';
import { createSourceWorktree, suggestedSourceWorktreePath } from '../git-worktrees';

const execFileAsync = promisify(execFile);

export type AgentGitServiceClock = () => Date;
export type AgentGitRunner = (cwd: string, args: string[]) => Promise<{ stdout: string }>;

export type AgentGitGenerationContext = {
  context: string;
  baseRef?: string;
};

export class AgentGitService {
  constructor(
    private readonly now: AgentGitServiceClock = () => new Date(),
    private readonly runGit: AgentGitRunner = git,
  ) {}

  async status(folder: string): Promise<AgentGitStatus> {
    const updatedAt = this.now().toISOString();
    try {
      const [statusResult, stagedNumstat, unstagedNumstat, untrackedFilesResult, commonDirectoryResult, remotesResult] = await Promise.all([
        this.runGit(folder, ['status', '--porcelain=v1', '--branch']),
        this.runGit(folder, ['diff', '--cached', '--numstat', '--']),
        this.runGit(folder, ['diff', '--numstat', '--']),
        this.runGit(folder, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
        this.runGit(folder, ['rev-parse', '--git-common-dir']).catch(() => ({ stdout: '' })),
        this.runGit(folder, ['remote', '-v']).catch(() => ({ stdout: '' })),
      ]);
      const branch = parseBranchStatus(statusResult.stdout);
      const stagedDiff = parseNumstat(stagedNumstat.stdout);
      const unstagedDiff = parseNumstat(unstagedNumstat.stdout);
      const untrackedDiff = await untrackedNumstat(this.runGit, folder, untrackedFilesResult.stdout.split('\0').filter(Boolean));
      const diff = {
        addedLines: stagedDiff.addedLines + unstagedDiff.addedLines + untrackedDiff.addedLines,
        removedLines: stagedDiff.removedLines + unstagedDiff.removedLines + untrackedDiff.removedLines,
      };
      const changed = parseChangedFiles(statusResult.stdout);
      const isDirty = changed.changedFiles > 0 || diff.addedLines > 0 || diff.removedLines > 0;
      const commonDirectory = commonDirectoryResult.stdout.trim();
      const repository = commonDirectory ? fileName(dirname(resolve(folder, commonDirectory))) : undefined;
      const githubRepository = githubRepositoryFromRemotes(remotesResult.stdout);

      return {
        folder,
        ...(repository ? { repository } : {}),
        ...(githubRepository ? { githubRepository } : {}),
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

  async diff(folder: string): Promise<AgentGitDiff> {
    const sections = await this.diffSections(folder);
    return {
      diff: joinDiffOutputs(sections.map((section) => section.diff)),
      sections,
    };
  }

  async diffSections(folder: string): Promise<AgentGitDiffSection[]> {
    const [staged, unstaged, untrackedFiles] = await Promise.all([
      this.runGit(folder, ['diff', '--cached', '--no-ext-diff', '--']),
      this.runGit(folder, ['diff', '--no-ext-diff', '--']),
      this.runGit(folder, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
    ]);
    const untrackedDiffs: string[] = [];

    for (const file of untrackedFiles.stdout.split('\0').filter(Boolean)) {
      const result = await this.runGit(folder, [
        'diff',
        '--no-index',
        '--no-ext-diff',
        '--',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
        file,
      ]);
      untrackedDiffs.push(result.stdout);
    }

    return [
      { scope: 'staged', diff: staged.stdout },
      { scope: 'unstaged', diff: unstaged.stdout },
      { scope: 'untracked', diff: joinDiffOutputs(untrackedDiffs) },
    ];
  }

  async commitMessageContext(
    folder: string,
    input: { includeUnstaged: boolean; includeUntracked: boolean },
  ): Promise<AgentGitGenerationContext> {
    const sections = await this.diffSections(folder);
    const selected = sections.filter((section) => (
      section.scope === 'staged'
      || (section.scope === 'unstaged' && input.includeUnstaged)
      || (section.scope === 'untracked' && input.includeUntracked)
    ) && section.diff.trim());
    if (selected.length === 0) throw new Error('There are no selected changes to describe.');
    return {
      context: boundedGenerationContext(selected.map((section) => (
        `## ${section.scope} changes\n${section.diff.trim()}`
      )).join('\n\n')),
    };
  }

  async pullRequestMessageContext(folder: string): Promise<AgentGitGenerationContext> {
    const workflow = await this.workflow(folder);
    if (!workflow.branch || workflow.detached) throw new Error('Create or check out a branch before generating a pull request.');
    if (isIntegrationBranch(workflow.branch)) throw new Error('Create a feature branch before generating a pull request.');
    const baseRef = await this.resolvePullRequestBase(folder, workflow.branch, workflow.remote);
    const [commits, stat, diff] = await Promise.all([
      this.runGit(folder, ['log', '--format=%h %s%n%b', `${baseRef}..HEAD`]),
      this.runGit(folder, ['diff', '--stat', `${baseRef}...HEAD`, '--']),
      this.runGit(folder, ['diff', '--no-ext-diff', `${baseRef}...HEAD`, '--']),
    ]);
    if (!commits.stdout.trim() && !diff.stdout.trim()) throw new Error('There are no branch changes to describe.');
    return {
      baseRef,
      context: boundedGenerationContext([
        `## Base\n${baseRef}`,
        `## Commits\n${commits.stdout.trim() || '(none)'}`,
        `## Diff stat\n${stat.stdout.trim() || '(none)'}`,
        `## Diff\n${diff.stdout.trim() || '(none)'}`,
      ].join('\n\n')),
    };
  }

  async workflow(folder: string): Promise<Omit<AgentGitWorkflow, 'githubConnected' | 'existingPullRequest'>> {
    const [root, branch, upstream, remote, status, branchStatusResult, stagedNumstat, unstagedNumstat, worktreeList] = await Promise.all([
      this.runGit(folder, ['rev-parse', '--show-toplevel']),
      this.runGit(folder, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['remote']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['status', '--porcelain=v1', '-z']),
      this.runGit(folder, ['status', '--porcelain=v1', '--branch']),
      this.runGit(folder, ['diff', '--cached', '--numstat', '--']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['diff', '--numstat', '--']).catch(() => ({ stdout: '' })),
      this.runGit(folder, ['worktree', 'list', '--porcelain']).catch(() => ({ stdout: '' })),
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
    const repositoryFolder = root.stdout.trim();
    const worktrees = parseWorktrees(worktreeList.stdout);
    const currentWorktreeIndex = worktrees.findIndex((item) => resolve(item.path) === resolve(repositoryFolder));
    const repository = githubRepositoryFromRemote(remoteUrl) ?? fileName(repositoryFolder);
    return {
      repository,
      folder: repositoryFolder,
      isLinkedWorktree: currentWorktreeIndex > 0,
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

  async createBranch(folder: string, name: string, createWorktree = false, pullRequestNumber?: number): Promise<string> {
    const normalized = name.trim();
    if (!normalized) throw new Error('Enter a branch name.');
    if (normalized.startsWith('-')) throw new Error('Enter a valid branch name.');
    try {
      await this.runGit(folder, ['check-ref-format', '--branch', normalized]);
    } catch {
      throw new Error('Enter a valid branch name.');
    }
    let startPoint: string | undefined;
    if (pullRequestNumber !== undefined) {
      if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) throw new Error('Enter a valid pull request number.');
      const workflow = await this.workflow(folder);
      if (!workflow.remote) throw new Error('Add a GitHub remote before checking out a pull request.');
      await this.runGit(folder, ['fetch', workflow.remote, `pull/${pullRequestNumber}/head`]);
      startPoint = 'FETCH_HEAD';
    }
    if (createWorktree && startPoint) {
      const worktreePath = suggestedSourceWorktreePath(folder, normalized);
      const branchExists = await this.localBranchExists(folder, normalized);
      await this.runGit(folder, branchExists
        ? ['worktree', 'add', worktreePath, normalized]
        : ['worktree', 'add', '-b', normalized, worktreePath, startPoint]);
      if (branchExists) await this.runGit(worktreePath, ['merge', '--ff-only', startPoint]);
      return worktreePath;
    }
    if (createWorktree) {
      const worktree = await createSourceWorktree({ repoPath: folder, branchName: normalized }, {
        run: async (command, args, options) => {
          if (command !== 'git') throw new Error(`Unsupported command: ${command}`);
          return this.runGit(options.cwd, args);
        },
      });
      return worktree.path;
    }
    if (startPoint && await this.localBranchExists(folder, normalized)) {
      await this.runGit(folder, ['switch', normalized]);
      await this.runGit(folder, ['merge', '--ff-only', startPoint]);
    } else {
      await this.runGit(folder, ['switch', '-c', normalized, ...(startPoint ? [startPoint] : [])]);
    }
    return folder;
  }

  private async localBranchExists(folder: string, branch: string): Promise<boolean> {
    try {
      await this.runGit(folder, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  async mergeTarget(folder: string): Promise<string> {
    const current = await this.workflow(folder);
    const worktrees = parseWorktrees((await this.runGit(folder, ['worktree', 'list', '--porcelain'])).stdout);
    const target = selectMergeTarget(worktrees, current.folder);
    if (!target) throw new Error('A base worktree is required before merging.');
    return target.path;
  }

  async merge(folder: string, strategy: 'merge' | 'squash', deleteBranch: boolean, deleteWorktree: boolean, commitMessage?: string): Promise<string> {
    const normalizedCommitMessage = commitMessage?.trim();
    if (strategy === 'squash' && !normalizedCommitMessage) throw new Error('Enter a squash commit message.');
    const current = await this.workflow(folder);
    if (!current.branch || current.detached) throw new Error('Create or check out a branch before merging.');
    if (deleteWorktree && !current.isLinkedWorktree) throw new Error('The current folder is not a linked worktree.');
    if (deleteBranch && !deleteWorktree) throw new Error('Remove the linked worktree before deleting its branch.');
    const worktrees = parseWorktrees((await this.runGit(folder, ['worktree', 'list', '--porcelain'])).stdout);
    const target = selectMergeTarget(worktrees, current.folder);
    let targetFolder = target?.path;
    if (!targetFolder) {
      if (current.isLinkedWorktree) throw new Error('A base worktree is required before merging.');
      const branches = (await this.runGit(folder, ['branch', '--format=%(refname:short)'])).stdout
        .split(/\r?\n/)
        .map((branch) => branch.trim())
        .filter(Boolean);
      const baseBranch = integrationBranches.find((branch) => branch !== current.branch && branches.includes(branch));
      if (!baseBranch) throw new Error('Create a local base branch before merging.');
      await this.runGit(current.folder, ['switch', baseBranch]);
      targetFolder = current.folder;
    }
    await this.runGit(targetFolder, strategy === 'squash' ? ['merge', '--squash', current.branch] : ['merge', '--no-ff', current.branch]);
    if (strategy === 'squash') await this.runGit(targetFolder, ['commit', '-m', normalizedCommitMessage!]);
    if (deleteWorktree) await this.runGit(targetFolder, ['worktree', 'remove', current.folder]);
    if (deleteBranch) await this.runGit(targetFolder, ['branch', '-d', current.branch]);
    return targetFolder;
  }

  private async resolvePullRequestBase(folder: string, branch: string, remote?: string): Promise<string> {
    if (remote) {
      const remoteHead = (await this.runGit(folder, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`])
        .catch(() => ({ stdout: '' }))).stdout.trim();
      if (remoteHead && remoteHead !== `${remote}/${branch}`) return remoteHead;
    }
    const candidates = [
      ...(remote ? integrationBranches.map((name) => `${remote}/${name}`) : []),
      ...integrationBranches,
    ].filter((candidate) => candidate !== branch);
    for (const candidate of candidates) {
      const exists = await this.runGit(folder, ['rev-parse', '--verify', '--quiet', candidate])
        .then(() => true, () => false);
      if (exists) return candidate;
    }
    throw new Error('A main, master, develop, development, or trunk base branch is required.');
  }
}

const integrationBranches = ['main', 'master', 'develop', 'development', 'trunk'] as const;
const maxGenerationContextLength = 60_000;

function boundedGenerationContext(value: string): string {
  if (value.length <= maxGenerationContextLength) return value;
  return `${value.slice(0, maxGenerationContextLength)}\n\n[diff truncated by Codex Claw]`;
}

function isIntegrationBranch(branch: string): boolean {
  return integrationBranches.some((candidate) => candidate === branch);
}

function selectMergeTarget(worktrees: Array<{ path: string; branch?: string }>, currentFolder: string): { path: string; branch?: string } | undefined {
  return worktrees.find((item) => item.path !== currentFolder && integrationBranches.some((branch) => item.branch === branch))
    ?? worktrees.find((item) => item.path !== currentFolder);
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

function githubRepositoryFromRemotes(output: string): string | null {
  for (const line of output.split(/\r?\n/u)) {
    const remoteUrl = line.trim().split(/\s+/u)[1];
    const repository = githubRepositoryFromRemote(remoteUrl);
    if (repository) return repository;
  }
  return null;
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
