import { describe, expect, it } from 'vitest';
import {
  createAgentInSnapshot,
  createInitialSnapshot,
  selectAgent,
  updateAgentFromInput,
  updateAgentFolder,
  updateAgentWorkspace,
} from '../snapshot';

describe('snapshot reducer', () => {
  it('updates the agent folder and clears the old thread mapping', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    snapshot.agents[0].contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    snapshot.agents[0].plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    snapshot.agents[0].goal = {
      threadId: 'thread-old',
      objective: 'Old goal',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 100,
      timeUsedSeconds: 5,
      createdAt: 1,
      updatedAt: 2,
    };
    snapshot.agents[0].isRegistered = true;
    snapshot.agents[0].mcpSessionId = 'mcp-session';
    snapshot.agents[0].statusText = 'Registered';

    expect(updateAgentFolder(snapshot, 'agent-dina', '/Users/nbonamy/src/id8', '2026-06-05T00:00:01.000Z')).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('stores workspace identity and clears it when the folder changes', () => {
    const snapshot = createInitialSnapshot();
    const workspace = {
      kind: 'git' as const,
      folder: '/Users/nbonamy/src/codex-claw',
      repositoryName: 'codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw',
      branch: 'main',
      isLinkedWorktree: false,
      primaryWorktreeRoot: '/Users/nbonamy/src/codex-claw',
      updatedAt: '2026-08-27T12:00:00.000Z',
    };

    expect(updateAgentWorkspace(snapshot, 'agent-dina', workspace)).toMatchObject({ workspace });
    snapshot.agents[0].pullRequest = {
      provider: 'github', repository: 'owner/repo', branch: 'feature', number: 7, title: 'Feature',
      url: 'https://github.com/owner/repo/pull/7', draft: false, headSha: 'abc123', state: 'open',
      createdAt: '2026-09-03T11:00:00.000Z', updatedAt: '2026-09-03T11:00:00.000Z',
    };
    updateAgentFolder(snapshot, 'agent-dina', '/Users/nbonamy/src/id8');
    expect(snapshot.agents[0].workspace).toBeUndefined();
    expect(snapshot.agents[0].pullRequest).toBeUndefined();
  });

  it('creates agents in the active team and selects the new agent', () => {
    const snapshot = createInitialSnapshot();

    createAgentInSnapshot(snapshot, {
      name: ' Jules ',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/id8',
      delegatedByAgentId: ' agent-dina ',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-jules');

    expect(snapshot.activeAgentId).toBe('agent-new-jules');
    expect(snapshot.teams[0].agentIds).toContain('agent-new-jules');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-new-jules');
    expect(snapshot.agents.at(-1)).toStrictEqual({
      id: 'agent-new-jules',
      teamId: 'team-codex-claw',
      delegatedByAgentId: 'agent-dina',
      name: 'Jules',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('creates agents in a requested team from overview add actions', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      color: '#46A857',
      agentIds: [],
    });

    createAgentInSnapshot(snapshot, {
      name: 'Abby',
      folder: '/Users/nbonamy/src/skwad',
      teamId: 'team-skwad',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-abby');

    expect(snapshot.activeTeamId).toBe('team-skwad');
    expect(snapshot.activeAgentId).toBe('agent-new-abby');
    expect(snapshot.teams[0].agentIds).not.toContain('agent-new-abby');
    expect(snapshot.teams[1].agentIds).toStrictEqual(['agent-new-abby']);
    expect(snapshot.teams[1].activeAgentId).toBe('agent-new-abby');
    expect(snapshot.agents.at(-1)).toMatchObject({
      id: 'agent-new-abby',
      teamId: 'team-skwad',
      name: 'Abby',
      folder: '/Users/nbonamy/src/skwad',
    });
  });

  it('creates agents without storing execution connection on the agent', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';

    createAgentInSnapshot(snapshot, {
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }, '2026-06-05T10:11:12.000Z', 'agent-remote-dina');

    expect(snapshot.agents.at(-1)).toMatchObject({
      id: 'agent-remote-dina',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    });
    expect(snapshot.agents.at(-1)).not.toHaveProperty('remoteConnectionId');
  });

  it('stores a blank created agent name as null', () => {
    const snapshot = createInitialSnapshot();

    createAgentInSnapshot(snapshot, {
      name: ' ',
      folder: '/tmp/codex-claw',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-codex-claw');

    expect(snapshot.agents.at(-1)?.name).toBeNull();
    expect(snapshot.agents.at(-1)?.id).toBe('agent-new-codex-claw');
  });

  it('renames working agents without clearing runtime state', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.status = { type: 'working', detail: 'Running tests' };
    agent.backendSession = { kind: 'codex', threadId: 'thread-old' };
    agent.contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    agent.plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    agent.goal = {
      threadId: 'thread-old',
      objective: 'Old goal',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 100,
      timeUsedSeconds: 5,
      createdAt: 1,
      updatedAt: 2,
    };
    agent.isRegistered = true;
    agent.mcpSessionId = 'mcp-session';
    agent.statusText = 'Registered and idle';

    expect(updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: 'Dina Prime',
    }, '2026-06-05T10:11:12.000Z')).toMatchObject({
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      status: { type: 'working', detail: 'Running tests' },
      backendSession: { kind: 'codex', threadId: 'thread-old' },
      plan: { turnId: 'turn-plan' },
      goal: { objective: 'Old goal' },
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.agents[0].contextUsage?.totalTokens).toBe(397_740);
    expect(snapshot.agents[0].isRegistered).toBe(true);
    expect(snapshot.agents[0].mcpSessionId).toBe('mcp-session');
  });

  it('clears an edited name without changing the existing agent workspace', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-existing' };

    updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: null,
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.agents[0].name).toBeNull();
    expect(snapshot.agents[0].avatar).toBe('DI');
    expect(snapshot.agents[0].folder).toBe('~/src/codex-claw');
    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-existing' });
  });

  it('returns null when updating a missing agent', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFromInput(snapshot, {
      id: 'agent-missing',
      name: 'Missing',
    })).toBeNull();
  });

  it('selects the active agent on its team when switching agents', () => {
    const snapshot = createInitialSnapshot();

    selectAgent(snapshot, 'agent-jesse');

    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-jesse');
  });
});
