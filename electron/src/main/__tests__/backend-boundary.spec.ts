import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron backend boundary', () => {
  it('keeps provider and backend orchestration implementations out of Electron main', async () => {
    const mainDir = path.resolve(__dirname, '..');
    const forbiddenPaths = [
      'agent-files.ts',
      'automations',
      'backends',
      'claude',
      'codex',
      'git',
      'git-worktrees.ts',
      'mcp',
      'source-repositories.ts',
      'state-persistence.ts',
      'state.ts',
      'transcription',
      'work-integrations',
    ];

    for (const forbiddenPath of forbiddenPaths) {
      await expect(readdir(path.join(mainDir, forbiddenPath))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('keeps backend orchestration imports out of Electron main runtime files', async () => {
    const sources = await readRuntimeSources(path.resolve(__dirname, '..'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/from ['"].*\/(automations|backends|claude|codex|git-worktrees|mcp|source-repositories|state-persistence|transcription|work-integrations)(\/|['"])/);
      expect(source, filePath).not.toMatch(/\b(AgentCoordinator|AppStatePersistence|AutomationRunner|AutomationScheduler|ClaudeBackendDriver|CodexBackendDriver|GitHubWorkProviderDriver|McpService|WorkIntegrationManager)\b/);
    }
  });

  it('does not expose unrestricted filesystem reads from Electron main runtime files', async () => {
    const sources = await readRuntimeSources(path.resolve(__dirname, '..'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/import\s+\{[^}]*\breadFile(?:Sync)?\b[^}]*\}\s+from\s+['"]node:fs(?:\/promises)?['"]/s);
      expect(source, filePath).not.toMatch(/(?<!\.)\breadFile(?:Sync)?\s*\(/);
      expect(source, filePath).not.toMatch(/\bcreateReadStream\b/);
    }
  });

  it('keeps preload free of raw file APIs', async () => {
    const preloadPath = path.resolve(__dirname, '../../preload/index.ts');
    const source = await readFile(preloadPath, 'utf8');

    expect(source).not.toMatch(/\breadFile(?:Sync)?\b/);
    expect(source).not.toMatch(/\bcreateReadStream\b/);
  });

  it('keeps the shared package free of Node filesystem runtime APIs', async () => {
    const sources = (await readRuntimeSources(path.resolve(__dirname, '../../../../core/src')))
      .filter(({ filePath }) => !filePath.endsWith('runtime-discovery.ts'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/from ['"]node:fs/);
      expect(source, filePath).not.toMatch(/from ['"]fs/);
      expect(source, filePath).not.toMatch(/\breadFile(?:Sync)?\b/);
      expect(source, filePath).not.toMatch(/\bwriteFile(?:Sync)?\b/);
      expect(source, filePath).not.toMatch(/\bcreateReadStream\b/);
    }
  });
});

async function readRuntimeSources(
  directory: string,
): Promise<Array<{ filePath: string; source: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: Array<{ filePath: string; source: string }> = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') {
        sources.push(...(await readRuntimeSources(filePath)));
      }
      continue;
    }

    if (entry.isFile() && filePath.endsWith('.ts')) {
      sources.push({ filePath, source: await readFile(filePath, 'utf8') });
    }
  }

  return sources;
}
