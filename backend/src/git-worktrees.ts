import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CreateSourceWorktreeInput, SourceWorktree } from '@codex-claw/shared/contracts';

const execFileAsync = promisify(execFile);

type CommandRunner = {
  run: (command: string, args: string[], options: { cwd: string }) => Promise<{ stdout?: string }>;
};

const defaultRunner: CommandRunner = {
  run: (command, args, options) => execFileAsync(command, args, options),
};

export function suggestedSourceWorktreePath(repoPath: string, branchName: string): string {
  return path.join(
    path.dirname(repoPath),
    `${path.basename(repoPath)}-${slug(branchName)}`,
  );
}

export async function createSourceWorktree(
  input: CreateSourceWorktreeInput,
  runner: CommandRunner = defaultRunner,
): Promise<SourceWorktree> {
  const repoPath = input.repoPath.trim();
  const branchName = input.branchName.trim();
  if (!branchName) {
    throw new Error('Branch name is required.');
  }

  const worktreePath = input.destinationPath?.trim() || suggestedSourceWorktreePath(repoPath, branchName);
  await runner.run('git', ['worktree', 'add', '-b', branchName, worktreePath], {
    cwd: repoPath,
  });

  return {
    name: slug(path.basename(branchName)),
    path: worktreePath,
  };
}

export async function listSourceWorktrees(
  repoPath: string,
  runner: CommandRunner = defaultRunner,
): Promise<SourceWorktree[]> {
  const normalizedRepoPath = repoPath.trim();
  if (!normalizedRepoPath) {
    throw new Error('Repository path is required.');
  }

  const result = await runner.run('git', ['worktree', 'list', '--porcelain'], {
    cwd: normalizedRepoPath,
  });

  return parseGitWorktreeList(result.stdout ?? '', normalizedRepoPath);
}

export function parseGitWorktreeList(output: string, repoPath: string): SourceWorktree[] {
  return output
    .split(/\n(?=worktree )/u)
    .map((entry) => parseGitWorktreeEntry(entry, repoPath))
    .filter((entry): entry is SourceWorktree => entry !== null)
    .sort((left, right) => {
      if (left.path === repoPath) {
        return -1;
      }
      if (right.path === repoPath) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function parseGitWorktreeEntry(entry: string, repoPath: string): SourceWorktree | null {
  const lines = entry.split('\n').map((line) => line.trim()).filter(Boolean);
  const worktreePath = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length).trim();
  if (!worktreePath) {
    return null;
  }

  const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length).trim();
  const branchName = branch?.replace(/^refs\/heads\//u, '') ?? '';

  return {
    name: branchName || path.basename(worktreePath) || path.basename(repoPath),
    path: worktreePath,
  };
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'worktree';
}
