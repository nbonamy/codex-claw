import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackendDriver } from '@codex-claw/shared/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import type { Agent, AppSnapshot, Loop } from '@codex-claw/shared/contracts';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/shared/snapshot';
import { BackendDriverRpc } from '../../driver-rpc';
import { ClawMcpService } from '../service';

describe('ClawMcpService', () => {
  let service: ClawMcpService | null = null;

  afterEach(async () => {
    await service?.stop();
    service = null;
  });

  it('serves Claw collaboration tools from clawd and injects teammate messages through backend drivers', async () => {
    const snapshot = createInitialSnapshot();
    const events: unknown[] = [];
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-jesse' },
      turnId: 'turn-jesse',
    });
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt })]])));
    const url = await service.start();
    const dinaUrl = agentUrl(url, 'agent-dina');

    const toolsResponse = await postJson(dinaUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'list-agents',
      'send-message',
      'check-messages',
      'broadcast-message',
      'set-status',
    ]));

    const sendMessageResponse = await postJson(dinaUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'send-message',
        arguments: {
          to: 'agent-jesse',
          content: 'Can you review this branch?',
        },
      },
    });

    expect(sendMessageResponse.result.isError).toBe(false);
    expect(sendMessageResponse.result.structuredContent).toMatchObject({
      recipientId: 'agent-jesse',
      recipientName: 'Jesse',
    });
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Can you review this branch?'),
      undefined,
    );
    expect(snapshot.messages.at(-1)).toMatchObject({
      agentId: 'agent-jesse',
      role: 'user',
      parts: [{
        type: 'text',
        text: expect.stringContaining('Can you review this branch?'),
      }],
    });
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-jesse',
      type: 'snapshot.updated',
      payload: expect.objectContaining({
        messages: [expect.objectContaining({
          agentId: 'agent-jesse',
          role: 'user',
          parts: [expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('Can you review this branch?'),
          })],
        })],
      }),
    }));
  });

  it('steers teammate messages into a recipient with an active turn', async () => {
    const snapshot = createInitialSnapshot();
    const recipient = snapshot.agents.find((agent) => agent.id === 'agent-jesse')!;
    recipient.status = { type: 'working' };
    recipient.backendSession = { kind: 'codex', threadId: 'thread-jesse' };
    const events: any[] = [];
    const steerPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-jesse' },
      turnId: 'turn-active',
    });
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ steerPrompt })]])));
    const url = await service.start();

    await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send-message', arguments: { to: 'agent-jesse', content: 'Check the failing test.' } },
    });

    await vi.waitFor(() => expect(steerPrompt).toHaveBeenCalledOnce());
    expect(steerPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Check the failing test.'),
    );
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-jesse',
      type: 'message.steer',
      turnId: 'turn-active',
    }));
    expect(events.some((event) => event.type === 'agent.promptQueued')).toBe(false);
  });

  it('shows busy teammate messages in the recipient queue and sends them when the turn completes', async () => {
    const snapshot = createInitialSnapshot();
    const recipient = snapshot.agents.find((agent) => agent.id === 'agent-jesse')!;
    recipient.status = { type: 'starting' };
    const events: any[] = [];
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-next' },
      turnId: 'turn-next',
    });
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt })]])));
    const url = await service.start();

    await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send-message', arguments: { to: 'agent-jesse', content: 'Run this next.' } },
    });

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-jesse',
      type: 'agent.promptQueued',
      payload: expect.objectContaining({ text: 'Run this next.' }),
    })));
    expect(sendPrompt).not.toHaveBeenCalled();

    recipient.status = { type: 'idle' };
    service.handleBackendEvent({
      seq: 1,
      agentId: 'agent-jesse',
      threadId: 'thread-old',
      turnId: 'turn-old',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-08-02T00:00:00.000Z',
    });

    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-jesse',
      type: 'agent.promptDequeued',
    })));
  });

  it('routes Computer Use MCP calls through the desktop client port', async () => {
    const status = vi.fn().mockResolvedValue({ available: true, accessibilityTrusted: true, platform: 'darwin' });
    const execute = vi.fn().mockResolvedValue({ ok: true, result: { apps: [] } });
    const stop = vi.fn().mockResolvedValue({ stopped: true });
    service = new ClawMcpService({
      snapshot: createInitialSnapshot(),
      computerUse: {
        execute,
        requestAccessibility: vi.fn(),
        status,
        stop,
      },
    });
    const url = await service.start();

    const toolsResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
    });
    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'computer-use-status',
      'computer-use-get-app-state',
      'computer-use-click',
      'computer-use-stop',
    ]));

    const statusResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'computer-use-status', arguments: {} },
    });
    expect(statusResponse.result.isError).toBe(false);
    expect(status).toHaveBeenCalledOnce();

    const stateResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'computer-use-get-app-state', arguments: { app: 'TextEdit', maxNodes: 200 } },
    });
    expect(execute).toHaveBeenCalledWith({
      command: 'get_app_state',
      arguments: { app: 'TextEdit', maxNodes: 200 },
    });
    expect(stateResponse.result.content[0].text).toBe('{"apps":[]}');

    const stopResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'computer-use-stop', arguments: {} },
    });
    expect(stopResponse.result.structuredContent).toStrictEqual({ stopped: true });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('routes in-app browser inspection and debugging tools through the desktop client port', async () => {
    const open = vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', canGoBack: false, canGoForward: false });
    const execute = vi.fn().mockResolvedValue({ url: 'https://example.com', title: 'Example', element: { tag: 'button' } });
    service = new ClawMcpService({
      snapshot: createInitialSnapshot(),
      browser: { open, execute },
    });
    const url = await service.start();
    const toolsResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
    });
    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'browser-open', 'browser-get-dom', 'browser-screenshot', 'browser-click', 'browser-type', 'browser-scroll', 'browser-console-logs',
    ]));
    const openResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'browser-open', arguments: { url: 'https://example.com' } },
    });
    expect(openResponse.result.structuredContent).toStrictEqual({ url: 'https://example.com/', title: 'Example', canGoBack: false, canGoForward: false });
    expect(open).toHaveBeenCalledWith({ agentId: 'agent-dina', browserId: 'primary', url: 'https://example.com' });
    const response = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'browser-get-dom', arguments: { selector: '#save' } },
    });
    expect(response.result.structuredContent).toStrictEqual({ url: 'https://example.com', title: 'Example', element: { tag: 'button' } });
    expect(execute).toHaveBeenCalledWith({ agentId: 'agent-dina', browserId: 'primary', command: 'dom', arguments: { selector: '#save' } });
  });

  it('completes existing-team loop executions only after every created assignment is done and deletes the created agents', async () => {
    const snapshot = createLoopSnapshot({
      teamTarget: { mode: 'existing', teamId: 'team-codex-claw' },
      createdAgents: [{
        agentId: 'agent-one',
        agentName: 'One',
        workItemId: 'github:nbonamy/codex-claw#5',
        workItemTitle: 'Fix first issue',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/5',
      }, {
        agentId: 'agent-two',
        agentName: 'Two',
        workItemId: 'github:nbonamy/codex-claw#6',
        workItemTitle: 'Fix second issue',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/6',
      }],
    });
    service = new ClawMcpService({
      snapshot,
      now: () => new Date('2026-06-15T01:30:48.802Z'),
    });
    const url = await service.start();

    await markWorkItemCompleted(url, 'agent-one', 'github:nbonamy/codex-claw#5');

    expect(snapshot.agents.map((agent) => agent.id)).toEqual(expect.arrayContaining(['agent-one', 'agent-two']));
    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({ status: 'working' });

    await markWorkItemCompleted(url, 'agent-two', 'github:nbonamy/codex-claw#6');

    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({
      status: 'completed',
      completedAt: '2026-06-15T01:30:48.802Z',
      createdAgents: [
        expect.objectContaining({
          agentId: 'agent-one',
          conversationRef: { backend: 'codex', threadId: 'thread-agent-one' },
        }),
        expect.objectContaining({
          agentId: 'agent-two',
          conversationRef: { backend: 'codex', threadId: 'thread-agent-two' },
        }),
      ],
    });
    expect(snapshot.agents.map((agent) => agent.id)).not.toEqual(expect.arrayContaining(['agent-one', 'agent-two']));
    expect(snapshot.teams[0]?.agentIds).not.toEqual(expect.arrayContaining(['agent-one', 'agent-two']));
    expect(snapshot.teams.map((team) => team.id)).toContain('team-codex-claw');
  });

  it('deletes the dedicated team when a dedicated-team loop execution completes', async () => {
    const snapshot = createLoopSnapshot({
      teamTarget: { mode: 'dedicated' },
      dedicatedTeamId: 'team-github-5',
      createdAgents: [{
        agentId: 'agent-work-item',
        agentName: 'Work Item',
        workItemId: 'github:nbonamy/codex-claw#5',
        workItemTitle: 'Fix issue',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/5',
      }],
    });
    service = new ClawMcpService({
      snapshot,
      now: () => new Date('2026-06-15T01:30:48.802Z'),
    });
    const url = await service.start();

    await markWorkItemCompleted(url, 'agent-work-item', 'github:nbonamy/codex-claw#5');

    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({
      status: 'completed',
      completedAt: '2026-06-15T01:30:48.802Z',
      createdAgents: [{
        agentId: 'agent-work-item',
        conversationRef: { backend: 'codex', threadId: 'thread-agent-work-item' },
      }],
    });
    expect(snapshot.teams.map((team) => team.id)).not.toContain('team-github-5');
    expect(snapshot.agents.map((agent) => agent.id)).not.toContain('agent-work-item');
    expect(snapshot.teams.map((team) => team.id)).toContain('team-codex-claw');
  });
});

function createDriver(overrides: Partial<AgentBackendDriver> = {}): AgentBackendDriver {
  return {
    backend: 'codex',
    getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
    getCapabilities: () => codexBackendCapabilities,
    sendPrompt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      turnId: 'turn-test',
    }),
    interrupt: vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      turnId: 'turn-test',
    }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function agentUrl(url: string, agentId: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('agentId', agentId);
  return parsed.toString();
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(200);
  const text = await response.text();
  if (text.startsWith('event:')) {
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    return JSON.parse(dataLine!.slice('data: '.length));
  }

  return JSON.parse(text);
}

async function markWorkItemCompleted(url: string, agentId: string, workItemId: string): Promise<void> {
  const response = await postJson(agentUrl(url, agentId), {
    jsonrpc: '2.0',
    id: `complete-${agentId}`,
    method: 'tools/call',
    params: {
      name: 'mark-work-item-completed',
      arguments: {
        workItemId,
        confirmCompletion: true,
      },
    },
  });

  expect(response.result.isError).toBe(false);
}

function createLoopSnapshot(input: {
  createdAgents: Loop['executionLog'][number]['createdAgents'];
  dedicatedTeamId?: string;
  teamTarget: Loop['action']['teamTarget'];
}): AppSnapshot {
  const snapshot = createEmptySnapshot();
  const targetTeamId = input.teamTarget.mode === 'dedicated'
    ? input.dedicatedTeamId ?? 'team-github-item'
    : input.teamTarget.teamId;
  const createdAgentIds = input.createdAgents.map((createdAgent) => createdAgent.agentId);
  snapshot.teams[0] = {
    ...snapshot.teams[0]!,
    agentIds: input.teamTarget.mode === 'existing' ? createdAgentIds : [],
    activeAgentId: input.teamTarget.mode === 'existing' ? createdAgentIds[0] : undefined,
  };
  if (input.teamTarget.mode === 'dedicated') {
    snapshot.teams.push({
      id: targetTeamId,
      name: 'GitHub work item',
      agentIds: createdAgentIds,
      activeAgentId: createdAgentIds[0],
    });
  }
  snapshot.agents = input.createdAgents.map((createdAgent) => createTestAgent(createdAgent.agentId, targetTeamId, createdAgent.agentName));
  snapshot.activeTeamId = targetTeamId;
  snapshot.activeAgentId = createdAgentIds[0] ?? null;
  snapshot.loops = [{
    id: 'loop-bugs',
    name: 'Bug loop',
    enabled: true,
    createdAt: '2026-06-15T01:00:00.000Z',
    updatedAt: '2026-06-15T01:00:00.000Z',
    source: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
    action: {
      type: 'create-agent',
      sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      teamTarget: input.teamTarget,
    },
    instructions: {},
    executionLog: [{
      id: 'loop-exec-1',
      loopId: 'loop-bugs',
      startedAt: '2026-06-15T01:00:00.000Z',
      status: 'working',
      createdCount: input.createdAgents.length,
      createdAgents: input.createdAgents,
    }],
  }];
  for (const createdAgent of input.createdAgents) {
    const [, itemId] = createdAgent.workItemId.split(':');
    snapshot.workBacklog.assignments[createdAgent.workItemId] = {
      provider: 'github',
      itemId: itemId ?? createdAgent.workItemId,
      agentId: createdAgent.agentId,
      assignedAt: '2026-06-15T01:00:00.000Z',
      status: 'working',
      loopId: 'loop-bugs',
      loopExecutionId: 'loop-exec-1',
    };
  }

  return snapshot;
}

function createTestAgent(id: string, teamId: string, name: string): Agent {
  return {
    id,
    teamId,
    name,
    folder: `/Users/nbonamy/src/${id}`,
    backend: 'codex',
    backendSession: { kind: 'codex', threadId: `thread-${id}` },
    status: { type: 'idle' },
    createdAt: '2026-06-15T01:00:00.000Z',
    updatedAt: '2026-06-15T01:00:00.000Z',
  };
}
