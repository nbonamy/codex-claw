import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentGitStatus } from '@codex-claw/shared/contracts';

const execFileAsync = promisify(execFile);

export type AgentGitServiceClock = () => Date;

export class AgentGitService {
  constructor(private readonly now: AgentGitServiceClock = () => new Date()) {}

  async status(folder: string): Promise<AgentGitStatus> {
    const updatedAt = this.now().toISOString();
    try {
      const [statusResult, diffResult] = await Promise.all([
        git(folder, ['status', '--porcelain=v1', '--branch']),
        git(folder, ['diff', '--numstat']),
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
    const result = await git(folder, ['diff', '--no-ext-diff', '--']);
    return result.stdout;
  }
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string }> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: result.stdout };
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
