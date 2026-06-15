import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backendHomeDir, backendProviderTokensFilePath, backendStateFilePath, loadBackendSnapshot, saveBackendSnapshot } from '../state';
import { persistedStateFromSnapshot } from '../state-persistence';

describe('backend state loading', () => {
  let tempDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clawd-state-'));
    homeDir = path.join(tempDir, 'home');
    vi.stubEnv('CODEX_CLAW_HOME', homeDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('defaults the backend home to ~/.codex-claw', () => {
    vi.stubEnv('CODEX_CLAW_HOME', '');

    expect(backendHomeDir()).toBe(path.join(os.homedir(), '.codex-claw'));
  });

  it('uses CODEX_CLAW_HOME as the only backend home override', () => {
    expect(backendHomeDir()).toBe(homeDir);
    expect(backendStateFilePath()).toBe(path.join(homeDir, 'state.json'));
    expect(backendProviderTokensFilePath()).toBe(path.join(homeDir, 'provider-tokens.json'));
  });

  it('creates a default snapshot when no state file exists', async () => {
    const snapshot = await loadBackendSnapshot();

    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    await expect(readFile(path.join(homeDir, 'state.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('loads an existing app snapshot from state.json', async () => {
    const snapshot = await loadBackendSnapshot();
    const persisted = {
      ...persistedStateFromSnapshot(snapshot),
      teams: [{ id: 'team-loaded', name: 'Loaded', agentIds: [] }],
      activeTeamId: 'team-loaded',
    };
    await writeFile(path.join(homeDir, 'state.json'), JSON.stringify(persisted), 'utf8');

    await expect(loadBackendSnapshot()).resolves.toMatchObject({
      activeTeamId: 'team-loaded',
      teams: [{ id: 'team-loaded' }],
    });
  });

  it('saves backend snapshots using the shared persisted state shape', async () => {
    const snapshot = await loadBackendSnapshot();
    snapshot.messages.push({
      id: 'message-runtime',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-13T00:00:00.000Z',
      parts: [{ type: 'text', text: 'do not persist runtime transcript' }],
    });

    await saveBackendSnapshot(snapshot);

    const persisted = JSON.parse(await readFile(path.join(homeDir, 'state.json'), 'utf8')) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('messages');
    await expect(loadBackendSnapshot()).resolves.toMatchObject({
      messages: [],
      activeTeamId: 'team-codex-claw',
    });
  });

  it('falls back to a default snapshot for malformed state shape', async () => {
    await loadBackendSnapshot();
    await writeFile(path.join(homeDir, 'state.json'), JSON.stringify({ teams: [] }), 'utf8');

    await expect(loadBackendSnapshot()).resolves.toMatchObject({
      activeTeamId: 'team-codex-claw',
    });
  });
});
