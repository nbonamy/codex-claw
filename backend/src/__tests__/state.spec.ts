import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { persistedStateFromSnapshot } from '@codex-claw/shared/state-persistence';
import { loadBackendSnapshot, saveBackendSnapshot } from '../state';

describe('backend state loading', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clawd-state-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a default snapshot when no state file exists', async () => {
    const stateDir = path.join(tempDir, 'state');
    const snapshot = await loadBackendSnapshot(stateDir);

    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    await expect(readFile(path.join(stateDir, 'state.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('loads an existing app snapshot from state.json', async () => {
    const stateDir = path.join(tempDir, 'state');
    const snapshot = await loadBackendSnapshot(stateDir);
    const persisted = {
      ...persistedStateFromSnapshot(snapshot),
      teams: [{ id: 'team-loaded', name: 'Loaded', agentIds: [] }],
      activeTeamId: 'team-loaded',
    };
    await writeFile(path.join(stateDir, 'state.json'), JSON.stringify(persisted), 'utf8');

    await expect(loadBackendSnapshot(stateDir)).resolves.toMatchObject({
      activeTeamId: 'team-loaded',
      teams: [{ id: 'team-loaded' }],
    });
  });

  it('saves backend snapshots using the shared persisted state shape', async () => {
    const stateDir = path.join(tempDir, 'state');
    const snapshot = await loadBackendSnapshot(stateDir);
    snapshot.messages.push({
      id: 'message-runtime',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-13T00:00:00.000Z',
      parts: [{ type: 'text', text: 'do not persist runtime transcript' }],
    });

    await saveBackendSnapshot(stateDir, snapshot);

    const persisted = JSON.parse(await readFile(path.join(stateDir, 'state.json'), 'utf8')) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('messages');
    await expect(loadBackendSnapshot(stateDir)).resolves.toMatchObject({
      messages: [],
      activeTeamId: 'team-codex-claw',
    });
  });

  it('falls back to a default snapshot for malformed state shape', async () => {
    const stateDir = path.join(tempDir, 'state');
    await loadBackendSnapshot(stateDir);
    await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ teams: [] }), 'utf8');

    await expect(loadBackendSnapshot(stateDir)).resolves.toMatchObject({
      activeTeamId: 'team-codex-claw',
    });
  });
});
