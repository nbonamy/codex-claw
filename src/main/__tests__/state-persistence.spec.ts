import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStatePersistence, persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import { appendUserPrompt, createEmptySnapshot, createInitialSnapshot } from '../../shared/snapshot';

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('AppStatePersistence', () => {
  it('loads the default team with no agents when no state file exists', async () => {
    const persistence = new AppStatePersistence(await tempStatePath());

    await expect(persistence.load()).resolves.toStrictEqual(createEmptySnapshot());
  });

  it('keeps persisted empty agents empty while defaulting missing teams', () => {
    const restored = snapshotFromPersistedState({
      teams: [],
      agents: [],
      bench: [],
      activeTeamId: null,
      activeAgentId: 'agent-dina',
      theme: { id: 'codex-claw-dark' },
    });

    expect(restored.teams).toStrictEqual(createEmptySnapshot().teams);
    expect(restored.agents).toStrictEqual([]);
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.activeAgentId).toBeNull();
  });

  it('saves metadata without transcripts or app-server runtime state', async () => {
    const filePath = await tempStatePath();
    const persistence = new AppStatePersistence(filePath);
    const snapshot = createInitialSnapshot();
    snapshot.appServer = { status: 'running', detail: 'connected' };
    snapshot.agents[0].codexThreadId = 'thread-dina';
    appendUserPrompt(snapshot, 'agent-dina', 'do not persist this', '2026-06-05T10:11:12.000Z');

    await persistence.save(snapshot);

    const written = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('messages');
    expect(written).not.toHaveProperty('appServer');
    expect(written.activeTeamId).toBe('team-codex-claw');
    expect((written.agents as Array<Record<string, unknown>>)[0].codexThreadId).toBe('thread-dina');
  });

  it('resets transient agent fields while preserving metadata and thread ids on load', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      codexThreadId: 'thread-dina',
      isRegistered: true,
      mcpSessionId: 'mcp-session',
      statusText: 'Registered',
      status: { type: 'working', detail: 'busy' },
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.agents[0]).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      codexThreadId: 'thread-dina',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(restored.messages).toStrictEqual([]);
    expect(restored.appServer.status).toBe('notConfigured');
  });

  it('repairs team membership and selected agent when persisted ids drift', async () => {
    const filePath = await tempStatePath();
    await writeFile(filePath, JSON.stringify({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: [] }],
      agents: [{ id: 'agent-jules', teamId: 'team-codex-claw', name: 'Jules', folder: '/tmp/jules', createdAt: 'now', updatedAt: 'now' }],
      bench: [],
      activeTeamId: 'missing-team',
      activeAgentId: 'missing-agent',
      theme: { id: 'codex-claw-dark' },
    }), 'utf8');

    const restored = await new AppStatePersistence(filePath).load();

    expect(restored.activeAgentId).toBe('agent-jules');
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.teams[0].color).toBe('#1B4FB2');
    expect(restored.teams[0].agentIds).toStrictEqual(['agent-jules']);
  });
});

async function tempStatePath(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-state-'));
  return path.join(tempDir, 'state.json');
}
