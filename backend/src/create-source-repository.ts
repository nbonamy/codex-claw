import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { AppError } from '@codex-claw/core/app-error';
import type { SourceRepository } from '@codex-claw/core/contracts';
import { resolveSourceFolderPath, scanSourceRepositories } from './source-repositories';

const execFileAsync = promisify(execFile);

type CommandRunner = {
  run: (command: string, args: string[], options: { cwd: string }) => Promise<unknown>;
};

const defaultRunner: CommandRunner = {
  run: (command, args, options) => execFileAsync(command, args, options),
};

export async function createSourceRepository(
  sourceFolderPath: string,
  name: string,
  runner: CommandRunner = defaultRunner,
): Promise<SourceRepository> {
  const configuredSourceRoot = sourceFolderPath.trim();
  const repositoryName = requireRepositoryName(name);
  if (!configuredSourceRoot) throw new AppError('createRepository.sourceFolderMissing', 'Source folder is not configured.');

  const sourceRoot = resolveSourceFolderPath(configuredSourceRoot);
  const destinationPath = path.join(sourceRoot, repositoryName);
  await mkdir(sourceRoot, { recursive: true });
  if (await pathExists(destinationPath)) {
    throw new AppError('createRepository.alreadyExists', `${repositoryName} already exists in the source folder.`, { repository: repositoryName });
  }

  await mkdir(destinationPath);
  await runner.run('git', ['init'], { cwd: destinationPath });

  const repository = (await scanSourceRepositories(sourceRoot)).find((candidate) => candidate.path === destinationPath);
  if (!repository) {
    throw new AppError(
      'createRepository.discoveryFailed',
      `Created ${repositoryName}, but could not discover it in the source folder.`,
      { repository: repositoryName },
    );
  }
  return repository;
}

export function requireRepositoryName(value: string): string {
  const name = value.trim();
  if (!name) throw new AppError('createRepository.nameRequired', 'Project name is required.');
  if (name === '.' || name === '..' || /[/\\]/u.test(name)) {
    throw new AppError('createRepository.invalidName', 'Project name must be a single folder name.');
  }
  return name;
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}
