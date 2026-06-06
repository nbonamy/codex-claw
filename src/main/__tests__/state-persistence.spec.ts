import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStatePersistence, persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import { appendUserPrompt, createEmptySnapshot, createInitialSnapshot } from '../../shared/snapshot';
import { defaultThemeSettings } from '../../shared/settings';

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
      theme: defaultThemeSettings,
    });

    expect(restored.teams).toStrictEqual(createEmptySnapshot().teams);
    expect(restored.agents).toStrictEqual([]);
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.activeAgentId).toBeNull();
  });

  it('saves metadata, context usage, and collaboration status without transcripts or app-server runtime state', async () => {
    const filePath = await tempStatePath();
    const persistence = new AppStatePersistence(filePath);
    const snapshot = createInitialSnapshot();
    snapshot.appServer = { status: 'running', detail: 'connected' };
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      codexThreadId: 'thread-dina',
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
      isRegistered: true,
      mcpSessionId: 'mcp-session',
      statusText: 'Registered',
      status: { type: 'working', detail: 'busy' },
    };
    appendUserPrompt(snapshot, 'agent-dina', 'do not persist this', '2026-06-05T10:11:12.000Z');

    await persistence.save(snapshot);

    const written = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('messages');
    expect(written).not.toHaveProperty('appServer');
    expect(written.accountRateLimits).toStrictEqual(snapshot.accountRateLimits);
    expect(written.activeTeamId).toBe('team-codex-claw');
    const writtenAgent = (written.agents as Array<Record<string, unknown>>)[0];
    expect(writtenAgent.codexThreadId).toBe('thread-dina');
    expect(writtenAgent.contextUsage).toStrictEqual({
      totalTokens: 1200,
      inputTokens: 900,
      cachedInputTokens: 100,
      outputTokens: 300,
      reasoningOutputTokens: 80,
      lastTotalTokens: 300,
      modelContextWindow: 10000,
      usedPercent: 12,
    });
    expect(writtenAgent).not.toHaveProperty('isRegistered');
    expect(writtenAgent).not.toHaveProperty('mcpSessionId');
    expect(writtenAgent.statusText).toBe('Registered');
    expect(writtenAgent).not.toHaveProperty('status');
  });

  it('resets transient agent fields while preserving metadata, status text, and thread ids on load', () => {
    const snapshot = createInitialSnapshot();
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      codexThreadId: 'thread-dina',
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
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
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
      statusText: 'Registered',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(restored.messages).toStrictEqual([]);
    expect(restored.appServer.status).toBe('notConfigured');
    expect(restored.accountRateLimits).toStrictEqual(snapshot.accountRateLimits);
  });

  it('drops invalid persisted context usage', () => {
    const restored = snapshotFromPersistedState({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: ['agent-dina'] }],
      agents: [{
        id: 'agent-dina',
        teamId: 'team-codex-claw',
        name: 'Dina',
        folder: '~/src/codex-claw',
        codexThreadId: 'thread-dina',
        contextUsage: {
          totalTokens: 1200,
          inputTokens: 900,
          cachedInputTokens: 100,
          outputTokens: 300,
          reasoningOutputTokens: 80,
          lastTotalTokens: 300,
          modelContextWindow: '10000',
          usedPercent: 12,
        },
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      }],
      bench: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
      theme: defaultThemeSettings,
    });

    expect(restored.agents[0].contextUsage).toBeUndefined();
  });

  it('repairs team membership and selected agent when persisted ids drift', async () => {
    const filePath = await tempStatePath();
    await writeFile(filePath, JSON.stringify({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: [] }],
      agents: [{ id: 'agent-jules', teamId: 'team-codex-claw', name: 'Jules', folder: '/tmp/jules', createdAt: 'now', updatedAt: 'now' }],
      bench: [],
      activeTeamId: 'missing-team',
      activeAgentId: 'missing-agent',
      theme: defaultThemeSettings,
    }), 'utf8');

    const restored = await new AppStatePersistence(filePath).load();

    expect(restored.activeAgentId).toBe('agent-jules');
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.teams[0].color).toBe('#1B4FB2');
    expect(restored.teams[0].agentIds).toStrictEqual(['agent-jules']);
  });

  it('persists and restores normalized appearance settings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.theme = {
      id: 'github-dark',
      mode: 'dark',
      uiFontSize: 15,
      chatFontSize: 17,
      codeFontSize: 14,
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.theme).toStrictEqual(snapshot.theme);
  });
});

async function tempStatePath(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-state-'));
  return path.join(tempDir, 'state.json');
}
