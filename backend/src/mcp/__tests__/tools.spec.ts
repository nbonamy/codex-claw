import * as z from 'zod/v4';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClawMcpAgentCoordinator } from '../agent-coordinator';
import { McpToolError } from '../agent-coordinator';
import { STRUCTURED_TOOL_RESULT_NOTICE } from '../tool-result';

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  registerComputerUseTools: vi.fn(),
  registerInAppBrowserTools: vi.fn(),
  logMain: vi.fn(),
  warnMain: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    registerTool = mocks.registerTool;
  },
}));

vi.mock('../computer-use-tools', () => ({
  registerComputerUseTools: mocks.registerComputerUseTools,
}));

vi.mock('../browser-tools', () => ({
  registerInAppBrowserTools: mocks.registerInAppBrowserTools,
}));

vi.mock('../../log', () => ({
  logMain: mocks.logMain,
  warnMain: mocks.warnMain,
}));

import { createCodexClawMcpServer } from '../tools';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

describe('Codex Claw MCP tool registration', () => {
  const handlers = new Map<string, ToolHandler>();
  const coordinator = {
    missionContext: vi.fn(),
    listAgents: vi.fn(),
    sendMessage: vi.fn(),
    checkMessages: vi.fn(),
    broadcastMessage: vi.fn(),
    setStatus: vi.fn(),
    finishTurn: vi.fn(),
    celebrate: vi.fn(),
    updateWorkItem: vi.fn(),
    submitMissionResult: vi.fn(),
    upsertMissionTicket: vi.fn(),
    setMissionTitle: vi.fn(),
    attachMissionRepository: vi.fn(),
    listMissionArtifacts: vi.fn(),
    readMissionArtifact: vi.fn(),
    writeMissionArtifact: vi.fn(),
    listSourceRepositories: vi.fn(),
    listSourceWorktrees: vi.fn(),
    createSourceWorktree: vi.fn(),
    createAgent: vi.fn(),
    displayMarkdown: vi.fn(),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    coordinator.missionContext.mockReturnValue(undefined);
    mocks.registerTool.mockImplementation((name: string, _definition: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    });
  });

  it('registers every app-owned tool and optional device adapters', () => {
    const computerUse = {
      status: vi.fn(),
      requestAccessibility: vi.fn(),
      stop: vi.fn(),
      execute: vi.fn(),
    };
    const browser = { open: vi.fn(), execute: vi.fn() };
    const server = createCodexClawMcpServer(
      coordinator as unknown as ClawMcpAgentCoordinator,
      'agent-dina',
      computerUse,
      browser,
    );

    expect([...handlers.keys()]).toStrictEqual([
      'list-agents',
      'send-message',
      'check-messages',
      'broadcast-message',
      'set-status',
      'finish_turn',
      'celebrate',
      'update-work-item',
      'list-repos',
      'list-worktrees',
      'create-worktree',
      'create-agent',
      'display-markdown',
    ]);
    expect(mocks.registerComputerUseTools).toHaveBeenCalledWith(server, computerUse);
    expect(mocks.registerInAppBrowserTools).toHaveBeenCalledWith(server, 'agent-dina', browser);
  });

  it('does not register optional adapters when clients are absent', () => {
    createServer();

    expect(mocks.registerComputerUseTools).not.toHaveBeenCalled();
    expect(mocks.registerInAppBrowserTools).not.toHaveBeenCalled();
  });

  it('does not expose agent avatars in the create-agent contract', () => {
    createServer();

    const registration = mocks.registerTool.mock.calls.find(([name]) => name === 'create-agent');
    const definition = registration?.[1] as { description: string; inputSchema: Record<string, unknown> } | undefined;
    expect(definition?.description).toContain('Codex Claw co-agent');
    expect(Object.keys(definition?.inputSchema ?? {})).toStrictEqual([
      'name',
      'backend',
      'model',
      'reasoningEffort',
      'repoPath',
      'createWorktree',
      'branchName',
      'destinationPath',
      'prompt',
    ]);
  });

  it.each([
    ['list-agents', {}, 'listAgents', ['agent-dina']],
    ['send-message', { to: 'agent-jesse', content: 'hello' }, 'sendMessage', ['agent-dina', 'agent-jesse', 'hello']],
    ['check-messages', {}, 'checkMessages', ['agent-dina', true]],
    ['check-messages', { markAsRead: false }, 'checkMessages', ['agent-dina', false]],
    ['broadcast-message', { content: 'hello all' }, 'broadcastMessage', ['agent-dina', 'hello all']],
    ['set-status', { status: 'Testing', announcement: { phase: 'start', text: 'On it.' } }, 'setStatus', ['agent-dina', 'Testing', { phase: 'start', text: 'On it.' }]],
    ['finish_turn', {}, 'finishTurn', ['agent-dina', undefined]],
    ['finish_turn', { flag: 'ready_for_review' }, 'finishTurn', ['agent-dina', 'ready_for_review']],
    ['celebrate', { kind: 'stars' }, 'celebrate', ['agent-dina', 'stars']],
    ['update-work-item', { workItemId: 'github:o/r#1', status: 'readyForReview' }, 'updateWorkItem', ['agent-dina', 'github:o/r#1', 'readyForReview', undefined]],
    ['update-work-item', { workItemId: 'github:o/r#1', status: 'blocked', note: 'Need API access' }, 'updateWorkItem', ['agent-dina', 'github:o/r#1', 'blocked', 'Need API access']],
    ['list-repos', {}, 'listSourceRepositories', ['agent-dina']],
    ['list-worktrees', { repoPath: '/src/claw' }, 'listSourceWorktrees', ['agent-dina', '/src/claw']],
    ['create-worktree', { repoPath: '/src/claw', branchName: 'tests' }, 'createSourceWorktree', ['agent-dina', { repoPath: '/src/claw', branchName: 'tests' }]],
    ['create-agent', { repoPath: '/src/claw', backend: 'claude' }, 'createAgent', ['agent-dina', { repoPath: '/src/claw', backend: 'claude' }]],
    ['display-markdown', { markdown: '# Report' }, 'displayMarkdown', ['agent-dina', { markdown: '# Report' }]],
  ])('adapts %s arguments to the coordinator', async (tool, input, method, expectedArguments) => {
    createServer();
    const coordinatorMethod = coordinator[method as keyof typeof coordinator];
    coordinatorMethod.mockResolvedValue({ ok: true });

    const result = await handlers.get(tool)?.(input);

    expect(coordinatorMethod).toHaveBeenCalledWith(...expectedArguments);
    expect(result).toMatchObject({
      content: [{ type: 'text', text: STRUCTURED_TOOL_RESULT_NOTICE }],
      structuredContent: { ok: true },
      isError: false,
    });
    expect(mocks.logMain).toHaveBeenCalledWith('mcp-tool', 'start', expect.objectContaining({ tool }));
    expect(mocks.logMain).toHaveBeenCalledWith('mcp-tool', 'success', {
      tool,
      structuredKeys: ['ok'],
    });
  });

  it('exposes the mission tool family only to an active mission worker and binds title changes to caller identity', async () => {
    coordinator.missionContext.mockReturnValue({ missionId: 'mission-1', runId: 'run-1', stage: 'requirements' });
    createServer();
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'set-mission-title', 'list-mission-artifacts', 'read-mission-artifact', 'write-mission-artifact', 'upsert-mission-ticket', 'submit-mission-result',
    ]));
    expect([...handlers.keys()]).not.toContain('set-mission-execution-policy');
    coordinator.setMissionTitle.mockResolvedValue({ success: true, title: 'Add team billing' });
    expect(await handlers.get('set-mission-title')!({ title: 'Add team billing' })).toMatchObject({
      structuredContent: { success: true, title: 'Add team billing' },
    });
    expect(coordinator.setMissionTitle).toHaveBeenCalledWith('agent-dina', 'Add team billing');
    coordinator.listMissionArtifacts.mockReturnValue([{ stage: 'requirements', revision: 1 }]);
    await handlers.get('list-mission-artifacts')!({});
    expect(coordinator.listMissionArtifacts).toHaveBeenCalledWith('agent-dina');
    coordinator.readMissionArtifact.mockResolvedValue({ stage: 'requirements', content: '# Brief', revision: 1, updatedAt: 'now' });
    await handlers.get('read-mission-artifact')!({ stage: 'requirements' });
    expect(coordinator.readMissionArtifact).toHaveBeenCalledWith('agent-dina', 'requirements');
    coordinator.writeMissionArtifact.mockResolvedValue({ stage: 'requirements', content: '# Brief', revision: 2, updatedAt: 'later' });
    await handlers.get('write-mission-artifact')!({ stage: 'requirements', content: '# Brief', expectedRevision: 1 });
    expect(coordinator.writeMissionArtifact).toHaveBeenCalledWith('agent-dina', { stage: 'requirements', content: '# Brief', expectedRevision: 1 });

    coordinator.submitMissionResult.mockResolvedValue({ success: true, status: 'awaitingReview' });
    const input = { summary: 'Ready', artifacts: { requirements: { problem: 'Billing', acceptance: 'Pay' }, tickets: [], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } } };
    input.artifacts.tickets = [{ title: 'Checkout', repositoryPath: '/repo', done: false, reference: 'https://example.com/issue/1', dependsOn: [] }] as never[];
    const definition = mocks.registerTool.mock.calls.find(([name]) => name === 'submit-mission-result')![1] as { inputSchema: z.ZodRawShape };
    expect(z.object(definition.inputSchema).parse(input)).toEqual(input);
    expect(z.object(definition.inputSchema).parse({ ...input, missionId: 'stale-mission', runId: 'stale-run' })).toEqual(input);
    expect(await handlers.get('submit-mission-result')!(input)).toMatchObject({ structuredContent: { success: true, status: 'awaitingReview' } });
    expect(coordinator.submitMissionResult).toHaveBeenCalledWith('agent-dina', input);

    handlers.clear();
    coordinator.missionContext.mockReturnValue({ missionId: 'mission-1', runId: 'run-2', stage: 'tickets' });
    createServer();
    coordinator.upsertMissionTicket.mockResolvedValue({ success: true, ticketId: 'mission-ticket-1', index: 0, artifactRevision: 1 });
    const draft = { title: 'Add checkout', body: 'Deliver owner checkout.', repositoryPath: '/repo', blockedByTicketIds: [] };
    expect(await handlers.get('upsert-mission-ticket')!(draft)).toMatchObject({
      structuredContent: { success: true, ticketId: 'mission-ticket-1', index: 0, artifactRevision: 1 },
    });
    expect(coordinator.upsertMissionTicket).toHaveBeenCalledWith('agent-dina', draft);
  });

  it('preserves every optional creation and display field', async () => {
    createServer();
    coordinator.createSourceWorktree.mockResolvedValue({ path: '/src/claw-tests' });
    coordinator.createAgent.mockResolvedValue({ success: true });
    coordinator.displayMarkdown.mockResolvedValue({ success: true });

    await handlers.get('create-worktree')?.({
      repoPath: '/src/claw',
      branchName: 'tests',
      destinationPath: '/src/claw-tests',
    });
    expect(coordinator.createSourceWorktree).toHaveBeenCalledWith('agent-dina', {
      repoPath: '/src/claw',
      branchName: 'tests',
      destinationPath: '/src/claw-tests',
    });

    const agentInput = {
      name: 'Tester',
      backend: 'codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
      repoPath: '/src/claw',
      createWorktree: true,
      branchName: 'tests',
      destinationPath: '/src/claw-tests',
      prompt: 'Run the focused tests and fix the failure.',
    };
    await handlers.get('create-agent')?.(agentInput);
    expect(coordinator.createAgent).toHaveBeenCalledWith('agent-dina', agentInput);

    await handlers.get('display-markdown')?.({ path: 'report.md', title: 'Report' });
    expect(coordinator.displayMarkdown).toHaveBeenCalledWith('agent-dina', {
      path: 'report.md',
      title: 'Report',
    });
  });

  it.each([
    [new McpToolError('invalid recipient'), 'invalid recipient'],
    [new Error('coordinator failed'), 'coordinator failed'],
    ['transport stopped', 'transport stopped'],
  ])('turns coordinator failures into error tool results', async (error, message) => {
    createServer();
    coordinator.listAgents.mockRejectedValue(error);

    await expect(handlers.get('list-agents')?.({})).resolves.toStrictEqual({
      content: [{ type: 'text', text: message }],
      isError: true,
    });
    expect(mocks.warnMain).toHaveBeenCalledWith('mcp-tool', 'error', {
      tool: 'list-agents',
      message,
    });
  });

  function createServer() {
    return createCodexClawMcpServer(
      coordinator as unknown as ClawMcpAgentCoordinator,
      'agent-dina',
    );
  }
});
