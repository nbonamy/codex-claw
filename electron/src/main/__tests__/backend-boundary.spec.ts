import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron backend boundary', () => {
  it('keeps AppController behind the Claw backend protocol client', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toMatch(/from ['"]\.\/codex\//);
    expect(source).not.toMatch(/from ['"]\.\/claude\//);
    expect(source).not.toContain('new CodexBackendDriver');
    expect(source).not.toContain('new ClaudeBackendDriver');
    expect(source).not.toContain('ClawBackendProxyDriver');
    expect(source).toContain('createRuntimeClawBackendClient');
  });

  it('keeps provider implementation directories out of Electron main', async () => {
    const mainDir = path.resolve(__dirname, '..');
    await expect(readdir(path.join(mainDir, 'codex'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(path.join(mainDir, 'claude'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(path.join(mainDir, 'backends'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps Electron main limited to desktop adapter modules', async () => {
    const mainDir = path.resolve(__dirname, '..');
    const entries = await readdir(mainDir, { withFileTypes: true });
    const runtimeFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .sort();

    expect(runtimeFiles).toStrictEqual([
      'agent-activity-power-save-blocker.ts',
      'app-controller.ts',
      'app-menu.ts',
      'app-shortcuts.ts',
      'backend-client.ts',
      'backend-process-client.ts',
      'backend-socket-client.ts',
      'client-request-handlers.ts',
      'daemon-launch-agent.ts',
      'forge-env.d.ts',
      'index.ts',
      'log.ts',
      'main-window.ts',
      'runtime-config.ts',
      'system-permissions.ts',
    ]);
  });

  it('keeps each extracted backend concern in the backend package', async () => {
    const backendDir = path.resolve(__dirname, '../../../../backend/src');
    const expectedBackendPaths = [
      'loops/scheduler.ts',
      'loops/runner.ts',
      'work-integrations/manager.ts',
      'work-integrations/github-driver.ts',
      'git-worktrees.ts',
      'state-persistence.ts',
      'state.ts',
      'transcription/apple-speech.ts',
      'server.ts',
    ];

    for (const backendPath of expectedBackendPaths) {
      await expect(readFile(path.join(backendDir, backendPath), 'utf8')).resolves.toEqual(expect.any(String));
    }
  });

  it('keeps backend orchestration implementation modules out of Electron main', async () => {
    const mainDir = path.resolve(__dirname, '..');
    const forbiddenPaths = [
      'agent-files.ts',
      'git',
      'git-worktrees.ts',
      'loops',
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

  it('keeps backend orchestration types and imports out of Electron main runtime files', async () => {
    const sources = await readElectronMainRuntimeSources(path.resolve(__dirname, '..'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/from ['"].*\/(loops|mcp|work-integrations|git-worktrees|source-repositories|agent-files|state-persistence|state|transcription)(\/|['"])/);
      expect(source, filePath).not.toMatch(/\b(LoopRunner|LoopScheduler|WorkIntegrationManager|GitHubWorkProviderDriver|AgentCoordinator|McpService|AppStatePersistence|transcribeWithAppleSpeechAnalyzer)\b/);
    }
  });

  it('keeps workspace file previews behind clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toMatch(/from ['"]node:fs/);
    expect(source).not.toMatch(/from ['"]fs/);
    expect(source).not.toContain('driver/previewFile');
    expect(source).not.toContain('driver/listFiles');
    expect(source).toContain("request('agent/previewFile'");
    expect(source).toContain('agentId');
  });

  it('does not expose raw filesystem reads from Electron main runtime files', async () => {
    const sources = await readElectronMainRuntimeSources(path.resolve(__dirname, '..'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/\breadFile(?:Sync)?\b/);
      expect(source, filePath).not.toMatch(/\bcreateReadStream\b/);
      expect(source, filePath).not.toContain('driver/previewFile');
      expect(source, filePath).not.toContain('driver/listFiles');
    }
  });

  it('keeps preload free of raw file APIs', async () => {
    const preloadPath = path.resolve(__dirname, '../../preload/index.ts');
    const source = await readFile(preloadPath, 'utf8');

    expect(source).not.toMatch(/\breadFile(?:Sync)?\b/);
    expect(source).not.toMatch(/\bcreateReadStream\b/);
    expect(source).not.toContain('driver/previewFile');
    expect(source).not.toContain('driver/listFiles');
  });

  it('keeps the shared package free of Node filesystem runtime APIs', async () => {
    const sources = await readElectronMainRuntimeSources(path.resolve(__dirname, '../../../../shared/src'));

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toMatch(/from ['"]node:fs/);
      expect(source, filePath).not.toMatch(/from ['"]fs/);
      expect(source, filePath).not.toMatch(/\breadFile(?:Sync)?\b/);
      expect(source, filePath).not.toMatch(/\bwriteFile(?:Sync)?\b/);
      expect(source, filePath).not.toMatch(/\bcreateReadStream\b/);
    }
  });

  it('keeps renderer product snapshot reduction behind clawd', async () => {
    const appStatePath = path.resolve(__dirname, '../../renderer/app-state.ts');
    const source = await readFile(appStatePath, 'utf8');

    expect(source).not.toContain('applyMainEventToSnapshot');
    expect(source).not.toContain('updateSettingsInSnapshot');
    expect(source).not.toContain('snapshot.value.activeAgentId =');
    expect(source).not.toContain('snapshot.value.activeTeamId =');
    expect(source).not.toContain("event.type === 'snapshot.updated' && isAppSnapshot(event.payload)");
    expect(source).toContain('adoptSnapshotFromMainEvent');
  });

  it('keeps durable snapshot persistence in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const mainDir = path.resolve(__dirname, '..');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('AppStatePersistence');
    expect(source).not.toContain('state.json');
    expect(source).not.toContain('persistSnapshot');
    expect(source).not.toContain('./snapshot-service');
    expect(source).not.toContain('applyMainEventToSnapshot');
    expect(source).not.toContain('createEmptySnapshot');
    expect(source).toContain("request<unknown>('snapshot/get')");
    await expect(readdir(path.join(mainDir, 'snapshot-service.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps Electron snapshot caching limited to backend-provided snapshots', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');
    const assignments = source.match(/\bthis\.snapshot\s*=/g) ?? [];

    expect(assignments).toHaveLength(4);
    expect(source).toContain('this.snapshot = initialSnapshot;');
    expect(source).toContain('this.snapshot = snapshot;');
    expect(source).toContain('this.snapshot = backendState.snapshot;');
    expect(source).toContain('this.snapshot = event.snapshot;');
    expect(source).not.toContain('this.snapshot = result.snapshot;');
    expect(source).not.toContain('snapshotFromBackendEvent');
    expect(source).not.toContain('applyMainEventToSnapshot');
    expect(source).not.toContain('updateSettingsInSnapshot');
  });

  it('keeps desktop-native power state derived by clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const powerSaveBlockerPath = path.resolve(__dirname, '../agent-activity-power-save-blocker.ts');
    const appController = await readFile(appControllerPath, 'utf8');
    const powerSaveBlocker = await readFile(powerSaveBlockerPath, 'utf8');

    expect(appController).toContain("request<ClientState>('client/getState')");
    expect(appController).toContain('this.clientState.shouldPreventDisplaySleep');
    expect(powerSaveBlocker).not.toContain('AppSnapshot');
    expect(powerSaveBlocker).not.toContain('AgentStatus');
    expect(powerSaveBlocker).not.toContain('preventSleepWhenAgentsRun');
    expect(powerSaveBlocker).not.toContain('.agents');
  });

  it('keeps derived side-panel events in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('promptPlanPreview');
    expect(source).not.toContain('promptGitDiffPreview');
    expect(source).not.toContain("type: 'sidePanel.markdownRequested'");
    expect(source).not.toContain("type: 'sidePanel.gitDiffRequested'");
  });

  it('keeps source folder auto-detection in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('source/detectFolder');
    expect(source).not.toContain('agent/validateFolder');
    expect(source).toContain('this.clientState.sourceFolderPath');
  });

  it('keeps source worktree path policy in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).toContain("request('source/listWorktrees'");
    expect(source).toContain("request('source/suggestWorktreePath'");
    expect(source).toContain("request<SourceWorktree>('source/createWorktree'");
    expect(source).not.toContain('git worktree');
    expect(source).not.toContain('worktree list');
    expect(source).not.toContain('path.dirname');
    expect(source).not.toContain('path.join');
    expect(source).not.toContain('suggestedName');
  });

  it('keeps source recent-repository bookkeeping behind clawd', async () => {
    const appStatePath = path.resolve(__dirname, '../../renderer/app-state.ts');
    const appShellPath = path.resolve(__dirname, '../../renderer/components/AppShell.vue');
    const agentDialogPath = path.resolve(__dirname, '../../renderer/components/AgentDialog.vue');
    const sources = [
      await readFile(appStatePath, 'utf8'),
      await readFile(appShellPath, 'utf8'),
      await readFile(agentDialogPath, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).not.toContain('addRecentSourceRepository');
      expect(source).not.toContain('add-recent-source-repository');
    }
  });

  it('keeps folder picker IPC separate from backend mutations', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const preloadPath = path.resolve(__dirname, '../../preload/index.ts');
    const ipcPath = path.resolve(__dirname, '../../../../shared/src/ipc.ts');
    const appController = await readFile(appControllerPath, 'utf8');
    const preload = await readFile(preloadPath, 'utf8');
    const ipc = await readFile(ipcPath, 'utf8');

    expect(appController).toContain('chooseAgentFolder');
    expect(appController).toContain('updateAgentFolder');
    expect(appController).not.toContain('selectAgentFolder');
    expect(preload).not.toContain('selectAgentFolder');
    expect(ipc).not.toContain('agent:select-folder');
  });

  it('keeps system permission API ownership in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('./system-permissions');
    expect(source).toContain("request('system/getPermissions')");
    expect(source).toContain("request('system/openAccessibilitySettings')");
  });

  it('keeps Apple Speech helper paths out of per-request Electron IPC', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).toContain("request('transcription/appleSpeech'");
    expect(source).not.toContain('assetsPath');
    expect(source).not.toContain('appleSpeechAssetsPath');
  });

  it('keeps shell PATH repair out of Electron startup', async () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const mainDir = path.resolve(__dirname, '..');
    const source = await readFile(indexPath, 'utf8');

    expect(source).not.toContain('fixPath');
    expect(source).not.toContain('./utils');
    expect(source).not.toContain('child_process');
    await expect(readdir(path.join(mainDir, 'utils.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function readElectronMainRuntimeSources(
  directory: string,
): Promise<Array<{ filePath: string; source: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: Array<{ filePath: string; source: string }> = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') {
        sources.push(...(await readElectronMainRuntimeSources(filePath)));
      }
      continue;
    }

    if (entry.isFile() && filePath.endsWith('.ts')) {
      sources.push({ filePath, source: await readFile(filePath, 'utf8') });
    }
  }

  return sources;
}
