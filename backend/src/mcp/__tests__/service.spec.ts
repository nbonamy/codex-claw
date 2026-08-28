import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { Agent, AppSnapshot, Loop } from '@codex-claw/core/contracts';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import { BackendDriverRpc } from '../../driver-rpc';
import { ClawMcpService } from '../service';

describe('ClawMcpService', () => {
  let service: ClawMcpService | null = null;

  afterEach(async () => {
    await service?.stop();
    service = null;
  });

  it('serializes an explicit null when set-status clears the current text', async () => {
    const snapshot = createInitialSnapshot();
    const events: unknown[] = [];
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    const url = await service.start();

    const response = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'set-status', arguments: { status: '' } },
    });

    expect(response.result.isError).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: expect.objectContaining({ statusText: null }),
    }));
  });

  it('holds prepare-work until Claw resolves the routing choice', async () => {
    const snapshot = createInitialSnapshot();
    const events: Array<{ type?: string; payload?: unknown }> = [];
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    const url = await service.start();

    const toolCall = postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'prepare-work',
        arguments: { task: 'Add queue retries', branchName: 'feat/queue-retries' },
      },
    });

    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ type: 'workRouting.requested' }));
    });
    const request = snapshot.workRoutingRequests?.[0];
    expect(request).toMatchObject({
      kind: 'work_routing',
      payload: { request: { agentId: 'agent-dina', task: 'Add queue retries', suggestedBranchName: 'feat/queue-retries' } },
    });

    service.resolveWorkRoutingRequest(request!.id, {
      mode: 'current',
      folder: '/Users/nicolas/src/codex-claw',
    });

    await expect(toolCall).resolves.toMatchObject({
      result: { structuredContent: { mode: 'current', folder: '/Users/nicolas/src/codex-claw' } },
    });
    expect(snapshot.workRoutingRequests).toStrictEqual([]);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'workRouting.resolved',
      payload: { id: request!.id },
    }));
  });

  it('serves health and debug routes while rejecting invalid HTTP and MCP requests', async () => {
    service = new ClawMcpService({ snapshot: createInitialSnapshot() });
    const mcpUrl = await service.start();
    await expect(service.start()).resolves.toBe(mcpUrl);
    const origin = new URL(mcpUrl).origin;

    const health = await fetch(`${origin}/health`);
    expect(health.status).toBe(200);
    await expect(health.text()).resolves.toBe('OK');
    const debug = await fetch(`${origin}/`);
    expect(debug.status).toBe(200);
    await expect(debug.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent-dina' }),
    ]));
    await expect(fetch(mcpUrl)).resolves.toMatchObject({ status: 405 });
    await expect(fetch(mcpUrl, { method: 'DELETE' })).resolves.toMatchObject({ status: 405 });
    await expect(fetch(`${origin}/missing`)).resolves.toMatchObject({ status: 404 });

    const missingIdentity = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(missingIdentity.status).toBe(400);
    const invalidRequest = await fetch(agentUrl(mcpUrl, 'agent-dina'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} }),
    });
    expect(invalidRequest.status).toBe(400);
    const malformedJson = await fetch(agentUrl(mcpUrl, 'agent-dina'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformedJson.status).toBe(500);
    const oversized = await fetch(agentUrl(mcpUrl, 'agent-dina'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(1024 * 1024) }),
    });
    expect(oversized.status).toBe(500);

    await service.stop();
    await service.stop();
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

  it('exposes the same message delivery path to backend-owned debug fixtures', async () => {
    const snapshot = createInitialSnapshot();
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-jesse' },
      turnId: 'turn-jesse',
    });
    service = new ClawMcpService({ snapshot });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt })]])));

    service.sendMessage('agent-dina', 'agent-jesse', 'Debug menu delivery');

    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Debug menu delivery'),
      undefined,
    ));
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

  it('shows busy teammate messages in the backend-owned queue until it reports dequeue', async () => {
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
      payload: expect.objectContaining({
        text: expect.stringContaining('Run this next.'),
      }),
    })));
    expect(sendPrompt).not.toHaveBeenCalled();

    const queuedEvent = events.find((event) => event.type === 'agent.promptQueued');
    const queuedMessageId = queuedEvent?.payload?.id as string;
    service.handleBackendEvent({
      seq: 1,
      agentId: 'agent-jesse',
      type: 'agent.promptDequeued',
      payload: { ids: [queuedMessageId] },
      occurredAt: '2026-08-02T00:00:00.000Z',
    });
    expect(sendPrompt).not.toHaveBeenCalled();

    recipient.status = { type: 'idle' };
    await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'send-message', arguments: { to: 'agent-jesse', content: 'Only this remains.' } },
    });
    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledOnce());
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('Only this remains.');
    expect(sendPrompt.mock.calls[0]?.[1]).not.toContain('Run this next.');
  });

  it('marks collaboration messages already submitted when an idle delivery fails', async () => {
    const snapshot = createInitialSnapshot();
    const events: any[] = [];
    const sendPrompt = vi.fn().mockRejectedValue(new Error('transport disconnected'));
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    service.setDriverRpc(new BackendDriverRpc(new Map([['codex', createDriver({ sendPrompt })]])));
    const url = await service.start();

    await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send-message', arguments: { to: 'agent-jesse', content: 'Retry this safely.' } },
    });

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-jesse',
      type: 'agent.promptQueued',
      payload: expect.objectContaining({ submitted: true }),
    })));
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-jesse' && message.role === 'user')).toHaveLength(1);
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

  it('omits Computer Use tools when the capability is disabled', async () => {
    service = new ClawMcpService({
      snapshot: createInitialSnapshot(),
      computerUse: {
        execute: vi.fn(),
        requestAccessibility: vi.fn(),
        status: vi.fn(),
        stop: vi.fn(),
      },
      computerUseEnabled: () => false,
    });
    const url = await service.start();

    const toolsResponse = await postJson(agentUrl(url, 'agent-dina'), {
      jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
    });

    expect(toolsResponse.result.tools.map((tool: { name: string }) => tool.name)).not.toEqual(
      expect.arrayContaining(['computer-use-status', 'computer-use-click']),
    );
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

  it('displays generated Markdown and creates agents through the service boundary', async () => {
    const snapshot = createInitialSnapshot();
    const events: any[] = [];
    service = new ClawMcpService({ snapshot, onEvent: (event) => events.push(event) });
    const url = await service.start();
    const callerUrl = agentUrl(url, 'agent-dina');

    const markdownResponse = await postJson(callerUrl, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'display-markdown', arguments: { markdown: '# Coverage report', title: 'Coverage' } },
    });
    expect(markdownResponse.result.structuredContent).toMatchObject({
      success: true,
      message: 'Displayed Markdown in the side panel.',
      title: 'Coverage',
    });
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: { kind: 'markdown', title: 'Coverage', content: '# Coverage report' },
    }));

    const createResponse = await postJson(callerUrl, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'create-agent',
        arguments: { repoPath: '/tmp/new-agent', name: 'New Agent', avatar: 'NA', backend: 'claude' },
      },
    });
    expect(createResponse.result.structuredContent).toMatchObject({ success: true, agentId: expect.any(String) });
    expect(snapshot.agents).toContainEqual(expect.objectContaining({
      name: 'New Agent',
      avatar: 'NA',
      backend: 'claude',
      folder: '/tmp/new-agent',
      teamId: 'team-codex-claw',
    }));

    const missingRepo = await postJson(callerUrl, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'create-agent', arguments: { repoPath: '   ' } },
    });
    expect(missingRepo.result.structuredContent).toStrictEqual({ success: false, message: 'repoPath is required' });
    const missingBranch = await postJson(callerUrl, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'create-agent', arguments: { repoPath: '/tmp/new-agent', createWorktree: true } },
    });
    expect(missingBranch.result.structuredContent).toStrictEqual({
      success: false,
      message: 'branchName is required when createWorktree is true',
    });
  });

  it('requires loop completion instructions before confirming work completion', async () => {
    const snapshot = createLoopSnapshot({
      teamTarget: { mode: 'existing', teamId: 'team-codex-claw' },
      createdAgents: [{
        agentId: 'agent-one',
        agentName: 'One',
        workItemId: 'github:nbonamy/codex-claw#5',
        workItemTitle: 'Fix first issue',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/5',
      }],
    });
    snapshot.loops[0]!.instructions.beforeCompletion = 'Remove the bug label first.';
    const events: any[] = [];
    service = new ClawMcpService({
      snapshot,
      now: () => new Date('2026-06-15T01:30:48.802Z'),
      onEvent: (event) => events.push(event),
    });
    const url = await service.start();

    const first = await callTool(url, 'agent-one', 'update-work-item', {
      workItemId: 'github:nbonamy/codex-claw#5',
      status: 'completed',
    });
    expect(first.result.structuredContent).toMatchObject({
      status: 'completion-instructions-required',
      instructions: 'Remove the bug label first.',
      repeatUpdateRequired: true,
    });
    const completed = await callTool(url, 'agent-one', 'update-work-item', {
      workItemId: 'github:nbonamy/codex-claw#5',
      status: 'completed',
    });
    expect(completed.result.structuredContent).toMatchObject({ status: 'completed' });
    expect(events.filter((event) => event.type === 'workBacklog.assignmentUpdated')).toHaveLength(2);

    const missing = await fetch(agentUrl(url, 'agent-one'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'missing-work-item', method: 'tools/call',
        params: { name: 'update-work-item', arguments: { workItemId: 'missing', status: 'completed' } },
      }),
    });
    expect(missing.status).toBe(500);
  });

  it('updates only the caller-owned assignment and requires blocked context', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12'] = {
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-dina',
      assignedAt: '2026-06-15T01:00:00.000Z',
      policy: 'review',
      status: 'inProgress',
    };
    const events: any[] = [];
    service = new ClawMcpService({
      snapshot,
      now: () => new Date('2026-06-15T01:30:48.802Z'),
      onEvent: (event) => events.push(event),
    });
    const url = await service.start();

    const missingNote = await callTool(url, 'agent-dina', 'update-work-item', {
      workItemId: 'github:nbonamy/codex-claw#12',
      status: 'blocked',
    });
    expect(missingNote.result.isError).toBe(true);

    const blocked = await callTool(url, 'agent-dina', 'update-work-item', {
      workItemId: 'github:nbonamy/codex-claw#12',
      status: 'blocked',
      note: 'Need access to the private fixture',
    });
    expect(blocked.result.structuredContent).toMatchObject({
      status: 'blocked',
      note: 'Need access to the private fixture',
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      status: 'blocked',
      note: 'Need access to the private fixture',
      updatedAt: '2026-06-15T01:30:48.802Z',
    });
    expect(events).toContainEqual(expect.objectContaining({ type: 'workBacklog.assignmentUpdated' }));
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
      name: 'update-work-item',
      arguments: {
        workItemId,
        status: 'completed',
      },
    },
  });

  expect(response.result.isError).toBe(false);
}

function callTool(url: string, agentId: string, name: string, arguments_: Record<string, unknown>): Promise<any> {
  return postJson(agentUrl(url, agentId), {
    jsonrpc: '2.0',
    id: `${name}-${agentId}`,
    method: 'tools/call',
    params: { name, arguments: arguments_ },
  });
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
      policy: 'complete',
      status: 'inProgress',
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
