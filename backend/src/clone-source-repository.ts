import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SourceRepository } from '@codex-claw/core/contracts';
import { scanSourceRepositories } from './source-repositories';

const execFileAsync = promisify(execFile);

type CommandRunner = {
  run: (command: string, args: string[], options: { cwd: string }) => Promise<{ stdout?: string }>;
};

const defaultRunner: CommandRunner = {
  run: (command, args, options) => execFileAsync(command, args, options),
};

export async function cloneSourceRepository(
  sourceFolderPath: string,
  repositoryUrl: string,
  runner: CommandRunner = defaultRunner,
): Promise<SourceRepository> {
  const sourceRoot = sourceFolderPath.trim();
  const url = repositoryUrl.trim();
  if (!sourceRoot) throw new Error('Source folder is not configured.');
  if (!url) throw new Error('Repository URL is required.');

  const repositoryName = repositoryNameFromUrl(url);
  const destinationPath = path.join(sourceRoot, repositoryName);
  await mkdir(sourceRoot, { recursive: true });

  if (await pathExists(destinationPath)) {
    const existingRemote = (await runner.run('git', ['remote', 'get-url', 'origin'], { cwd: destinationPath })
      .catch(() => ({ stdout: '' }))).stdout?.trim();
    if (!existingRemote || normalizeGitUrl(existingRemote) !== normalizeGitUrl(url)) {
      throw new Error(`${repositoryName} already exists in the source folder.`);
    }
  } else {
    await runner.run('git', ['clone', '--', url, destinationPath], { cwd: sourceRoot });
  }

  const repositories = await scanSourceRepositories(sourceRoot);
  const repository = repositories.find((candidate) => candidate.path === destinationPath);
  if (!repository) throw new Error(`Cloned ${repositoryName}, but could not discover it in the source folder.`);
  return repository;
}

export function repositoryNameFromUrl(repositoryUrl: string): string {
  const normalized = repositoryUrl.trim().replace(/[?#].*$/u, '').replace(/\/+$/u, '');
  const repositoryPath = /^[^/:]+@[^:]+:/u.test(normalized)
    ? normalized.slice(normalized.lastIndexOf(':') + 1)
    : normalized;
  const pathPart = repositoryPath.slice(repositoryPath.lastIndexOf('/') + 1);
  const name = pathPart.replace(/\.git$/iu, '').trim();
  if (!name || name === '.' || name === '..' || /[/\\]/u.test(name)) {
    throw new Error('Repository URL does not contain a valid repository name.');
  }
  return name;
}

function normalizeGitUrl(value: string): string {
  return value.trim().replace(/\.git$/iu, '').replace(/\/+$/u, '').toLocaleLowerCase();
}

async function pathExists(value: string): Promise<boolean> {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}
