import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentGitStatus } from '@codex-claw/shared/contracts';

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
