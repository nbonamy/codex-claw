import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CreateSourceWorktreeInput, SourceWorktree } from '../shared/contracts';

const execFileAsync = promisify(execFile);

type CommandRunner = {
  run: (command: string, args: string[], options: { cwd: string }) => Promise<unknown>;
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

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'worktree';
}
