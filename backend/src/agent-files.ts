import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AgentFilePreviewResult, AgentFileSearchItem } from '@codex-claw/shared/contracts';

export const DEFAULT_AGENT_FILE_LIMIT = 1000;
export const DEFAULT_AGENT_FILE_DEPTH = 8;
export const DEFAULT_AGENT_FILE_READ_BYTES = 2 * 1024 * 1024;

const skippedDirectoryNames = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor',
]);

export type ListAgentFolderFilesOptions = {
  maxDepth?: number;
  maxFiles?: number;
};

export async function listAgentFolderFiles(
  folder: string,
  options: ListAgentFolderFilesOptions = {},
): Promise<AgentFileSearchItem[]> {
  const root = path.resolve(folder);
  const maxDepth = options.maxDepth ?? DEFAULT_AGENT_FILE_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_AGENT_FILE_LIMIT;
  const files: AgentFileSearchItem[] = [];

  await visitFolder(root, 0);

  return files.sort((a, b) => a.path.localeCompare(b.path));

  async function visitFolder(currentFolder: string, depth: number): Promise<void> {
    if (files.length >= maxFiles || depth > maxDepth) {
      return;
    }

    let entries;
    try {
      entries = await readdir(currentFolder, { withFileTypes: true });
    } catch (error) {
      if (currentFolder === root) {
        throw error;
      }
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(currentFolder, entry.name);
      if (entry.isDirectory()) {
        if (!skippedDirectoryNames.has(entry.name)) {
          await visitFolder(absolutePath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      files.push({
        name: entry.name,
        path: relativePath,
      });
    }
  }
}

export async function readAgentFolderFile(
  folder: string,
  filePath: string,
  options: { maxBytes?: number } = {},
): Promise<AgentFilePreviewResult> {
  const resolvedPath = resolveAgentFilePath(folder, filePath);
  const fileStat = await stat(resolvedPath.absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath.relativePath}`);
  }

  if (fileStat.size > (options.maxBytes ?? DEFAULT_AGENT_FILE_READ_BYTES)) {
    throw new Error(`File is too large to preview: ${resolvedPath.relativePath}`);
  }

  return {
    path: resolvedPath.relativePath,
    content: await readFile(resolvedPath.absolutePath, 'utf8'),
  };
}

export function resolveAgentFilePath(folder: string, filePath: string): { absolutePath: string; relativePath: string } {
  const root = path.resolve(folder);
  const target = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const relativePath = path.relative(root, target);

  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`File is outside the agent folder: ${filePath}`);
  }

  return {
    absolutePath: target,
    relativePath: relativePath.split(path.sep).join('/'),
  };
}
